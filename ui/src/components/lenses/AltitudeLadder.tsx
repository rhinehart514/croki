// AltitudeLadder — the persistent left-edge minimap for the GTM board. Nine cells, one per belief
// layer, bracketed into the three phases (Strategy 1-4 · Motion 5-6 · Loop 7-9). It is ALWAYS visible
// at both altitudes so you never lose your place: at board altitude nothing is focused; at band
// altitude the open band is lit. Click a cell to fly straight to that band.
//
// Pure navigation chrome — it reads the layer list and the focused layer, and calls back on click. It
// never gates, never triggers a run.

import { motion } from "motion/react";
import type { LayerBelief } from "@/types";
import { layerMeta } from "@/lib/boardModel";
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
    <nav className="alt-ladder" aria-label="Board altitude ladder">
      {phases.map((phase) => (
        <div key={phase.key} className="alt-phase">
          <span className="alt-phase-label">{phase.label}</span>
          <div className="alt-cells">
            {phase.layers.map((l) => {
              const meta = layerMeta(l.layer);
              const on = focusedLayer === l.layer;
              const grounded = Boolean(l.belief);
              return (
                <button
                  key={l.layer}
                  type="button"
                  className={`alt-cell${on ? " on" : ""}${grounded ? " grounded" : " blind"}`}
                  onClick={() => onFly(l.layer)}
                  title={`${meta.n} · ${meta.name}`}
                  aria-current={on ? "true" : undefined}
                >
                  {on && (
                    <motion.span
                      layoutId="alt-cell-active"
                      className="alt-cell-active"
                      transition={{ type: "spring", stiffness: 480, damping: 34, mass: 0.7 }}
                    />
                  )}
                  <span className="alt-cell-n">{meta.n}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
