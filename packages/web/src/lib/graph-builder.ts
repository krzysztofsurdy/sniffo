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
): Graph {
  const graph = new Graph();

  const visibleNodes = data.nodes.filter((n) =>
    visibleNodeTypes.has(n.type) &&
    (!hiddenNamespaces?.size || !isNamespaceHidden(n.qualifiedName, hiddenNamespaces))
  );

  const nameCount = new Map<string, number>();
  for (const node of visibleNodes) {
    nameCount.set(node.shortName, (nameCount.get(node.shortName) ?? 0) + 1);
  }

  // Compute node positions based on layout type
  const nodePositions = new Map<string, { x: number; y: number }>();

  if (layoutType === 'sunshine') {
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
      if (!visibleEdgeTypes.has(edge.type)) continue;
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
    const center = groupKeys.reduce((best, k) =>
      (groupTotalEdges.get(k) ?? 0) > (groupTotalEdges.get(best) ?? 0) ? k : best
    , groupKeys[0]);

    const groupCenters = new Map<string, { cx: number; cy: number }>();
    groupCenters.set(center, { cx: 0, cy: 0 });

    const visited = new Set<string>([center]);
    let queue: string[] = [center];
    const ringGap = 400;
    let ring = 0;

    while (queue.length > 0) {
      ring++;
      const ringGroups: string[] = [];
      const nextQueue: string[] = [];

      for (const current of queue) {
        const neighbors = groupEdges.get(current);
        if (!neighbors) continue;
        for (const [neighbor] of neighbors) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          ringGroups.push(neighbor);
          nextQueue.push(neighbor);
        }
      }

      const radius = ring * ringGap;
      for (let i = 0; i < ringGroups.length; i++) {
        const angle = (2 * Math.PI * i) / ringGroups.length - Math.PI / 2;
        groupCenters.set(ringGroups[i], {
          cx: radius * Math.cos(angle),
          cy: radius * Math.sin(angle),
        });
      }

      queue = nextQueue;
    }

    // Disconnected groups all go to one spot
    const unvisited = groupKeys.filter(k => !visited.has(k));
    if (unvisited.length > 0) {
      const pos = { cx: 0, cy: (ring + 1) * ringGap };
      for (const key of unvisited) {
        groupCenters.set(key, pos);
      }
    }

    // Intra-group sunshine: most connected node at center, rest in concentric rings
    const nodeEdgeCount = new Map<string, number>();
    for (const edge of data.edges) {
      if (!visibleEdgeTypes.has(edge.type)) continue;
      nodeEdgeCount.set(edge.source, (nodeEdgeCount.get(edge.source) ?? 0) + 1);
      nodeEdgeCount.set(edge.target, (nodeEdgeCount.get(edge.target) ?? 0) + 1);
    }

    const groupedNodes = new Map<string, typeof visibleNodes>();
    for (const node of visibleNodes) {
      const key = getGroupKey(node.qualifiedName);
      if (!groupedNodes.has(key)) groupedNodes.set(key, []);
      groupedNodes.get(key)!.push(node);
    }
    for (const [, nodes] of groupedNodes) {
      nodes.sort((a, b) => (nodeEdgeCount.get(b.id) ?? 0) - (nodeEdgeCount.get(a.id) ?? 0));
    }

    const intraGap = 20;
    for (const [key, nodes] of groupedNodes) {
      const gc = groupCenters.get(key) ?? { cx: 0, cy: 0 };
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
  } else {
    // Force-directed: random initial positions, FA2 handles layout
    const spread = Math.sqrt(visibleNodes.length) * 10;
    for (const node of visibleNodes) {
      nodePositions.set(node.id, {
        x: (Math.random() - 0.5) * spread,
        y: (Math.random() - 0.5) * spread,
      });
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
    if (!visibleEdgeTypes.has(edge.type)) continue;
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
        color: (edge.metadata?.crossPackage ? '#F97316' : getEdgeColor(edge.type)) + '80',
        size: edgeSize(w),
        rawWeight: w,
        edgeType: edge.type,
      });
    }
  }

  return graph;
}
