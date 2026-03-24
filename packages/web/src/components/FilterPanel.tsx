import { useUIStore } from '../store';
import { NODE_COLORS, EDGE_COLORS } from '../lib/node-colors';
import ViewsPanel from './ViewsPanel';

function TypeCheckbox({
  label,
  color,
  checked,
  onChange,
}: {
  label: string;
  color: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 py-1 px-2 hover:bg-surface-700 rounded cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="accent-text-link"
      />
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-text-secondary text-xs">{label}</span>
    </label>
  );
}

export default function FilterPanel() {
  const filterPanelOpen = useUIStore((s) => s.filterPanelOpen);
  const visibleNodeTypes = useUIStore((s) => s.visibleNodeTypes);
  const toggleNodeType = useUIStore((s) => s.toggleNodeType);
  const setAllNodeTypes = useUIStore((s) => s.setAllNodeTypes);
  const clearNodeTypes = useUIStore((s) => s.clearNodeTypes);
  const visibleEdgeTypes = useUIStore((s) => s.visibleEdgeTypes);
  const toggleEdgeType = useUIStore((s) => s.toggleEdgeType);
  const setAllEdgeTypes = useUIStore((s) => s.setAllEdgeTypes);
  const clearEdgeTypes = useUIStore((s) => s.clearEdgeTypes);

  if (!filterPanelOpen) return null;

  return (
    <aside className="w-[280px] bg-surface-800 border-r border-border-default overflow-y-auto">
      <ViewsPanel />

      <div className="p-3 border-b border-border-muted">
        <div className="flex items-center justify-between mb-2">
          <p className="text-text-tertiary text-xs uppercase tracking-wide">Node Types</p>
          <div className="flex gap-2">
            <button onClick={() => setAllNodeTypes(Object.keys(NODE_COLORS))} className="text-text-link text-xs">All</button>
            <button onClick={clearNodeTypes} className="text-text-link text-xs">None</button>
          </div>
        </div>
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <TypeCheckbox
            key={type}
            label={type}
            color={color}
            checked={visibleNodeTypes.has(type)}
            onChange={() => toggleNodeType(type)}
          />
        ))}
      </div>

      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-text-tertiary text-xs uppercase tracking-wide">Edge Types</p>
          <div className="flex gap-2">
            <button onClick={() => setAllEdgeTypes(Object.keys(EDGE_COLORS))} className="text-text-link text-xs">All</button>
            <button onClick={clearEdgeTypes} className="text-text-link text-xs">None</button>
          </div>
        </div>
        {Object.entries(EDGE_COLORS).map(([type, color]) => (
          <TypeCheckbox
            key={type}
            label={type}
            color={color}
            checked={visibleEdgeTypes.has(type)}
            onChange={() => toggleEdgeType(type)}
          />
        ))}
      </div>
    </aside>
  );
}
