import { useEffect, useMemo, useState } from "react";
import { Users, Check, X as XIcon, PencilLine } from "lucide-react";
import { agentPersona, FAMILY_TINT } from "@/lib/agentPersona";
import { getAgentBench, type AgentBenchRow } from "@/api";
import "@/styles/agent-bench.css";

// The bench — the whole roster as ONE lens over the run ledger. Every row is REAL: role and monogram
// come from the persona library, the track record is derived from actual gate decisions, and an agent
// that has never run says so plainly. Nothing here is a stored roster or a seeded number; it is a
// projection over the same runs the profile sheet reads. Click a row to open that agent's full record.
function Mark({ agentRef, job }: { agentRef: string; job?: string }) {
  const { family, monogram } = agentPersona(agentRef, job);
  const tint = FAMILY_TINT[family];
  return (
    <div className="bench-mark" style={{ background: tint.bg, color: tint.fg }}>{monogram}</div>
  );
}

// A quiet proof-strength bar: the share of this agent's decided work the founder approved. Only shown
// when the agent has a track record — never a 0-dressed-as-data bar for an agent that has not run.
function ProofBar({ approved, decided }: { approved: number; decided: number }) {
  const pct = decided > 0 ? Math.round((approved / decided) * 100) : 0;
  return (
    <div className="bench-proof" aria-hidden>
      <div className="bench-proof-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function AgentBench({
  open, projectId, onClose, onOpenAgent,
}: {
  open: boolean;
  projectId: string | null;
  onClose: () => void;
  onOpenAgent: (ref: string) => void;
}) {
  // Stamped with the project it belongs to (like the profile sheet stamps by ref) so switching projects
  // never shows a stale roster and "still loading" is simply "no loaded record for this project yet" —
  // no synchronous reset in the effect. rows === null on a loaded record means the read failed.
  const [loaded, setLoaded] = useState<{ projectId: string; rows: AgentBenchRow[] | null } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !projectId) return;
    let live = true;
    getAgentBench(projectId)
      .then((r) => { if (live) setLoaded({ projectId, rows: r.bench }); })
      .catch(() => { if (live) setLoaded({ projectId, rows: null }); });
    return () => { live = false; };
  }, [open, projectId]);

  const current = loaded && loaded.projectId === projectId ? loaded : null;
  const rows = current?.rows ?? null;
  const loading = current === null;
  const error = current !== null && current.rows === null;

  // The backend already orders run-first; split at the boundary so the roster reads as "who's proven"
  // above "who's on the bench, not yet tried" — the teaching the founder actually wants.
  const { proven, waiting } = useMemo(() => {
    const list = rows ?? [];
    return {
      proven: list.filter((r) => r.hasRuns),
      waiting: list.filter((r) => !r.hasRuns),
    };
  }, [rows]);

  if (!open) return null;

  return (
    <div className="canvas-overlay bench-overlay" role="dialog" aria-modal="true" aria-label="Agent bench">
      <div className="canvas-overlay-bar">
        <div className="bench-title">
          <span className="bench-title-icon"><Users size={15} /></span>
          <div>
            <h1>Your bench</h1>
            <p>Every specialist, and what each has earned at your gate.</p>
          </div>
        </div>
        <button className="canvas-overlay-close" onClick={onClose} type="button" title="Back to the canvas">×</button>
      </div>

      <div className="canvas-overlay-body bench-body">
        {error ? (
          <p className="bench-empty">The bench couldn&apos;t be read just now. It reflects your run history — try reopening it.</p>
        ) : loading ? (
          <p className="bench-empty">Reading the roster&hellip;</p>
        ) : (rows ?? []).length === 0 ? (
          <p className="bench-empty">No agents on disk yet. As pipelines compose specialists, they show up here with their track record.</p>
        ) : (
          <>
            {proven.length > 0 && (
              <section className="bench-section">
                <div className="bench-shead">Proven · decided at your gate</div>
                <div className="bench-grid">
                  {proven.map((row) => <BenchRow key={row.ref} row={row} onOpen={onOpenAgent} />)}
                </div>
              </section>
            )}
            {waiting.length > 0 && (
              <section className="bench-section">
                <div className="bench-shead">On the bench · not yet run</div>
                <div className="bench-grid">
                  {waiting.map((row) => <BenchRow key={row.ref} row={row} onOpen={onOpenAgent} />)}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BenchRow({ row, onOpen }: { row: AgentBenchRow; onOpen: (ref: string) => void }) {
  const { role } = agentPersona(row.ref, row.job);
  const decided = row.counts.approved + row.counts.rejected;
  return (
    <button className="bench-card" type="button" onClick={() => onOpen(row.ref)}>
      <Mark agentRef={row.ref} job={row.job} />
      <div className="bench-card-main">
        <div className="bench-card-role">{role}</div>
        {row.job ? <div className="bench-card-job">{row.job}</div> : null}
        {row.hasRuns ? (
          <>
            <div className="bench-card-stats">
              <span className="bench-stat good"><Check size={12} />{row.counts.approved}</span>
              {row.counts.rejected > 0 ? <span className="bench-stat bad"><XIcon size={12} />{row.counts.rejected}</span> : null}
              {row.counts.edits > 0 ? <span className="bench-stat"><PencilLine size={12} />{row.counts.edits}</span> : null}
              <span className="bench-stat-runs">{row.runCount} run{row.runCount === 1 ? "" : "s"}</span>
            </div>
            <ProofBar approved={row.counts.approved} decided={decided} />
          </>
        ) : (
          <div className="bench-card-quiet">No runs yet — nothing decided at your gate.</div>
        )}
      </div>
    </button>
  );
}
