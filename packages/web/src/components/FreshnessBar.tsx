import { useStatus, useRefresh } from '../api/hooks';

export default function FreshnessBar() {
  const { data: status } = useStatus();
  const refresh = useRefresh();

  if (!status) return null;

  const pct = status.stalePercentage;
  const color = pct === 0 ? '#2EA043' : pct < 20 ? '#D29922' : '#F85149';

  return (
    <div className="h-8 flex items-center px-4 gap-4 bg-surface-800 border-b border-border-default text-xs">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-text-secondary">
          {status.totalNodes} nodes, {status.staleNodes.length} stale ({pct}%)
        </span>
      </div>

      {status.lastAnalysisRun && (
        <span className="text-text-tertiary">
          Last: {new Date(status.lastAnalysisRun.startedAt).toLocaleString()}
        </span>
      )}

      <button
        onClick={() => refresh.mutate(undefined)}
        disabled={refresh.isPending}
        className="ml-auto px-2 py-0.5 bg-surface-700 border border-border-default rounded text-text-secondary hover:text-text-primary hover:bg-surface-600 disabled:opacity-50"
      >
        {refresh.isPending ? 'Refreshing...' : 'Refresh'}
      </button>

      {refresh.isSuccess && refresh.data && (
        <span className="text-text-tertiary">
          Updated {refresh.data.filesAnalyzed} files in {refresh.data.durationMs}ms
        </span>
      )}
    </div>
  );
}
