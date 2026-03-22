import type { GraphStore, StoredNode, StoredEdge } from '@contextualizer/storage';
import type { NodeType, EdgeType } from '@contextualizer/core';
import { GraphLevel } from '@contextualizer/core';

export interface ReferenceResult {
  source: StoredNode;
  edgeType: EdgeType;
  edge: StoredEdge;
}

export interface DependencyResult {
  target: StoredNode;
  edgeType: EdgeType;
  edge: StoredEdge;
}

export interface DependentResult {
  id: string;
  qualifiedName: string;
  shortName: string;
  type: string;
  filePath: string | null;
  depth: number;
}

export async function searchSymbols(
  store: GraphStore,
  query: string,
  types?: NodeType[],
): Promise<StoredNode[]> {
  const allNodes = await store.getAllNodes();
  let results = allNodes.filter(n =>
    n.level === GraphLevel.COMPONENT &&
    (n.qualifiedName.includes(query) || n.shortName.includes(query))
  );

  if (types && types.length > 0) {
    const typeSet = new Set(types);
    results = results.filter(n => typeSet.has(n.type));
  }

  return results;
}

export async function findReferences(
  store: GraphStore,
  symbolName: string,
  edgeTypes?: EdgeType[],
): Promise<ReferenceResult[]> {
  const targetNode = await resolveSymbol(store, symbolName);
  if (!targetNode) return [];

  let edges = await store.getIncomingEdges(targetNode.id);
  if (edgeTypes && edgeTypes.length > 0) {
    const typeSet = new Set(edgeTypes);
    edges = edges.filter(e => typeSet.has(e.type));
  }

  const results: ReferenceResult[] = [];
  for (const edge of edges) {
    const source = await store.getNodeById(edge.source);
    if (source) {
      results.push({ source, edgeType: edge.type, edge });
    }
  }

  return results;
}

export async function findDependencies(
  store: GraphStore,
  symbolName: string,
  edgeTypes?: EdgeType[],
): Promise<DependencyResult[]> {
  const sourceNode = await resolveSymbol(store, symbolName);
  if (!sourceNode) return [];

  let edges = await store.getOutgoingEdges(sourceNode.id);
  if (edgeTypes && edgeTypes.length > 0) {
    const typeSet = new Set(edgeTypes);
    edges = edges.filter(e => typeSet.has(e.type));
  }

  const results: DependencyResult[] = [];
  for (const edge of edges) {
    const target = await store.getNodeById(edge.target);
    if (target) {
      results.push({ target, edgeType: edge.type, edge });
    }
  }

  return results;
}

export async function findDependents(
  store: GraphStore,
  symbolName: string,
  depth: number = 1,
): Promise<DependentResult[]> {
  const targetNode = await resolveSymbol(store, symbolName);
  if (!targetNode) return [];

  const visited = new Set<string>([targetNode.id]);
  const results: DependentResult[] = [];
  let queue = [targetNode.id];
  let currentDepth = 0;

  while (queue.length > 0 && currentDepth < depth) {
    const nextQueue: string[] = [];
    currentDepth++;

    for (const nodeId of queue) {
      const incomingEdges = await store.getIncomingEdges(nodeId);
      for (const edge of incomingEdges) {
        if (!visited.has(edge.source)) {
          visited.add(edge.source);
          nextQueue.push(edge.source);
          const node = await store.getNodeById(edge.source);
          if (node) {
            results.push({
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

  return results;
}

async function resolveSymbol(store: GraphStore, symbolName: string): Promise<StoredNode | null> {
  const exact = await store.getNodeByQualifiedName(symbolName);
  if (exact) return exact;

  const candidates = await store.getNodesByShortName(symbolName);
  if (candidates.length === 1) return candidates[0];

  const allNodes = await store.getAllNodes();
  const matches = allNodes.filter(n =>
    n.level === GraphLevel.COMPONENT && n.qualifiedName.includes(symbolName)
  );
  if (matches.length === 1) return matches[0];

  return matches[0] ?? null;
}
