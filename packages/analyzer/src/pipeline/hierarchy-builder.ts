import { GraphLevel, NodeType, EdgeType, createNodeId, createEdgeId } from '@contextualizer/core';
import type { StoredNode, StoredEdge } from '@contextualizer/storage';

export interface HierarchyResult {
  systemNode: StoredNode;
  containerNodes: StoredNode[];
  containmentEdges: StoredEdge[];
}

export function buildHierarchy(
  componentNodes: StoredNode[],
  projectName: string,
): HierarchyResult {
  const now = new Date().toISOString();

  const systemNode: StoredNode = {
    id: createNodeId(NodeType.SYSTEM, projectName),
    type: NodeType.SYSTEM,
    level: GraphLevel.SYSTEM,
    qualifiedName: projectName,
    shortName: projectName,
    filePath: null,
    startLine: null,
    endLine: null,
    contentHash: null,
    isStale: false,
    lastAnalyzedAt: now,
    metadata: {},
  };

  const namespaceMap = new Map<string, StoredNode[]>();
  for (const node of componentNodes) {
    const ns = extractNamespace(node.qualifiedName);
    if (!namespaceMap.has(ns)) namespaceMap.set(ns, []);
    namespaceMap.get(ns)!.push(node);
  }

  const containerNodes: StoredNode[] = [];
  const containmentEdges: StoredEdge[] = [];

  for (const [ns, members] of namespaceMap) {
    const containerNode: StoredNode = {
      id: createNodeId(NodeType.MODULE, ns),
      type: NodeType.MODULE,
      level: GraphLevel.CONTAINER,
      qualifiedName: ns,
      shortName: ns.split('\\').pop() || ns,
      filePath: null,
      startLine: null,
      endLine: null,
      contentHash: null,
      isStale: false,
      lastAnalyzedAt: now,
      metadata: {
        namespace: ns,
        directory: '',
        fileCount: members.length,
      },
    };
    containerNodes.push(containerNode);

    containmentEdges.push({
      id: createEdgeId(systemNode.id, containerNode.id, EdgeType.CONTAINS),
      source: systemNode.id,
      target: containerNode.id,
      type: EdgeType.CONTAINS,
      level: GraphLevel.SYSTEM,
      weight: 1.0,
      metadata: {},
    });

    for (const member of members) {
      containmentEdges.push({
        id: createEdgeId(containerNode.id, member.id, EdgeType.CONTAINS),
        source: containerNode.id,
        target: member.id,
        type: EdgeType.CONTAINS,
        level: GraphLevel.CONTAINER,
        weight: 1.0,
        metadata: {},
      });
    }
  }

  return { systemNode, containerNodes, containmentEdges };
}

function extractNamespace(qualifiedName: string): string {
  const parts = qualifiedName.split('\\');
  if (parts.length <= 1) return '(global)';
  return parts.slice(0, -1).join('\\');
}
