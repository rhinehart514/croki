import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DEFAULT_QUEUE_DIR, listFrictionQueue, updateFrictionItem } from "./friction.mjs";
import { loadProject } from "./project-store.mjs";
import { addDecision, addRevision, getWorkspace, updateRevision } from "./workspace.mjs";
import { completeUncommittedPatch, patchDigest } from "./git-patch.mjs";
import { applyRevision, inspectApplyReadiness, reviewRevision } from "./revision.mjs";

const VISIBLE = new Set(["queued", "building", "failed", "declined", "ready-for-review", "interrupted"]);
const MAX_DIFF = 120_000;

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 2 * 1024 * 1024 }).trim();
}

function receiptPath(queueDir, file) {
  const name = path.basename(String(file || ""));
  if (!name.endsWith(".md") || name !== file) throw new Error("Product change receipt not found.");
  const resolved = path.join(queueDir, name);
  if (!fs.existsSync(resolved)) throw new Error("Product change receipt not found.");
  return resolved;
}

function safeWorkspace(record) {
  if (!record.worktree || !record.repository || !fs.existsSync(record.worktree) || !fs.existsSync(record.repository)) return null;
  const repo = fs.realpathSync(record.repository);
  const worktree = fs.realpathSync(record.worktree);
  const root = path.join(repo, ".dogfood-worktrees");
  const rel = path.relative(root, worktree);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? { repo, worktree } : null;
}

function safeRepository(record) {
  if (!record.repository || !fs.existsSync(record.repository)) return null;
  try { return fs.realpathSync(record.repository); } catch { return null; }
}

function assertRetainedIdentity(record, safe) {
  const top = fs.realpathSync(git(safe.worktree, ["rev-parse", "--show-toplevel"]));
  if (top !== safe.worktree) throw new Error("The retained product-change worktree identity no longer matches its receipt.");
  const branch = git(safe.worktree, ["symbolic-ref", "--short", "HEAD"]);
  if (!record.branch || branch !== record.branch) throw new Error("The retained product-change branch no longer matches its receipt.");
  const head = git(safe.worktree, ["rev-parse", "HEAD"]);
  if (!record.baseCommit || head !== record.baseCommit) throw new Error("The retained product-change base moved after the isolated build.");
}

function patchFor(record) {
  const safe = safeWorkspace(record);
  if (!safe || ["queued", "building", "declined"].includes(record.status)) return { diff: null, fullDiff: null, patchHash: null, truncated: false };
  try {
    assertRetainedIdentity(record, safe);
    const fullDiff = completeUncommittedPatch(safe.worktree);
    const patchHash = patchDigest(fullDiff);
    return fullDiff.length > MAX_DIFF
      ? { diff: `${fullDiff.slice(0, MAX_DIFF)}\n… diff truncated`, fullDiff, patchHash, truncated: true }
      : { diff: fullDiff, fullDiff, patchHash, truncated: false };
  } catch { return { diff: null, fullDiff: null, patchHash: null, truncated: false }; }
}

function productChangeRecord(projectId, file, options = {}) {
  const queueDir = options.queueDir ?? DEFAULT_QUEUE_DIR;
  const record = listFrictionQueue({ queueDir }).reports.find((item) => item.file === file && item.projectId === projectId && item.kind === "feature");
  if (!record) throw new Error("Product change receipt not found in this project.");
  return { record, queueDir };
}

function resolveReview(projectId, file, options = {}) {
  const { record } = productChangeRecord(projectId, file, options);
  if (!record.reviewWorkspaceId || !record.reviewRevisionId) throw new Error("This product change has not been staged for founder review.");
  const project = loadProject({ ...options, projectId });
  if (project.sharedContext?.repository?.workspaceId !== record.reviewWorkspaceId) throw new Error("This review is not linked to the current project workspace.");
  const workspace = getWorkspace(record.reviewWorkspaceId, options);
  const revision = workspace.revisions.find((item) => item.id === record.reviewRevisionId);
  if (!revision || revision.sourceReceiptId !== file) throw new Error("The staged review does not match this product change receipt.");
  return { record, workspace, revision };
}

export function listProductChangeReceipts(projectId, options = {}) {
  const queueDir = options.queueDir ?? DEFAULT_QUEUE_DIR;
  return listFrictionQueue({ queueDir }).reports
    .filter((record) => record.kind === "feature" && record.projectId === projectId && VISIBLE.has(record.status))
    .map((record) => ({
      id: record.file,
      projectId,
      status: record.status,
      title: record.summary,
      provider: record.provider,
      model: record.model,
      branch: record.branch,
      worktree: record.worktree,
      baseCommit: record.baseCommit,
      reviewWorkspaceId: record.reviewWorkspaceId,
      reviewRevisionId: record.reviewRevisionId,
      capturedAt: record.capturedAt,
      safety: "Local isolated work only. Nothing is committed, merged, pushed, deployed, or released.",
      verification: "No verification was recorded. The restricted builder had no shell or test authority; verify the exact diff before approving it.",
      reviewRevision: (() => {
        if (!record.reviewWorkspaceId || !record.reviewRevisionId) return null;
        try {
          const revision = getWorkspace(record.reviewWorkspaceId, options).revisions.find((item) => item.id === record.reviewRevisionId);
          return revision?.sourceReceiptId === record.file ? revision : null;
        } catch { return null; }
      })(),
      ...(() => { const { fullDiff: _fullDiff, ...visible } = patchFor(record); return visible; })(),
    }))
    .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)));
}

