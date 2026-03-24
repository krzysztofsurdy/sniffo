import { useState } from 'react';
import { useViews, useCreateView, useDeleteView } from '../api/hooks';
import { useUIStore } from '../store';

export default function ViewsPanel() {
  const [newName, setNewName] = useState('');
  const selectedNodeIds = useUIStore((s) => s.selectedNodeIds);
  const setSelection = useUIStore((s) => s.setSelection);
  const clearSelection = useUIStore((s) => s.clearSelection);

  const { data: views } = useViews();
  const createView = useCreateView();
  const deleteView = useDeleteView();

  const handleSave = () => {
    if (!newName.trim() || selectedNodeIds.size === 0) return;
    createView.mutate({ name: newName.trim(), nodeIds: Array.from(selectedNodeIds) });
    setNewName('');
  };

  const handleLoad = (nodeIds: string[]) => {
    setSelection(nodeIds);
  };

  return (
    <div className="p-3 border-t border-border-default">
      <h3 className="text-xs font-medium text-text-secondary mb-2">Saved Views</h3>

      {selectedNodeIds.size > 0 && (
        <div className="mb-2 flex gap-1">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="View name..."
            className="flex-1 h-7 px-2 text-xs bg-surface-700 border border-border-default rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-link"
          />
          <button
            onClick={handleSave}
            className="h-7 px-2 text-xs bg-text-link text-surface-900 rounded font-medium hover:opacity-90"
          >
            Save
          </button>
          <button
            onClick={clearSelection}
            className="h-7 px-2 text-xs bg-surface-700 text-text-secondary rounded hover:bg-surface-600"
          >
            Clear
          </button>
        </div>
      )}

      {selectedNodeIds.size > 0 && (
        <p className="text-xs text-text-tertiary mb-2">{selectedNodeIds.size} nodes selected (Shift+click to add)</p>
      )}

      <div className="space-y-1">
        {views?.map((view) => (
          <div key={view.id} className="flex items-center gap-1">
            <button
              onClick={() => handleLoad(view.nodeIds)}
              className="flex-1 text-left px-2 py-1 text-xs text-text-primary hover:bg-surface-700 rounded truncate"
            >
              {view.name}
              <span className="text-text-tertiary ml-1">({view.nodeIds.length})</span>
            </button>
            <button
              onClick={() => deleteView.mutate(view.id)}
              className="px-1 text-xs text-text-tertiary hover:text-red-400"
            >
              x
            </button>
          </div>
        ))}
        {(!views || views.length === 0) && (
          <p className="text-xs text-text-tertiary">No saved views. Select nodes and save.</p>
        )}
      </div>
    </div>
  );
}
