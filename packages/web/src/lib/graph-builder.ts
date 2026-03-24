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

function extractNamespace(qualifiedName: string): string {
  const sep = qualifiedName.includes('\\') ? '\\' : qualifiedName.includes('/') ? '/' : '.';
  const parts = qualifiedName.split(sep);
  return parts.length > 1 ? parts.slice(0, -1).join(sep) : '';
}

export function buildGraphology(
  data: GraphData,
  visibleNodeTypes: Set<string>,
  visibleEdgeTypes: Set<string>,
): Graph {
  const graph = new Graph();

  const visibleNodes = data.nodes.filter((n) => visibleNodeTypes.has(n.type));

  const nsNodes = new Map<string, number>();
  for (const node of visibleNodes) {
    const ns = extractNamespace(node.qualifiedName);
    nsNodes.set(ns, (nsNodes.get(ns) ?? 0) + 1);
  }

  const sorted = Array.from(nsNodes.keys()).sort();

  const topLevel = new Map<string, string[]>();
  for (const ns of sorted) {
    const sep = ns.includes('\\') ? '\\' : ns.includes('/') ? '/' : '.';
    const parts = ns.split(sep);
    const top = parts.slice(0, Math.min(2, parts.length)).join(sep) || ns;
    if (!topLevel.has(top)) topLevel.set(top, []);
    topLevel.get(top)!.push(ns);
  }

  const groupSpacing = 60;
  const nsPositions = new Map<string, { cx: number; cy: number }>();
  let groupIdx = 0;
  const groupCount = Math.max(1, topLevel.size);
  for (const [, children] of topLevel) {
    const groupAngle = (2 * Math.PI * groupIdx) / groupCount;
    const groupRadius = groupCount * groupSpacing / (2 * Math.PI);
    const gcx = groupRadius * Math.cos(groupAngle);
    const gcy = groupRadius * Math.sin(groupAngle);

    const subSpacing = 20;
    const cols = Math.ceil(Math.sqrt(children.length));
    for (let ci = 0; ci < children.length; ci++) {
      const row = Math.floor(ci / cols);
      const col = ci % cols;
      nsPositions.set(children[ci], {
        cx: gcx + (col - cols / 2) * subSpacing,
        cy: gcy + (row - cols / 2) * subSpacing,
      });
    }
    groupIdx++;
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

    const ns = extractNamespace(node.qualifiedName);
    const center = nsPositions.get(ns) ?? { cx: 0, cy: 0 };
    const jitter = 12;

    graph.addNode(node.id, {
      label: node.shortName,
      x: center.cx + (Math.random() - 0.5) * jitter,
      y: center.cy + (Math.random() - 0.5) * jitter,
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

    const existingEdge = graph.findEdge(edge.source, edge.target, () => true);
    if (existingEdge) {
      const rawWeight = (graph.getEdgeAttribute(existingEdge, 'rawWeight') ?? 1) + Math.max(1, edge.weight);
      graph.setEdgeAttribute(existingEdge, 'rawWeight', rawWeight);
      graph.setEdgeAttribute(existingEdge, 'size', edgeSize(rawWeight));
    } else {
      const w = Math.max(1, edge.weight);
      graph.addEdge(edge.source, edge.target, {
        label: edge.type,
        color: edge.metadata?.crossPackage ? '#F97316' : getEdgeColor(edge.type),
        size: edgeSize(w),
        rawWeight: w,
        edgeType: edge.type,
      });
    }
  }

  return graph;
}
