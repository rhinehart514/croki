// LensControl — the four operating-lens words + a 4-band altimeter (spec §2).
//
// The four lens names read AS WORDS (Understand / Design / Execute / Learn); the active word is
// emphasized, and "none" reads as free arrangement (the founder's own layout). Clicking a word sets that
// lens; clicking the active word exits to free. The keys (L / Shift+L / Escape) live in useOperatingLens —
// this is the visible surface of that state, and a pointer path to the same cycle.
//
// The altimeter is NEW on this surface: the band the cards render (SemanticBandProvider) lifts its word
// here through onBand in VentureCanvasStage. It shows the current altitude word (Orbit / Ground / Inside /
// Artifacts) and, when a lens is active, a one-word suffix ("Ground · Execute") so the founder always
// knows both how high they are and which lens they are reading through.

import { LENS_LABEL, LENS_SEQUENCE, type LensId } from "./lensArrangement";
import { BAND_LABEL, type SemanticBand } from "@/components/atlas/semanticBand";
import "./lens-control.css";

// The 4-band altimeter: the live altitude word, plus the active lens as a suffix. Reads BAND_LABEL (the
// same lookup the card anatomy keys off) so the altimeter word and the card band can never disagree.
function Altimeter({ band, lensId }: { band: SemanticBand; lensId: LensId | null }) {
  const suffix = lensId ? ` · ${LENS_LABEL[lensId]}` : "";
  return (
    <div className="lens-altimeter" data-band={band} aria-live="polite">
      <span className="lens-altimeter-scale" aria-hidden="true">
        {(["structure", "relationships", "components", "artifacts"] as SemanticBand[]).map((step) => (
          <span key={step} className="lens-altimeter-tick" data-active={step === band ? "true" : "false"} />
        ))}
      </span>
      <span className="lens-altimeter-word">
        {BAND_LABEL[band]}
        {suffix ? <span className="lens-altimeter-suffix">{suffix}</span> : null}
      </span>
    </div>
  );
}

export function LensControl({
  lensId,
  band,
  onPick,
}: {
  lensId: LensId | null;
  band: SemanticBand;
  onPick: (next: LensId | null) => void;
}) {
  return (
    <div className="lens-control" role="group" aria-label="Operating lens">
      <div className="lens-control-words">
        {LENS_SEQUENCE.map((id) => {
          const active = id === lensId;
          return (
            <button
              key={id}
              type="button"
              className="lens-word"
              data-active={active ? "true" : "false"}
              aria-pressed={active}
              // Clicking the active word exits to the free arrangement; clicking another sets it.
              onClick={() => onPick(active ? null : id)}
            >
              {LENS_LABEL[id]}
            </button>
          );
        })}
        <span className="lens-word-free" data-active={lensId === null ? "true" : "false"} aria-hidden="true">
          Free
        </span>
      </div>
      <Altimeter band={band} lensId={lensId} />
    </div>
  );
}
