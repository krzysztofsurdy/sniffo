import type { GraphStore, StoredEdge } from '@contextualizer/storage';

export interface BlastRadiusNode {
  id: string;
  qualifiedName: string;
  shortName: string;
  type: string;
  filePath: string | null;
  depth: number;
}

export interface BlastRadiusResult {
  originId: string;
  maxDepth: number;
  affectedNodes: BlastRadiusNode[];
  affectedEdges: StoredEdge[];
}

export async function computeBlastRadius(
  store: GraphStore,
  originId: string,
  maxDepth: number = 2,
): Promise<BlastRadiusResult> {
  const visited = new Set<string>([originId]);
  const affectedNodes: BlastRadiusNode[] = [];
  const affectedEdges: StoredEdge[] = [];
  let queue = [originId];
  let currentDepth = 0;

  while (queue.length > 0 && currentDepth < maxDepth) {
    const nextQueue: string[] = [];
    currentDepth++;

    for (const nodeId of queue) {
      const incoming = await store.getIncomingEdges(nodeId);
      for (const edge of incoming) {
        affectedEdges.push(edge);
        if (!visited.has(edge.source)) {
          visited.add(edge.source);
          nextQueue.push(edge.source);
          const node = await store.getNodeById(edge.source);
          if (node) {
            affectedNodes.push({
              id: node.id,
              qualifiedName: node.qualifiedName,
              shortName: node.shortName,
              type: node.type,
              filePath: node.filePath,
              depth: currentDepth,
            });
          }
        }
      }
    }

    queue = nextQueue;
  }

  return { originId, maxDepth, affectedNodes, affectedEdges };
}
