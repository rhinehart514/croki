import { useMemo } from "react";
import { TrendingUp, CircleSlash, Undo2, Check } from "lucide-react";
import type {
  ReallocationReceiptData,
  ReallocationStarvedMotion,
} from "@/types";

// ReallocationBatchCard — the Overdrive receipt the founder's batch/gate stream renders for LEARN
// (GTM-MACHINE.md Area 3, decided open-question 1). The machine watched which of your motions actually
// earned wins and already leaned your next runs toward those shapes — on its own, as Overdrive is meant
// to. This card is the RECEIPT of that lean, dropped into the batch as a correctable item: what it
// tilted, drawn from which real outcomes, plainly ("per-city pages earned 9 of 12; cold email 0 of 41 in
// 3 weeks"). It is overturnable, never a hidden policy — one click undoes the lean. It never pauses or
// kills a motion on its own; a motion that drew nothing is flagged here for your call, not cut.
//
// Purely presentational and prop-driven (self-contained, no fetch, no App wiring, own scoped styles) so
// the integrator can drop it into the batch stream beside the gate cards. The receipt persists as a
// decision: once you overturn or accept, the card shows the receipt chip and the actions retire — the
// Overdrive shape where your call becomes a correction after the fact, not a gate before the work.

// The two ranking dimensions the tilt leads with (from reallocation.mjs's UP set) rendered in plain
// words — never the store's camelCase. Any weight key the machine tilted that isn't mapped here still
// renders, using a humanized fallback, so a future signal weight is never silently dropped.
const WEIGHT_LABELS: Record<string, string> = {
  evidenceStrength: "hard evidence",
  measurementReadiness: "measurability",
  upside: "upside",
  founderFit: "your fit",
};

function weightLabel(key: string): string {
  if (WEIGHT_LABELS[key]) return WEIGHT_LABELS[key];
  // Humanize an unmapped camelCase key rather than drop it.
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toLowerCase());
}

