// product-change.mjs — fork is a worktree (FIRM-SPEC.md "The one verb": "When the bet is code, fork
// is literally a git worktree.").
//
// A code bet gets an isolated worktree, retained diff, staged founder review, and explicit apply.
// The venture and bet are the complete identity for every receipt and review workspace.
//
// This file covers fork → ready-for-review → stage-for-review-and-park. The founder's decision and
// its consequences (review/apply/revert/discard) live in product-change-decide.mjs — a domain split,
// not a size dodge: "get a diff in front of the founder" vs. "what the founder decided."

import fs from "node:fs";
import path from "node:path";
import { now, openVenture } from "./venture-store.mjs";
import { updateFrictionItem, listFrictionQueue, DEFAULT_QUEUE_DIR } from "../friction.mjs";
import { enqueueFeatureRequest } from "../feature-builder.mjs";
import { completeUncommittedPatch, patchDigest } from "../git-patch.mjs";
import { getWorkspace, openBetWorkspace, addRevision } from "./product-change-workspace.mjs";
import { git, safeWorkspace, assertRetainedIdentity, readBetIdentity, betQueueRecord } from "./product-change-record.mjs";
import { stampKnownEffectConsequences } from "./effect-consequences.mjs";

const MAX_DIFF = 120_000;

// ── Fork: a bet's request to touch the product cuts an isolated worktree ──────────────────────────
// This is the entry point work-loop.mjs (F2) calls: a teammate driving a bet whose next act touches
// the product forks by requesting a feature build keyed to that bet, exactly as forking a GTM bet
// enqueues divergent work. Nothing here commits, merges, pushes, or deploys — feature-builder.mjs's
// existing wall (the defensive uncommit + ready-for-review retention) is unchanged.
//
export function forkProductBet({ ventureId, betId, intent }, options = {}) {
  if (!ventureId || !betId) throw new Error("forkProductBet() needs a ventureId and a betId.");
  const report = String(intent ?? "").trim();
  if (!report) throw new Error("forkProductBet() needs an intent — what the bet is trying.");
  const venture = openVenture(ventureId, options);
  if (!venture) throw new Error(`No such venture: ${ventureId}`);
  const queueDir = options.queueDir ?? DEFAULT_QUEUE_DIR;
  const enqueued = enqueueFeatureRequest(
    { report, source: "firm-bet", ventureId },
    { ...options, repoRoot: options.repoRoot ?? venture.repository },
  );
  updateFrictionItem(path.join(queueDir, path.basename(enqueued.file)), {
    fields: { venture_id: ventureId, bet_id: betId },
  });
  return enqueued;
}

// The founder-facing list view gets a display-truncated diff (MAX_DIFF); stageProductBetForReview
// re-derives the full untruncated diff itself so what's staged for apply is always the exact patch.
function patchFor(record) {
  const safe = safeWorkspace(record);
  if (!safe || ["queued", "building", "declined"].includes(record.status)) return { diff: null, patchHash: null, truncated: false };
  assertRetainedIdentity(record, safe);
  const fullDiff = completeUncommittedPatch(safe.worktree);
  const patchHash = patchDigest(fullDiff);
  return fullDiff.length > MAX_DIFF
    ? { diff: `${fullDiff.slice(0, MAX_DIFF)}\n… diff truncated`, patchHash, truncated: true }
    : { diff: fullDiff, patchHash, truncated: false };
}

function fullPatchFor(record) {
  const safe = safeWorkspace(record);
  if (!safe) return { diff: null, patchHash: null };
  assertRetainedIdentity(record, safe);
  const fullDiff = completeUncommittedPatch(safe.worktree);
  return { diff: fullDiff, patchHash: patchDigest(fullDiff) };
}

// Every visible product-change receipt currently on one bet — the venture-scoped, bet-scoped
// equivalent of listProductChangeReceipts. Never crosses into another venture's or bet's queue
// items: the ventureId/betId frontmatter stamp is the fail-closed filter, same shape as every other
// venture-scoped read in this tree.
const VISIBLE = new Set(["queued", "building", "failed", "declined", "ready-for-review", "interrupted"]);
export function listBetProductChanges(ventureId, betId, options = {}) {
  const queueDir = options.queueDir ?? DEFAULT_QUEUE_DIR;
  return listFrictionQueue({ queueDir }).reports
    .filter((record) => record.kind === "feature" && VISIBLE.has(record.status))
    .filter((record) => {
      const identity = readBetIdentity(queueDir, record.file);
      return identity.ventureId === ventureId && identity.betId === betId;
    })
    .map((record) => ({
      id: record.file,
      ventureId, betId,
      status: record.status,
      title: record.summary,
      branch: record.branch,
      worktree: record.worktree,
      baseCommit: record.baseCommit,
      capturedAt: record.capturedAt,
      ...patchFor(record),
    }))
    .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)));
}

