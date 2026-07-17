// The founder's decision on a staged product change: review, apply, revert, or discard.
//
// Every write below takes an already-resolved founder actor (never an HTTP request) and rejects
// anything not stamped "founder" — the same boundary shape as bet.mjs's end(). The real
// local-page request check happens at the routes layer, above this call (F3's wall.mjs/routes.mjs);
// this module only refuses to run without that resolved authority already in hand.

import fs from "node:fs";
import path from "node:path";
import { updateFrictionItem } from "../friction.mjs";
import { applyRevision, inspectApplyReadiness, reviewRevision, revertRevision } from "../revision.mjs";
import { getWorkspace, updateRevision, addDecision } from "./product-change-workspace.mjs";
import { git, safeWorkspace, assertRetainedIdentity, betQueueRecord } from "./product-change-record.mjs";
import { now } from "./venture-store.mjs";

function assertFounderActor(actor, action) {
  const kind = typeof actor === "string" ? actor : actor?.kind;
  if (String(kind ?? "").trim().toLowerCase() !== "founder") {
    const error = new Error(`${action} is founder-only. Only the founder can decide a product change.`);
    error.code = "product_change_forbidden";
    throw error;
  }
}

function actorRef(actor) {
  return typeof actor === "string" ? actor : (actor?.ref ?? "founder");
}

function findRevision(workspace, revisionId) {
  const revision = workspace.revisions.find((item) => item.id === revisionId);
  if (!revision) throw new Error(`Revision not found: ${revisionId}`);
  return revision;
}

export function reviewProductBetChange(workspaceId, revisionId, actor, input = {}, options = {}) {
  assertFounderActor(actor, "Reviewing a product change");
  const workspace = getWorkspace(workspaceId, options);
  const revision = findRevision(workspace, revisionId);
  const reviewed = reviewRevision(revision, input.decision, input.note);
  const updated = updateRevision(workspace.id, revision.id, () => reviewed, options);
  addDecision(updated.id, {
    type: "product_change_review", revisionId: revision.id, sourceReceiptId: revision.sourceReceiptId,
    decision: input.decision, note: String(input.note || "").trim(), decidedBy: actorRef(actor),
    summary: `${input.decision === "approve" ? "Approved" : "Rejected"} isolated product change on bet ${revision.betId}.`,
  }, options);
  return findRevision(getWorkspace(workspace.id, options), revisionId);
}

export function inspectProductBetChangeReadiness(workspaceId, revisionId, options = {}) {
  const workspace = getWorkspace(workspaceId, options);
  return inspectApplyReadiness(workspace, findRevision(workspace, revisionId));
}

// Release runs applyRevision with `confirm`, founder-gated exactly as the existing contract — a
// second, separate authorization for deploy (not modeled here) stays a later, distinct act.
export function applyProductBetChange(workspaceId, revisionId, actor, input = {}, options = {}) {
  assertFounderActor(actor, "Applying a product change");
  if (input.confirm !== true) throw new Error("Applying isolated product work requires explicit confirmation.");
  const workspace = getWorkspace(workspaceId, options);
  const revision = findRevision(workspace, revisionId);
  // A release can only ever act on a revision the founder ALREADY reviewed and approved as its own
  // separate act (reviewProductBetChange). This gate is the ordering law: review-approve BEFORE apply.
  // Without it, the "applying" flip below would stamp intent onto a never-reviewed revision, and a
  // failed apply's recovery could then leave the revision looking approved — self-approving content the
  // founder never saw. Refuse here, before any status is touched, so an unapproved release is inert.
  //
  // RECOVERY FROM A STUCK APPLY: a process that dies AFTER the `applying` flip but before the terminal
  // write leaves the revision `applying` forever, and a strict approved-only gate would then refuse every
  // retry (fail-closed but stuck). `applying` is only ever reached from an already-approved revision (this
  // gate ran first), so re-attempting from `applying` re-enters ONLY genuinely-approved work — it never
  // self-approves anything the founder did not review. A never-approved revision still cannot reach here.
  if (revision.status !== "approved" && revision.status !== "applying") {
    const error = new Error("Release requires the founder's prior review approval — review this revision first.");
    error.code = "product_change_not_approved";
    throw error;
  }
  // Persist intent before touching files. If the process dies after git apply but before the final
  // write, durable state says `applying` instead of falsely leaving an approved/no-op receipt. A recovery
  // re-attempt rewinds to `approved` on failure — never hardcoded, but a stuck `applying` truly was approved.
  const priorStatus = revision.status === "applying" ? "approved" : revision.status;
  updateRevision(workspace.id, revision.id, (current) => ({ ...current, status: "applying", applyStartedAt: now() }), options);
  try {
    // applyRevision's readiness gate reads revision.status === "approved"; a stuck-applying re-attempt was
    // provably approved before its flip (priorStatus), so hand applyRevision that approved snapshot rather
    // than the "applying" one — the diff/base/worktree checks are unchanged, only the already-earned status.
    const applied = applyRevision(workspace, { ...revision, status: priorStatus }, true);
    updateRevision(workspace.id, revision.id, () => applied, options);
    addDecision(workspace.id, {
      type: "product_change_apply", revisionId: revision.id, sourceReceiptId: revision.sourceReceiptId,
      decision: "apply", decidedBy: actorRef(actor),
      summary: `Applied isolated product change on bet ${revision.betId} to the source repository.`,
    }, options);
    return findRevision(getWorkspace(workspace.id, options), revisionId);
  } catch (error) {
    // Restore the pre-apply status — never hardcode "approved". Recovery must not stamp an approval the
    // founder never gave; it only rewinds the "applying" flip back to whatever the revision truly was.
    updateRevision(workspace.id, revision.id, (current) => ({
      ...current, status: priorStatus, applyError: error instanceof Error ? error.message : String(error),
    }), options);
    throw error;
  }
}

