import { EdgeType } from '@sniffo/core';
import type { GraphStore } from '@sniffo/storage';

const MAX_DEPTH = 2;
const STRUCTURAL_EDGE_TYPES = new Set([EdgeType.EXTENDS, EdgeType.IMPLEMENTS, EdgeType.USES_TRAIT]);

export interface InvalidationResult {
  directlyChanged: string[];
  cascadeInvalidated: string[];
  stats: {
    directlyChangedCount: number;
    cascadeInvalidatedCount: number;
    edgesMarkedStale: number;
    cascadeDepth: number;
  };
}

export async function cascadeInvalidation(
  store: GraphStore,
  changedFilePaths: string[],
): Promise<InvalidationResult> {
  const directlyChanged: string[] = [];
  for (const filePath of changedFilePaths) {
    const nodes = await store.getNodesByFilePath(filePath);
    for (const node of nodes) {
      directlyChanged.push(node.id);
    }
  }

  const visited = new Set<string>(directlyChanged);
  const cascadeInvalidated: string[] = [];
  let queue = [...directlyChanged];
  let depth = 0;
  let edgesMarkedStale = 0;

  while (queue.length > 0 && depth < MAX_DEPTH) {
    const nextQueue: string[] = [];

    for (const nodeId of queue) {
      const incomingEdges = await store.getIncomingEdges(nodeId);

      for (const edge of incomingEdges) {
        edgesMarkedStale++;

        if (!visited.has(edge.source)) {
          visited.add(edge.source);
          cascadeInvalidated.push(edge.source);

          if (STRUCTURAL_EDGE_TYPES.has(edge.type)) {
            nextQueue.push(edge.source);
          }
        }
      }
    }

    queue = nextQueue;
    depth++;
  }

  if (cascadeInvalidated.length > 0) {
    await store.markNodesStale(cascadeInvalidated);
  }

  return {
    directlyChanged,
    cascadeInvalidated,
    stats: {
      directlyChangedCount: directlyChanged.length,
      cascadeInvalidatedCount: cascadeInvalidated.length,
      edgesMarkedStale,
      cascadeDepth: depth,
    },
  };
}
