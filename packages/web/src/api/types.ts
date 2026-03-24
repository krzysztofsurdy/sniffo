export interface GraphNode {
  id: string;
  type: string;
  level: string;
  qualifiedName: string;
  shortName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  contentHash: string;
  isStale: boolean;
  lastAnalyzedAt: string;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  level: string;
  weight: number;
  metadata: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface NodeDetail {
  node: GraphNode;
  incoming: GraphEdge[];
  outgoing: GraphEdge[];
}

export interface StalenessReport {
  totalNodes: number;
  staleNodes: Array<{ id: string; qualifiedName: string; filePath: string }>;
  stalePercentage: number;
  lastAnalysisRun: { startedAt: string; trigger: string } | null;
}

export interface AnalysisResult {
  filesScanned: number;
  filesAnalyzed: number;
  filesSkipped: number;
  filesFailed: number;
  symbolsFound: number;
  referencesFound: number;
  durationMs: number;
  errors: Array<{ phase: string; filePath: string; message: string }>;
}

export interface ChildrenData {
  parentId: string;
  parentLabel: string;
  children: GraphNode[];
  edges: GraphEdge[];
}

export interface BlastRadiusNode {
  id: string;
  qualifiedName: string;
  shortName: string;
  type: string;
  filePath: string | null;
  depth: number;
}

export interface BlastRadiusData {
  originId: string;
  maxDepth: number;
  affectedNodes: BlastRadiusNode[];
  affectedEdges: GraphEdge[];
}

export interface CyclesData {
  cycles: string[][];
  count: number;
}

export interface WorkspacePackage {
  name: string;
  path: string;
}

export interface WorkspaceData {
  type: 'pnpm' | 'npm' | 'composer';
  packages: WorkspacePackage[];
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}
