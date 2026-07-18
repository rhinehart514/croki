// InterpretationChip — the dwell-gated interpretation preview (SPEC A / Exp Law 7). When a drop arms over a
// target (useDropTarget) the stage feeds this chip the ranked interpretation (interpretRelationship). It
// floats at the drop midpoint in flow coordinates (ViewportPortal, the same portal TerritoryLayer uses) and
// says, in the founder's own vocabulary first: "Drover understands: <sentence>" with three durable exits —
// Apply, Change relationship, Keep visual only.
//
// This component is PRESENTATIONAL and ISOLATED: it holds only the "which proposal is showing" cursor and
// calls back out. It NEVER mutates architecture, NEVER writes placement, NEVER moves a node. The stage owns
// the write path (mutation.apply + push inverse to the revision stack) in a later single-owner phase; here
// the three exits are callbacks:
//   • onApply(kind)        — the stage writes a founder-asserted create-connection with this label.
//   • onKeepVisual()       — the stage writes NOTHING (that IS the unsupported epistemic state — no drawn
//                            line); the visual move already committed, so the node stays where it landed.
//   • onDismiss()          — the founder closed the preview without choosing; same as keep-visual by intent
//                            but kept distinct so the stage can log the difference.
// "Change relationship" cycles the ranked proposals IN PLACE, so the founder walks their own vocabulary
// before the system's without a round-trip.

import { useMemo, useRef, useState } from "react";
import { ViewportPortal } from "@xyflow/react";
import type { RelationshipInterpretation, RelationshipProposal } from "./interpretRelationship";
import "./interpretation-chip.css";

export type InterpretationChipProps = {
  // The ranked interpretation for the armed pair, or null when nothing is armed (the chip renders nothing).
  interpretation: RelationshipInterpretation | null;
  // Flow-coordinate midpoint between the two node centres — where the chip floats.
  midpoint: { x: number; y: number } | null;
  // Founder-facing titles for the two ends, so the sentence reads in the founder's words, not refs.
  sourceTitle: string;
  targetTitle: string;
  onApply: (proposal: RelationshipProposal) => void;
  onKeepVisual: () => void;
  onDismiss: () => void;
};

// The one-sentence reading Drover proposes, in the founder's words: "<source> <kind> <target>".
function sentence(sourceTitle: string, proposal: RelationshipProposal | undefined, targetTitle: string): string {
  if (!proposal) return `${sourceTitle} relates to ${targetTitle}`;
  return `${sourceTitle} ${proposal.kind} ${targetTitle}`;
}

export function InterpretationChip({
  interpretation,
  midpoint,
  sourceTitle,
  targetTitle,
  onApply,
  onKeepVisual,
  onDismiss,
}: InterpretationChipProps) {
  const proposals = interpretation?.proposals ?? [];
  const [cursor, setCursor] = useState(0);

  // A fresh armed pair resets the cursor to the top-ranked proposal (the founder's most-used label, or the
  // strongest type-pair). Keyed on the pair so re-arming the SAME pair keeps the founder's cycled choice.
  // Adjusted during render (React's "storing information from previous renders" pattern) rather than in an
  // effect, so the reset is applied before paint with no cascading re-render.
  const pairKey = interpretation ? `${interpretation.fromRef}→${interpretation.toRef}` : null;
  const lastPairKey = useRef(pairKey);
  if (lastPairKey.current !== pairKey) {
    lastPairKey.current = pairKey;
    if (cursor !== 0) setCursor(0);
  }

  const active = proposals[cursor];
  const reading = useMemo(() => sentence(sourceTitle, active, targetTitle), [sourceTitle, active, targetTitle]);

  if (!interpretation || !midpoint || proposals.length === 0) return null;

  const cycle = () => setCursor((current) => (proposals.length ? (current + 1) % proposals.length : 0));

  return (
    <ViewportPortal>
      <div
        className="interpretation-chip"
        role="dialog"
        aria-label="Drover's interpretation of this relationship"
        style={{
          position: "absolute",
          transform: `translate(-50%, -100%) translate(${midpoint.x}px, ${midpoint.y - 12}px)`,
        }}
      >
        <p className="interpretation-chip-lead">
          <span className="interpretation-chip-kicker">Drover understands</span>
          <span className="interpretation-chip-sentence">{reading}</span>
        </p>
        {active ? <p className="interpretation-chip-rationale">{active.rationale}</p> : null}
        <div className="interpretation-chip-actions">
          <button
            type="button"
            className="interpretation-chip-action is-primary"
            onClick={() => active && onApply(active)}
            disabled={!active}
          >
            Apply
          </button>
          <button
            type="button"
            className="interpretation-chip-action"
            onClick={cycle}
            disabled={proposals.length < 2}
            aria-label={`Change relationship — ${proposals.length} readings`}
          >
            Change relationship
          </button>
          <button type="button" className="interpretation-chip-action is-quiet" onClick={onKeepVisual}>
            Keep visual only
          </button>
        </div>
        <button
          type="button"
          className="interpretation-chip-dismiss"
          aria-label="Dismiss interpretation"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
    </ViewportPortal>
  );
}
