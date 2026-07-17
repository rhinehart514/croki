import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "@xyflow/react";
import { bandForZoom, altitudeForBand, type SemanticBand } from "./semanticBand";
import type { AtlasAltitude } from "./atlasTypes";
import { BandContext } from "./semanticBandContext";

// The ONE band state (Slice 2 STEP A). It owns the single piece of memory the pure step function needs
// (the previous band, threaded through the functional state updater for hysteresis) and the settle-freeze
// that stops a fast wheel from strobing through bands. Node anatomies, the lens module, and the altimeter
// all read this via BandContext — never a second raw-transform read — so the altimeter word and the card
// anatomy can never disagree.
//
// Must be mounted inside <ReactFlow>'s store (a child of ReactFlowProvider, wrapping the flow) so it can
// subscribe to the store transform and still sit above the nodes. For chrome outside the flow (the
// Altimeter), the surface lifts the band through the onBand callback.

// Settle-freeze release window. While the wheel is flinging the band-driving zoom is frozen; it releases
// when zoom velocity stays below threshold for this long, so a fast wheel snaps ONCE at rest while a slow
// deliberate zoom still crosses bands mid-gesture.
const SETTLE_MS = 140;
// Below this per-ms zoom velocity the gesture reads as "deliberate/settled" and the band advances
// immediately; above it the founder is flinging and we hold until they settle.
const VELOCITY_FLOOR = 0.0009;

function nowMs() {
  return (typeof performance !== "undefined" ? performance : Date).now();
}

export function SemanticBandProvider({
  onBand,
  children,
}: {
  onBand?: (band: SemanticBand, altitude: AtlasAltitude) => void;
  children: ReactNode;
}) {
  const liveZoom = useStore((state) => state.transform[2]);
  const [band, setBand] = useState<SemanticBand>(() => bandForZoom(liveZoom));

  // Settle-freeze bookkeeping. lastTimeRef starts null (never call an impure clock during render) and is
  // stamped on the first effect; the velocity estimate holds the band while the wheel flings.
  const lastZoomRef = useRef(liveZoom);
  const lastTimeRef = useRef<number | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const now = nowMs();
    const dz = Math.abs(liveZoom - lastZoomRef.current);
    const dt = Math.max(1, now - (lastTimeRef.current ?? now));
    const velocity = dz / dt;
    lastZoomRef.current = liveZoom;
    lastTimeRef.current = now;

    if (settleTimerRef.current) { clearTimeout(settleTimerRef.current); settleTimerRef.current = null; }

    // A slow, deliberate zoom crosses bands immediately (the founder means it). A fast fling holds the
    // current band and arms the settle timer, so the band snaps once when the wheel comes to rest instead
    // of flashing every intermediate anatomy on the way through. The previous band is read through the
    // functional updater, so no ref is mutated during render.
    const commit = () => setBand((previous) => bandForZoom(liveZoom, previous));
    if (velocity <= VELOCITY_FLOOR) commit();
    else settleTimerRef.current = setTimeout(commit, SETTLE_MS);

    return () => { if (settleTimerRef.current) { clearTimeout(settleTimerRef.current); settleTimerRef.current = null; } };
  }, [liveZoom]);

  const altitude = altitudeForBand(band);
  useEffect(() => { onBand?.(band, altitude); }, [band, altitude, onBand]);

  return <BandContext.Provider value={{ band, altitude }}>{children}</BandContext.Provider>;
}
