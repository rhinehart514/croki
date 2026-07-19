// Comparison is a review surface, not a hidden composer shortcut. Each approach states what exists,
// reveals the real staged artifacts/outcome in place, and offers steering as a separate explicit act.
// No draft body is synthesized here: everything comes from the bet's durable staged work or outcome.
import type { FirmBet, FirmStagedArtifact } from "@/types";
import { targetBet, type CanvasSelection } from "@/components/firm/directionTarget";
import { ArtifactPreview, DiffView, FilesChanged } from "@/components/review";
import { resolveStagedArtifact, type ResolvedArtifact } from "./reviewArtifact";
import type { DirectionRenderContext } from "./projectDirection";

const POSITION_LABEL: Record<string, string> = {
  live: "Open",
  "at-wall": "Needs your decision",
  ended: "Ended",
};

type ReviewableArtifact = {
  key: string;
  title: string;
  resolved: Exclude<ResolvedArtifact, null>;
};

function reviewableArtifacts(bet: FirmBet): ReviewableArtifact[] {
  return (bet.staged ?? []).flatMap((entry: FirmStagedArtifact, index) => {
    const resolved = resolveStagedArtifact(entry.content);
    if (!resolved) return [];
    return [{
      key: entry.id ?? `${bet.id}-${index}`,
      title: entry.title?.trim() || (resolved.kind === "diff" ? "Product change" : "Draft"),
      resolved,
    }];
  });
}

function workSummary(artifacts: ReviewableArtifact[], hasOutcome: boolean): string {
  const changes = artifacts.filter((entry) => entry.resolved.kind === "diff").length;
  const drafts = artifacts.length - changes;
  const parts: string[] = [];
  if (changes) parts.push(`${changes} ${changes === 1 ? "product change" : "product changes"}`);
  if (drafts) parts.push(`${drafts} ${drafts === 1 ? "draft" : "drafts"}`);
  if (hasOutcome) parts.push("1 market result");
  return parts.length ? `${parts.join(" · ")} ready to review` : "Nothing reviewable yet";
}

function ArtifactReview({ entry }: { entry: ReviewableArtifact }) {
  return (
    <div className="now-approach-artifact">
      <p className="now-approach-artifact-title">{entry.title}</p>
      {entry.resolved.kind === "diff" ? (
        <>
          <FilesChanged diff={entry.resolved.diff} />
          <details className="now-exact-diff">
            <summary>Review exact diff</summary>
            <DiffView diff={entry.resolved.diff} />
          </details>
        </>
      ) : (
        <div className="now-artifact-cap">
          <ArtifactPreview artifact={entry.resolved.artifact} />
        </div>
      )}
    </div>
  );
}

function ApproachCard({
  bet,
  isWorking,
  onScopePick,
}: {
  bet: FirmBet;
  isWorking: boolean;
  onScopePick?: (selection: CanvasSelection) => void;
}) {
  const artifacts = reviewableArtifacts(bet);
  const outcome = bet.latestOutcome;
  const hasReview = artifacts.length > 0 || Boolean(outcome?.body);
  const tone = bet.position === "live" ? "working" : bet.position === "at-wall" ? "needs-you" : "changed";

  return (
    <article className="now-approach now-approach-card" data-tone={tone} aria-label={`Approach: ${bet.intent}`}>
      <div className="now-approach-head">
        <h3 className="now-approach-intent">{bet.intent}</h3>
        <span className="now-approach-state">{isWorking ? "Working" : POSITION_LABEL[bet.position] ?? bet.position}</span>
      </div>
      <p className="now-change-meta">{workSummary(artifacts, Boolean(outcome?.body))}</p>

      {hasReview ? (
        <details className="now-approach-review">
          <summary>Review this approach</summary>
          <div className="now-approach-review-body">
            {artifacts.map((entry) => <ArtifactReview key={entry.key} entry={entry} />)}
            {outcome?.body ? (
              <div className="now-returned">
                <span className="now-detail-block-label">Market result</span>
                <p className="now-detail-why">{outcome.body}</p>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {onScopePick && bet.position !== "ended" && !bet.endedAt ? (
        <div className="now-approach-actions">
          <button type="button" className="now-approach-steer" onClick={() => onScopePick(targetBet(bet.id))}>
            Steer this approach
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function ApproachComparison({
  ctx,
  onScopePick,
}: {
  ctx: DirectionRenderContext;
  onScopePick?: (selection: CanvasSelection) => void;
}) {
  return (
    <section className="now-detail-block" aria-label="Approach comparison">
      <span className="now-detail-block-label">
        {ctx.memberBets.length} approaches · compare their work
      </span>
      {ctx.memberBets.map((bet) => (
        <ApproachCard
          key={bet.id}
          bet={bet}
          isWorking={(ctx.drives ?? []).some((drive) => drive.betId === bet.id)}
          onScopePick={onScopePick}
        />
      ))}
    </section>
  );
}