// Explicit founder recovery for a revision left `applying` by a crash mid-apply. Founder-only, same
// boundary as every other decide here. It rewinds the stuck `applying` flip back to `approved` (the state
// the revision provably held before the flip — the gate above requires approval before `applying` is ever
// set), so the founder can retry the release cleanly. It never advances a never-approved revision and never
// touches files; a revision not currently `applying` is refused so this is not a general status override.
export function resetStuckProductBetChange(workspaceId, revisionId, actor, input = {}, options = {}) {
  assertFounderActor(actor, "Recovering a stuck product change");
  if (input.confirm !== true) throw new Error("Recovering a stuck product change requires explicit confirmation.");
  const workspace = getWorkspace(workspaceId, options);
  const revision = findRevision(workspace, revisionId);
  if (revision.status !== "applying") {
    const error = new Error(`Revision ${revisionId} is not stuck applying (status "${revision.status}") — nothing to recover.`);
    error.code = "product_change_not_stuck";
    throw error;
  }
  const recovered = updateRevision(workspace.id, revision.id, (current) => ({
    ...current, status: "approved", recoveredFromStuckAt: now(),
    applyError: "Recovered from an interrupted apply; retry the release when ready.",
  }), options);
  addDecision(recovered.id, {
    type: "product_change_recover", revisionId: revision.id, sourceReceiptId: revision.sourceReceiptId,
    decision: "recover", decidedBy: actorRef(actor),
    summary: `Recovered stuck product change on bet ${revision.betId} from an interrupted apply.`,
  }, options);
  return findRevision(getWorkspace(workspace.id, options), revisionId);
}

export function revertProductBetChange(workspaceId, revisionId, actor, input = {}, options = {}) {
  assertFounderActor(actor, "Reverting a product change");
  if (input.confirm !== true) throw new Error("Reverting isolated product work requires explicit confirmation.");
  const workspace = getWorkspace(workspaceId, options);
  const revision = findRevision(workspace, revisionId);
  const reverted = revertRevision(workspace, revision, true);
  const updated = updateRevision(workspace.id, revision.id, () => reverted, options);
  return findRevision(updated, revisionId);
}

// Discard removes the isolated worktree/branch and marks the queue item discarded — the founder's
// alone, same as ending a bet, since it destroys reviewable work no one can get back.
export function discardProductBetChange(ventureId, betId, file, actor, input = {}, options = {}) {
  assertFounderActor(actor, "Discarding an isolated product change");
  if (input.confirm !== true) throw new Error("Discarding isolated work requires explicit confirmation.");
  const { record, queueDir } = betQueueRecord(ventureId, betId, file, options);
  if (record.status === "queued" || record.status === "building") throw new Error("A running product change cannot be discarded until it stops.");
  const safe = safeWorkspace(record);
  if (record.worktree && !safe) throw new Error("The recorded worktree is outside its product repository; refusing to touch it.");
  if (safe) {
    assertRetainedIdentity(record, safe);
    git(safe.repo, ["worktree", "remove", "--force", safe.worktree]);
  }
  if (record.branch) {
    if (!record.branch.startsWith("dogfood/")) throw new Error("The recorded branch is outside the product-change namespace; refusing to touch it.");
    const repo = safe?.repo ?? (record.repository && fs.existsSync(record.repository) ? fs.realpathSync(record.repository) : null);
    if (!repo) throw new Error("The product repository cannot be verified; refusing to delete its branch.");
    try { git(repo, ["branch", "-D", record.branch]); } catch { /* already absent */ }
  }
  updateFrictionItem(path.join(queueDir, file), { fields: { status: "discarded", branch: "none", worktree: "none" } });
  return { id: file, ventureId, betId, status: "discarded", discardedAt: now() };
}
