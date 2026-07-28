// git-ship.mjs — repository drift facts and the single founder-gated ship action for a reviewed
// coding workspace: create feature branch -> commit the exact reviewed patch -> push -> open a
// GitHub pull request via the gh CLI, as one stacked action with phased, durable progress.
//
// Authority physics: agents may PREPARE ship content (git-ship-prompts.mjs, prepareShipDrafts) but
// execution is founder-only, enforced here by actor authority and at the route by the founder write
// gate. The commit is built with a temporary index (the same licensed technique as
// native-code/t3-checkpoint-store.mjs), so the founder's working tree and checkout never move.
// GitHub is the only PR provider; when gh is absent or unauthenticated the PR phase degrades
// honestly instead of pretending.
//
// Portions Copyright (c) 2026 T3 Tools Inc. Licensed under MIT (github.com/pingdotgg/t3code).
// Drift derivation adapted from apps/server/src/vcs/GitVcsDriverCore.ts
// (computeAheadCountAgainstBase, statusDetailsRemote); the stacked action shape from
// apps/server/src/git/GitManager.ts (runStackedAction), with Effect idioms removed.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { emitFirmEvent } from "./firm-events.mjs";
import { getVentureDoc, listVentureDocs, now, setVentureDoc } from "./venture-store.mjs";
import { CODE_WORKSPACE_COLLECTION, inspectCodingReadiness } from "./code-workspace.mjs";
import {
  draftShipContent,
  mergeShipDrafts,
} from "./git-ship-prompts.mjs";
import { readGitHubPullRequest, repositoryReviewState } from "./git-review-state.mjs";

function git(cwd, args, { input, env } = {}) {
  try {
    return execFileSync("git", args, {
      cwd, input, env, encoding: "utf8",
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    }).trim();
  } catch (error) {
    const detail = error?.stderr?.toString?.().trim();
    throw new Error(detail || `git ${args.join(" ")} failed.`);
  }
}

function tryGit(cwd, args) {
  try { return git(cwd, args); } catch { return null; }
}

