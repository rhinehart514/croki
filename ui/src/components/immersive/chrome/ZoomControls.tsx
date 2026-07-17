// Explicit zoom / fit control. MUST render inside <ReactFlow> so useReactFlow drives the camera
// directly — a guaranteed way to change altitude that never depends on wheel/trackpad behaviour
// (the passive Altimeter only reads altitude; this is how the founder leaves Orbit with a click).
import { useReactFlow, useStore } from "@xyflow/react";

export function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);

  return (
    <div className="iw-zoom" role="group" aria-label="Zoom the venture">
      <button type="button" className="iw-zoom-btn" aria-label="Zoom out" onClick={() => void zoomOut({ duration: 220 })}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
      </button>
      <span className="iw-zoom-label" aria-live="polite">{Math.round(zoom * 100)}%</span>
      <button type="button" className="iw-zoom-btn" aria-label="Zoom in" onClick={() => void zoomIn({ duration: 220 })}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      <span className="iw-zoom-sep" aria-hidden="true" />
      <button type="button" className="iw-zoom-btn" aria-label="Fit the whole venture" onClick={() => void fitView({ duration: 420, padding: 0.2 })}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
      </button>
    </div>
  );
}