// Stage the exact retained diff into a review revision on the bet's workspace, then attach a staged
// artifact (diff + patchHash + worktree identity) to bet.staged[] and park it at the wall. `bet` is
// the caller's in-memory bet object (mirroring bet.mjs's own no-implicit-persistence convention —
// this returns the UPDATED bet; the caller still calls setVentureDoc). `deps.park` is injectable so
// this module never hard-imports wall.mjs at load time (F3 lands it in parallel); the default lazily
// imports ./wall.mjs only at call time, so a test that never stages a change never touches it.
async function defaultPark(effect, parkOptions) {
  const { park } = await import("./wall.mjs");
  return park(effect, parkOptions);
}

export async function stageProductBetForReview(bet, file, options = {}, deps = {}) {
  const park = deps.park ?? defaultPark;
  const { record, queueDir } = betQueueRecord(bet.ventureId, bet.id, file, options);
  if (record.status !== "ready-for-review") throw new Error("This bet's product change is not ready for founder review.");
  const safe = safeWorkspace(record);
  if (!safe) throw new Error("The retained worktree cannot be verified inside this product repository.");
  const workspace = openBetWorkspace(bet.ventureId, bet.id, safe.repo, options);
  if (fs.realpathSync(workspace.repo) !== safe.repo) throw new Error("The retained change belongs to a different bet's workspace.");
  assertRetainedIdentity(record, safe);
  const { diff, patchHash } = fullPatchFor(record);
  if (!diff || !patchHash) throw new Error("The exact full difference is not available for founder review.");

  const id = `local-change-${file.replace(/\.md$/, "")}-${patchHash.slice(0, 12)}`;
  const existingRevision = workspace.revisions.find((revision) => revision.id === id);
  let revision = existingRevision;
  if (!existingRevision) {
    const timestamp = now();
    revision = {
      id, createdAt: timestamp, updatedAt: timestamp, status: "proposed",
      baseCommit: record.baseCommit, branch: record.branch, worktree: record.worktree,
      worktreeStatus: "ready-for-review",
      diffStat: git(safe.worktree, ["diff", "--stat", "--"]),
      diff, patchHash, summary: record.summary, error: null,
      sourceReceiptId: file, betId: bet.id, ventureId: bet.ventureId,
      safety: "Proposed for founder review only. No files were applied and no commit, merge, push, or deploy occurred.",
    };
    addRevision(workspace.id, revision, options);
    updateFrictionItem(path.join(queueDir, file), { fields: { review_workspace: workspace.id, review_revision: id } });
  }

  const alreadyStaged = (bet.staged ?? []).some((item) => item.patchHash === patchHash);
  const staged = alreadyStaged ? bet.staged : [
    ...(bet.staged ?? []),
    {
      id,
      kind: "product-change", sourceReceiptId: file, workspaceId: workspace.id, revisionId: id,
      diff, diffStat: revision.diffStat, patchHash, worktree: record.worktree, branch: record.branch,
      baseCommit: record.baseCommit, betId: bet.id,
      ownerRefs: bet.teammateRef ? [bet.teammateRef] : [], contributorRefs: [],
      configurationRevision: bet.configurationRevision ?? null,
      architectureRevision: bet.architectureRevision ?? null,
      architectureTarget: bet.architectureTarget ?? null,
      stagedAt: now(), updatedAt: now(),
    },
  ];
  const updatedBet = { ...bet, staged, updatedAt: now() };

  if (!alreadyStaged) {
    // workspaceId/revisionId ride along on the parked effect (not just bet.staged[]) because
    // effect-executors.mjs's product-change executor needs them at release time to call
    // applyProductBetChange — the wall only ever hands the executor the effect it parked.
    await park(
      { ventureId: bet.ventureId, betId: bet.id, workRef: id, purpose: "release", configurationRevision: bet.configurationRevision ?? null, architectureRevision: bet.architectureRevision ?? null, architectureTarget: bet.architectureTarget ?? null, effect: stampKnownEffectConsequences({ kind: "product-change", workspaceId: workspace.id, revisionId: id, diff, diffStat: revision.diffStat, patchHash, worktree: record.worktree, branch: record.branch, baseCommit: record.baseCommit, sourceReceiptId: file }, options) },
      options,
    );
  }
  return { bet: updatedBet, workspaceId: workspace.id, revision };
}

export { getWorkspace };
