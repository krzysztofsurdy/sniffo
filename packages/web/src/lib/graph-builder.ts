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

  const spacing = 10;
  const gap = 40;

  const groups: Array<{ namespaces: string[]; nodeCount: number; side: number }> = [];
  for (const [, children] of topLevel) {
    let nodeCount = 0;
    for (const ns of children) nodeCount += nsNodes.get(ns) ?? 0;
    const side = Math.ceil(Math.sqrt(nodeCount)) * spacing;
    groups.push({ namespaces: children, nodeCount, side });
  }

  groups.sort((a, b) => b.nodeCount - a.nodeCount);

  const totalArea = groups.reduce((s, g) => s + g.side * g.side, 0);
  const maxRowWidth = Math.max(Math.sqrt(totalArea) * 1.5, groups[0]?.side ?? 0);

  const nsPositions = new Map<string, { cx: number; cy: number }>();
  let rowX = 0;
  let rowY = 0;
  let rowMaxHeight = 0;

  for (const group of groups) {
    if (rowX > 0 && rowX + group.side > maxRowWidth) {
      rowY += rowMaxHeight + gap;
      rowX = 0;
      rowMaxHeight = 0;
    }

    const gcx = rowX + group.side / 2;
    const gcy = rowY + group.side / 2;

    let subIdx = 0;
    for (const ns of group.namespaces) {
      const count = nsNodes.get(ns) ?? 0;
      const subCols = Math.max(1, Math.ceil(Math.sqrt(count)));
      const blockW = subCols * spacing;
      const subRow = Math.floor(subIdx / Math.max(1, Math.floor(group.side / blockW)));
      const subCol = subIdx % Math.max(1, Math.floor(group.side / blockW));

      nsPositions.set(ns, {
        cx: gcx - group.side / 2 + subCol * blockW + blockW / 2,
        cy: gcy - group.side / 2 + subRow * blockW + blockW / 2,
      });
      subIdx++;
    }

    rowX += group.side + gap;
    rowMaxHeight = Math.max(rowMaxHeight, group.side);
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
