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
  // Persist intent before touching files. If the process dies after git apply but before the final
  // write, durable state says `applying` instead of falsely leaving an approved/no-op receipt.
  updateRevision(workspace.id, revision.id, (current) => ({ ...current, status: "applying", applyStartedAt: now() }), options);
  try {
    const applied = applyRevision(workspace, revision, true);
    updateRevision(workspace.id, revision.id, () => applied, options);
    addDecision(workspace.id, {
      type: "product_change_apply", revisionId: revision.id, sourceReceiptId: revision.sourceReceiptId,
      decision: "apply", decidedBy: actorRef(actor),
      summary: `Applied isolated product change on bet ${revision.betId} to the source repository.`,
    }, options);
    return findRevision(getWorkspace(workspace.id, options), revisionId);
  } catch (error) {
    updateRevision(workspace.id, revision.id, (current) => ({
      ...current, status: "approved", applyError: error instanceof Error ? error.message : String(error),
    }), options);
    throw error;
  }
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
