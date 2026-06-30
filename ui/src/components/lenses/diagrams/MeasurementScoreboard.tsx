// MeasurementScoreboard — the Measurement band (layer "measure"): is the outcome observable? A
// lightweight scoreboard built ENTIRELY from the band's already-derived signal (the board folds
// engine.deriveMeasure into this belief: its confidence, status, and the live attribution issues as
// evidence). It never invents a conversion number.
//
// The honest-blind case is the point: when attribution is severed — the win event isn't wired to a
// source the runs can read — the board grounds belief=null / status="blind" / confidence=0, and this
// reads "blind" in plain words, NOT a fake zero. Only when there is real measure signal does the
// scoreboard show the derived observability reading and the open attribution gaps.

import type { LayerDiagramProps } from "@/components/lenses/LayerDiagramProps";
import "./BandDiagrams.css";

export function MeasurementScoreboard({ belief }: LayerDiagramProps) {
  const blind = !belief.belief || belief.status === "blind";

  if (blind) {
    return (
      <div className="band-diagram" role="region" aria-label="Measurement — attribution blind">
        <div className="band-diagram-head">
          <span className="band-diagram-kicker">measurement</span>
        </div>
        <div className="score-blind">
          <span className="score-blind-tag"><span className="dot" />attribution blind</span>
          <div className="score-blind-line">
            The win can't be traced back to a motion yet.
          </div>
          <div className="score-blind-note">
            Nothing here is a number — it's a blind. The win event isn't wired to a source the runs can
            read, so there is no real conversion to report. Wire the win to a channel and this scoreboard
            fills from real run outcomes.
          </div>
        </div>
      </div>
    );
  }

  const conf = Math.max(0, Math.min(100, belief.confidence));
  const validated = belief.status === "validated";

  return (
    <div className="band-diagram" role="region" aria-label="Measurement scoreboard">
      <div className="band-diagram-head">
        <span className="band-diagram-kicker">measurement</span>
        <p className="band-diagram-sub">{belief.belief}</p>
      </div>

      <div className="score-grid">
        <div className="score-tile">
          <span className="score-tile-label">observable signal</span>
          <span className="score-tile-num">{conf}<small>/ 100</small></span>
          <span className="score-strip">
            <span
              className={`score-strip-fill${conf >= 60 ? " is-high" : ""}`}
              style={{ width: `${conf}%` }}
            />
          </span>
        </div>
        <div className="score-tile">
          <span className="score-tile-label">read</span>
          <span className={`score-status${validated ? " is-validated" : ""}`}>
            <span className="dot" />{belief.status}
          </span>
          <span className="band-diagram-sub" style={{ margin: 0 }}>
            grounded from real run outcomes, never seeded
          </span>
        </div>
      </div>

      {belief.evidence.length > 0 && (
        <ul className="score-issues">
          <span className="score-issues-eyebrow">what the measure read found</span>
          {belief.evidence.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}
