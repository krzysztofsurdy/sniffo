import { GraphLevel, NodeType, EdgeType, createNodeId, createEdgeId } from '@sniffo/core';
import type { StoredNode, StoredEdge } from '@sniffo/storage';
import type { WorkspaceInfo } from './workspace-detector.js';

export interface HierarchyResult {
  systemNode: StoredNode;
  containerNodes: StoredNode[];
  containmentEdges: StoredEdge[];
}

export function buildHierarchy(
  componentNodes: StoredNode[],
  projectName: string,
  workspaces?: WorkspaceInfo | null,
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

  if (workspaces && workspaces.packages.length > 0) {
    return buildMonorepoHierarchy(systemNode, componentNodes, workspaces, now);
  }

  return buildFlatHierarchy(systemNode, componentNodes, now);
}

function buildFlatHierarchy(
  systemNode: StoredNode,
  componentNodes: StoredNode[],
  now: string,
): HierarchyResult {
  const containerNodes: StoredNode[] = [];
  const containmentEdges: StoredEdge[] = [];

  const namespaceMap = groupByNamespace(componentNodes);

  for (const [ns, members] of namespaceMap) {
    const containerNode = makeModuleNode(ns, members.length, now);
    containerNodes.push(containerNode);

    containmentEdges.push(makeContainsEdge(systemNode.id, containerNode.id, GraphLevel.SYSTEM));

    for (const member of members) {
      containmentEdges.push(makeContainsEdge(containerNode.id, member.id, GraphLevel.CONTAINER));
    }
  }

  return { systemNode, containerNodes, containmentEdges };
}

function buildMonorepoHierarchy(
  systemNode: StoredNode,
  componentNodes: StoredNode[],
  workspaces: WorkspaceInfo,
  now: string,
): HierarchyResult {
  const containerNodes: StoredNode[] = [];
  const containmentEdges: StoredEdge[] = [];

  const sortedPackages = [...workspaces.packages].sort(
    (a, b) => b.relativePath.length - a.relativePath.length,
  );

  const packageBuckets = new Map<string, StoredNode[]>();
  const unassigned: StoredNode[] = [];

  for (const pkg of workspaces.packages) {
    packageBuckets.set(pkg.relativePath, []);
  }

  for (const node of componentNodes) {
    const filePath = node.filePath ?? node.qualifiedName;
    let assigned = false;

    for (const pkg of sortedPackages) {
      if (filePath.startsWith(pkg.relativePath + '/') || filePath.startsWith(pkg.relativePath + '\\')) {
        packageBuckets.get(pkg.relativePath)!.push(node);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      unassigned.push(node);
    }
  }

  for (const pkg of workspaces.packages) {
    const members = packageBuckets.get(pkg.relativePath) ?? [];
    if (members.length === 0) continue;

    const packageNode: StoredNode = {
      id: createNodeId(NodeType.PACKAGE, pkg.name),
      type: NodeType.PACKAGE,
      level: GraphLevel.CONTAINER,
      qualifiedName: pkg.name,
      shortName: pkg.name,
      filePath: null,
      startLine: null,
      endLine: null,
      contentHash: null,
      isStale: false,
      lastAnalyzedAt: now,
      metadata: {
        namespace: pkg.name,
        directory: pkg.relativePath,
        fileCount: members.length,
        workspaceType: workspaces.type,
      },
    };
    containerNodes.push(packageNode);

    containmentEdges.push(makeContainsEdge(systemNode.id, packageNode.id, GraphLevel.SYSTEM));

    const namespaceMap = groupByNamespace(members);

    for (const [ns, nsMembers] of namespaceMap) {
      const moduleNode = makeModuleNode(`${pkg.name}::${ns}`, nsMembers.length, now);
      containerNodes.push(moduleNode);

      containmentEdges.push(makeContainsEdge(packageNode.id, moduleNode.id, GraphLevel.CONTAINER));

      for (const member of nsMembers) {
        containmentEdges.push(makeContainsEdge(moduleNode.id, member.id, GraphLevel.CONTAINER));
      }
    }
  }

  if (unassigned.length > 0) {
    const namespaceMap = groupByNamespace(unassigned);
    for (const [ns, members] of namespaceMap) {
      const moduleNode = makeModuleNode(ns, members.length, now);
      containerNodes.push(moduleNode);

      containmentEdges.push(makeContainsEdge(systemNode.id, moduleNode.id, GraphLevel.SYSTEM));

      for (const member of members) {
        containmentEdges.push(makeContainsEdge(moduleNode.id, member.id, GraphLevel.CONTAINER));
      }
    }
  }

  return { systemNode, containerNodes, containmentEdges };
}

function groupByNamespace(nodes: StoredNode[]): Map<string, StoredNode[]> {
  const map = new Map<string, StoredNode[]>();
  for (const node of nodes) {
    const ns = extractNamespace(node.qualifiedName);
    if (!map.has(ns)) map.set(ns, []);
    map.get(ns)!.push(node);
  }
  return map;
}

function extractNamespace(qualifiedName: string): string {
  if (qualifiedName.includes('\\')) {
    const parts = qualifiedName.split('\\');
    if (parts.length <= 1) return '(global)';
    return parts.slice(0, -1).join('\\');
  }
  if (qualifiedName.includes('.')) {
    const withoutMember = qualifiedName.split('::')[0];
    const segments = withoutMember.split('.');
    if (segments.length <= 1) return '(global)';
    return segments.slice(0, -1).join('.');
  }
  return '(global)';
}

function makeModuleNode(ns: string, fileCount: number, now: string): StoredNode {
  return {
    id: createNodeId(NodeType.MODULE, ns),
    type: NodeType.MODULE,
    level: GraphLevel.CONTAINER,
    qualifiedName: ns,
    shortName: ns.split('\\').pop()?.split('.').pop() || ns,
    filePath: null,
    startLine: null,
    endLine: null,
    contentHash: null,
    isStale: false,
    lastAnalyzedAt: now,
    metadata: {
      namespace: ns,
      directory: '',
      fileCount,
    },
  };
}

function makeContainsEdge(sourceId: string, targetId: string, level: GraphLevel): StoredEdge {
  return {
    id: createEdgeId(sourceId, targetId, EdgeType.CONTAINS),
    source: sourceId,
    target: targetId,
    type: EdgeType.CONTAINS,
    level,
    weight: 1.0,
    metadata: {},
  };
}
