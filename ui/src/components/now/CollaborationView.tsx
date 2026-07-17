// Agent collaboration — a restrained representation projected from REAL truth only. It shows WORK before
// worker: what is forming, what is blocked on the founder, and a single calm working-now line — never
// avatars, an org chart, inter-agent messages, or a per-tool-call log, and never a fabricated dependency
// or handoff graph (activeDrives carries none of that, so neither does this). Live drives are labeled
// VOLATILE because they are process-local and vanish on brain restart — this view refuses to imply a
// durable participant graph. It is honest at rest: with zero drives it still projects the standing state
// (staged work forming, decisions blocked on you) from durable bet/wall truth. A driving row is clickable
// to narrow the composer to that bet (targetBet) — pure intent, no mutation. available() gates on a live
// drive OR any member bet, so it is only offered when there is real work to describe.
import { Square } from "lucide-react";
import { targetBet, type CanvasSelection } from "@/components/firm/directionTarget";
import type { DirectionRenderContext } from "./projectDirection";

function elapsed(startedAt: string): string | null {
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return null;
  const mins = Math.max(0, Math.round((Date.now() - started) / 60_000));
  if (mins < 1) return "just started";
  if (mins < 60) return `${mins}m in`;
  return `${Math.floor(mins / 60)}h in`;
}

export function CollaborationView({
  ctx,
  onScopePick,
  onStop,
}: {
  ctx: DirectionRenderContext;
  onScopePick?: (selection: CanvasSelection) => void;
  onStop?: (driveId: string) => void;
}) {
  const { drives, memberBets, waiting, previews, exactChanges } = ctx;
  const forming = exactChanges.length + previews.length;

  return (
    <div className="now-detail-block">
      <span className="now-detail-block-label">Who is working, and on what</span>

      {/* Work before worker: what is forming and what is blocked, in plain language. */}
      <ul className="now-detail-list">
        {forming > 0 ? (
          <li><span>{forming > 1 ? `${forming} results are` : "A result is"} forming and ready to review.</span></li>
        ) : null}
        {waiting.length ? (
          <li><span>{waiting.length > 1 ? `${waiting.length} decisions are` : "A decision is"} waiting on you.</span></li>
        ) : null}
        {forming === 0 && !waiting.length ? (
          <li><span>{drives.length ? "Work is taking shape now." : "No work is moving right now — steer to begin."}</span></li>
        ) : null}
      </ul>

      {/* Live drives — the only "who", demoted below the work and explicitly labeled volatile. */}
      {drives.length ? (
        <div className="now-detail-block">
          {drives.map((drive) => {
            const bet = memberBets.find((entry) => entry.id === drive.betId);
            const when = elapsed(drive.startedAt);
            return (
              <div key={drive.id} className="now-collab-row" data-tone="working">
                <span className="now-progress-dot" aria-hidden="true" />
                <button type="button" className="now-collab-focus" onClick={() => onScopePick?.(targetBet(drive.betId ?? bet?.id ?? ""))} disabled={!drive.betId && !bet}>
                  {bet?.intent ?? "Work in this direction"}
                </button>
                <span className="now-change-meta">
                  {drive.teammateRef} · {drive.runtime}{when ? ` · ${when}` : ""} · live now, not saved history
                </span>
                {drive.abortSupported ? (
                  <button type="button" className="now-progress-stop" onClick={() => onStop?.(drive.id)} disabled={Boolean(drive.abortRequestedAt)}>
                    <Square aria-hidden="true" style={{ width: 11, height: 11 }} /> {drive.abortRequestedAt ? "Stopping…" : "Stop"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="now-change-meta">No agent is driving this right now. Standing state is read from saved work above.</p>
      )}
    </div>
  );
}
