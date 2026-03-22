import { useEffect, useState } from 'react';
import { useUIStore, useNavigationStore } from '../store';

export default function KeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false);
  const selectNode = useUIStore((s) => s.selectNode);
  const toggleBlastRadius = useNavigationStore((s) => s.toggleBlastRadius);
  const resetNavigation = useNavigationStore((s) => s.resetNavigation);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      switch (e.key) {
        case 'Escape': selectNode(null); break;
        case 'b': case 'B': toggleBlastRadius(); break;
        case '?': setShowHelp(s => !s); break;
        case '0': resetNavigation(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectNode, toggleBlastRadius, resetNavigation]);

  if (!showHelp) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowHelp(false)}>
      <div className="bg-surface-800 border border-border-default rounded-lg p-6 max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-text-primary font-semibold mb-4">Keyboard Shortcuts</h3>
        <div className="space-y-2 text-sm">
          {[
            ['/', 'Focus search'],
            ['Escape', 'Clear selection'],
            ['B', 'Toggle blast radius'],
            ['+/-', 'Zoom in/out'],
            ['0', 'Reset view'],
            ['Double-click', 'Drill into node'],
            ['?', 'Toggle this help'],
          ].map(([key, desc]) => (
            <div key={key} className="flex gap-4">
              <kbd className="px-2 py-0.5 bg-surface-700 rounded text-text-primary font-mono text-xs min-w-[60px] text-center">{key}</kbd>
              <span className="text-text-secondary">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