export function discardProductChange(projectId, file, input = {}, options = {}) {
  if (input.confirm !== true) throw new Error("Discarding isolated work requires explicit confirmation.");
  const queueDir = options.queueDir ?? DEFAULT_QUEUE_DIR;
  const record = listFrictionQueue({ queueDir }).reports.find((item) => item.file === file && item.projectId === projectId && item.kind === "feature");
  if (!record) throw new Error("Product change receipt not found in this project.");
  if (record.status === "queued" || record.status === "building") throw new Error("A running product change cannot be discarded until it stops.");
  const safe = safeWorkspace(record);
  if (record.worktree && !safe) throw new Error("The recorded worktree is outside its product repository; refusing to touch it.");
  if (safe) assertRetainedIdentity(record, safe);
  if (safe) git(safe.repo, ["worktree", "remove", "--force", safe.worktree]);
  if (record.branch) {
    if (!record.branch.startsWith("dogfood/")) throw new Error("The recorded branch is outside the product-change namespace; refusing to touch it.");
    const repo = safe?.repo ?? safeRepository(record);
    if (!repo) throw new Error("The product repository cannot be verified; refusing to delete its branch.");
    try { git(repo, ["branch", "-D", record.branch]); } catch { /* already absent */ }
  }
  updateFrictionItem(receiptPath(queueDir, file), { fields: { status: "discarded", branch: "none", worktree: "none" } });
  return { id: file, projectId, status: "discarded", discardedAt: new Date().toISOString() };
}

export function reviewProductChange(projectId, file, input = {}, options = {}) {
  const { workspace, revision } = resolveReview(projectId, file, options);
  const reviewed = reviewRevision(revision, input.decision, input.note);
  const updated = updateRevision(workspace.id, revision.id, () => reviewed, options);
  addDecision(updated.id, {
    type: "product_change_review", revisionId: revision.id, sourceReceiptId: file,
    decision: input.decision, note: String(input.note || "").trim(),
    summary: `${input.decision === "approve" ? "Approved" : "Rejected"} isolated product change ${file}.`,
  }, options);
  return getWorkspace(workspace.id, options).revisions.find((item) => item.id === revision.id);
}

export function inspectProductChangeReadiness(projectId, file, options = {}) {
  const { workspace, revision } = resolveReview(projectId, file, options);
  return inspectApplyReadiness(workspace, revision);
}

export function applyProductChange(projectId, file, input = {}, options = {}) {
  if (input.confirm !== true) throw new Error("Applying isolated product work requires explicit confirmation.");
  const { workspace, revision } = resolveReview(projectId, file, options);
  // Persist intent before touching files. If the process dies after git apply but before the final write,
  // durable state says `applying` instead of falsely leaving an approved/no-op receipt.
  updateRevision(workspace.id, revision.id, (current) => ({ ...current, status: "applying", applyStartedAt: new Date().toISOString() }), options);
  try {
    const applied = applyRevision(workspace, revision, true);
    updateRevision(workspace.id, revision.id, () => applied, options);
    addDecision(workspace.id, {
      type: "product_change_apply", revisionId: revision.id, sourceReceiptId: file,
      decision: "apply", summary: `Applied isolated product change ${file} locally.`,
    }, options);
    return getWorkspace(workspace.id, options).revisions.find((item) => item.id === revision.id);
  } catch (error) {
    updateRevision(workspace.id, revision.id, (current) => ({
      ...current, status: "approved", applyError: error instanceof Error ? error.message : String(error),
    }), options);
    throw error;
  }
}

// Convert the exact retained local difference into the existing workspace revision review authority.
// This is staging only: status `proposed` is inert until the founder separately reviews it, and even an
// approved revision still needs the existing explicit-confirm apply route. No git mutation occurs here.
export function stageProductChangeProposal(projectId, file, options = {}) {
  const queueDir = options.queueDir ?? DEFAULT_QUEUE_DIR;
  const record = listFrictionQueue({ queueDir }).reports.find((item) => item.file === file && item.projectId === projectId && item.kind === "feature");
  if (!record || record.status !== "ready-for-review") throw new Error("This project change is not ready for founder review.");
  const safe = safeWorkspace(record);
  if (!safe) throw new Error("The retained worktree cannot be verified inside this product repository.");
  const project = loadProject({ ...options, projectId });
  const workspaceId = project.sharedContext?.repository?.workspaceId;
  if (!workspaceId) throw new Error("This project has no linked workspace for code review.");
  const workspace = getWorkspace(workspaceId, options);
  if (fs.realpathSync(workspace.repo) !== safe.repo) throw new Error("The retained change belongs to a different project workspace.");
  assertRetainedIdentity(record, safe);
  const { fullDiff: diff, patchHash } = patchFor(record);
  if (!diff || !patchHash) throw new Error("The exact full difference is not available for founder review.");
  const id = `local-change-${file.replace(/\.md$/, "")}-${patchHash.slice(0, 12)}`;
  const existing = workspace.revisions.find((revision) => revision.id === id);
  if (existing) return { workspaceId: workspace.id, revision: existing, deduped: true };
  const timestamp = new Date().toISOString();
  const revision = {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "proposed",
    reportScannedAt: workspace.report?.scannedAt ?? null,
    gapId: null,
    evidence: [],
    baseCommit: record.baseCommit,
    branch: record.branch,
    worktree: record.worktree,
    worktreeStatus: "ready-for-review",
    diffStat: git(safe.worktree, ["diff", "--stat", "--"]),
    diff,
    patchHash,
    summary: record.summary,
    error: null,
    sourceReceiptId: file,
    provider: record.provider,
    model: record.model,
    safety: "Proposed for founder review only. No files were applied and no commit, merge, push, or deploy occurred.",
  };
  addRevision(workspace.id, revision, options);
  updateFrictionItem(receiptPath(queueDir, file), { fields: { review_workspace: workspace.id, review_revision: id } });
  return { workspaceId: workspace.id, revision, deduped: false };
}
