import { useViews, useDeleteView } from '../api/hooks';
import { useUIStore, useNavigationStore } from '../store';

const LAYOUT_TYPES = [
  { value: 'sunshine', label: 'Sunshine' },
];

export default function ViewsPanel() {
  const currentLevel = useUIStore((s) => s.currentLevel);
  const setCurrentLevel = useUIStore((s) => s.setCurrentLevel);
  const layoutType = useUIStore((s) => s.layoutType);
  const setLayoutType = useUIStore((s) => s.setLayoutType);
  const clearView = useNavigationStore((s) => s.clearView);

  const { data: views } = useViews();
  const deleteView = useDeleteView();

  return (
    <div className="p-3 border-b border-border-muted">
      <p className="text-text-tertiary text-xs mb-2 uppercase tracking-wide">Views</p>

      <div className="flex gap-1 mb-3">
        <select
          value={layoutType}
          onChange={(e) => setLayoutType(e.target.value)}
          className="bg-surface-700 text-text-secondary text-xs rounded px-2 py-1 border border-border-muted"
        >
          {LAYOUT_TYPES.map((lt) => (
            <option key={lt.value} value={lt.value}>{lt.label}</option>
          ))}
        </select>
      </div>


      <div className="flex gap-1 mb-3">
        {['system', 'container', 'component'].map((level) => (
          <button
            key={level}
            onClick={() => { setCurrentLevel(level); clearView(); }}
            className={`px-2 py-1 text-xs rounded capitalize ${
              currentLevel === level
                ? 'bg-text-link text-surface-900 font-medium'
                : 'bg-surface-700 text-text-secondary hover:bg-surface-600'
            }`}
          >
            {level}
          </button>
        ))}
      </div>

      {views && views.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          <p className="text-text-tertiary text-xs mb-1 sticky top-0 bg-surface-800">Saved</p>
          {views.map((view) => (
            <div
              key={view.id}
              className="flex items-center justify-between p-2 rounded text-xs bg-surface-secondary hover:bg-surface-tertiary"
            >
              <div className="truncate">
                <span className="text-text-primary">{view.name}</span>
                <span className="text-text-secondary ml-1">
                  ({view.rootLabel})
                </span>
              </div>
              <button
                onClick={() => deleteView.mutate(view.id)}
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
