// One durable coding workspace per implementation approach. A Thread owns continuity, Runs append
// execution attempts, and this record owns only isolated filesystem lineage, checkpoints, proof, and
// founder-held local consequences. Provider events remain runtime input translated into this record.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { completeUncommittedPatch, patchDigest } from "../git-patch.mjs";
import { captureCheckpoint, diffCheckpoints, restoreCheckpoint, snapshotTree } from "../native-code/t3-checkpoint-store.mjs";
import { emitFirmEvent } from "./firm-events.mjs";
import { listVentures, getVentureDoc, listVentureDocs, now, setVentureDoc } from "./venture-store.mjs";
import { recordCodingProductConsequence } from "./semantic-model-store.mjs";

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

function linkDependencyTree(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const localCaches = new Set([".cache", ".tmp", ".vite"]);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const target = path.join(destination, entry.name);
    if (localCaches.has(entry.name)) {
      fs.mkdirSync(target, { recursive: true });
    } else if (entry.name.startsWith("@") && entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      for (const scoped of fs.readdirSync(path.join(source, entry.name))) {
        fs.symlinkSync(path.join(source, entry.name, scoped), path.join(target, scoped), "junction");
      }
    } else {
      fs.symlinkSync(path.join(source, entry.name), target, "junction");
    }
  }
}

function linkDependencies(repo, worktree) {
  for (const relative of ["node_modules", "brain/node_modules", "ui/node_modules", "design-system/node_modules"]) {
    const source = path.join(repo, relative);
    const destination = path.join(worktree, relative);
    if (!fs.existsSync(source) || fs.existsSync(destination)) continue;
    linkDependencyTree(source, destination);
  }
}

