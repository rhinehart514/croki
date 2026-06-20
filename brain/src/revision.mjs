import { execFileSync } from "node:child_process";
import { buildTrackingFix } from "./build.mjs";

function git(repo, args, options = {}) {
  try {
    return execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      input: options.input,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stderr = error?.stderr?.toString?.().trim();
    throw new Error(stderr || `git ${args.join(" ")} failed.`);
  }
}

export async function createRevision(workspace, options = {}) {
  const createdAt = new Date().toISOString();
  const result = await buildTrackingFix(workspace.report, options);
  return {
    id: `revision-${Date.now()}`,
    createdAt,
    updatedAt: createdAt,
    status: result.ok ? "proposed" : "failed",
    reportScannedAt: workspace.report.scannedAt,
    gapId: workspace.report.gaps?.[0]?.id ?? null,
    evidence: workspace.report.gaps?.[0]?.citations ?? [],
    baseCommit: result.baseCommit,
    branch: result.branch,
    worktree: result.worktree,
    worktreeStatus: result.status,
    diffStat: result.diffStat,
    diff: result.diff,
    summary: result.summary,
    error: result.error,
  };
}

export function reviewRevision(revision, decision, note = "") {
  if (!["approve", "reject"].includes(decision)) {
    throw new Error("Review decision must be approve or reject.");
  }
  if (!["proposed", "approved", "rejected"].includes(revision.status)) {
    throw new Error(`Revision cannot be reviewed from status "${revision.status}".`);
  }
  return {
    ...revision,
    status: decision === "approve" ? "approved" : "rejected",
    review: {
      decision,
      note: String(note || "").trim(),
      decidedAt: new Date().toISOString(),
    },
  };
}

export function inspectApplyReadiness(workspace, revision) {
  const sourceHead = git(workspace.repo, ["rev-parse", "HEAD"]);
  const sourceStatus = git(workspace.repo, ["status", "--porcelain"]);
  const sameBase = sourceHead === revision.baseCommit;
  return {
    ready: revision.status === "approved" && sameBase && !sourceStatus,
    sourceHead,
    sourceStatus,
    sameBase,
    reasons: [
      revision.status !== "approved" ? "The change set is not approved." : null,
      !sameBase ? "The source repository moved since this change set was created." : null,
      sourceStatus ? "The source repository has uncommitted changes." : null,
    ].filter(Boolean),
  };
}

export function applyRevision(workspace, revision, confirmation) {
  if (confirmation !== true) throw new Error("Applying a change set requires explicit confirmation.");
  const readiness = inspectApplyReadiness(workspace, revision);
  if (!readiness.ready) throw new Error(readiness.reasons.join(" "));
  if (!revision.diff?.trim()) throw new Error("This change set has no patch to apply.");

  const patch = revision.diff.endsWith("\n") ? revision.diff : `${revision.diff}\n`;
  git(workspace.repo, ["apply", "--check", "--whitespace=nowarn", "-"], { input: patch });
  git(workspace.repo, ["apply", "--whitespace=nowarn", "-"], { input: patch });
  return {
    ...revision,
    status: "applied",
    appliedAt: new Date().toISOString(),
    appliedSourceHead: readiness.sourceHead,
  };
}

export function revertRevision(workspace, revision, confirmation) {
  if (confirmation !== true) throw new Error("Reverting a change set requires explicit confirmation.");
  if (revision.status !== "applied") throw new Error("Only an applied change set can be reverted.");
  if (!revision.diff?.trim()) throw new Error("This change set has no patch to reverse.");

  const patch = revision.diff.endsWith("\n") ? revision.diff : `${revision.diff}\n`;
  git(workspace.repo, ["apply", "--reverse", "--check", "--whitespace=nowarn", "-"], { input: patch });
  git(workspace.repo, ["apply", "--reverse", "--whitespace=nowarn", "-"], { input: patch });
  return {
    ...revision,
    status: "reverted",
    revertedAt: new Date().toISOString(),
  };
}
