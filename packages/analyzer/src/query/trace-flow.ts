import type { GraphStore, StoredNode, StoredEdge } from '@sniffo/storage';
import type { EdgeType } from '@sniffo/core';

export interface TraceFlowOptions {
  edgeTypes: EdgeType[];
  depth: number;
  direction: 'outgoing' | 'incoming' | 'both';
}

export interface TraceFlowResult {
  rootId: string;
  nodes: StoredNode[];
  edges: StoredEdge[];
}

export async function traceFlow(
  store: GraphStore,
  rootId: string,
  options: TraceFlowOptions,
): Promise<TraceFlowResult> {
  const rootNode = await store.getNodeById(rootId);
  if (!rootNode) {
    return { rootId, nodes: [], edges: [] };
  }

  const edgeTypeSet = new Set(options.edgeTypes as string[]);
  const visitedNodes = new Set<string>([rootId]);
  const collectedEdges = new Map<string, StoredEdge>();
  let frontier = [rootId];

  for (let d = 0; d < options.depth && frontier.length > 0; d++) {
    const nextFrontier: string[] = [];

    for (const nodeId of frontier) {
      const candidateEdges: StoredEdge[] = [];

      if (options.direction === 'outgoing' || options.direction === 'both') {
        const outgoing = await store.getOutgoingEdges(nodeId);
        candidateEdges.push(...outgoing);
      }

      if (options.direction === 'incoming' || options.direction === 'both') {
        const incoming = await store.getIncomingEdges(nodeId);
        candidateEdges.push(...incoming);
      }

      for (const edge of candidateEdges) {
        if (!edgeTypeSet.has(edge.type)) continue;

        collectedEdges.set(edge.id, edge);

        const neighborId = edge.source === nodeId ? edge.target : edge.source;
        if (!visitedNodes.has(neighborId)) {
          visitedNodes.add(neighborId);
          nextFrontier.push(neighborId);
        }
      }
    }

    frontier = nextFrontier;
  }

  const nodeMap = new Map<string, StoredNode>();
  nodeMap.set(rootId, rootNode);

  for (const nodeId of visitedNodes) {
    if (nodeMap.has(nodeId)) continue;
    const node = await store.getNodeById(nodeId);
    if (node) nodeMap.set(nodeId, node);
  }

  return {
    rootId,
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(collectedEdges.values()),
  };
}
