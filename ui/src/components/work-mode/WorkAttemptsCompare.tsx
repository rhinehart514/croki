import type { CodingReviewComment, CodingWorkspace } from "@/api";
import { WorkChangesPane } from "./WorkChangesPane";
import { WorkReviewSummary } from "./WorkReviewSummary";
import { workStatusLabel } from "./workStatusLabel";
import { attemptLabel } from "./workspaceProjection";

function carriedComment(comment: CodingReviewComment) {
  const anchor = comment.currentAnchor ?? comment.anchor;
  return `${anchor.path}:${anchor.startLine} — ${comment.body}`;
}

export function WorkAttemptsCompare({
  attempts,
  primaryId,
  leftId,
  rightId,
  onPairChange,
  onFocusAttempt,
  onContinueAttempt,
  onCarryComment,
  onExit,
}: {
  attempts: CodingWorkspace[];
  primaryId: string;
  leftId: string | null;
  rightId: string | null;
  onPairChange: (leftId: string, rightId: string) => void;
  onFocusAttempt: (id: string) => void;
  onContinueAttempt: (id: string) => void;
  onCarryComment: (id: string, comment: string) => void;
  onExit: () => void;
}) {
  const fallbackOther = attempts.find((attempt) => attempt.id !== primaryId)?.id ?? primaryId;
  const exactLeftId = attempts.some((attempt) => attempt.id === leftId) ? leftId! : primaryId;
  const exactRightId = attempts.some((attempt) => attempt.id === rightId) && rightId !== exactLeftId
    ? rightId!
    : attempts.find((attempt) => attempt.id !== exactLeftId)?.id ?? fallbackOther;
  const left = attempts.find((attempt) => attempt.id === exactLeftId) ?? attempts[0];
  const right = attempts.find((attempt) => attempt.id === exactRightId) ?? attempts[1] ?? attempts[0];
  const columns = [
    { side: "left", workspace: left, value: exactLeftId },
    { side: "right", workspace: right, value: exactRightId },
  ] as const;

  return (
    <section className="work-compare" aria-label="Compare coding attempts">
      <header className="work-compare-head">
        <div><strong>Compare attempts</strong><span>Read-only until you focus, continue, or carry a comment.</span></div>
        <button type="button" className="work-compare-done" onClick={onExit}>Done comparing</button>
      </header>
      <div className="work-compare-columns">
        {columns.map(({ side, workspace, value }) => (
          <article className="work-compare-column" key={side} aria-label={`${side === "left" ? "Left" : "Right"} attempt`}>
            <header className="work-compare-column-head">
              <label className="work-compare-pick">
                <span className="sr-only">Choose {side} attempt</span>
                <select
                  value={value}
                  onChange={(event) => {
                    const next = event.target.value;
                    onPairChange(
                      side === "left" ? next : next === exactLeftId ? exactRightId : exactLeftId,
                      side === "right" ? next : next === exactRightId ? exactLeftId : exactRightId,
                    );
                  }}
                >
                  {attempts.map((attempt) => (
                    <option key={attempt.id} value={attempt.id}>{attemptLabel(attempts, attempt)} · {workStatusLabel(attempt.status)}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="work-compare-focus" onClick={() => onFocusAttempt(workspace.id)}>Focus</button>
              <button type="button" className="work-compare-focus" onClick={() => onContinueAttempt(workspace.id)}>Continue</button>
            </header>
            <div className="work-compare-column-body">
              <WorkReviewSummary
                workspace={workspace}
                attempts={attempts}
                compact
                onCarryComment={(comment) => onCarryComment(workspace.id, carriedComment(comment))}
              />
              <WorkChangesPane workspace={workspace} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
