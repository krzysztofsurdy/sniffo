import type { ApiResponse, GraphData, GraphNode, NodeDetail, StalenessReport, AnalysisResult, ChildrenData, BlastRadiusData, CyclesData, WorkspaceData, SavedView } from './types';

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
  createView: (name: string, nodeIds: string[]) =>
    fetchJson<SavedView>('/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, nodeIds }),
    }),
  deleteView: (id: string) =>
    fetchJson<void>(`/views/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
