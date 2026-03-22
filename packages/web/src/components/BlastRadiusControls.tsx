import { useUIStore, useNavigationStore } from '../store';

export default function BlastRadiusControls() {
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const blastRadiusActive = useNavigationStore((s) => s.blastRadiusActive);
  const toggleBlastRadius = useNavigationStore((s) => s.toggleBlastRadius);
  const blastRadiusDepth = useNavigationStore((s) => s.blastRadiusDepth);
  const setBlastRadiusDepth = useNavigationStore((s) => s.setBlastRadiusDepth);

  return (
    <div className="absolute bottom-2 right-2 z-10 flex items-center gap-2 bg-surface-800/90 rounded-md px-3 py-2 border border-border-default">
      <button
        onClick={toggleBlastRadius}
        disabled={!selectedNodeId}
        className={`px-2 py-1 text-xs rounded ${
          blastRadiusActive
            ? 'bg-[#F78166] text-surface-900 font-medium'
            : 'bg-surface-700 text-text-secondary hover:bg-surface-600'
        } disabled:opacity-30`}
        title="Toggle Blast Radius (B)"
      >
        Blast Radius
      </button>
      {blastRadiusActive && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => setBlastRadiusDepth(blastRadiusDepth - 1)}
            className="w-5 h-5 text-xs bg-surface-700 rounded text-text-secondary hover:bg-surface-600"
          >-</button>
          <span className="text-text-primary text-xs w-4 text-center">{blastRadiusDepth}</span>
          <button
            onClick={() => setBlastRadiusDepth(blastRadiusDepth + 1)}
            className="w-5 h-5 text-xs bg-surface-700 rounded text-text-secondary hover:bg-surface-600"
          >+</button>
        </div>
      )}
    </div>
  );
}
