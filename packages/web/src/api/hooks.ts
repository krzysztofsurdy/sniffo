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
