// Passive altitude readout (architecture §1, redesign §3/§5). NOT a switcher — navigation is continuous
// zoom, and this only reads the current altitude band the camera derives (orbit / ground / inside). It
// gives the founder a sense of where they are in the dive without adding altitude chrome or modes. The
// three bands map to useAtlasCamera().altitude: venture → Orbit, architecture → Ground, detail → Inside.
//
// The altitude the camera publishes is split at the SAME zoom cutpoints (ORBIT_MAX_ZOOM / GROUND_MAX_ZOOM
// in useAtlasCamera) that useSemanticZoom uses for the per-node detail band, and the camera re-derives it
// from live zoom on every reframe (not just gesture end). So at any zoom where the cards show their full
// anatomy (Ground band) this label reads "Ground", never a stale "Orbit".
import type { AtlasAltitude } from "@/components/atlas/atlasTypes";

const BAND_LABEL: Record<AtlasAltitude, string> = {
  venture: "Orbit",
  architecture: "Ground",
  detail: "Inside",
};

export function Altimeter({ altitude }: { altitude: AtlasAltitude }) {
  return (
    <div className="iw-altimeter" aria-label={`Altitude: ${BAND_LABEL[altitude]}`} role="status">
      {(["venture", "architecture", "detail"] as AtlasAltitude[]).map((band) => (
        <span key={band} className="iw-altimeter-tick" data-active={band === altitude ? "true" : "false"} aria-hidden="true" />
      ))}
      <span className="iw-altimeter-label">{BAND_LABEL[altitude]}</span>
    </div>
  );
}
