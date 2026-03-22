import type { GraphLevel, NodeType, EdgeType } from '@contextualizer/core';

export interface StoredNode {
  id: string;
  type: NodeType;
  level: GraphLevel;
  qualifiedName: string;
  shortName: string;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  contentHash: string | null;
  isStale: boolean;
  lastAnalyzedAt: string;
  metadata: Record<string, unknown>;
}

export interface StoredEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  level: GraphLevel;
  weight: number;
  metadata: Record<string, unknown>;
}

export interface GraphStore {
  initialize(): Promise<void>;
  close(): Promise<void>;

  // Nodes
  upsertNode(node: StoredNode): Promise<void>;
  getNodeById(id: string): Promise<StoredNode | null>;
  getNodeByQualifiedName(fqn: string): Promise<StoredNode | null>;
  getNodesByShortName(shortName: string): Promise<StoredNode[]>;
  getNodesByType(types: NodeType[]): Promise<StoredNode[]>;
  getNodesByFilePath(filePath: string): Promise<StoredNode[]>;
  removeNodesByFilePath(filePath: string): Promise<void>;
  getAllNodes(): Promise<StoredNode[]>;
  markNodesStale(nodeIds: string[]): Promise<void>;
  markNodesClean(nodeIds: string[]): Promise<void>;

  // Edges
  upsertEdge(edge: StoredEdge): Promise<void>;
  getOutgoingEdges(nodeId: string): Promise<StoredEdge[]>;
  getIncomingEdges(nodeId: string): Promise<StoredEdge[]>;
  getEdgesByType(type: EdgeType): Promise<StoredEdge[]>;
  removeEdgesBySourceFilePath(filePath: string): Promise<void>;
  removeEdgesByNodeId(nodeId: string): Promise<void>;
  getAllEdges(): Promise<StoredEdge[]>;

  // File hashes
  getFileHash(filePath: string): Promise<string | null>;
  setFileHash(filePath: string, hash: string, sizeBytes: number): Promise<void>;
  removeFileHash(filePath: string): Promise<void>;
  getAllTrackedPaths(): Promise<string[]>;

  // Analysis runs
  recordAnalysisRun(run: AnalysisRun): Promise<void>;
  getLastAnalysisRun(): Promise<AnalysisRun | null>;
}

export interface AnalysisRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  trigger: 'full' | 'incremental' | 'pre-commit';
  filesAnalyzed: number;
  nodesCreated: number;
  nodesUpdated: number;
  nodesDeleted: number;
  edgesCreated: number;
  edgesDeleted: number;
  status: 'running' | 'completed' | 'failed';
}