function count(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function listLocalBranchNames(cwd) {
  const output = tryGit(cwd, ["for-each-ref", "refs/heads", "--format=%(refname:short)"]);
  return output ? output.split("\n").filter(Boolean) : [];
}

function listKnownBranchNames(cwd) {
  const output = tryGit(cwd, ["for-each-ref", "refs/heads", "refs/remotes/origin", "--format=%(refname:short)"]);
  return [...new Set(String(output ?? "").split("\n")
    .map((name) => name.replace(/^origin\//, "")).filter((name) => name && name !== "HEAD"))];
}

// The base the repository ships against: the origin default branch when one is known, otherwise the
// conventional candidates. Ported from T3's resolveBaseBranchForNoUpstream candidate walk.
export function resolveDefaultBranchRef(cwd) {
  const originHead = tryGit(cwd, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  const currentBranch = tryGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  for (const candidate of [originHead, "origin/main", "origin/master", "main", "master"]) {
    if (!candidate || candidate === currentBranch) continue;
    if (tryGit(cwd, ["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`]) != null) return candidate;
  }
  return null;
}

// Drift facts for one Thread worktree, every count a real `git rev-list` answer. The default-branch
// counts anchor on the attempt's exact base commit (sourceHead) rather than the worktree HEAD so the
// synthetic baseline snapshot commit never inflates "ahead" — ahead-of-default is real commits the
// attempt's base carries that the default branch lacks, behind-default is commits the default branch
// gained since the attempt began.
export function worktreeDriftFacts({ worktree, sourceHead = null }) {
  const branch = tryGit(worktree, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const upstreamRef = tryGit(worktree, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  let upstreamAheadCount = 0;
  let upstreamBehindCount = 0;
  if (upstreamRef) {
    const divergence = tryGit(worktree, ["rev-list", "--left-right", "--count", `HEAD...${upstreamRef}`]);
    const [ahead, behind] = String(divergence ?? "").split(/\s+/);
    upstreamAheadCount = count(ahead);
    upstreamBehindCount = count(behind);
  }
  const baseRef = resolveDefaultBranchRef(worktree);
  const anchor = sourceHead ?? "HEAD";
  return {
    branch,
    baseRef,
    hasUpstream: Boolean(upstreamRef),
    upstreamRef: upstreamRef ?? null,
    upstreamAheadCount,
    upstreamBehindCount,
    aheadOfDefaultCount: baseRef ? count(tryGit(worktree, ["rev-list", "--count", `${baseRef}..${anchor}`])) : 0,
    behindDefaultCount: baseRef ? count(tryGit(worktree, ["rev-list", "--count", `${anchor}..${baseRef}`])) : 0,
  };
}

const DRIFT_STATUSES = new Set([
  "preparing", "running", "interrupted", "reviewable",
  "needs-verification", "failed-verification", "applied", "committed",
]);
const driftCache = new Map();
const DRIFT_CACHE_MS = 10_000;

// Per-Thread drift rows for the work index. A broken or missing worktree contributes nothing rather
// than breaking the index; a short cache keeps index reads from spawning git on every poll.
export function codeDriftForVenture(ventureId, options = {}) {
  const cached = driftCache.get(ventureId);
  if (options.driftCache !== false && cached && Date.now() - cached.at < DRIFT_CACHE_MS) return cached.rows;
  const rows = [];
  for (const record of listVentureDocs(ventureId, CODE_WORKSPACE_COLLECTION, options)) {
    if (!record.worktree || !DRIFT_STATUSES.has(record.status)) continue;
    try {
      if (!fs.existsSync(record.worktree)) continue;
      rows.push({
        threadRef: record.threadRef,
        workspaceRef: record.id,
        updatedAt: record.updatedAt ?? record.createdAt ?? null,
        ...worktreeDriftFacts({ worktree: record.worktree, sourceHead: record.sourceHead }),
      });
    } catch { /* a torn worktree never breaks the index */ }
  }
  driftCache.set(ventureId, { at: Date.now(), rows });
  return rows;
}

// Newest drift row per Thread, ready for the work index join: derived rows in, one row per Thread
// out, never a stored status. Threads without a live worktree simply carry no drift.
export function newestCodeDriftByThread(rows) {
  const byThread = new Map();
  for (const row of rows ?? []) {
    if (!row?.threadRef) continue;
    const existing = byThread.get(row.threadRef);
    if (!existing || (Date.parse(row.updatedAt ?? "") || 0) > (Date.parse(existing.updatedAt ?? "") || 0)) {
      byThread.set(row.threadRef, row);
    }
  }
  return byThread;
}

function defaultGh(cwd, args) {
  return execFileSync("gh", args, {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024,
  }).trim();
}

const ghStatusCache = new Map();
const GH_STATUS_CACHE_MS = 30_000;

// Honest gh CLI availability: installed and authenticated, installed but signed out, or absent.
// Reads ride a short cache so inspecting a workspace never blocks on a gh network round-trip;
// execution passes `fresh` because the answer gates a real outward step.
export function ghAvailability(cwd, ghExec = defaultGh, { fresh = false } = {}) {
  const cacheable = ghExec === defaultGh;
  if (cacheable && !fresh) {
    const cached = ghStatusCache.get(cwd);
    if (cached && Date.now() - cached.at < GH_STATUS_CACHE_MS) return cached.value;
  }
  let value;
  try {
    ghExec(cwd, ["auth", "status"]);
    value = { available: true, authenticated: true, reason: null };
  } catch (error) {
    value = error?.code === "ENOENT"
      ? { available: false, authenticated: false, reason: "The GitHub CLI (gh) is not installed, so Croki cannot open a pull request. Install gh to enable that step." }
      : { available: true, authenticated: false, reason: "The GitHub CLI is installed but not signed in. Run `gh auth login` to enable the pull request step." };
  }
  if (cacheable) ghStatusCache.set(cwd, { at: Date.now(), value });
  return value;
}

function save(record, options = {}) {
  const updated = { ...record, updatedAt: now() };
  setVentureDoc(updated.ventureId, CODE_WORKSPACE_COLLECTION, updated.id, updated, options);
  emitFirmEvent(updated.ventureId, "timeline", { threadRef: updated.threadRef });
  return updated;
}

function exactRecord(ventureId, id, options) {
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  if (!record) throw new Error(`No such coding workspace: ${id}`);
  return record;
}

// Agents (and the founder) stage exact ship content here. Preparation is inward-only: it stores
// sanitized drafts on the durable record and never touches a branch, remote, or GitHub.
export function prepareShipDrafts(ventureId, id, drafts = {}, options = {}) {
  const record = exactRecord(ventureId, id, options);
  const prepared = mergeShipDrafts(
    draftShipContent(record, { existingBranchNames: listKnownBranchNames(record.repository) }),
    drafts,
  );
  save({ ...record, ship: { ...(record.ship ?? {}), drafts: prepared, preparedAt: now() } }, options);
  return prepared;
}

// Everything the founder sees at the decision point: drift facts, gh availability, the exact
// prepared branch/commit/PR content, and prior attempts.
export function inspectShip(ventureId, id, options = {}) {
  const record = exactRecord(ventureId, id, options);
  const drafts = mergeShipDrafts(
    draftShipContent(record, { existingBranchNames: listKnownBranchNames(record.repository) }),
    record.ship?.drafts ?? {},
  );
  let drift = null;
  try {
    if (record.worktree && fs.existsSync(record.worktree)) {
      drift = worktreeDriftFacts({ worktree: record.worktree, sourceHead: record.sourceHead });
    }
  } catch { /* drift is informative, never blocking */ }
  const baseRef = drift?.baseRef ?? resolveDefaultBranchRef(record.repository);
  const gh = ghAvailability(record.repository, options.shipGh);
  const repository = repositoryReviewState(record, {
    drift,
    baseBranch: baseRef ? baseRef.replace(/^origin\//, "") : null,
    drafts,
    gh: options.shipGitHubRead === false ? { ...gh, authenticated: false } : gh,
    ghExec: options.shipGh,
  });
  return {
    drafts,
    drift,
    baseBranch: baseRef ? baseRef.replace(/^origin\//, "") : null,
    gh,
    repository,
    plan: repository.plan,
    attempt: record.ship?.attempt ?? null,
    receipts: record.shipReceipts ?? [],
  };
}

// Build the exact reviewed patch into a commit object with a temporary index so the founder's
// checkout and working tree never move. `check` only validates that the patch applies to the base.
function buildPatchCommit(repo, { baseCommit, patch, message, check = false }) {
  const commonDir = path.resolve(repo, git(repo, ["rev-parse", "--git-common-dir"]));
  const tempIndex = path.join(commonDir, `drover-ship-${process.pid}-${crypto.randomUUID()}.index`);
  const env = { ...process.env, GIT_INDEX_FILE: tempIndex };
  const body = patch.endsWith("\n") ? patch : `${patch}\n`;
  try {
    git(repo, ["read-tree", baseCommit], { env });
    git(repo, ["apply", "--cached", "--whitespace=nowarn", ...(check ? ["--check"] : []), "-"], { env, input: body });
    if (check) return null;
    const tree = git(repo, ["write-tree"], { env });
    return git(repo, ["commit-tree", tree, "-p", baseCommit, "-m", message], { env });
  } finally {
    try { fs.unlinkSync(tempIndex); } catch { /* the temporary index may never have been created */ }
  }
}

function assertShippableBranchName(repo, branch) {
  const name = String(branch ?? "").trim();
  if (!name) throw new Error("Shipping needs a branch name.");
  try { git(repo, ["check-ref-format", "--branch", name]); }
  catch { throw new Error(`"${name}" is not a valid git branch name.`); }
  const taken = new Set(listKnownBranchNames(repo).map((entry) => entry.toLowerCase()));
  if (taken.has(name.toLowerCase())) throw new Error(`The branch "${name}" already exists. Pick another name.`);
  return name;
}

function shortSha(sha) {
  return String(sha ?? "").slice(0, 8);
}

// The single founder-gated stacked action: branch -> commit -> push -> pull request, with each
// phase persisted on the durable record as it happens. Dry run validates the branch and the exact
// patch, then records the exact push and PR commands it would run without executing either.
export async function runShipAction(ventureId, id, input = {}, actor, options = {}) {
  if (actor?.authority !== "founder") {
    throw new Error("Shipping is a founder-held consequence. Agents may prepare branch, commit, and pull request content, but never push or open a pull request.");
  }
  const record = exactRecord(ventureId, id, options);
  const readiness = inspectCodingReadiness(ventureId, id, options);
  if (!readiness.approved) throw new Error("Shipping requires founder approval of the exact checkpoint first.");
  if (!readiness.verified) throw new Error("Shipping requires successful, failure-free project verification of the exact checkpoint.");
  if (!readiness.exact) throw new Error("The coding workspace moved after its exact checkpoint; resume it to capture a new revision before shipping.");
  if (!record.diff) throw new Error("There is no repository change to ship.");
  if (record.status === "preparing" || record.status === "running") {
    throw new Error("Source-control changes wait until the active Run releases this workspace.");
  }

  const dryRun = input.dryRun === true;
  if (!dryRun && input.confirm !== true) throw new Error("Shipping needs the founder's explicit confirmation.");
  const repo = record.repository;
  const drafts = mergeShipDrafts(
    draftShipContent(record, { existingBranchNames: listKnownBranchNames(repo) }),
    { ...(record.ship?.drafts ?? {}), ...input },
  );
  const gh = ghAvailability(repo, options.shipGh, { fresh: true });
  const baseRef = resolveDefaultBranchRef(repo);
  const baseBranch = baseRef ? baseRef.replace(/^origin\//, "") : null;
  const reviewedState = repositoryReviewState(record, {
    drift: worktreeDriftFacts({ worktree: record.worktree, sourceHead: record.sourceHead }),
    baseBranch,
    drafts,
    gh: { ...gh, authenticated: false },
    ghExec: options.shipGh,
    freshGitHub: true,
  });
  if (!dryRun && (!input.planFingerprint || input.planFingerprint !== reviewedState.plan.fingerprint)) {
    throw Object.assign(
      new Error("Repository state changed after this ship plan was reviewed. Refresh the exact plan before confirming."),
      { code: "ship_plan_stale", status: 409 },
    );
  }
  // A push/PR failure keeps the exact local commit. Retrying the same reviewed plan resumes at the
  // failed outward phase instead of recreating prior successful phases or pushing twice.
  const prior = record.ship?.attempt;
  const resuming = Boolean(
    prior && prior.outcome === "failed" && ["push", "pr"].includes(prior.failedPhase) && prior.commitSha
    && drafts.branch === prior.branch
    && tryGit(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${prior.branch}`]) === prior.commitSha,
  );
  const branch = resuming ? prior.branch : assertShippableBranchName(repo, drafts.branch);
  const startedAt = now();
  const attemptId = `ship-${(record.shipReceipts ?? []).length + 1}`;
  let attempt = {
    id: attemptId, dryRun, startedAt, completedAt: null, outcome: "running", error: null, failedPhase: null,
    branch, baseBranch, commitSha: null, pushed: false, prUrl: null, prNote: null,
    planFingerprint: reviewedState.plan.fingerprint,
    reviewedPlan: reviewedState.plan,
    content: { commitMessage: drafts.commitMessage, prTitle: drafts.prTitle, prBody: drafts.prBody },
    phases: ["fetch", "branch", "commit", "push", "pr"].map((phase) => ({ phase, status: "pending", detail: null, at: null })),
  };
  let current = record;
  const persist = () => {
    current = save({ ...current, ship: { ...(current.ship ?? {}), drafts, attempt } }, options);
  };
  const phase = (name, patch) => {
    attempt = { ...attempt, phases: attempt.phases.map((entry) => entry.phase === name ? { ...entry, ...patch, at: now() } : entry) };
    persist();
  };
  const settle = (patch) => {
    attempt = { ...attempt, ...patch, completedAt: now() };
    const receipts = [...(current.shipReceipts ?? []), attempt].slice(-20);
    current = save({ ...current, shipReceipts: receipts, ship: { ...(current.ship ?? {}), drafts, attempt } }, options);
  };
  persist();
  try {
    phase("fetch", { status: "running" });
    const origin = tryGit(repo, ["remote", "get-url", "origin"]);
    if (dryRun) {
      phase("fetch", { status: origin ? "ready" : "skipped", detail: origin ? "Would safely refresh origin before any branch or commit changes." : "No origin remote is configured." });
    } else if (origin) {
      try { git(repo, ["fetch", "--prune", "origin"]); }
      catch (error) { throw Object.assign(new Error(`Fetch failed: ${error.message}`), { shipPhase: "fetch" }); }
      phase("fetch", { status: "done", detail: "Refreshed origin before changing source control." });
      const refreshedDrift = worktreeDriftFacts({ worktree: record.worktree, sourceHead: record.sourceHead });
      const refreshedBase = refreshedDrift.baseRef?.replace(/^origin\//, "") ?? baseBranch;
      const refreshed = repositoryReviewState(record, {
        drift: refreshedDrift, baseBranch: refreshedBase, drafts,
        gh: { ...gh, authenticated: false },
        ghExec: options.shipGh,
      });
      if (refreshed.plan.fingerprint !== reviewedState.plan.fingerprint) {
        throw Object.assign(
          new Error("Fetch found branch drift after review. No branch, commit, push, or pull request changed; refresh the exact plan."),
          { shipPhase: "fetch", code: "ship_plan_stale", status: 409 },
        );
      }
    } else {
      phase("fetch", { status: "skipped", detail: "No origin remote is configured." });
    }

    phase("branch", { status: "running" });
    if (!resuming) {
      try { buildPatchCommit(repo, { baseCommit: record.sourceHead, patch: record.diff, message: drafts.commitMessage, check: true }); }
      catch (error) { throw Object.assign(error, { shipPhase: "commit" }); }
    }
    phase("branch", {
      status: dryRun || !resuming ? "ready" : "done",
      detail: resuming
        ? `Reusing ${branch}, already created and pushed by the previous attempt`
        : `${dryRun ? "Would create" : "Will create"} ${branch} from ${shortSha(record.sourceHead)}`,
    });

    if (dryRun) {
      phase("commit", { status: "ready", detail: resuming ? `Would reuse commit ${shortSha(prior.commitSha)}` : `The exact reviewed patch applies cleanly; would commit "${drafts.commitSubject}"` });
      phase("push", { status: "skipped", detail: resuming && prior.pushed ? `${branch} is already on origin; nothing would be pushed twice` : `Would run: git push -u origin ${branch}` });
      phase("pr", {
        status: "skipped",
        detail: gh.available && gh.authenticated
          ? `Would run: gh pr create --head ${branch}${baseBranch ? ` --base ${baseBranch}` : ""} --title "${drafts.prTitle}"`
          : gh.reason,
      });
      settle({ outcome: "dry-run" });
      return { workspace: current, attempt };
    }

    let commitSha;
    if (resuming) {
      commitSha = prior.commitSha;
      attempt = { ...attempt, commitSha, pushed: prior.pushed === true };
      phase("commit", { status: "done", detail: `Reusing commit ${shortSha(commitSha)} on ${branch}` });
      if (prior.pushed) {
        phase("push", { status: "done", detail: `${branch} is already on origin; nothing pushed twice` });
      } else {
        phase("push", { status: "running" });
        try { git(repo, ["push", "-u", "origin", branch]); }
        catch (error) { throw Object.assign(new Error(`Push failed: ${error.message}`), { shipPhase: "push" }); }
        attempt = { ...attempt, pushed: true };
        phase("push", { status: "done", detail: `Pushed retained commit ${shortSha(commitSha)} to origin` });
      }
    } else {
      phase("commit", { status: "running" });
      try { commitSha = buildPatchCommit(repo, { baseCommit: record.sourceHead, patch: record.diff, message: drafts.commitMessage }); }
      catch (error) { throw Object.assign(error, { shipPhase: "commit" }); }
      git(repo, ["update-ref", `refs/heads/${branch}`, commitSha, ""]);
      attempt = { ...attempt, commitSha };
      phase("branch", { status: "done", detail: `Created ${branch} at ${shortSha(commitSha)}` });
      phase("commit", { status: "done", detail: `Committed ${shortSha(commitSha)} on ${branch}` });

      phase("push", { status: "running" });
      if (!tryGit(repo, ["remote", "get-url", "origin"])) {
        throw Object.assign(new Error("This repository has no origin remote, so there is nowhere to push."), { shipPhase: "push" });
      }
      try {
        git(repo, ["push", "-u", "origin", branch]);
      } catch (error) {
        throw Object.assign(new Error(`Push failed: ${error.message}`), { shipPhase: "push" });
      }
      attempt = { ...attempt, pushed: true };
      phase("push", { status: "done", detail: `Pushed ${branch} to origin` });
    }

    phase("pr", { status: "running" });
    if (!gh.available || !gh.authenticated) {
      attempt = { ...attempt, prNote: gh.reason };
      phase("pr", { status: "skipped", detail: gh.reason });
    } else {
      const existing = resuming && prior.failedPhase === "pr"
        ? readGitHubPullRequest(repo, branch, gh, options.shipGh ?? defaultGh, { fresh: true })
        : null;
      if (existing?.pullRequest) {
        attempt = { ...attempt, prUrl: existing.pullRequest.url };
        phase("pr", { status: "done", detail: `${existing.pullRequest.url ?? `PR #${existing.pullRequest.number}`} already exists; nothing created twice` });
        settle({ outcome: "completed" });
        return { workspace: current, attempt };
      }
      const bodyFile = path.join(os.tmpdir(), `drover-pr-body-${process.pid}-${crypto.randomUUID()}.md`);
      fs.writeFileSync(bodyFile, drafts.prBody ?? "");
      try {
        const output = (options.shipGh ?? defaultGh)(repo, [
          "pr", "create", "--head", branch,
          ...(baseBranch ? ["--base", baseBranch] : []),
          "--title", drafts.prTitle, "--body-file", bodyFile,
        ]);
        const url = output.match(/https:\/\/\S+/)?.[0] ?? null;
        attempt = { ...attempt, prUrl: url };
        phase("pr", { status: "done", detail: url ?? "Pull request created" });
      } catch (error) {
        throw Object.assign(new Error(`The push succeeded but opening the pull request failed: ${error.message}`), { shipPhase: "pr" });
      } finally {
        try { fs.unlinkSync(bodyFile); } catch { /* best effort */ }
      }
    }

    settle({ outcome: "completed" });
    return { workspace: current, attempt };
  } catch (error) {
    const failedPhase = error?.shipPhase ?? attempt.phases.find((entry) => entry.status === "running")?.phase ?? null;
    if (failedPhase) phase(failedPhase, { status: "failed", detail: error.message });
    settle({ outcome: "failed", error: error.message, failedPhase });
    throw error;
  }
}
