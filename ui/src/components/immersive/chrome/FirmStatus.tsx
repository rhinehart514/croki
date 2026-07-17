// The operating-picture glyphs (architecture §1/§3, redesign outcome 1). A glanceable read of the whole
// firm at rest: how many efforts are live, how many the crew is building, how much has returned from the
// market. Derived deterministically from the polled projection joins + lens bets — never a model call.
// This is the "return to a clear account" surface (redesign §2, outcome 8): on load it says what the firm
// is doing without the founder descending into anything. Amber is NOT used here — needs-your-hand is the
// NeedsYouPulse's job; this bar stays calm green/ink.
import { useMemo } from "react";
import type { FirmLens, FirmArchitectureProjection } from "@/types";

type StatusGlyph = { key: string; label: string; count: number };

export function FirmStatus({
  lens,
  projection,
}: {
  lens: FirmLens;
  projection: FirmArchitectureProjection | null;
}) {
  const glyphs = useMemo<StatusGlyph[]>(() => {
    const bets = lens.bets ?? [];
    // Live = efforts running in the market. Building = the crew has staged drafts not yet live (stagedCount
    // > 0 on a still-live effort). Returned = outcomes the market handed back. Counts come from the
    // lens/projection already in hand — deterministic, never a model call.
    const live = bets.filter((bet) => bet.position === "live" && bet.stagedCount === 0).length;
    const building = bets.filter((bet) => bet.position === "live" && bet.stagedCount > 0).length;
    const returned = (lens.outcomes?.length ?? projection?.joins.outcomes.length ?? 0);
    return [
      { key: "live", label: "live", count: live },
      { key: "building", label: "building", count: building },
      { key: "returned", label: "returned", count: returned },
    ];
  }, [lens.bets, lens.outcomes, projection?.joins.outcomes.length]);

  return (
    <div className="iw-status" aria-label="Firm operating picture">
      {glyphs.map((glyph) => (
        <span key={glyph.key} className="iw-status-glyph" data-key={glyph.key}>
          <span className="iw-status-dot" data-key={glyph.key} aria-hidden="true" />
          <span className="iw-status-count">{glyph.count}</span>
          <span className="iw-status-label">{glyph.label}</span>
        </span>
      ))}
    </div>
  );
}
