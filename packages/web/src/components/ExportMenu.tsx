import { useState } from 'react';
import { useSigma } from '@react-sigma/core';

export default function ExportMenu() {
  const [open, setOpen] = useState(false);
  const sigma = useSigma();

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPng() {
    const container = sigma.getContainer();
    const canvas = container?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        downloadBlob(blob, `contextualizer-${ts}.png`);
      }
    });
    setOpen(false);
  }

  function exportJson() {
    const graph = sigma.getGraph();
    const nodes = graph.mapNodes((id: string, attrs: Record<string, unknown>) => ({ id, ...attrs }));
    const edges = graph.mapEdges((id: string, attrs: Record<string, unknown>, source: string, target: string) => ({ id, source, target, ...attrs }));
    const blob = new Blob([JSON.stringify({ nodes, edges }, null, 2)], { type: 'application/json' });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(blob, `contextualizer-${ts}.json`);
    setOpen(false);
  }

  return (
    <div className="absolute top-2 right-2 z-10">
      <button
        onClick={() => setOpen(!open)}
        className="px-2 py-1 text-xs bg-surface-800/90 border border-border-default rounded text-text-secondary hover:text-text-primary"
      >
        Export
      </button>
      {open && (
        <div className="absolute top-8 right-0 bg-surface-600 border border-border-default rounded-md shadow-lg">
          <button onClick={exportPng} className="block w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-surface-700">Export as PNG</button>
          <button onClick={exportJson} className="block w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-surface-700">Export as JSON</button>
        </div>
      )}
    </div>
  );
}
