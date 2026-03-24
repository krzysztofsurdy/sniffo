import { useState, useMemo } from 'react';
import { useUIStore } from '../store';
import { useGraphData } from '../api/hooks';
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

interface NsNode {
  name: string;
  fullPath: string;
  count: number;
  children: NsNode[];
}

function buildNsTree(qualifiedNames: string[]): NsNode[] {
  const root: NsNode = { name: '', fullPath: '', count: 0, children: [] };

  for (const qn of qualifiedNames) {
    const sep = qn.includes('\\') ? '\\' : qn.includes('/') ? '/' : '.';
    const parts = qn.split(sep);
    const nsParts = parts.slice(0, -1);

    let cur = root;
    for (let i = 0; i < nsParts.length; i++) {
      const part = nsParts[i];
      const fullPath = nsParts.slice(0, i + 1).join(sep);
      let child = cur.children.find(c => c.name === part);
      if (!child) {
        child = { name: part, fullPath, count: 0, children: [] };
        cur.children.push(child);
      }
      child.count++;
      cur = child;
    }
  }

  return root.children.sort((a, b) => b.count - a.count);
}

function collectPaths(node: NsNode): string[] {
  const paths = [node.fullPath];
  for (const child of node.children) {
    paths.push(...collectPaths(child));
  }
  return paths;
}

function isEffectivelyHidden(node: NsNode, hiddenNamespaces: Set<string>): boolean {
  if (hiddenNamespaces.has(node.fullPath)) return true;
  const sep = node.fullPath.includes('\\') ? '\\' : node.fullPath.includes('/') ? '/' : '.';
  const parts = node.fullPath.split(sep);
  for (let i = 1; i < parts.length; i++) {
    if (hiddenNamespaces.has(parts.slice(0, i).join(sep))) return true;
  }
  return false;
}

function NsTreeNode({ node, depth, hiddenNamespaces, onToggle }: {
  node: NsNode;
  depth: number;
  hiddenNamespaces: Set<string>;
  onToggle: (paths: string[], hide: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isHidden = isEffectivelyHidden(node, hiddenNamespaces);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 hover:bg-surface-700 rounded cursor-pointer"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-text-tertiary text-xs w-4 flex-shrink-0"
          >
            {expanded ? '\u25BC' : '\u25B6'}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        <label className="flex items-center gap-1.5 flex-1 cursor-pointer min-w-0">
          <input
            type="checkbox"
            checked={!isHidden}
            onChange={() => onToggle(collectPaths(node), !isHidden)}
            className="accent-text-link flex-shrink-0"
          />
          <span className="text-text-secondary text-xs truncate">{node.name}</span>
          <span className="text-text-tertiary text-xs flex-shrink-0">({node.count})</span>
        </label>
      </div>
      {expanded && hasChildren && node.children
        .sort((a, b) => b.count - a.count)
        .map(child => (
          <NsTreeNode
            key={child.fullPath}
            node={child}
            depth={depth + 1}
            hiddenNamespaces={hiddenNamespaces}
            onToggle={onToggle}
          />
        ))
      }
    </div>
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
  const showEdgeLabels = useUIStore((s) => s.showEdgeLabels);
  const toggleEdgeLabels = useUIStore((s) => s.toggleEdgeLabels);
  const hiddenNamespaces = useUIStore((s) => s.hiddenNamespaces);
  const setNamespaces = useUIStore((s) => s.setNamespaces);
  const clearHiddenNamespaces = useUIStore((s) => s.clearHiddenNamespaces);
  const currentLevel = useUIStore((s) => s.currentLevel);
  const { data: graphData } = useGraphData(currentLevel);

  const nsTree = useMemo(() => {
    if (!graphData?.nodes) return [];
    return buildNsTree(graphData.nodes.map(n => n.qualifiedName));
  }, [graphData]);

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

      {nsTree.length > 0 && (
        <div className="p-3 border-b border-border-muted">
          <div className="flex items-center justify-between mb-2">
            <p className="text-text-tertiary text-xs uppercase tracking-wide">Namespaces</p>
            {hiddenNamespaces.size > 0 && (
              <button onClick={clearHiddenNamespaces} className="text-text-link text-xs">Show all</button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {nsTree.map(node => (
              <NsTreeNode
                key={node.fullPath}
                node={node}
                depth={0}
                hiddenNamespaces={hiddenNamespaces}
                onToggle={setNamespaces}
              />
            ))}
          </div>
        </div>
      )}

      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-text-tertiary text-xs uppercase tracking-wide">Edge Types</p>
          <div className="flex gap-2">
            <button onClick={toggleEdgeLabels} className={`text-xs ${showEdgeLabels ? 'text-text-link' : 'text-text-tertiary'}`}>Labels</button>
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
