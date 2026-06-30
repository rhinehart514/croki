// AltitudeLadder — the persistent left SECTION RAIL for the GTM board canvas. Nine sections, one per
// belief layer, grouped into the three phases (Strategy 1-4 · Motion 5-6 · Loop 7-9). It is ALWAYS
// visible so you never lose your place: clicking a section FLIES THE CAMERA to that cluster on the
// spatial canvas and lights the section here. At the whole-flow altitude nothing is active.
//
// Pure navigation chrome — it reads the layer list and the focused layer, and calls back on click. It
// never gates, never triggers a run. (Named AltitudeLadder for history; it is the section rail now.)

import type { LayerBelief } from "@/types";
import { layerMeta, groundingBadge } from "@/lib/boardModel";
import "./GtmBoard.css";

type Phase = { key: string; label: string; layers: LayerBelief[] };

export function AltitudeLadder({
  layers, focusedLayer, onFly,
}: {
  layers: LayerBelief[];
  focusedLayer: string | null;
  onFly: (layer: string) => void;
}) {
  // Group in board order into the three phase brackets. Order follows the layers array (already
  // Strategy → Motion → Loop from getBoard); we only need the phase label breaks.
  const phases: Phase[] = [];
  for (const l of layers) {
    const last = phases[phases.length - 1];
    if (!last || last.label !== l.phase) phases.push({ key: l.phase, label: l.phase, layers: [l] });
    else last.layers.push(l);
  }

  return (
    <nav className="sec-rail" aria-label="Board sections">
      <div className="sec-rail-head">
        <div className="sec-rail-title">The board</div>
        <div className="sec-rail-sub">One canvas. Click a section to focus it · swipe right to unfold it.</div>
      </div>
      <div className="sec-rail-scroll">
        {phases.map((phase) => (
          <div key={phase.key} className="sec-phase">
            <span className="sec-phase-label">{phase.label}</span>
            {phase.layers.map((l) => {
              const meta = layerMeta(l.layer);
              const on = focusedLayer === l.layer;
              const badge = groundingBadge(l);
              return (
                <button
                  key={l.layer}
                  type="button"
                  className={`sec${on ? " active" : ""}`}
                  onClick={() => onFly(l.layer)}
                  title={`${meta.n} · ${meta.name}`}
                  aria-current={on ? "true" : undefined}
                >
                  <span className="sec-num">{meta.n}</span>
                  <span className="sec-lbl">{meta.name}</span>
                  <span className={`sec-dot tone-${badge.tone}`} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
