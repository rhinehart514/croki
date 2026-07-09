import { Activity } from "lucide-react";

// MotionEfficiencyTable — the Measure surface's per-motion table (GTM-MACHINE.md Area 7).
//
// It renders the ONE efficiency table the whole operation keys on: every real outcome aggregated by the
// motion that earned it (a shape-derived motion kind), ordered by observed outcomes. These are the same
// rows the Operator lens's funnel consumes — one table, never a second figure.
//
// The honesty rules this component enforces visually (never a fabricated rate):
//   - A motion with staged work and zero measured outcomes reads "Nothing measured yet" — no invented %.
//   - Coverage renders only when something is staged; a null coverage shows an em-dash, never 0%.
//   - The unattributed bucket (outcomes that joined to no motion) is drawn apart, muted, so nothing is
//     silently credited to a motion it did not come from.
//   - An empty operation reads a plain empty state, not a table of zeros.
//
// Purely presentational: it takes the deriveMotionEfficiency payload as a prop (self-contained, no fetch,
// no App wiring) so the Operator lens or a Measure panel can drop it in. Tabular numbers on everything
// that changes; monochrome zinc; one restrained accent only on the top-ranked, working motion.

export type MotionEfficiencyRow = {
  motionKind: string | null;
  motionRef?: string | null;
  staged: number;
  measured: number;
  outcomesByKind: Record<string, number>;
  coverage: number | null;
  lastOutcomeAt: string | null;
  orderRank: number;
};

export type MotionEfficiencyData = {
  projectId?: string;
  motions: MotionEfficiencyRow[];
  totals?: { motions: number; staged: number; measured: number };
};

const UNATTRIBUTED_LABEL = "Unattributed";

function outcomeSummary(byKind: Record<string, number>): string {
  const parts = Object.entries(byKind)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${n} ${kind}`);
  return parts.join(" · ");
}

function coverageLabel(row: MotionEfficiencyRow): string {
  // Never a fabricated rate: an em-dash when nothing is staged, an honest 0% when staged-but-unmeasured.
  if (row.coverage === null) return "—";
  return `${Math.round(row.coverage * 100)}%`;
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const secs = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function MotionEfficiencyTable({
  data,
  loading = false,
  error = null,
}: {
  data: MotionEfficiencyData | null;
  loading?: boolean;
  error?: string | null;
}) {
  const motions = data?.motions ?? [];

  return (
    <section className="met" aria-label="Per-motion efficiency">
      <style>{MET_CSS}</style>
      <header className="met-head">
        <span className="met-eyebrow">
          <Activity size={13} aria-hidden="true" /> Which motion is working
        </span>
        {data?.totals ? (
          <span className="met-totals">
            {data.totals.measured} measured across {data.totals.staged} staged
          </span>
        ) : null}
      </header>

      {error ? (
        <p className="met-empty met-empty--err">{error}</p>
      ) : loading ? (
        <p className="met-empty">Reading the outcome ledger…</p>
      ) : motions.length === 0 ? (
        <p className="met-empty">
          Nothing measured yet. Run a motion to the gate and record an outcome — the first result names the
          motion that earned it.
        </p>
      ) : (
        <div className="met-scroll">
          <table className="met-table">
            <thead>
              <tr>
                <th className="met-col-motion">Motion</th>
                <th className="met-col-num">Staged</th>
                <th className="met-col-num">Measured</th>
                <th className="met-col-num">Coverage</th>
                <th className="met-col-outcomes">Outcomes</th>
                <th className="met-col-when">Last</th>
              </tr>
            </thead>
            <tbody>
              {motions.map((row) => {
                const key = row.motionRef ?? row.motionKind ?? `rank-${row.orderRank}`;
                const label = row.motionKind ?? UNATTRIBUTED_LABEL;
                const unattributed = row.motionKind === null;
                const working = !unattributed && row.orderRank === 0 && row.measured > 0;
                const nothingMeasured = row.measured === 0;
                return (
                  <tr
                    key={key}
                    className={
                      "met-row" +
                      (unattributed ? " met-row--unattributed" : "") +
                      (working ? " met-row--working" : "")
                    }
                  >
                    <td className="met-col-motion">
                      <span className="met-motion-dot" data-working={working ? "1" : "0"} aria-hidden="true" />
                      <span className="met-motion-label">{label}</span>
                    </td>
                    <td className="met-col-num met-num">{row.staged}</td>
                    <td className="met-col-num met-num">{row.measured}</td>
                    <td className="met-col-num met-num met-coverage">{coverageLabel(row)}</td>
                    <td className="met-col-outcomes">
                      {nothingMeasured ? (
                        <span className="met-nothing">Nothing measured yet</span>
                      ) : (
                        <span className="met-outcomes">{outcomeSummary(row.outcomesByKind)}</span>
                      )}
                    </td>
                    <td className="met-col-when met-num">{relTime(row.lastOutcomeAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Scoped styles — self-contained so the component drops into any surface without touching index.css.
// Monochrome zinc on the shared tokens; tabular numbers on every changing figure; one restrained accent
// on the single working motion; no decoration.
const MET_CSS = `
.met { display: flex; flex-direction: column; gap: 10px; }
.met-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.met-eyebrow {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: var(--text-xs, 0.6875rem); font-weight: 600; letter-spacing: 0.02em;
  text-transform: uppercase; color: var(--muted);
}
.met-totals {
  font-size: var(--text-xs, 0.6875rem); color: var(--faint);
  font-variant-numeric: tabular-nums;
}
.met-empty {
  margin: 0; padding: 14px 2px; color: var(--muted);
  font-size: var(--text-sm, 0.8125rem); line-height: 1.5; max-width: 52ch;
}
.met-empty--err { color: var(--danger, #dc2626); }
.met-scroll { overflow-x: auto; }
.met-table {
  width: 100%; border-collapse: collapse; font-size: var(--text-sm, 0.8125rem);
}
.met-table thead th {
  text-align: left; font-weight: 600; color: var(--muted);
  font-size: var(--text-xs, 0.6875rem); letter-spacing: 0.01em;
  padding: 0 12px 8px; border-bottom: 1px solid var(--line, #ececec); white-space: nowrap;
}
.met-col-num { text-align: right; }
.met-row { border-bottom: 1px solid var(--line, #ececec); }
.met-row:last-child { border-bottom: none; }
.met-row td { padding: 9px 12px; color: var(--ink-2, #3f3f46); vertical-align: baseline; }
.met-num { font-variant-numeric: tabular-nums; }
.met-coverage { color: var(--ink, #18181b); font-weight: 500; }
.met-col-motion { display: flex; align-items: center; gap: 8px; min-width: 160px; }
.met-motion-label { color: var(--ink, #18181b); font-weight: 500; }
.met-motion-dot {
  width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto;
  background: var(--ghost, #d4d4d8);
}
.met-motion-dot[data-working="1"] { background: var(--proven, #16a34a); }
.met-row--working .met-motion-label { color: var(--ink, #18181b); }
.met-row--unattributed td { color: var(--faint, #a1a1aa); }
.met-row--unattributed .met-motion-label { color: var(--faint, #a1a1aa); font-style: italic; font-weight: 400; }
.met-nothing { color: var(--faint, #a1a1aa); }
.met-outcomes { color: var(--ink-2, #3f3f46); font-variant-numeric: tabular-nums; }
.met-col-when { color: var(--muted); white-space: nowrap; }
`;