function installConsequenceGuards(worktree) {
  const gitDir = path.resolve(worktree, git(worktree, ["rev-parse", "--git-dir"]));
  const hooks = path.join(gitDir, "drover-founder-guards");
  fs.mkdirSync(hooks, { recursive: true });
  const protectedRoot = worktree.replaceAll("'", "'\"'\"'");
  const script = `#!/bin/sh
protected_root='${protectedRoot}'
current_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ "$current_root" = "$protected_root" ]; then
  echo 'Drover: commit, merge, and push remain founder-held consequences.' >&2
  exit 1
fi
exit 0
`;
  for (const name of ["pre-commit", "pre-merge-commit", "pre-push", "pre-rebase"]) {
    const target = path.join(hooks, name);
    fs.writeFileSync(target, script, { mode: 0o755 });
  }
  return hooks;
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

export function openCodingWorkspace({ ventureId, runId, threadRef, betId = null, participantRef, provider, repository, goal, workRef = null }, options = {}) {
  const reusable = reusableWorkspace(ventureId, { threadRef, betId, workRef, goal }, options);
  if (reusable) {
    assertCodingWorkspaceIdentity(reusable);
    return save({
      ...reusable,
      status: "running",
      runRefs: [...new Set([...(reusable.runRefs ?? []), `run:${runId}`])],
      participantRefs: [...new Set([...(reusable.participantRefs ?? []), participantRef])],
      providerSessions: [...(reusable.providerSessions ?? []), { runRef: `run:${runId}`, provider, sessionId: null, startedAt: now(), completedAt: null }],
      currentActivity: "Resuming the isolated workspace",
      interruption: null,
      decisions: reusable.consequence ? [...(reusable.decisions ?? []), reusable.consequence] : reusable.decisions ?? [],
      consequence: null,
    }, options);
  }

  const repo = realRepository(repository);
  const id = newWorkspaceId(runId);
  const root = path.join(repo, ".drover-worktrees");
  const worktree = path.join(root, id);
  const branch = `drover/${id}`;
  if (fs.existsSync(worktree)) throw new Error(`Coding workspace already exists: ${worktree}`);
  fs.mkdirSync(root, { recursive: true });

  // Snapshot the founder's exact starting tree (including uncommitted files) without touching their
  // index. This lets Drover dogfood safely while its own source checkout contains reviewable work.
  const sourceHead = git(repo, ["rev-parse", "HEAD"]);
  const sourcePatchHash = patchDigest(completeUncommittedPatch(repo));
  const sourceCheckpoint = captureCheckpoint({ worktree: repo, ref: checkpointRef(id, "source"), message: `Drover source baseline for ${id}` });
  git(repo, ["worktree", "add", "-b", branch, worktree, sourceCheckpoint.commit]);
  linkDependencies(repo, worktree);
  const guardHooks = installConsequenceGuards(worktree);
  const baseline = captureCheckpoint({ worktree, ref: checkpointRef(id, "baseline"), message: `Drover coding baseline for ${id}` });
  const timestamp = now();
  const settled = save({
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
  }, options);
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

export function updateCodingSession(ventureId, id, { runRef, sessionId = null, activity = null, command = null }, options = {}) {
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  if (!record) throw new Error(`No such coding workspace: ${id}`);
  let sessions = record.providerSessions ?? [];
  if (sessionId) sessions = sessions.map((entry) => entry.runRef === runRef ? { ...entry, sessionId } : entry);
  const commands = command ? [...(record.commands ?? []), { kind: "provider-command", ...command }] : record.commands ?? [];
  const verification = command?.verification === true ? [...(record.verification ?? []), { kind: "provider-command", ...command }] : record.verification ?? [];
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
  const latestByCommand = new Map();
  for (const entry of record.verification ?? []) {
    if (!entry.completedAt) continue;
    latestByCommand.set(`${entry.kind}:${entry.command}`, entry);
  }
  const latest = [...latestByCommand.values()];
  const host = latest.filter((entry) => entry.kind === "host-project" || entry.kind === "host");
  const provider = latest.filter((entry) => entry.kind === "provider-command");
  const authoritative = host.some((entry) => entry.kind === "host-project") ? host : provider;
  const failed = authoritative.some((entry) => entry.status === "failed");
  return {
    ready: authoritative.some((entry) => entry.status === "passed") && !failed,
    completed: authoritative,
    failed,
  };
}

function hostProjectCheck(worktree) {
  const packagePath = path.join(worktree, "package.json");
  if (!fs.existsSync(packagePath)) return null;
  const manifest = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (!manifest?.scripts?.test) return null;
  const startedAt = now();
  const env = { ...process.env };
  for (const key of Object.keys(env).filter((entry) => entry.startsWith("GIT_CONFIG_"))) delete env[key];
  const result = spawnSync("npm", ["test"], { cwd: worktree, env, encoding: "utf8", timeout: 15 * 60_000, maxBuffer: 16 * 1024 * 1024 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return {
    command: "npm test", kind: "host-project", status: result.status === 0 ? "passed" : "failed",
    exitCode: Number.isInteger(result.status) ? result.status : 1, startedAt, completedAt: now(),
    output: (result.error?.message ? `${output}\n${result.error.message}` : output).slice(-16_000),
  };
}

export function settleCodingWorkspace(ventureId, id, { runRef, outcome, error = null }, options = {}) {
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  if (!record) throw new Error(`No such coding workspace: ${id}`);
  const { worktree } = assertCodingWorkspaceIdentity(record);
  const baseline = record.checkpoints.find((entry) => entry.id === "baseline");
  const expectedHead = record.workspaceHead ?? git(worktree, ["rev-parse", `${baseline.ref}^`]);
  const actualHead = git(worktree, ["rev-parse", "HEAD"]);
  if (actualHead !== expectedHead) {
    throw new Error("The provider changed repository history; Drover retained the workspace but will not treat it as reviewable.");
  }
  const sequence = (record.checkpoints ?? []).filter((entry) => entry.id.startsWith("turn-")).length + 1;
  const checkpoint = captureCheckpoint({ worktree, ref: checkpointRef(id, `turn-${sequence}`), message: `Drover run ${runRef} checkpoint` });
  const diff = diffCheckpoints({ worktree, fromRef: baseline.ref, toRef: checkpoint.ref });
  const checkStartedAt = now();
  let diffCheck = { command: "git diff --check", kind: "host", status: "passed", exitCode: 0, startedAt: checkStartedAt, completedAt: now(), output: "No whitespace errors." };
  try { git(worktree, ["diff", "--check", baseline.ref, checkpoint.ref, "--"]); }
  catch (checkError) { diffCheck = { ...diffCheck, status: "failed", exitCode: 1, output: checkError.message, completedAt: now() }; }
  const projectCheck = record.hostVerification !== false && !error && outcome?.kind === "completed" ? hostProjectCheck(worktree) : null;
  const verification = [...(record.verification ?? []), diffCheck, ...(projectCheck ? [projectCheck] : [])];
  const proof = verificationReadiness({ verification });
  const patchHash = patchDigest(diff);
  const terminal = error || outcome?.kind === "failed" ? "interrupted"
    : outcome?.kind === "cancelled" ? "stopped"
      : !diff ? "no-change"
        : proof.failed ? "failed-verification"
          : proof.ready ? "reviewable" : "needs-verification";
  const completedAt = now();
  const sessions = (record.providerSessions ?? []).map((entry) => entry.runRef === runRef ? { ...entry, completedAt, terminal: error ? "interrupted" : outcome?.kind ?? "completed" } : entry);
  const settled = save({
    ...record, status: terminal, currentActivity: null, providerSessions: sessions,
    checkpoints: [...(record.checkpoints ?? []), { id: `turn-${sequence}`, runRef, ...checkpoint }],
    diff, diffStat: git(worktree, ["diff", "--stat", baseline.ref, checkpoint.ref, "--"]),
    changedFiles: changedFiles(worktree, baseline.ref, checkpoint.ref), patchHash, verification,
    interruption: error ? { message: String(error), at: completedAt, recovery: "Resume this thread to continue in the retained workspace, or inspect and discard it." } : null,
    productConsequence: diff ? {
      capability: record.goal,
      system: changedFiles(worktree, baseline.ref, checkpoint.ref).map((entry) => entry.path),
      claims: [
        terminal === "reviewable"
          ? { status: "supported-by-implementation", statement: "The isolated repository state and recorded checks support that the requested capability was implemented." }
          : { status: "unsupported", statement: "The changed repository state has not met the selected implementation proof." },
        { status: "unsupported", statement: "Customer impact and distribution effectiveness remain unsupported until a release returns attributable evidence." },
        { status: "stale-not-identified", statement: "No existing Product claim was marked stale automatically; founder review or returned evidence must make that judgment." },
      ],
      releaseQuestion: `Which release should carry “${record.goal}”, and how will returned evidence change the Product or its distribution?`,
    } : null,
  }, options);
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
      throw new Error("The committed branch moved after founder review; Drover will not act on ambiguous history.");
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
  return save({ ...record, status: "applied", consequence: { ...record.consequence, action: "applied", actedAt: now(), reversible: true, appliedSourceHead: appliedSource.head, appliedSourcePatchHash: appliedSource.patchHash } }, options);
}

export function revertCodingWorkspaceApply(ventureId, id, options = {}) {
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  if (record?.consequence?.action !== "applied") throw new Error("Only an applied coding checkpoint can be reverted.");
  const current = sourceState(record);
  if (current.head !== record.consequence.appliedSourceHead || current.patchHash !== record.consequence.appliedSourcePatchHash) {
    throw new Error("The source workspace moved after apply; Drover will not reverse an ambiguous working tree.");
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
  git(worktree, ["commit", "-m", subject]);
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

export function restoreCodingWorkspaceCheckpoint(ventureId, id, checkpointId, options = {}) {
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  const checkpoint = record?.checkpoints?.find((entry) => entry.id === checkpointId);
  if (!checkpoint) throw new Error(`No such checkpoint on this coding workspace: ${checkpointId}`);
  const { worktree } = assertCodingWorkspaceIdentity(record);
  restoreCheckpoint({ worktree, ref: checkpoint.ref });
  const baseline = record.checkpoints.find((entry) => entry.id === "baseline");
  const diff = diffCheckpoints({ worktree, fromRef: baseline.ref, toRef: checkpoint.ref });
  const restoredAt = now();
  const restorationId = `restore-${(record.checkpoints ?? []).filter((entry) => entry.id.startsWith("restore-")).length + 1}`;
  return save({
    ...record,
    status: diff ? "needs-verification" : "no-change",
    checkpoints: [...record.checkpoints, { ...checkpoint, id: restorationId, restoredFrom: checkpointId, capturedAt: restoredAt }],
    changedFiles: changedFiles(worktree, baseline.ref, checkpoint.ref),
    diff,
    diffStat: git(worktree, ["diff", "--stat", baseline.ref, checkpoint.ref, "--"]),
    patchHash: patchDigest(diff),
    verification: [],
    decisions: record.consequence ? [...(record.decisions ?? []), record.consequence] : record.decisions ?? [],
    consequence: null,
    interruption: null,
    restoration: { checkpointId, restoredAt, note: "The exact repository snapshot was restored. Verification and founder review are required again." },
  }, options);
}

export function discardCodingWorkspace(ventureId, id, options = {}) {
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  if (!record) throw new Error(`No such coding workspace: ${id}`);
  const { repo, worktree } = assertCodingWorkspaceIdentity(record);
  if (!record.branch.startsWith("drover/code-")) throw new Error("Refusing to discard a branch outside Drover's coding namespace.");
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

export function recoverInterruptedCodingWorkspaces(options = {}) {
  const recovered = [];
  for (const venture of listVentures(options)) {
    for (const record of listVentureDocs(venture.id, CODE_WORKSPACE_COLLECTION, options).filter((entry) => ["preparing", "running"].includes(entry.status))) {
      try {
        const updated = settleCodingWorkspace(venture.id, record.id, { runRef: record.runRefs.at(-1), outcome: { kind: "failed" }, error: "Drover restarted before the provider turn settled." }, options);
        recovered.push(updated);
      } catch (error) {
        recovered.push(save({ ...record, status: "interrupted", currentActivity: null, interruption: { message: error.message, at: now(), recovery: "Workspace lineage could not be verified; Drover will not resume or modify it automatically." } }, options));
      }
    }
  }
  return recovered;
}
