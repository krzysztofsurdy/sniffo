import Graph from 'graphology';
import type { GraphData } from '../api/types';
import { getNodeColor, getEdgeColor } from './node-colors';

function blendColor(color1: string, color2: string, ratio: number): string {
  const hex = (c: string) => parseInt(c, 16);
  const r1 = hex(color1.slice(1, 3)), g1 = hex(color1.slice(3, 5)), b1 = hex(color1.slice(5, 7));
  const r2 = hex(color2.slice(1, 3)), g2 = hex(color2.slice(3, 5)), b2 = hex(color2.slice(5, 7));
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function getNamespaceParts(qualifiedName: string): string[] {
  const sep = qualifiedName.includes('\\') ? '\\' : qualifiedName.includes('/') ? '/' : '.';
  const parts = qualifiedName.split(sep);
  return parts.slice(0, -1);
}

function getGroupKey(qualifiedName: string): string {
  const parts = getNamespaceParts(qualifiedName);
  if (parts.length === 0) return '__root__';
  // Use first 2 meaningful segments as group key, collapsing very deep namespaces
  // into broader groups that ForceAtlas2 can separate via edge forces
  return parts.slice(0, Math.min(3, parts.length)).join('\\');
}

function getFullNamespace(qualifiedName: string): string {
  const sep = qualifiedName.includes('\\') ? '\\' : qualifiedName.includes('/') ? '/' : '.';
  const parts = qualifiedName.split(sep);
  return parts.length > 1 ? parts.slice(0, -1).join(sep) : '';
}

function isNamespaceHidden(qualifiedName: string, hiddenNamespaces: Set<string>): boolean {
  const sep = qualifiedName.includes('\\') ? '\\' : qualifiedName.includes('/') ? '/' : '.';
  const parts = qualifiedName.split(sep);
  for (let i = 1; i <= parts.length - 1; i++) {
    if (hiddenNamespaces.has(parts.slice(0, i).join(sep))) return true;
  }
  return false;
}

export function buildGraphology(
  data: GraphData,
  visibleNodeTypes: Set<string>,
  visibleEdgeTypes: Set<string>,
  hiddenNamespaces?: Set<string>,
  layoutType: string = 'sunshine',
  spacingNodes: number = 1.0,
  spacingCenter: number = 1.0,
  spacingGroups: number = 1.0,
): Graph {
  const graph = new Graph();

  // Use ALL nodes for layout computation
  const visibleNodes = data.nodes;

  const nameCount = new Map<string, number>();
  for (const node of visibleNodes) {
    nameCount.set(node.shortName, (nameCount.get(node.shortName) ?? 0) + 1);
  }

  // Compute node positions based on layout type
  const nodePositions = new Map<string, { x: number; y: number }>();

  if (layoutType === 'force') {
    const spread = Math.sqrt(visibleNodes.length) * 10;
    for (const node of visibleNodes) {
      nodePositions.set(node.id, {
        x: (Math.random() - 0.5) * spread,
        y: (Math.random() - 0.5) * spread,
      });
    }
  } else {
    // Shared: build groups, edges between groups, BFS ordering
    const groupCounts = new Map<string, number>();
    for (const node of visibleNodes) {
      const key = getGroupKey(node.qualifiedName);
      groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
    }

    const nodeGroupMap = new Map<string, string>();
    for (const node of visibleNodes) {
      nodeGroupMap.set(node.id, getGroupKey(node.qualifiedName));
    }
    const groupEdges = new Map<string, Map<string, number>>();
    const groupTotalEdges = new Map<string, number>();
    for (const edge of data.edges) {
      const sg = nodeGroupMap.get(edge.source);
      const tg = nodeGroupMap.get(edge.target);
      if (!sg || !tg || sg === tg) continue;
      if (!groupEdges.has(sg)) groupEdges.set(sg, new Map());
      if (!groupEdges.has(tg)) groupEdges.set(tg, new Map());
      groupEdges.get(sg)!.set(tg, (groupEdges.get(sg)!.get(tg) ?? 0) + 1);
      groupEdges.get(tg)!.set(sg, (groupEdges.get(tg)!.get(sg) ?? 0) + 1);
      groupTotalEdges.set(sg, (groupTotalEdges.get(sg) ?? 0) + 1);
      groupTotalEdges.set(tg, (groupTotalEdges.get(tg) ?? 0) + 1);
    }

    const groupKeys = Array.from(groupCounts.keys());
    const centerKey = groupKeys.reduce((best, k) =>
      (groupTotalEdges.get(k) ?? 0) > (groupTotalEdges.get(best) ?? 0) ? k : best
    , groupKeys[0]);

    // BFS order from most-connected group
    const bfsOrder: string[] = [centerKey];
    const visited = new Set<string>([centerKey]);
    const parentMap = new Map<string, string>();
    let bfsQueue: string[] = [centerKey];
    while (bfsQueue.length > 0) {
      const next: string[] = [];
      for (const current of bfsQueue) {
        const neighbors = groupEdges.get(current);
        if (!neighbors) continue;
        for (const [neighbor] of neighbors) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          bfsOrder.push(neighbor);
          parentMap.set(neighbor, current);
          next.push(neighbor);
        }
      }
      bfsQueue = next;
    }
    const unvisited = groupKeys.filter(k => !visited.has(k));

    // Compute group radii (how much space each group needs)
    const intraGap = 20 * spacingNodes;
    const groupRadii = new Map<string, number>();
    for (const [key, count] of groupCounts) {
      let ringIdx = 0;
      let placed = 1;
      while (placed < count) {
        ringIdx++;
        const r = ringIdx * intraGap;
        placed += Math.max(1, Math.floor(2 * Math.PI * r / intraGap));
      }
      groupRadii.set(key, Math.max(15, ringIdx * intraGap));
    }

    // Compute group centers based on layout type
    const groupCenters = new Map<string, { cx: number; cy: number }>();
    let disconnectedPos = { cx: 0, cy: 0 };

    if (layoutType === 'sunshine') {
      groupCenters.set(centerKey, { cx: 0, cy: 0 });
      const baseRingGap = 200 * spacingCenter;
      let ring = 0;
      let qi = 1;
      let ringStart = 1;
      // Find ring boundaries from BFS
      const bfsDepth = new Map<string, number>();
      bfsDepth.set(centerKey, 0);
      for (const key of bfsOrder) {
        const parent = parentMap.get(key);
        if (parent !== undefined) {
          bfsDepth.set(key, (bfsDepth.get(parent) ?? 0) + 1);
        }
      }
      const maxDepth = Math.max(0, ...bfsDepth.values());
      let cumulativeRadius = groupRadii.get(centerKey) ?? 15;
      for (let d = 1; d <= maxDepth; d++) {
        const ringGroups = bfsOrder.filter(k => bfsDepth.get(k) === d);
        const maxRadiusInRing = Math.max(...ringGroups.map(k => groupRadii.get(k) ?? 15));
        cumulativeRadius += maxRadiusInRing + baseRingGap;
        // Ensure ring circumference fits all groups with gaps between them
        const totalGroupWidth = ringGroups.reduce((s, k) => {
          const r = groupRadii.get(k) ?? 15;
          const gap = Math.max(40, r * 0.5) * spacingGroups;
          return s + r * 2 + gap;
        }, 0);
        const minRadius = totalGroupWidth / (2 * Math.PI);
        const radius = Math.max(cumulativeRadius, minRadius);
        cumulativeRadius = radius;
        for (let i = 0; i < ringGroups.length; i++) {
          const angle = (2 * Math.PI * i) / ringGroups.length;
          groupCenters.set(ringGroups[i], {
            cx: radius * Math.cos(angle),
            cy: radius * Math.sin(angle),
          });
        }
        ring = d;
      }
      const maxOuterGroupRadius = Math.max(0, ...Array.from(groupRadii.values()));
      disconnectedPos = { cx: 0, cy: cumulativeRadius + maxOuterGroupRadius * 2 + baseRingGap * 3 };

    } else if (layoutType === 'tree') {
      // Natural tree: root at bottom, branches grow upward fanning out
      const childrenOf = new Map<string, string[]>();
      for (const key of bfsOrder) {
        const parent = parentMap.get(key);
        if (parent !== undefined) {
          if (!childrenOf.has(parent)) childrenOf.set(parent, []);
          childrenOf.get(parent)!.push(key);
        }
      }

      function subtreeSize(key: string): number {
        const kids = childrenOf.get(key);
        if (!kids || kids.length === 0) return 1;
        return kids.reduce((s, k) => s + subtreeSize(k), 0);
      }

      const branchLen = 800 * spacingCenter;

      // Each branch grows from parent at an angle within a fan
      // Root's children fan across top half (upward), deeper branches narrow the fan
      function layoutBranch(
        key: string,
        cx: number,
        cy: number,
        direction: number, // angle this branch is growing toward
        fanWidth: number, // how wide the fan of children can spread
      ) {
        groupCenters.set(key, { cx, cy });
        const kids = childrenOf.get(key);
        if (!kids || kids.length === 0) return;

        const totalLeaves = kids.reduce((s, k) => s + subtreeSize(k), 0);
        let angleOffset = direction - fanWidth / 2;

        for (const child of kids) {
          const childLeaves = subtreeSize(child);
          const slice = (fanWidth * childLeaves) / totalLeaves;
          const childAngle = angleOffset + slice / 2;
          const parentR = groupRadii.get(key) ?? 15;
          const childR = groupRadii.get(child) ?? 15;
          const dist = (branchLen + parentR + childR) * spacingGroups;
          const childCx = cx + dist * Math.cos(childAngle);
          const childCy = cy + dist * Math.sin(childAngle);
          // Children's fan narrows as tree grows
          const childFan = Math.min(fanWidth * 0.8, slice * 1.5);
          layoutBranch(child, childCx, childCy, childAngle, childFan);
          angleOffset += slice;
        }
      }

      // Root at bottom, fan upward only (no sideways/downward branches)
      groupCenters.set(centerKey, { cx: 0, cy: 0 });
      layoutBranch(centerKey, 0, 0, Math.PI / 2, Math.PI * 0.6);

      const maxY = Math.max(0, ...Array.from(groupCenters.values()).map(p => p.cy));
      disconnectedPos = { cx: 0, cy: maxY + branchLen };

    } else if (layoutType === 'mandelbrot') {
      // Fractal spiral: groups placed along golden-angle spiral with fractal branching
      groupCenters.set(centerKey, { cx: 0, cy: 0 });
      const bfsDepth = new Map<string, number>();
      bfsDepth.set(centerKey, 0);
      for (const key of bfsOrder) {
        const parent = parentMap.get(key);
        if (parent !== undefined) {
          bfsDepth.set(key, (bfsDepth.get(parent) ?? 0) + 1);
        }
      }

      const golden = Math.PI * (3 - Math.sqrt(5));
      const childIndex = new Map<string, number>();
      const childCount = new Map<string, number>();
      for (const key of bfsOrder) {
        const parent = parentMap.get(key);
        if (parent !== undefined) {
          childCount.set(parent, (childCount.get(parent) ?? 0) + 1);
        }
      }

      for (const key of bfsOrder) {
        if (key === centerKey) continue;
        const parent = parentMap.get(key)!;
        const parentPos = groupCenters.get(parent) ?? { cx: 0, cy: 0 };
        const depth = bfsDepth.get(key) ?? 1;
        const siblings = childCount.get(parent) ?? 1;
        const idx = childIndex.get(parent) ?? 0;
        childIndex.set(parent, idx + 1);

        const parentR = groupRadii.get(parent) ?? 15;
        const myR = groupRadii.get(key) ?? 15;
        const baseAngle = parent === centerKey
          ? (2 * Math.PI * idx) / siblings
          : Math.atan2(parentPos.cy, parentPos.cx);
        const spiralAngle = baseAngle + idx * golden * 0.5;
        const dist = (parentR + myR) * spacingGroups + (150 + 100 / Math.sqrt(depth)) * spacingCenter;

        groupCenters.set(key, {
          cx: parentPos.cx + dist * Math.cos(spiralAngle),
          cy: parentPos.cy + dist * Math.sin(spiralAngle),
        });
      }
      const maxDist = Math.max(200, ...Array.from(groupCenters.values()).map(p => Math.sqrt(p.cx * p.cx + p.cy * p.cy)));
      disconnectedPos = { cx: 0, cy: maxDist + 400 };
    }

    // Place disconnected groups
    for (const key of unvisited) {
      groupCenters.set(key, disconnectedPos);
    }

    // Intra-group layout: most connected node at center, rest in concentric rings
    const nodeEdgeCount = new Map<string, number>();
    for (const edge of data.edges) {
      nodeEdgeCount.set(edge.source, (nodeEdgeCount.get(edge.source) ?? 0) + 1);
      nodeEdgeCount.set(edge.target, (nodeEdgeCount.get(edge.target) ?? 0) + 1);
    }

    const groupedNodes = new Map<string, typeof visibleNodes>();
    const loneNodes: typeof visibleNodes = [];
    for (const node of visibleNodes) {
      if ((nodeEdgeCount.get(node.id) ?? 0) === 0) {
        loneNodes.push(node);
      } else {
        const key = getGroupKey(node.qualifiedName);
        if (!groupedNodes.has(key)) groupedNodes.set(key, []);
        groupedNodes.get(key)!.push(node);
      }
    }
    for (const [, nodes] of groupedNodes) {
      nodes.sort((a, b) => (nodeEdgeCount.get(b.id) ?? 0) - (nodeEdgeCount.get(a.id) ?? 0));
    }
    if (loneNodes.length > 0) {
      if (!groupedNodes.has('__disconnected__')) groupedNodes.set('__disconnected__', []);
      groupedNodes.get('__disconnected__')!.push(...loneNodes);
      groupCenters.set('__disconnected__', disconnectedPos);
    }

    for (const [key, nodes] of groupedNodes) {
      const gc = groupCenters.get(key) ?? disconnectedPos;
      if (nodes.length === 1) {
        nodePositions.set(nodes[0].id, { x: gc.cx, y: gc.cy });
        continue;
      }
      nodePositions.set(nodes[0].id, { x: gc.cx, y: gc.cy });
      let ringIdx = 0;
      let placed = 1;
      while (placed < nodes.length) {
        ringIdx++;
        const r = ringIdx * intraGap;
        const capacity = Math.max(1, Math.floor(2 * Math.PI * r / intraGap));
        const count = Math.min(capacity, nodes.length - placed);
        for (let i = 0; i < count; i++) {
          const angle = (2 * Math.PI * i) / count - Math.PI / 2;
          nodePositions.set(nodes[placed].id, {
            x: gc.cx + r * Math.cos(angle),
            y: gc.cy + r * Math.sin(angle),
          });
          placed++;
        }
      }
    }
  }

  const visibleNodeIds = new Set<string>();

  for (const node of visibleNodes) {
    visibleNodeIds.add(node.id);

    const daysSince = node.lastAnalyzedAt
      ? (Date.now() - new Date(node.lastAnalyzedAt).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    let freshnessState: string;
    if (node.isStale) freshnessState = 'stale';
    else if (!node.lastAnalyzedAt || daysSince === Infinity) freshnessState = 'unknown';
    else if (daysSince < 7) freshnessState = 'fresh';
    else if (daysSince < 30) freshnessState = 'aging';
    else freshnessState = 'stale';

    const baseColor = getNodeColor(node.type);
    const color = freshnessState === 'stale' ? blendColor(baseColor, '#6E7681', 0.4)
      : freshnessState === 'aging' ? blendColor(baseColor, '#6E7681', 0.15)
      : freshnessState === 'unknown' ? blendColor(baseColor, '#6E7681', 0.6)
      : baseColor;

    const { x, y } = nodePositions.get(node.id) ?? { x: 0, y: 0 };

    let label = node.shortName;
    if ((nameCount.get(node.shortName) ?? 0) > 1) {
      const sep = node.qualifiedName.includes('\\') ? '\\' : node.qualifiedName.includes('/') ? '/' : '.';
      const parts = node.qualifiedName.split(sep);
      label = parts.length > 1 ? parts.slice(-2).join(sep) : node.shortName;
    }

    graph.addNode(node.id, {
      label,
      x,
      y,
      size: node.type === 'SYSTEM' ? 12 : node.type === 'PACKAGE' ? 10 : node.type === 'MODULE' ? 8 : 5,
      color,
      nodeType: node.type,
      qualifiedName: node.qualifiedName,
      filePath: node.filePath,
      isStale: node.isStale,
    });
  }

  for (const edge of data.edges) {
    if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) continue;
    if (edge.source === edge.target) continue;

    const edgeSize = (w: number) => Math.min(5, 1 + Math.log2(Math.max(1, w)));

    const types = edge.metadata?.constituentEdgeTypes as string[] | undefined;
    const count = edge.metadata?.constituentEdgeCount as number | undefined;
    let edgeLabel: string;
    if (types && types.length > 0) {
      edgeLabel = types.map((t) => t.toLowerCase()).join(', ');
      if (count && count > types.length) edgeLabel = `${count}x ${edgeLabel}`;
    } else {
      edgeLabel = edge.type.toLowerCase();
    }

    const existingEdge = graph.findEdge(edge.source, edge.target, () => true);
    if (existingEdge) {
      const rawWeight = (graph.getEdgeAttribute(existingEdge, 'rawWeight') ?? 1) + Math.max(1, edge.weight);
      graph.setEdgeAttribute(existingEdge, 'rawWeight', rawWeight);
      graph.setEdgeAttribute(existingEdge, 'size', edgeSize(rawWeight));
    } else {
      const w = Math.max(1, edge.weight);
      graph.addEdge(edge.source, edge.target, {
        label: edgeLabel,
        color: edge.metadata?.crossPackage ? '#F97316' : getEdgeColor(edge.type),
        size: edgeSize(w),
        rawWeight: w,
        edgeType: edge.type,
      });
    }
  }

  return graph;
}
