import { useSigma } from '@react-sigma/core';

export default function GraphControls() {
  const sigma = useSigma();

  const zoomIn = () => {
    const camera = sigma.getCamera();
    camera.animatedZoom({ duration: 200 });
  };

  const zoomOut = () => {
    const camera = sigma.getCamera();
    camera.animatedUnzoom({ duration: 200 });
  };

  const fitToScreen = () => {
    const camera = sigma.getCamera();
    camera.animatedReset({ duration: 300 });
  };

  return (
    <div className="absolute bottom-2 left-2 z-10 flex flex-col gap-1">
      <button onClick={zoomIn} className="w-8 h-8 bg-surface-800/90 border border-border-default rounded text-text-secondary hover:text-text-primary text-sm" title="Zoom In (+)">+</button>
      <button onClick={zoomOut} className="w-8 h-8 bg-surface-800/90 border border-border-default rounded text-text-secondary hover:text-text-primary text-sm" title="Zoom Out (-)">-</button>
      <button onClick={fitToScreen} className="w-8 h-8 bg-surface-800/90 border border-border-default rounded text-text-secondary hover:text-text-primary text-xs" title="Fit to Screen (0)">Fit</button>
    </div>
  );
}
