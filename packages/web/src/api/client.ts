import type { ApiResponse, GraphData, GraphNode, GraphEdge, NodeDetail, StalenessReport, AnalysisResult, ChildrenData, BlastRadiusData, CyclesData, WorkspaceData, SavedView, DocTreeNode } from './types';

const BASE_URL = '/api';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, init);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  const json = await res.json() as ApiResponse<T>;
  if (!json.success) {
    throw new Error(json.error ?? 'Unknown API error');
  }
  return json.data;
}

export const api = {
  getGraph: (level: string) => fetchJson<GraphData>(`/graph/${level}`),
  getNode: (id: string) => fetchJson<NodeDetail>(`/node/${encodeURIComponent(id)}`),
  search: (query: string) => fetchJson<GraphNode[]>(`/search?q=${encodeURIComponent(query)}`),
  getStatus: () => fetchJson<StalenessReport>('/status'),
  refresh: (files?: string[]) =>
    fetchJson<AnalysisResult>('/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    }),
  getChildren: (nodeId: string) => fetchJson<ChildrenData>(`/node/${encodeURIComponent(nodeId)}/children`),
  getBlastRadius: (nodeId: string, depth: number) => fetchJson<BlastRadiusData>(`/blast-radius/${encodeURIComponent(nodeId)}?depth=${depth}`),
  getCycles: () => fetchJson<CyclesData>('/cycles'),
  getWorkspaces: () => fetchJson<WorkspaceData | null>('/workspaces'),

  getViews: () => fetchJson<SavedView[]>('/views'),
  createView: (params: {
    name: string;
    rootNodeId: string;
    rootLabel: string;
    edgeTypes: string[];
    depth: number;
    direction: string;
  }) =>
    fetchJson<SavedView>('/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }),
  deleteView: (id: string) =>
    fetchJson<void>(`/views/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getDocsTree: () => fetchJson<{ tree: DocTreeNode[] }>('/docs'),
  getDocContent: (path: string) => fetchJson<{ path: string; content: string }>(`/docs/${path}`),

  getTrace: (nodeId: string, edgeTypes: string[], depth: number, direction: string) => {
    const params = new URLSearchParams({
      edgeTypes: edgeTypes.join(','),
      depth: String(depth),
      direction,
    });
    return fetchJson<{ rootId: string; nodes: GraphNode[]; edges: GraphEdge[] }>(
      `/trace/${encodeURIComponent(nodeId)}?${params}`,
    );
  },
};
