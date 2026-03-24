import { useNodeDetail } from '../api/hooks';
import { useUIStore } from '../store';
import { getNodeColor, getEdgeColor } from '../lib/node-colors';

export default function DetailPanel() {
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const detailPanelOpen = useUIStore((s) => s.detailPanelOpen);
  const selectNode = useUIStore((s) => s.selectNode);
  const { data, isLoading } = useNodeDetail(selectedNodeId);

  if (!detailPanelOpen) return null;

  if (!selectedNodeId) {
    return (
      <aside className="w-[360px] bg-surface-800 border-l border-border-default p-4 overflow-y-auto">
        <p className="text-text-tertiary text-sm">Click a node to see details</p>
      </aside>
    );
  }

  if (isLoading) {
    return (
      <aside className="w-[360px] bg-surface-800 border-l border-border-default p-4">
        <p className="text-text-secondary text-sm">Loading...</p>
      </aside>
    );
  }

  if (!data) return null;

  const { node, incoming, outgoing, peerNodes } = data;

  const daysSince = node.lastAnalyzedAt
    ? Math.floor((Date.now() - new Date(node.lastAnalyzedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  let freshnessLabel: string;
  let freshnessColor: string;
  if (node.isStale || (daysSince !== null && daysSince >= 30)) {
    freshnessLabel = daysSince !== null ? `Stale (${daysSince}d)` : 'Stale';
    freshnessColor = '#F85149';
  } else if (daysSince !== null && daysSince >= 7) {
    freshnessLabel = `Aging (${daysSince}d)`;
    freshnessColor = '#D29922';
  } else if (daysSince !== null && daysSince < 1) {
    freshnessLabel = 'Fresh (today)';
    freshnessColor = '#2EA043';
  } else if (daysSince !== null) {
    freshnessLabel = `Fresh (${daysSince}d)`;
    freshnessColor = '#2EA043';
  } else {
    freshnessLabel = 'Unknown';
    freshnessColor = '#6E7681';
  }

  return (
    <aside className="w-[360px] bg-surface-800 border-l border-border-default p-4 overflow-y-auto">
      <div className="flex items-center gap-2 mb-4">
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: getNodeColor(node.type) }}
        />
        <h2 className="text-text-primary font-semibold text-base truncate">{node.shortName}</h2>
        <button
          onClick={() => selectNode(null)}
          className="ml-auto text-text-tertiary hover:text-text-primary text-sm"
        >
          x
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <span className="px-2 py-0.5 text-xs rounded bg-surface-700 text-text-secondary">{node.type}</span>
        <span className="px-2 py-0.5 text-xs rounded bg-surface-700 text-text-secondary">{node.level}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ backgroundColor: freshnessColor + '20', color: freshnessColor }}>{freshnessLabel}</span>
      </div>

      <div className="mb-4">
        <p className="text-text-tertiary text-xs mb-1">Qualified Name</p>
        <p className="text-text-primary text-sm font-mono break-all">{node.qualifiedName}</p>
      </div>

      <div className="mb-4">
        <p className="text-text-tertiary text-xs mb-1">Location</p>
        <p className="text-text-link text-sm font-mono">{node.filePath}:{node.startLine}-{node.endLine}</p>
      </div>

      <div className="mb-4">
        <p className="text-text-tertiary text-xs mb-1">Last Analyzed</p>
        <p className="text-text-secondary text-sm">{new Date(node.lastAnalyzedAt).toLocaleString()}</p>
      </div>

      <div className="mb-4">
        <p className="text-text-tertiary text-xs mb-1">Connections</p>
        <p className="text-text-secondary text-sm">{incoming.length} incoming, {outgoing.length} outgoing</p>
      </div>

      {incoming.length > 0 && (
        <div className="mb-4">
          <p className="text-text-tertiary text-xs mb-2">Incoming ({incoming.length})</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {incoming.map((edge) => (
              <button
                key={edge.id}
                onClick={() => selectNode(edge.source)}
                className="w-full text-left px-2 py-1 text-xs hover:bg-surface-700 rounded flex items-center gap-1"
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getEdgeColor(edge.type) }} />
                <span className="text-text-secondary">{edge.type}</span>
                <span className="text-text-link truncate ml-1">{peerNodes[edge.source]?.shortName ?? edge.source}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="mb-4">
          <p className="text-text-tertiary text-xs mb-2">Outgoing ({outgoing.length})</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {outgoing.map((edge) => (
              <button
                key={edge.id}
                onClick={() => selectNode(edge.target)}
                className="w-full text-left px-2 py-1 text-xs hover:bg-surface-700 rounded flex items-center gap-1"
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getEdgeColor(edge.type) }} />
                <span className="text-text-secondary">{edge.type}</span>
                <span className="text-text-link truncate ml-1">{peerNodes[edge.target]?.shortName ?? edge.target}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
