import { useEffect } from "react";
import type { CodingReviewComment, CodingWorkspace } from "@/api";
import { recordCodingValueMilestones } from "@/lib/ux-metrics";
import { attemptLabel } from "./workspaceProjection";
import { workStatusLabel } from "./workStatusLabel";

function elapsed(workspace: CodingWorkspace) {
  const session = workspace.providerSessions.at(-1);
  const start = Date.parse(session?.startedAt ?? workspace.createdAt);
  const end = Date.parse(session?.completedAt ?? workspace.updatedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "Not measured";
  const seconds = Math.max(1, Math.round((end - start) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function currentVerification(workspace: CodingWorkspace) {
  const latestRunRef = workspace.checkpoints.at(-1)?.runRef ?? workspace.runRefs.at(-1) ?? null;
  const attributed = latestRunRef
    ? workspace.verification.filter((entry) => entry.runRef === latestRunRef)
    : workspace.verification;
  return attributed.length || !latestRunRef
    ? attributed
    : workspace.verification.filter((entry) => !entry.runRef);
}

function evidence(checks: CodingWorkspace["verification"]) {
  const completed = checks.filter((entry) => entry.completedAt);
  const failed = completed.filter((entry) => entry.status === "failed");
  if (failed.length) return { state: "uncertain", detail: `${failed.length} verification check${failed.length === 1 ? "" : "s"} failed.` };
  const project = completed.filter((entry) => entry.kind === "host-project");
  const provider = completed.filter((entry) => entry.kind === "provider-command");
  const legacy = completed.filter((entry) => entry.kind !== "host" && entry.kind !== "host-project" && entry.kind !== "provider-command");
  const authoritative = project.length ? project : provider.length ? provider : legacy;
  if (!authoritative.some((entry) => entry.status === "passed")) return { state: "unverified", detail: "No successful verification is attributed to this checkpoint." };
  return { state: "verified", detail: "Captured checks are attributed to this exact checkpoint." };
}

function lineLabel(comment: CodingReviewComment) {
  const anchor = comment.currentAnchor ?? comment.anchor;
  return `${anchor.path}:${anchor.startLine}${anchor.endLine === anchor.startLine ? "" : `–${anchor.endLine}`}`;
}

export function WorkReviewSummary({
  workspace,
  attempts = [workspace],
  compact = false,
  onCarryComment,
}: {
  workspace: CodingWorkspace;
  attempts?: CodingWorkspace[];
  compact?: boolean;
  onCarryComment?: (comment: CodingReviewComment) => void;
}) {
  const latest = workspace.checkpoints.at(-1);
  const session = workspace.providerSessions.at(-1);
  const verification = currentVerification(workspace);
  const proof = evidence(verification);
  const exactReviewableMaterial = Boolean(
    workspace.diff.trim()
    && workspace.patchHash
    && latest
    && latest.id !== "baseline"
    && latest.runRef
    && ["reviewable", "needs-verification", "failed-verification", "applied", "committed"].includes(workspace.status),
  );
  useEffect(() => {
    recordCodingValueMilestones(workspace.ventureId, {
      exactReviewableMaterial,
      verified: proof.state === "verified",
    });
  }, [exactReviewableMaterial, proof.state, workspace.ventureId]);
  const comments = workspace.reviewComments ?? [];
  const unresolved = comments.filter((comment) => comment.state !== "addressed-awaiting-review");
  const provider = [session?.provider, session?.model].filter(Boolean).join(" · ") || "Provider identity unavailable";
  return (
    <section className="work-review-summary" data-compact={compact ? "true" : undefined} aria-label={`Review facts for ${attemptLabel(attempts, workspace)}`}>
      <header>
        <div>
          <span>{attemptLabel(attempts, workspace)} · {workStatusLabel(workspace.status)}</span>
          <strong>{latest?.direction ?? workspace.goal}</strong>
        </div>
        <span className="work-review-evidence" data-state={proof.state}>{proof.state}</span>
      </header>
      <dl>
        <div><dt>Requested outcome</dt><dd>{workspace.changeSummary?.requestedOutcome ?? workspace.goal}</dd></div>
        <div><dt>Native agent</dt><dd>{provider}{session?.effort ? ` · ${session.effort}` : ""}</dd></div>
        <div><dt>Session</dt><dd><code>{session?.sessionId ?? "Not bound"}</code></dd></div>
        <div><dt>Worktree</dt><dd><code>{workspace.worktree ?? "Removed"}</code></dd></div>
        <div><dt>Run</dt><dd><code>{latest?.runRef ?? workspace.runRefs.at(-1) ?? "Not attributed"}</code></dd></div>
        <div><dt>Elapsed</dt><dd>{elapsed(workspace)}</dd></div>
        <div><dt>Cost</dt><dd>{workspace.reviewUsage?.measured ? `$${workspace.reviewUsage.costUsd.toFixed(4)}` : "Not reported"}</dd></div>
        <div><dt>Proof</dt><dd>{proof.detail}</dd></div>
      </dl>
      <div className="work-review-receipts">
        <span>{workspace.changedFiles.length} files</span>
        <span>{workspace.commands?.length ?? 0} commands</span>
        <span>{verification.filter((entry) => entry.status === "passed").length} checks passed</span>
        <span>{workspace.checkpoints.length} checkpoints</span>
      </div>
      {verification.length ? <ul className="work-review-proof-list" aria-label="Verification receipts">
        {verification.map((entry, index) => (
          <li key={`${entry.command}:${index}`} data-state={entry.status}>
            <code>{entry.command}</code><span>{entry.status}</span>
          </li>
        ))}
      </ul> : null}
      {comments.length ? <section className="work-review-comments" aria-label="Review comments">
        <header><strong>Review comments</strong><span>{unresolved.length} unresolved</span></header>
        <ul>{comments.map((comment) => <li key={comment.id} data-state={comment.state} data-mapping={comment.mapping}>
          <div><code>{lineLabel(comment)}</code><span>{comment.mapping === "uncertain" ? "Remap uncertain" : comment.state === "addressed-awaiting-review" ? "Addressed — verify" : "Unresolved"}</span></div>
          <p>{comment.body}</p>
          {comment.mappingNote ? <small>{comment.mappingNote}</small> : null}
          {onCarryComment ? <button type="button" onClick={() => onCarryComment(comment)}>Carry this comment</button> : null}
        </li>)}</ul>
      </section> : null}
      {workspace.productConsequence ? <footer>
        <span>Optional Canvas consequence</span>
        <p>{workspace.productConsequence.releaseQuestion}</p>
      </footer> : null}
    </section>
  );
}
