import { useState } from 'react';
import { useViews, useCreateView, useDeleteView } from '../api/hooks';
import { useUIStore, useNavigationStore } from '../store';
import type { SavedView } from '../api/types';

const TRACE_EDGE_OPTIONS = [
  { value: 'CALLS', label: 'Calls' },
  { value: 'IMPORTS', label: 'Imports' },
  { value: 'INJECTS', label: 'Injects' },
  { value: 'EXTENDS', label: 'Extends' },
  { value: 'IMPLEMENTS', label: 'Implements' },
  { value: 'DEPENDS_ON', label: 'Depends On' },
  { value: 'INSTANTIATES', label: 'Instantiates' },
];

export default function ViewsPanel() {
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const selectedNodeLabel = useUIStore((s) => s.selectedNodeLabel);
  const activateView = useNavigationStore((s) => s.activateView);
  const clearView = useNavigationStore((s) => s.clearView);
  const activeView = useNavigationStore((s) => s.activeView);

  const { data: views } = useViews();
  const createView = useCreateView();
  const deleteView = useDeleteView();

  const [name, setName] = useState('');
  const [depth, setDepth] = useState(3);
  const [direction, setDirection] = useState<'outgoing' | 'incoming' | 'both'>('outgoing');
  const [edgeTypes, setEdgeTypes] = useState<string[]>(['CALLS', 'INJECTS', 'IMPORTS']);

  const toggleEdgeType = (type: string) => {
    setEdgeTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const handleCreate = () => {
    if (!name.trim() || !selectedNodeId) return;
    createView.mutate({
      name: name.trim(),
      rootNodeId: selectedNodeId,
      rootLabel: selectedNodeLabel ?? selectedNodeId,
      edgeTypes,
      depth,
      direction,
    });
    setName('');
  };

  const handleActivate = (view: SavedView) => {
    activateView(view);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
        Landscape Views
      </h3>

      {selectedNodeId ? (
        <div className="space-y-2 p-2 bg-surface-secondary rounded">
          <p className="text-xs text-text-secondary">
            Trace from: <span className="text-text-primary font-medium">{selectedNodeLabel ?? selectedNodeId}</span>
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="View name..."
            className="w-full px-2 py-1 text-xs bg-surface-primary border border-border rounded text-text-primary"
          />
          <div className="space-y-1">
            <label className="text-xs text-text-secondary">Direction</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'outgoing' | 'incoming' | 'both')}
              className="w-full px-2 py-1 text-xs bg-surface-primary border border-border rounded text-text-primary"
            >
              <option value="outgoing">Outgoing (what does it call?)</option>
              <option value="incoming">Incoming (what calls it?)</option>
              <option value="both">Both directions</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-secondary">Depth: {depth}</label>
            <input
              type="range"
              min={1}
              max={8}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-secondary">Edge types</label>
            <div className="flex flex-wrap gap-1">
              {TRACE_EDGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => toggleEdgeType(opt.value)}
                  className={`px-1.5 py-0.5 text-xs rounded ${
                    edgeTypes.includes(opt.value)
                      ? 'bg-accent-blue text-white'
                      : 'bg-surface-primary text-text-secondary border border-border'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="w-full px-2 py-1 text-xs bg-accent-blue text-white rounded disabled:opacity-40"
          >
            Save View
          </button>
        </div>
      ) : (
        <p className="text-xs text-text-secondary">
          Click a node to create a trace view from it
        </p>
      )}

      {activeView && (
        <div className="flex items-center justify-between p-2 bg-accent-blue/20 border border-accent-blue/40 rounded">
          <span className="text-xs text-accent-blue font-medium truncate">
            {activeView.name}
          </span>
          <button
            onClick={clearView}
            className="text-xs text-text-secondary hover:text-text-primary ml-2 shrink-0"
          >
            Clear
          </button>
        </div>
      )}

      {views && views.length > 0 && (
        <div className="space-y-1">
          {views.map((view) => (
            <div
              key={view.id}
              className={`flex items-center justify-between p-2 rounded cursor-pointer text-xs
                ${activeView?.id === view.id ? 'bg-accent-blue/20' : 'bg-surface-secondary hover:bg-surface-tertiary'}`}
              onClick={() => handleActivate(view)}
            >
              <div className="truncate">
                <span className="text-text-primary">{view.name}</span>
                <span className="text-text-secondary ml-1">
                  ({view.direction}, d={view.depth})
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteView.mutate(view.id); }}
                className="text-text-secondary hover:text-red-400 ml-2 shrink-0"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
