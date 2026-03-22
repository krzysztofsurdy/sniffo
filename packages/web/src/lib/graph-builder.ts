import Graph from 'graphology';
import type { GraphData } from '../api/types';
import { getNodeColor, getEdgeColor } from './node-colors';

export function buildGraphology(
  data: GraphData,
  visibleNodeTypes: Set<string>,
  visibleEdgeTypes: Set<string>,
): Graph {
  const graph = new Graph({ multi: true });

  const visibleNodeIds = new Set<string>();

  for (const node of data.nodes) {
    if (!visibleNodeTypes.has(node.type)) continue;
    visibleNodeIds.add(node.id);

    graph.addNode(node.id, {
      label: node.shortName,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: node.type === 'SYSTEM' ? 12 : node.type === 'MODULE' ? 8 : 5,
      color: getNodeColor(node.type),
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

    try {
      graph.addEdge(edge.source, edge.target, {
        label: edge.type,
        color: getEdgeColor(edge.type),
        size: Math.max(1, edge.weight),
        edgeType: edge.type,
      });
    } catch {
      // Duplicate edge -- skip
    }
  }

  return graph;
}
