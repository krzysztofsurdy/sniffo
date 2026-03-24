import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export function useGraphData(level: string) {
  return useQuery({
    queryKey: ['graph', level],
    queryFn: () => api.getGraph(level),
  });
}

export function useNodeDetail(nodeId: string | null) {
  return useQuery({
    queryKey: ['node', nodeId],
    queryFn: () => api.getNode(nodeId!),
    enabled: !!nodeId,
  });
}

export function useSearch(query: string) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => api.search(query),
    enabled: query.length >= 2,
  });
}

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => api.getStatus(),
    refetchInterval: 60_000,
  });
}

export function useChildren(nodeId: string | null) {
  return useQuery({
    queryKey: ['children', nodeId],
    queryFn: () => api.getChildren(nodeId!),
    enabled: !!nodeId,
  });
}

export function useBlastRadius(nodeId: string | null, depth: number) {
  return useQuery({
    queryKey: ['blastRadius', nodeId, depth],
    queryFn: () => api.getBlastRadius(nodeId!, depth),
    enabled: !!nodeId,
  });
}

export function useCycles() {
  return useQuery({
    queryKey: ['cycles'],
    queryFn: () => api.getCycles(),
  });
}

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api.getWorkspaces(),
  });
}

export function useRefresh() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (files?: string[]) => api.refresh(files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['graph'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });
}

export function useTrace(
  nodeId: string | null,
  edgeTypes: string[],
  depth: number,
  direction: string,
) {
  return useQuery({
    queryKey: ['trace', nodeId, edgeTypes.join(','), depth, direction],
    queryFn: () => api.getTrace(nodeId!, edgeTypes, depth, direction),
    enabled: !!nodeId,
  });
}

export function useViews() {
  return useQuery({ queryKey: ['views'], queryFn: () => api.getViews() });
}

export function useCreateView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      name: string;
      rootNodeId: string;
      rootLabel: string;
      edgeTypes: string[];
      depth: number;
      direction: string;
    }) => api.createView(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['views'] }),
  });
}

export function useDeleteView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteView(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['views'] }),
  });
}
