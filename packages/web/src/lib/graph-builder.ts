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

interface NsTree {
  children: Map<string, NsTree>;
  nodeCount: number;
}

function buildNsTree(nodes: Array<{ qualifiedName: string }>): NsTree {
  const root: NsTree = { children: new Map(), nodeCount: 0 };
  for (const node of nodes) {
    const sep = node.qualifiedName.includes('\\') ? '\\' : node.qualifiedName.includes('/') ? '/' : '.';
    const parts = node.qualifiedName.split(sep);
    const nsParts = parts.slice(0, -1);

    let cur = root;
    cur.nodeCount++;
    for (const part of nsParts) {
      if (!cur.children.has(part)) {
        cur.children.set(part, { children: new Map(), nodeCount: 0 });
      }
      cur = cur.children.get(part)!;
      cur.nodeCount++;
    }
  }
  return root;
}

interface Circle { cx: number; cy: number; r: number }

function layoutCirclePack(tree: NsTree, cx: number, cy: number, radius: number): Map<string, Circle> {
  const result = new Map<string, Circle>();
  packRecursive(tree, cx, cy, radius, '', result);
  return result;
}

function packRecursive(
  tree: NsTree,
  cx: number,
  cy: number,
  radius: number,
  prefix: string,
  result: Map<string, Circle>,
): void {
  if (tree.children.size === 0) {
    result.set(prefix, { cx, cy, r: radius });
    return;
  }

  const entries = Array.from(tree.children.entries())
    .sort((a, b) => b[1].nodeCount - a[1].nodeCount);

  const total = entries.reduce((s, [, t]) => s + t.nodeCount, 0);
  if (total === 0) return;

  const innerRadius = radius * 0.85;

  if (entries.length === 1) {
    const [name, subtree] = entries[0];
    const childPrefix = prefix ? `${prefix}\\${name}` : name;
    if (subtree.children.size > 0) {
      packRecursive(subtree, cx, cy, innerRadius, childPrefix, result);
    } else {
      result.set(childPrefix, { cx, cy, r: innerRadius });
    }
    return;
  }

  for (let i = 0; i < entries.length; i++) {
    const [name, subtree] = entries[i];
    const ratio = subtree.nodeCount / total;
    const childR = innerRadius * Math.sqrt(ratio);
    const angle = (2 * Math.PI * i) / entries.length - Math.PI / 2;
    const dist = innerRadius - childR;
    const childCx = cx + dist * Math.cos(angle);
    const childCy = cy + dist * Math.sin(angle);
    const childPrefix = prefix ? `${prefix}\\${name}` : name;

    if (subtree.children.size > 0) {
      packRecursive(subtree, childCx, childCy, childR, childPrefix, result);
    } else {
      result.set(childPrefix, { cx: childCx, cy: childCy, r: childR });
    }
  }
}

function getNodeNamespace(qualifiedName: string): string {
  const sep = qualifiedName.includes('\\') ? '\\' : qualifiedName.includes('/') ? '/' : '.';
  const parts = qualifiedName.split(sep);
  return parts.length > 1 ? parts.slice(0, -1).join('\\') : '';
}

export function buildGraphology(
  data: GraphData,
  visibleNodeTypes: Set<string>,
  visibleEdgeTypes: Set<string>,
): Graph {
  const graph = new Graph();

  const visibleNodes = data.nodes.filter((n) => visibleNodeTypes.has(n.type));

  const tree = buildNsTree(visibleNodes);
  const totalNodes = visibleNodes.length;
  const totalRadius = Math.max(100, Math.sqrt(totalNodes) * 10);
  const circles = layoutCirclePack(tree, 0, 0, totalRadius);

  function findCircle(ns: string): Circle | undefined {
    if (circles.has(ns)) return circles.get(ns);
    const parts = ns.split('\\');
    for (let i = parts.length - 1; i >= 0; i--) {
      const parent = parts.slice(0, i).join('\\');
      if (circles.has(parent)) return circles.get(parent);
    }
    return undefined;
  }

  const nsCounters = new Map<string, number>();
  const nsTotals = new Map<string, number>();
  for (const node of visibleNodes) {
    const ns = getNodeNamespace(node.qualifiedName);
    nsTotals.set(ns, (nsTotals.get(ns) ?? 0) + 1);
  }

  const nameCount = new Map<string, number>();
  for (const node of visibleNodes) {
    nameCount.set(node.shortName, (nameCount.get(node.shortName) ?? 0) + 1);
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

    const ns = getNodeNamespace(node.qualifiedName);
    const circle = findCircle(ns);

    let x: number, y: number;
    if (circle) {
      const idx = nsCounters.get(ns) ?? 0;
      nsCounters.set(ns, idx + 1);
      const angle = (2 * Math.PI * idx) / Math.max(1, nsTotals.get(ns) ?? 1);
      const dist = circle.r * 0.6 * Math.sqrt((idx + 1) / Math.max(1, circle.r));
      x = circle.cx + dist * Math.cos(angle);
      y = circle.cy + dist * Math.sin(angle);
    } else {
      x = (Math.random() - 0.5) * totalRadius * 2;
      y = (Math.random() - 0.5) * totalRadius * 2;
    }

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
        color: edge.metadata?.crossPackage ? '#F97316' : getEdgeColor(edge.type),
        size: edgeSize(w),
        rawWeight: w,
        edgeType: edge.type,
      });
    }
  }

  return graph;
}
