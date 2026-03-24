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

export function buildGraphology(
  data: GraphData,
  visibleNodeTypes: Set<string>,
  visibleEdgeTypes: Set<string>,
): Graph {
  const graph = new Graph();

  const visibleNodeIds = new Set<string>();

  for (const node of data.nodes) {
    if (!visibleNodeTypes.has(node.type)) continue;
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

    graph.addNode(node.id, {
      label: node.shortName,
      x: Math.random() * 100,
      y: Math.random() * 100,
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
