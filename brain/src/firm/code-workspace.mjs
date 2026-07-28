// One durable coding workspace per implementation approach. A Thread owns continuity, Runs append
// execution attempts, and this record owns only isolated filesystem lineage, checkpoints, proof, and
// founder-held local consequences. Provider events remain runtime input translated into this record.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { completeUncommittedPatch, patchDigest } from "../git-patch.mjs";
import { captureCheckpoint, diffCheckpoints, restoreCheckpoint, snapshotTree } from "../native-code/t3-checkpoint-store.mjs";
import { emitFirmEvent } from "./firm-events.mjs";
import { syncProductPages } from "./first-run.mjs";
import { listVentures, getVentureDoc, listVentureDocs, now, setVentureDoc } from "./venture-store.mjs";
import { recordCodingProductConsequence } from "./semantic-model-store.mjs";
import { normalizeWorkflowOutcome } from "./workflow-outcome.mjs";
import { hostProjectCheck } from "./code-workspace-verification.mjs";
import { recordCodingSettlement } from "./work-journal-runtime.mjs";
import { prepareCodingWorkspaceFilesystem } from "./code-workspace-setup.mjs";
import {
  appendRunDirection,
  attributeCheckpoint,
  reconcileReviewComments,
} from "./git-review-state.mjs";
export const CODE_WORKSPACE_COLLECTION = "codeWorkspaces";
const ACTIVE = new Set(["preparing", "running", "interrupted", "reviewable", "needs-verification", "failed-verification"]);
function git(cwd, args, { input, allowDifference = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd, input, encoding: "utf8",
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    }).trim();
  } catch (error) {
    if (allowDifference && error?.status === 1) return String(error.stdout ?? "").trim();
    const detail = error?.stderr?.toString?.().trim();
    throw new Error(detail || `git ${args.join(" ")} failed.`);
  }
}
function realRepository(repository) {
  const repo = fs.realpathSync(path.resolve(String(repository ?? "")));
  if (git(repo, ["rev-parse", "--show-toplevel"]) !== repo) throw new Error("Native coding requires the venture repository root.");
  return repo;
}
function assertInsideWorkspaceRoot(repo, worktree) {
  const root = path.join(repo, ".drover-worktrees");
  const resolved = fs.realpathSync(worktree);
  const relative = path.relative(fs.realpathSync(root), resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("The coding workspace is outside this venture repository.");
  return resolved;
}
function checkpointRef(id, name) {
  return `refs/drover/checkpoints/${id}/${name}`;
}
function save(record, options = {}) {
  const updated = { ...record, updatedAt: now() };
  setVentureDoc(updated.ventureId, CODE_WORKSPACE_COLLECTION, updated.id, updated, options);
  emitFirmEvent(updated.ventureId, "timeline", { threadRef: updated.threadRef });
  return updated;
}

function newWorkspaceId(runId) {
  return `code-${String(runId).replace(/^drive-/, "").slice(0, 36)}`;
}

function reusableWorkspace(ventureId, { threadRef, betId, workRef, goal }, options) {
  if (!workRef && /\b(another|different|independent|separate) (?:implementation |coding )?(?:approach|attempt)|\bstart (?:over|fresh)\b|\bfrom scratch\b/i.test(String(goal ?? ""))) return null;
  const exactId = String(workRef ?? "").replace(/^work:/, "");
  const candidates = listVentureDocs(ventureId, CODE_WORKSPACE_COLLECTION, options)
    .filter((entry) => ACTIVE.has(entry.status))
    .filter((entry) => exactId ? entry.id === exactId : betId ? entry.betId === betId : entry.threadRef === threadRef)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return candidates[0] ?? null;
}

export function openCodingWorkspace({ ventureId, runId, threadRef, betId = null, participantRef, provider, repository, goal, originMessageRef = null, workRef = null }, options = {}) {
  const reusable = reusableWorkspace(ventureId, { threadRef, betId, workRef, goal }, options);
  if (reusable) {
    assertCodingWorkspaceIdentity(reusable);
    const resumed = appendRunDirection({
      ...reusable,
      status: "running",
      runRefs: [...new Set([...(reusable.runRefs ?? []), `run:${runId}`])],
      participantRefs: [...new Set([...(reusable.participantRefs ?? []), participantRef])],
      providerSessions: [...(reusable.providerSessions ?? []), { runRef: `run:${runId}`, provider, sessionId: null, startedAt: now(), completedAt: null }],
      currentActivity: "Resuming the isolated workspace",
      interruption: null,
      decisions: reusable.consequence ? [...(reusable.decisions ?? []), reusable.consequence] : reusable.decisions ?? [],
      consequence: null,
    }, { runRef: `run:${runId}`, originMessageRef, direction: goal, at: now() });
    return save(resumed, options);
  }

  const repo = realRepository(repository);
  const id = newWorkspaceId(runId);
  const root = path.join(repo, ".drover-worktrees");
  const worktree = path.join(root, id);
  const branch = `drover/${id}`;
  if (fs.existsSync(worktree)) throw new Error(`Coding workspace already exists: ${worktree}`);
  fs.mkdirSync(root, { recursive: true });

  // Snapshot the founder's exact starting tree (including uncommitted files) without touching their
  // index. This lets Croki dogfood safely while its own source checkout contains reviewable work.
  const sourceHead = git(repo, ["rev-parse", "HEAD"]);
  const sourcePatchHash = patchDigest(completeUncommittedPatch(repo));
  const sourceCheckpoint = captureCheckpoint({ worktree: repo, ref: checkpointRef(id, "source"), message: `Croki source baseline for ${id}` });
  git(repo, ["worktree", "add", "-b", branch, worktree, sourceCheckpoint.commit]);
  const guardHooks = prepareCodingWorkspaceFilesystem(repo, worktree, git);
  const baseline = captureCheckpoint({ worktree, ref: checkpointRef(id, "baseline"), message: `Croki coding baseline for ${id}` });
  const timestamp = now();
  const reviewAttributed = appendRunDirection({
    id, kind: "native-code", ventureId, threadRef, betId, goal,
    repository: repo, sourceHead, sourcePatchHash, branch, worktree, guardHooks,
    workspaceHead: git(worktree, ["rev-parse", "HEAD"]),
    runRefs: [`run:${runId}`], participantRefs: [participantRef],
    providerSessions: [{ runRef: `run:${runId}`, provider, sessionId: null, startedAt: timestamp, completedAt: null }],
    checkpoints: [{ id: "baseline", ...baseline }],
    commands: [], verification: [], changedFiles: [], diff: "", diffStat: "", patchHash: patchDigest(""),
    status: "running", currentActivity: "Working in an isolated repository workspace", interruption: null,
    consequence: null, decisions: [], productConsequence: null,
    hostVerification: options.nativeCodingHostVerification !== false,
    createdAt: timestamp, updatedAt: timestamp,
  }, { runRef: `run:${runId}`, originMessageRef, direction: goal, at: timestamp });
  const settled = save(reviewAttributed, options);
  return settled;
}

export function codingWorkspaceEnvironment(record, env = process.env) {
  if (!record?.guardHooks) return { ...env };
  return {
    ...env,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.hooksPath",
    GIT_CONFIG_VALUE_0: record.guardHooks,
  };
}

export function assertCodingWorkspaceIdentity(record) {
  const repo = realRepository(record.repository);
  const worktree = assertInsideWorkspaceRoot(repo, record.worktree);
  if (git(worktree, ["symbolic-ref", "--short", "HEAD"]) !== record.branch) throw new Error("The coding workspace branch no longer matches its durable lineage.");
  return { repo, worktree };
}

export function resumeCodingWorkspace(
  ventureId, id, { runRef, participantRef, provider } = {}, options = {},
) {
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  if (!record) throw new Error(`No such coding workspace: ${id}`);
  assertCodingWorkspaceIdentity(record);
  if (!(record.runRefs ?? []).includes(runRef) || !(record.participantRefs ?? []).includes(participantRef)) {
    throw new Error("The interrupted coding workspace no longer matches its Run and participant.");
  }
  const session = (record.providerSessions ?? []).find((entry) => entry.runRef === runRef && entry.provider === provider);
  if (!session?.sessionId) throw new Error("The interrupted coding workspace has no exact native provider session.");
  if (!["running", "interrupted", "preparing"].includes(record.status)) {
    throw new Error(`Coding workspace ${id} is already settled as ${record.status}.`);
  }
  return save({
    ...record,
    status: "running",
    currentActivity: "Resuming the exact interrupted provider session",
    interruption: null,
  }, options);
}

export function updateCodingSession(ventureId, id, { runRef, sessionId = null, activity = null, command = null }, options = {}) {
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  if (!record) throw new Error(`No such coding workspace: ${id}`);
  let sessions = record.providerSessions ?? [];
  if (sessionId) sessions = sessions.map((entry) => entry.runRef === runRef ? { ...entry, sessionId } : entry);
  // One isolated workspace may carry several sequential Runs in the same durable Thread. Stamp every
  // provider receipt with the Run that produced it so a later turn never reattributes earlier commands
  // while projecting its own settlement into the append-only Work journal.
  const attributedCommand = command ? { kind: "provider-command", ...command, runRef } : null;
  const commands = attributedCommand ? [...(record.commands ?? []), attributedCommand] : record.commands ?? [];
  const verification = command?.verification === true ? [...(record.verification ?? []), attributedCommand] : record.verification ?? [];
  return save({ ...record, providerSessions: sessions, commands, verification, ...(activity ? { currentActivity: activity } : {}) }, options);
}

function changedFiles(worktree, fromRef, toRef) {
  const output = git(worktree, ["diff", "--name-status", fromRef, toRef, "--"]);
  return output ? output.split("\n").map((line) => {
    const [status, ...parts] = line.split("\t");
    return { status, path: parts.at(-1) };
  }) : [];
}

function verificationReadiness(record) {
  const latestRunRef = record.checkpoints?.at(-1)?.runRef ?? record.runRefs?.at(-1) ?? null;
  const verification = record.verification ?? [];
  const attributed = latestRunRef
    ? verification.filter((entry) => entry.runRef === latestRunRef)
    : verification;
  // Older records predate Run attribution. Preserve their proof until the next settlement writes
  // exact Run refs, but never let a prior attributed Run verify a newer checkpoint.
  const candidates = attributed.length || !latestRunRef
    ? attributed
    : verification.filter((entry) => !entry.runRef);
  const latestByCommand = new Map();
  for (const entry of candidates) {
    if (!entry.completedAt) continue;
    latestByCommand.set(`${entry.kind}:${entry.command}`, entry);
  }
  const latest = [...latestByCommand.values()];
  const host = latest.filter((entry) => entry.kind === "host-project" || entry.kind === "host");
  const provider = latest.filter((entry) => entry.kind === "provider-command");
  const project = host.filter((entry) => entry.kind === "host-project");
  const authoritative = project.length ? project : provider;
  const failed = latest.some((entry) => entry.status === "failed");
  return {
    ready: authoritative.some((entry) => entry.status === "passed") && !failed,
    completed: latest,
    failed,
  };
}

export async function settleCodingWorkspace(ventureId, id, { runRef, outcome, error = null }, options = {}) {
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  if (!record) throw new Error(`No such coding workspace: ${id}`);
  const { worktree } = assertCodingWorkspaceIdentity(record);
  const baseline = record.checkpoints.find((entry) => entry.id === "baseline");
  const expectedHead = record.workspaceHead ?? git(worktree, ["rev-parse", `${baseline.ref}^`]);
  const actualHead = git(worktree, ["rev-parse", "HEAD"]);
  if (actualHead !== expectedHead) {
    throw new Error("The provider changed repository history; Croki retained the workspace but will not treat it as reviewable.");
  }
  const sequence = (record.checkpoints ?? []).filter((entry) => entry.id.startsWith("turn-")).length + 1;
  const checkpoint = captureCheckpoint({ worktree, ref: checkpointRef(id, `turn-${sequence}`), message: `Croki run ${runRef} checkpoint` });
  const diff = diffCheckpoints({ worktree, fromRef: baseline.ref, toRef: checkpoint.ref });
  const checkStartedAt = now();
  let diffCheck = { command: "git diff --check", kind: "host", status: "passed", exitCode: 0, startedAt: checkStartedAt, completedAt: now(), output: "No whitespace errors.", runRef };
  try { git(worktree, ["diff", "--check", baseline.ref, checkpoint.ref, "--"]); }
  catch (checkError) { diffCheck = { ...diffCheck, status: "failed", exitCode: 1, output: checkError.message, completedAt: now() }; }
  if (record.hostVerification !== false && !error && outcome?.kind === "completed") {
    save({ ...record, currentActivity: "Running project verification" }, options);
  }
  const projectCheck = record.hostVerification !== false && !error && outcome?.kind === "completed"
    ? await hostProjectCheck(worktree, options.hostProjectCheckDeps)
    : null;
  const verification = [...(record.verification ?? []), diffCheck, ...(projectCheck ? [{ ...projectCheck, runRef }] : [])];
  const proof = verificationReadiness({
    ...record,
    verification,
    checkpoints: [...(record.checkpoints ?? []), { runRef }],
  });
  const patchHash = patchDigest(diff);
  const runTerminal = normalizeWorkflowOutcome(error ? { kind: "failed", reason: error } : (outcome ?? { kind: "completed" })).kind;
  const terminal = error || runTerminal === "failed" ? "interrupted"
    : runTerminal === "cancelled" ? "cancelled"
      : !diff ? "no-change"
        : proof.failed ? "failed-verification"
          : proof.ready ? "reviewable" : "needs-verification";
  const completedAt = now();
  const sessions = (record.providerSessions ?? []).map((entry) => entry.runRef === runRef ? { ...entry, completedAt, terminal: runTerminal } : entry);
  const attributedCheckpoint = attributeCheckpoint(record, { id: `turn-${sequence}`, ...checkpoint }, runRef);
  const reviewComments = reconcileReviewComments(record, {
    runRef,
    checkpointId: attributedCheckpoint.id,
    diff,
    at: completedAt,
  });
  const exactChangedFiles = changedFiles(worktree, baseline.ref, checkpoint.ref);
  const changeSummary = diff ? {
    requestedOutcome: record.goal,
    changedFiles: exactChangedFiles,
    verification: proof.completed.map(({ command, kind, status, exitCode = null, runRef: attributedRunRef = null }) => ({
      command, kind, status, exitCode, runRef: attributedRunRef,
    })),
  } : null;
  const settled = save({
    ...record, status: terminal, currentActivity: null, providerSessions: sessions,
    checkpoints: [...(record.checkpoints ?? []), attributedCheckpoint],
    diff, diffStat: git(worktree, ["diff", "--stat", baseline.ref, checkpoint.ref, "--"]),
    changedFiles: exactChangedFiles, patchHash, verification, reviewComments, changeSummary,
    interruption: error ? { message: String(error), at: completedAt, recovery: "Resume this thread to continue in the retained workspace, or inspect and discard it." } : null,
    // A repository diff proves only repository state. Product or market meaning must arrive as an
    // explicit, source-bearing interpretation; routine coding never manufactures one.
    productConsequence: record.productConsequence ?? null,
  }, options);
  recordCodingSettlement(ventureId, settled, runRef, options);
  return settled;
}

function sourceState(record) {
  const head = git(record.repository, ["rev-parse", "HEAD"]);
  const patchHash = patchDigest(completeUncommittedPatch(record.repository));
  return { head, patchHash, unchanged: head === record.sourceHead && patchHash === record.sourcePatchHash };
}

function assertExactReviewable(record) {
  const { worktree } = assertCodingWorkspaceIdentity(record);
  const baseline = record.checkpoints.find((entry) => entry.id === "baseline");
  const latest = record.checkpoints.at(-1);
  if (!baseline || !latest || latest.id === "baseline") throw new Error("This coding workspace has no completed checkpoint to review.");
  const diff = diffCheckpoints({ worktree, fromRef: baseline.ref, toRef: latest.ref });
  if (!diff || patchDigest(diff) !== record.patchHash) throw new Error("The coding workspace moved after its exact checkpoint; resume it to capture a new revision.");
  const currentHead = git(worktree, ["rev-parse", "HEAD"]);
  if (record.consequence?.commit) {
    if (currentHead !== record.consequence.commit || patchDigest(git(worktree, ["diff", "--patch", "--binary", "--no-color", "--no-ext-diff", baseline.ref, currentHead, "--"])) !== record.patchHash) {
      throw new Error("The committed branch moved after founder review; Croki will not act on ambiguous history.");
    }
  } else {
    const expectedHead = record.workspaceHead ?? git(worktree, ["rev-parse", `${baseline.ref}^`]);
    const checkpointTree = latest.tree ?? git(worktree, ["rev-parse", `${latest.ref}^{tree}`]);
    if (currentHead !== expectedHead || snapshotTree(worktree) !== checkpointTree) {
      throw new Error("The coding workspace moved after its exact checkpoint; resume it to capture a new revision.");
    }
  }
  return { worktree, diff };
}

function assertVerified(record) {
  const proof = verificationReadiness(record);
  if (!proof.ready) throw new Error(proof.failed
    ? "A recorded verification failed; rerun the implementation and checks before this consequence."
    : "No successful project verification is attributed to this exact checkpoint.");
  return proof;
}

export function inspectCodingReadiness(ventureId, id, options = {}) {
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  if (!record) throw new Error(`No such coding workspace: ${id}`);
  let exact = true; let exactReason = null;
  try { assertExactReviewable(record); } catch (error) { exact = false; exactReason = error.message; }
  const source = sourceState(record);
  const approved = record.consequence?.review === "approved";
  const verified = verificationReadiness(record).ready;
  return { ready: approved && verified && exact && source.unchanged, approved, verified, exact, source, reasons: [!approved ? "The founder has not approved this exact checkpoint." : null, !verified ? "The exact checkpoint does not have successful, failure-free project verification." : null, !exact ? exactReason : null, !source.unchanged ? "The source workspace moved since this attempt began." : null].filter(Boolean) };
}

export function reviewCodingWorkspace(ventureId, id, decision, note, options = {}) {
  if (!["approve", "reject"].includes(decision)) throw new Error("Coding review must approve or reject the exact checkpoint.");
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  assertExactReviewable(record);
  return save({ ...record, consequence: { ...(record.consequence ?? {}), review: decision === "approve" ? "approved" : "rejected", note: String(note ?? "").trim(), reviewedAt: now() } }, options);
}

export function reviewCodingProductConsequence(ventureId, id, input = {}, actor, options = {}) {
  if (actor?.authority !== "founder") throw new Error("Adopting or rejecting a Product consequence is founder-only.");
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  if (!record?.productConsequence) throw new Error("This coding workspace has no Product consequence to review.");
  const decision = String(input.decision ?? "").trim();
  if (!["revise", "adopt", "reject"].includes(decision)) throw new Error("Product consequence review must revise, adopt, or reject the interpretation.");
  if (record.productConsequence.review?.decision === "adopted" && decision !== "adopt") {
    throw new Error("This Product consequence is already canonical. Update it here or change it directly in Product / GTM.");
  }
  const capability = String(input.capability ?? record.productConsequence.capability ?? "").trim();
  const releaseQuestion = String(input.releaseQuestion ?? record.productConsequence.releaseQuestion ?? "").trim();
  if (!capability) throw new Error("A Product consequence needs a concrete capability statement.");
  if (!releaseQuestion) throw new Error("A Product consequence needs a distribution question.");
  if (decision === "adopt") {
    assertExactReviewable(record);
    assertVerified(record);
  }
  const reviewed = save({
    ...record,
    productConsequence: {
      ...record.productConsequence,
      capability,
      releaseQuestion,
      review: {
        decision: decision === "adopt" ? "adopted" : decision === "reject" ? "rejected" : "provisional",
        reviewedAt: now(),
      },
    },
  }, options);
  if (decision === "adopt") recordCodingProductConsequence(ventureId, reviewed, { actor }, options);
  return reviewed;
}

export function applyCodingWorkspace(ventureId, id, options = {}) {
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  const readiness = inspectCodingReadiness(ventureId, id, options);
  if (!readiness.ready) throw new Error(readiness.reasons.join(" "));
  const { diff } = assertExactReviewable(record);
  const patch = diff.endsWith("\n") ? diff : `${diff}\n`;
  git(record.repository, ["apply", "--check", "--whitespace=nowarn", "-"], { input: patch });
  git(record.repository, ["apply", "--whitespace=nowarn", "-"], { input: patch });
  const appliedSource = sourceState(record);
  const applied = save({ ...record, status: "applied", consequence: { ...record.consequence, action: "applied", actedAt: now(), reversible: true, appliedSourceHead: appliedSource.head, appliedSourcePatchHash: appliedSource.patchHash } }, options);
  // The applied source is now what the code proves, so the page map re-derives without founder upkeep
  // (FIRM-SPEC). The apply is source truth: a map re-sync failure is logged, never a rollback or error.
  try { (options.productPageSync ?? syncProductPages)({ ventureId, repository: applied.repository }, options); }
  catch (error) { console.warn(`[firm/code-workspace] product page re-map skipped: ${error?.message ?? error}`); }
  return applied;
}

export function revertCodingWorkspaceApply(ventureId, id, options = {}) {
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  if (record?.consequence?.action !== "applied") throw new Error("Only an applied coding checkpoint can be reverted.");
  const current = sourceState(record);
  if (current.head !== record.consequence.appliedSourceHead || current.patchHash !== record.consequence.appliedSourcePatchHash) {
    throw new Error("The source workspace moved after apply; Croki will not reverse an ambiguous working tree.");
  }
  const { diff } = assertExactReviewable(record);
  const patch = diff.endsWith("\n") ? diff : `${diff}\n`;
  git(record.repository, ["apply", "--reverse", "--check", "--whitespace=nowarn", "-"], { input: patch });
  git(record.repository, ["apply", "--reverse", "--whitespace=nowarn", "-"], { input: patch });
  const restored = sourceState(record);
  if (!restored.unchanged) throw new Error("The reverse apply completed, but the source workspace no longer matches its exact starting state.");
  return save({ ...record, status: "reviewable", consequence: { ...record.consequence, action: "reverted", revertedAt: now(), reversible: false } }, options);
}

export function commitCodingWorkspace(ventureId, id, message, options = {}) {
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  if (record.consequence?.review !== "approved") throw new Error("Commit requires founder approval of the exact checkpoint first.");
  assertVerified(record);
  const { worktree } = assertExactReviewable(record);
  const subject = String(message ?? "").trim();
  if (!subject) throw new Error("Committing needs an explicit commit message.");
  git(worktree, ["add", "-A", "--", "."]);
  git(worktree, ["-c", "core.hooksPath=/dev/null", "commit", "-m", subject]);
  const commit = git(worktree, ["rev-parse", "HEAD"]);
  return save({ ...record, status: "committed", consequence: { ...record.consequence, action: "committed", commit, commitMessage: subject, actedAt: now(), reversible: true } }, options);
}

export function prepareCodingPullRequest(ventureId, id, options = {}) {
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  if (record.consequence?.review !== "approved") throw new Error("Preparing a pull request requires founder approval of the exact checkpoint first.");
  assertVerified(record);
  assertExactReviewable(record);
  const preparation = {
    branch: record.branch, baseCommit: record.sourceHead,
    pushCommand: `git push -u origin ${record.branch}`,
    pullRequestCommand: `gh pr create --draft --head ${record.branch}`,
    note: "Prepared only. Nothing was pushed and no pull request was created.",
    preparedAt: now(),
  };
  return save({ ...record, consequence: { ...record.consequence, action: "pull-request-prepared", preparation, actedAt: preparation.preparedAt, reversible: true } }, options);
}

export function discardCodingWorkspace(ventureId, id, options = {}) {
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  if (!record) throw new Error(`No such coding workspace: ${id}`);
  const { repo, worktree } = assertCodingWorkspaceIdentity(record);
  if (!record.branch.startsWith("drover/code-")) throw new Error("Refusing to discard a branch outside Croki's coding namespace.");
  git(repo, ["worktree", "remove", "--force", worktree]);
  try { git(repo, ["branch", "-D", record.branch]); } catch { /* already absent */ }
  for (const checkpoint of record.checkpoints ?? []) {
    if (checkpoint.ref?.startsWith(`refs/drover/checkpoints/${record.id}/`)) {
      try { git(repo, ["update-ref", "-d", checkpoint.ref]); } catch { /* ref may already be absent */ }
    }
  }
  try { git(repo, ["update-ref", "-d", checkpointRef(record.id, "source")]); } catch { /* ref may already be absent */ }
  const prior = record.consequence?.action ? record.consequence : null;
  return save({
    ...record,
    status: "discarded",
    worktree: null,
    decisions: prior ? [...(record.decisions ?? []), prior] : record.decisions ?? [],
    consequence: {
      review: record.consequence?.review ?? null,
      note: record.consequence?.note ?? "",
      reviewedAt: record.consequence?.reviewedAt ?? null,
      action: "discarded",
      actedAt: now(),
      reversible: false,
    },
  }, options);
}

// Isolated worktrees used to accumulate forever: one directory and one branch per coding session, never
// reclaimed, until a repeated workspace name failed a later run outright. Reclamation is deliberately
// narrow — only a COMMITTED workspace, whose work is already durable on its own drover/code-* branch, and
// only when its tree is clean. The branch is kept, so nothing becomes unrecoverable. Reviewable, applied,
// and interrupted workspaces still hold the only copy of founder work and are never touched here; ending
// those stays the founder's call through discard.
export function reclaimCommittedCodingWorktrees(options = {}) {
  const reclaimed = [];
  for (const venture of listVentures(options)) {
    for (const record of listVentureDocs(venture.id, CODE_WORKSPACE_COLLECTION, options)) {
      if (record.status !== "committed" || !record.worktree) continue;
      try {
        const { repo, worktree } = assertCodingWorkspaceIdentity(record);
        if (git(worktree, ["status", "--porcelain"]).trim()) continue; // uncommitted work: leave it alone
        git(repo, ["worktree", "remove", "--force", worktree]);
        reclaimed.push(save({ ...record, worktree: null }, options));
      } catch (error) {
        console.warn(`[firm/code-workspace] worktree reclaim skipped for ${record.id}: ${error?.message ?? error}`);
      }
    }
  }
  return reclaimed;
}

export async function recoverInterruptedCodingWorkspaces(options = {}) {
  const recovered = [];
  for (const venture of listVentures(options)) {
    for (const record of listVentureDocs(venture.id, CODE_WORKSPACE_COLLECTION, options).filter((entry) => ["preparing", "running"].includes(entry.status))) {
      try {
        const updated = await settleCodingWorkspace(venture.id, record.id, { runRef: record.runRefs.at(-1), outcome: { kind: "failed" }, error: "Croki restarted before the provider turn settled." }, options);
        recovered.push(updated);
      } catch (error) {
        recovered.push(save({ ...record, status: "interrupted", currentActivity: null, interruption: { message: error.message, at: now(), recovery: "Workspace lineage could not be verified; Croki will not resume or modify it automatically." } }, options));
      }
    }
  }
  return recovered;
}
