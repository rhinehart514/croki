// Approach comparison — a representation projected from REAL durable truth thrown away today as a count.
// A direction's member bets are its parallel attempts (fork siblings via forkedFrom). Instead of hiding
// them behind "Approaches: N" in machinery and collapsing extra drafts into <details>, this renders each
// sibling side by side: its intent, its live/at-wall/ended position, its staged summary, and any joined
// outcome. A row is clickable to narrow the composer's scope to that one sibling (targetBet) — pure
// intent, mutates nothing until the founder sends. available() gates on more than one member bet, so it
// never appears for a single-attempt direction. One visual grammar: now-detail-block throughout.
import type { FirmBet } from "@/types";
import { targetBet, type CanvasSelection } from "@/components/firm/directionTarget";
import { resolveStagedArtifact } from "./reviewArtifact";
import type { DirectionRenderContext } from "./projectDirection";

const POSITION_LABEL: Record<string, string> = { live: "Working", "at-wall": "Awaiting your decision", ended: "Ended" };

// A short, honest summary of what an attempt has produced — never fabricated, read from real artifacts.
function producedSummary(bet: FirmBet): string {
  const artifacts = bet.staged ?? [];
  if (!artifacts.length) return "Nothing produced yet.";
  let diffs = 0;
  let drafts = 0;
  for (const entry of artifacts) {
    const resolved = resolveStagedArtifact(entry.content);
    if (!resolved) continue;
    if (resolved.kind === "diff") diffs += 1;
    else drafts += 1;
  }
  const parts: string[] = [];
  if (diffs) parts.push(diffs > 1 ? `${diffs} product changes` : "a product change");
  if (drafts) parts.push(drafts > 1 ? `${drafts} drafts` : "a draft");
  return parts.length ? `Produced ${parts.join(" and ")}.` : "A result is forming.";
}

export function ApproachComparison({
  ctx,
  onScopePick,
}: {
  ctx: DirectionRenderContext;
  onScopePick?: (selection: CanvasSelection) => void;
}) {
  const { memberBets } = ctx;
  return (
    <div className="now-detail-block">
      <span className="now-detail-block-label">
        {memberBets.length} approaches · pick one to steer it
      </span>
      {memberBets.map((bet) => {
        const outcome = bet.latestOutcome;
        const label = POSITION_LABEL[bet.position] ?? bet.position;
        return (
          <button
            key={bet.id}
            type="button"
            className="now-approach"
            data-tone={bet.position === "live" ? "working" : bet.position === "at-wall" ? "needs-you" : "changed"}
            onClick={() => onScopePick?.(targetBet(bet.id))}
          >
            <span className="now-approach-head">
              <span className="now-approach-intent">{bet.intent}</span>
              <span className="now-approach-state">{label}</span>
            </span>
            <span className="now-change-meta">{producedSummary(bet)}</span>
            {outcome?.body ? <span className="now-change-meta">Market: {outcome.body}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