// The provenance line for a working motion: its real wins by kind, most-earned first. This is the part a
// screenshot can't clone — the receipt captured at the moment the machine leaned.
function outcomeProvenance(byKind: Record<string, number>, observed: number): string {
  const parts = Object.entries(byKind ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${n} ${kind}`);
  return parts.length ? parts.join(", ") : `${observed} measured`;
}

// The founder's persisted decision on this receipt. Set by the integrator once the founder acts; while
// null the card is live and shows its actions. "overturned" = the founder undid the lean; "accepted" =
// the founder let it stand. Either way the decision persists as a receipt chip (the Overdrive pattern).
export type ReallocationDecision = "accepted" | "overturned" | null;

export type ReallocationBatchCardProps = {
  // The receipt to render — the reallocationReceipt() payload, exactly. Null while it's still loading.
  receipt: ReallocationReceiptData | null;
  // The founder's persisted call on this receipt, if made. Null → the card is live and actionable.
  decision?: ReallocationDecision;
  // Overturn the lean — restore the founder's base ranking weights. The integrator wires the real undo
  // (re-tune to base) and then sets `decision="overturned"`. Absent → the overturn control is hidden.
  onOverturn?: () => void;
  // Let the lean stand — accept the receipt. The integrator persists `decision="accepted"`. Absent → the
  // accept control is hidden (the card can be inspect-only in a read surface).
  onAccept?: () => void;
  // Decide a flagged (starved) motion — keep it running or pause it. Pausing is itself a founder-confirmed
  // batch decision (never autonomous). Absent → flagged motions render as read-only receipts.
  onDecideStarved?: (motion: ReallocationStarvedMotion, action: "keep" | "pause") => void;
  // Whether an action is in flight (disables the buttons). Optional.
  busy?: boolean;
};

export function ReallocationBatchCard({
  receipt,
  decision = null,
  onOverturn,
  onAccept,
  onDecideStarved,
  busy = false,
}: ReallocationBatchCardProps) {
  const working = receipt?.working ?? [];
  const starved = receipt?.starved ?? [];

  // The weight moves the machine made, largest-magnitude first — the delta, shown as base → tilted so the
  // change is legible and the founder's base is always visible underneath (never a black-box policy).
  const moves = useMemo(() => {
    if (!receipt || !receipt.applied) return [];
    return Object.entries(receipt.tilt ?? {})
      .filter(([, delta]) => Math.abs(Number(delta) || 0) > 1e-6)
      .map(([key, delta]) => ({
        key,
        delta: Number(delta),
        base: Number(receipt.base?.[key] ?? 0),
        tilted: Number(receipt.weights?.[key] ?? 0),
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [receipt]);

  const hasSignal = working.length > 0 || starved.length > 0;
  const live = decision === null;

  return (
    <section className="rbc" aria-label="Reallocation receipt">
      <style>{RBC_CSS}</style>

      <header className="rbc-head">
        <span className="rbc-eyebrow">
          <TrendingUp size={13} aria-hidden="true" /> Where your wins are coming from
        </span>
        {decision === "overturned" ? (
          <span className="rbc-chip rbc-chip--overturned">
            <Undo2 size={12} aria-hidden="true" /> Overturned
          </span>
        ) : decision === "accepted" ? (
          <span className="rbc-chip rbc-chip--accepted">
            <Check size={12} aria-hidden="true" /> Kept
          </span>
        ) : null}
      </header>

      {!receipt ? (
        <p className="rbc-empty">Reading what your outcomes have taught the machine…</p>
      ) : !hasSignal ? (
        <p className="rbc-empty">
          Nothing measured yet. Once your motions start earning outcomes, the machine will show which
          shapes are working here — and lean your next runs toward them.
        </p>
      ) : (
        <div className="rbc-body">
          {/* What earned the lean — provenance-first: the real wins, by kind, that drove it. */}
          {working.length > 0 && (
            <div className="rbc-block">
              <div className="rbc-block-head rbc-block-head--up">Earning wins</div>
              <ul className="rbc-motions">
                {working.map((m) => (
                  <li key={m.motionRef ?? m.motionKind} className="rbc-motion">
                    <span className="rbc-motion-dot rbc-motion-dot--up" aria-hidden="true" />
                    <span className="rbc-motion-name">{m.motionKind}</span>
                    <span className="rbc-motion-prov">
                      {outcomeProvenance(m.outcomesByKind, m.observed)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* The tilt itself — the delta, base → tilted, so the change is the thing shown. */}
          {receipt.applied && moves.length > 0 && (
            <div className="rbc-block">
              <div className="rbc-block-head">What it leaned your ranking toward</div>
              <ul className="rbc-moves">
                {moves.map((mv) => {
                  const up = mv.delta > 0;
                  return (
                    <li key={mv.key} className="rbc-move">
                      <span className="rbc-move-name">{weightLabel(mv.key)}</span>
                      <span className="rbc-move-delta">
                        <span className="rbc-move-base">{mv.base.toFixed(2)}</span>
                        <span className="rbc-move-arrow" aria-hidden="true">
                          →
                        </span>
                        <span className={"rbc-move-to " + (up ? "rbc-move-to--up" : "rbc-move-to--down")}>
                          {mv.tilted.toFixed(2)}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {receipt.reasons?.length > 0 && (
                <p className="rbc-why">{receipt.reasons[receipt.reasons.length - 1]}</p>
              )}
            </div>
          )}

          {/* Flagged for your call — drew nothing, never cut. Each gets an explicit keep/pause. */}
          {starved.length > 0 && (
            <div className="rbc-block">
              <div className="rbc-block-head rbc-block-head--flag">
                <CircleSlash size={12} aria-hidden="true" /> Drawing nothing — your call, not cut
              </div>
              <ul className="rbc-motions">
                {starved.map((m) => (
                  <li key={m.motionRef ?? m.motionKind} className="rbc-motion rbc-motion--flag">
                    <span className="rbc-motion-dot rbc-motion-dot--flag" aria-hidden="true" />
                    <span className="rbc-motion-name">{m.motionKind}</span>
                    <span className="rbc-motion-prov rbc-motion-prov--flag">{m.reason}</span>
                    {live && onDecideStarved && (
                      <span className="rbc-motion-decide">
                        <button
                          type="button"
                          className="rbc-mini"
                          disabled={busy}
                          onClick={() => onDecideStarved(m, "keep")}
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          className="rbc-mini rbc-mini--pause"
                          disabled={busy}
                          onClick={() => onDecideStarved(m, "pause")}
                        >
                          Pause
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* The overturnable footer — live only, and only when the lean was actually applied. */}
      {live && receipt?.applied && (onOverturn || onAccept) && (
        <footer className="rbc-actions">
          {onAccept && (
            <button
              type="button"
              className="rbc-btn rbc-btn--primary"
              disabled={busy}
              onClick={onAccept}
            >
              Let it stand
            </button>
          )}
          {onOverturn && (
            <button type="button" className="rbc-btn" disabled={busy} onClick={onOverturn}>
              <Undo2 size={13} aria-hidden="true" /> Overturn — keep my weights
            </button>
          )}
        </footer>
      )}
    </section>
  );
}

// Scoped styles — self-contained so the card drops into the batch stream without touching index.css.
// Drover's real system: light ground, monochrome zinc, Geist, tabular numbers that hold still, semantic
// color ONLY for state (green = earning, amber = flagged) — never to decorate. No gradients, no glass, no
// bounce. One block of air, then doubled.
const RBC_CSS = `
.rbc {
  display: flex; flex-direction: column; gap: 16px;
  padding: 18px 20px 16px;
  background: var(--surface, #fff);
  border: 1px solid var(--line-2, #e4e4e7);
  border-radius: var(--r-lg, 12px);
  box-shadow: var(--shadow-card, 0 1px 2px rgba(24,24,27,0.04), 0 1px 3px rgba(24,24,27,0.06));
}
.rbc-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.rbc-eyebrow {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: var(--text-xs, 0.6875rem); font-weight: 600; letter-spacing: 0.02em;
  text-transform: uppercase; color: var(--muted, #71717a);
}
.rbc-chip {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: var(--text-xs, 0.6875rem); font-weight: 600;
  padding: 3px 8px; border-radius: 999px; white-space: nowrap;
}
.rbc-chip--accepted { color: var(--proven, #16a34a); background: var(--proven-soft, #f0fdf4); }
.rbc-chip--overturned { color: var(--muted, #71717a); background: var(--surface-2, #f4f4f5); }

.rbc-empty {
  margin: 0; color: var(--muted, #71717a);
  font-size: var(--text-sm, 0.8125rem); line-height: 1.5; max-width: 54ch;
}

.rbc-body { display: flex; flex-direction: column; gap: 18px; }
.rbc-block { display: flex; flex-direction: column; gap: 8px; }
.rbc-block-head {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: var(--text-xs, 0.6875rem); font-weight: 600; letter-spacing: 0.01em;
  color: var(--muted, #71717a);
}
.rbc-block-head--up { color: var(--proven, #16a34a); }
.rbc-block-head--flag { color: var(--gap, #d97706); }

.rbc-motions { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.rbc-motion {
  display: grid; grid-template-columns: 8px minmax(120px, max-content) 1fr auto;
  align-items: baseline; gap: 10px;
  padding: 7px 2px; border-bottom: 1px solid var(--line, #ececec);
}
.rbc-motion:last-child { border-bottom: none; }
.rbc-motion-dot {
  width: 7px; height: 7px; border-radius: 50%; align-self: center;
  background: var(--ghost, #d4d4d8);
}
.rbc-motion-dot--up { background: var(--proven, #16a34a); }
.rbc-motion-dot--flag { background: var(--gap, #d97706); }
.rbc-motion-name {
  font-size: var(--text-sm, 0.8125rem); font-weight: 550; color: var(--ink, #18181b);
}
.rbc-motion-prov {
  font-size: var(--text-sm, 0.8125rem); color: var(--ink-2, #3f3f46);
  font-variant-numeric: tabular-nums; line-height: 1.4;
}
.rbc-motion-prov--flag { color: var(--muted, #71717a); }
.rbc-motion-decide { display: inline-flex; gap: 6px; }

.rbc-mini {
  font-size: var(--text-xs, 0.6875rem); font-weight: 550;
  padding: 3px 9px; border-radius: var(--r-sm, 6px);
  border: 1px solid var(--line-2, #e4e4e7); background: var(--surface, #fff);
  color: var(--ink-2, #3f3f46); cursor: pointer;
  transition: border-color var(--dur-fast, 120ms) var(--ease-out, ease),
              background var(--dur-fast, 120ms) var(--ease-out, ease);
}
.rbc-mini:hover:not(:disabled) { border-color: var(--ghost, #d4d4d8); background: var(--surface-2, #f4f4f5); }
.rbc-mini--pause:hover:not(:disabled) { border-color: var(--gap, #d97706); color: var(--gap, #d97706); }
.rbc-mini:disabled { opacity: 0.5; cursor: default; }

.rbc-moves { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.rbc-move {
  display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
  font-size: var(--text-sm, 0.8125rem);
}
.rbc-move-name { color: var(--ink-2, #3f3f46); }
.rbc-move-delta { display: inline-flex; align-items: baseline; gap: 7px; font-variant-numeric: tabular-nums; }
.rbc-move-base { color: var(--faint, #a1a1aa); }
.rbc-move-arrow { color: var(--ghost, #d4d4d8); }
.rbc-move-to { font-weight: 600; }
.rbc-move-to--up { color: var(--proven, #16a34a); }
.rbc-move-to--down { color: var(--muted, #71717a); }

.rbc-why {
  margin: 2px 0 0; font-size: var(--text-xs, 0.6875rem); color: var(--muted, #71717a);
  line-height: 1.5; max-width: 60ch;
}

.rbc-actions {
  display: flex; align-items: center; gap: 8px;
  padding-top: 14px; border-top: 1px solid var(--line, #ececec);
}
.rbc-btn {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: var(--text-sm, 0.8125rem); font-weight: 550;
  padding: 7px 14px; border-radius: var(--r-sm, 6px);
  border: 1px solid var(--line-2, #e4e4e7); background: var(--surface, #fff);
  color: var(--ink-2, #3f3f46); cursor: pointer;
  transition: border-color var(--dur-fast, 120ms) var(--ease-out, ease),
              background var(--dur-fast, 120ms) var(--ease-out, ease),
              color var(--dur-fast, 120ms) var(--ease-out, ease);
}
.rbc-btn:hover:not(:disabled) { border-color: var(--ghost, #d4d4d8); background: var(--surface-2, #f4f4f5); }
.rbc-btn:disabled { opacity: 0.5; cursor: default; }
.rbc-btn--primary {
  background: var(--primary, #18181b); border-color: var(--primary, #18181b);
  color: var(--on-primary, #fff);
}
.rbc-btn--primary:hover:not(:disabled) {
  background: var(--primary-hover, #000); border-color: var(--primary-hover, #000);
}
`;
