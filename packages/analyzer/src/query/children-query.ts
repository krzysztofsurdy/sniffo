import type { GraphStore, StoredNode, StoredEdge } from '@sniffo/storage';
import { EdgeType } from '@sniffo/core';

export interface ChildrenResult {
  parentId: string;
  parentLabel: string;
  children: StoredNode[];
  edges: StoredEdge[];
}

export async function findChildren(store: GraphStore, parentId: string): Promise<ChildrenResult> {
  const parent = await store.getNodeById(parentId);
  if (!parent) {
    return { parentId, parentLabel: '', children: [], edges: [] };
  }

  const outgoing = await store.getOutgoingEdges(parentId);
  const containsEdges = outgoing.filter(e => e.type === EdgeType.CONTAINS);
  const childIds = new Set(containsEdges.map(e => e.target));

  const children: StoredNode[] = [];
  for (const childId of childIds) {
    const node = await store.getNodeById(childId);
    if (node) children.push(node);
  }

  const edges: StoredEdge[] = [];
  for (const child of children) {
    const childOutgoing = await store.getOutgoingEdges(child.id);
    for (const edge of childOutgoing) {
      if (edge.type !== EdgeType.CONTAINS && childIds.has(edge.target)) {
        edges.push(edge);
      }
    }
  }

  return { parentId, parentLabel: parent.shortName, children, edges };
}
