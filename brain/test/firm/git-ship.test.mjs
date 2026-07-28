import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { describe, it } from "node:test";

import {
  openCodingWorkspace,
  reviewCodingWorkspace,
  settleCodingWorkspace,
  updateCodingSession,
} from "../../src/firm/code-workspace.mjs";
import {
  buildCommitMessagePrompt,
  buildPrContentPrompt,
  draftShipContent,
  mergeShipDrafts,
  resolveAutoFeatureBranchName,
  sanitizeBranchFragment,
  sanitizeCommitSubject,
  sanitizeFeatureBranchName,
} from "../../src/firm/git-ship-prompts.mjs";
import {
  codeDriftForVenture,
  ghAvailability,
  inspectShip,
  prepareShipDrafts,
  runShipAction,
  worktreeDriftFacts,
} from "../../src/firm/git-ship.mjs";
import { projectWorkIndex } from "../../src/firm/work-index.mjs";
import { createVenture } from "../../src/firm/venture-store.mjs";
import codeWorkspaceRoutes from "../../src/firm/code-workspace-routes.mjs";

function git(cwd, args) { return execFileSync("git", args, { cwd, encoding: "utf8" }).trim(); }

// A local bare "origin" stands in for GitHub: pushes are provable without any network send.
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-git-ship-home-"));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drover-git-ship-repo-"));
  const origin = fs.mkdtempSync(path.join(os.tmpdir(), "drover-git-ship-origin-"));
  git(origin, ["init", "-q", "--bare"]);
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repo, ".gitignore"), ".drover-worktrees/\n");
  fs.writeFileSync(path.join(repo, "product.txt"), "base\n");
  git(repo, ["add", "."]); git(repo, ["commit", "-qm", "base"]);
  git(repo, ["remote", "add", "origin", origin]);
  git(repo, ["push", "-q", "-u", "origin", "main"]);
  const options = { root, seedFoundingCrew: false, nativeCodingHostVerification: false, driftCache: false };
  const venture = createVenture({ name: "Git ship", repository: repo }, options);
  const cleanup = () => { for (const dir of [root, repo, origin]) fs.rmSync(dir, { recursive: true, force: true }); };
  return { root, repo, origin, options, venture, cleanup };
}

async function reviewableWorkspace({ repo, options, venture }, { runId = "drive-ship-1", threadRef = "thread:ship", goal = "Implement the ship pipeline" } = {}) {
  const workspace = openCodingWorkspace({
    ventureId: venture.id, runId, threadRef, participantRef: "codex", provider: "codex",
    repository: repo, goal, workRef: null,
  }, options);
  fs.writeFileSync(path.join(workspace.worktree, "product.txt"), "base\nshipped\n");
  updateCodingSession(venture.id, workspace.id, {
    runRef: `run:${runId}`,
    command: { command: "npm test", status: "passed", exitCode: 0, completedAt: new Date().toISOString(), output: "ok", verification: true },
  }, options);
  await settleCodingWorkspace(venture.id, workspace.id, { runRef: `run:${runId}`, outcome: { kind: "completed" } }, options);
  return reviewCodingWorkspace(venture.id, workspace.id, "approve", "Exact patch reviewed", options);
}

const founder = { authority: "founder", id: "founder" };
const ghUnavailable = () => { throw Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" }); };
const confirmedPlan = (context, workspace, input = {}) => ({
  ...input,
  confirm: true,
  planFingerprint: inspectShip(context.venture.id, workspace.id, { ...context.options, shipGitHubRead: false }).plan.fingerprint,
});

describe("lifted branch and message shaping", () => {
  it("sanitizes arbitrary text into safe branch fragments and unique feature branches", () => {
    assert.equal(sanitizeBranchFragment("Fix the 'Login' Flow!!"), "fix-the-login-flow");
    assert.equal(sanitizeBranchFragment(""), "update");
    assert.equal(sanitizeFeatureBranchName("Ship pipeline"), "feature/ship-pipeline");
    assert.equal(resolveAutoFeatureBranchName(["feature/ship-pipeline"], "Ship pipeline"), "feature/ship-pipeline-2");
  });

  it("bounds commit subjects and keeps preparation prompts material-grounded", () => {
    assert.equal(sanitizeCommitSubject("Add drift facts."), "Add drift facts");
    assert.equal(sanitizeCommitSubject("x".repeat(100)).length, 72);
    const commit = buildCommitMessagePrompt({ branch: "main", stagedSummary: "M a.txt", stagedPatch: "diff", includeBranch: true });
    assert.deepEqual(commit.outputKeys, ["subject", "body", "branch"]);
    assert.match(commit.prompt, /<= 72 chars/);
    const pr = buildPrContentPrompt({ baseBranch: "main", headBranch: "feature/x", commitSummary: "c", diffSummary: "d", diffPatch: "p" });
    assert.match(pr.prompt, /## Summary/);
  });

  it("drafts deterministic ship content from the durable record and re-sanitizes founder edits", () => {
    const record = {
      goal: "Add the drift panel", changedFiles: [{ status: "M", path: "ui/panel.tsx" }],
      verification: [{ command: "npm test", status: "passed" }],
    };
    const drafts = draftShipContent(record, { existingBranchNames: [] });
    assert.equal(drafts.branch, "feature/add-the-drift-panel");
    assert.equal(drafts.commitSubject, "Add the drift panel");
    assert.match(drafts.prBody, /## Testing\n- `npm test` passed/);
    const edited = mergeShipDrafts(drafts, { branch: "Fix/Drift Panel!", commitMessage: "Refine drift panel.\n\nDetails here", prTitle: "Two\nlines" });
    assert.equal(edited.branch, "fix/drift-panel");
    assert.equal(edited.commitMessage, "Refine drift panel\n\nDetails here");
    assert.equal(edited.prTitle, "Two");
  });
});

describe("drift facts", () => {
  it("derives ahead/behind-of-default per Thread worktree via rev-list and joins them on the work index", async () => {
    const context = fixture();
    const { repo, options, venture, cleanup } = context;
    const workspace = await reviewableWorkspace(context);

    // The default branch moves after the attempt began: honest behind-of-default drift.
    fs.writeFileSync(path.join(repo, "other.txt"), "moved\n");
    git(repo, ["add", "other.txt"]); git(repo, ["commit", "-qm", "move main"]);
    git(repo, ["push", "-q", "origin", "main"]);

    const facts = worktreeDriftFacts({ worktree: workspace.worktree, sourceHead: workspace.sourceHead });
    assert.equal(facts.branch, workspace.branch);
    assert.equal(facts.hasUpstream, false, "an isolated attempt has pushed nothing");
    assert.equal(facts.behindDefaultCount, 1, "main gained one commit since the attempt began");
    assert.equal(facts.aheadOfDefaultCount, 0, "the attempt base carries no commits main lacks");

    const rows = codeDriftForVenture(venture.id, options);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].threadRef, "thread:ship");

    const index = projectWorkIndex({
      ventureId: venture.id,
      model: { revision: 1, threads: [{ id: "ship", name: "Ship it", subjectRefs: [], messageRefs: [] }], runs: [], objects: [], relationships: [] },
      codeDrift: rows,
    });
    assert.equal(index.items[0].drift.behindDefaultCount, 1);
    assert.equal(index.items[0].drift.workspaceRef, workspace.id);
    cleanup();
  });
});

describe("founder-gated ship action", () => {
  it("refuses agent-stamped commit and ship requests at the HTTP authority boundary", async () => {
    for (const action of ["commit", "ship"]) {
      const pathname = `/api/ventures/venture-forged/coding-workspaces/workspace-forged/${action}`;
      const req = Readable.from([JSON.stringify({ confirm: true, message: "forged" })]);
      Object.assign(req, {
        method: "POST",
        url: pathname,
        headers: { "content-type": "application/json", "x-gtm-actor": "agent" },
      });
      let status;
      let raw = "";
      const res = { writeHead(value) { status = value; }, setHeader() {}, end(value) { raw += value ?? ""; } };
      assert.equal(await codeWorkspaceRoutes({ req, res, url: new URL(pathname, "http://local") }), true);
      assert.equal(status, 403);
      assert.match(JSON.parse(raw).error, /founder-only/i);
    }
  });

  it("refuses agents outright: preparation is allowed, execution is founder-only", async () => {
    const context = fixture();
    const workspace = await reviewableWorkspace(context);
    const drafts = prepareShipDrafts(context.venture.id, workspace.id, { prTitle: "Agent-drafted title" }, context.options);
    assert.equal(drafts.prTitle, "Agent-drafted title");
    await assert.rejects(
      () => runShipAction(context.venture.id, workspace.id, {}, { authority: "agent", id: "codex" }, context.options),
      /founder-held consequence/,
    );
    assert.equal(git(context.origin, ["for-each-ref", "refs/heads", "--format=%(refname:short)"]), "main", "nothing may reach the remote");
    context.cleanup();
  });

  it("runs branch -> commit -> push -> PR as one stacked action without moving the founder's checkout", async () => {
    const context = fixture();
    const { repo, origin, options, venture, cleanup } = context;
    const workspace = await reviewableWorkspace(context);
    const before = { head: git(repo, ["rev-parse", "HEAD"]), branch: git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]), status: git(repo, ["status", "--porcelain"]) };
    const ghCalls = [];
    options.shipGh = (cwd, args) => {
      ghCalls.push(args);
      if (args[0] === "auth") return "Logged in";
      return "https://github.com/example/repo/pull/7";
    };

    const { attempt } = await runShipAction(venture.id, workspace.id, confirmedPlan(context, workspace), founder, options);
    assert.equal(attempt.outcome, "completed");
    assert.deepEqual(attempt.phases.map((phase) => [phase.phase, phase.status]), [["fetch", "done"], ["branch", "done"], ["commit", "done"], ["push", "done"], ["pr", "done"]]);
    assert.equal(attempt.branch, "feature/implement-the-ship-pipeline");
    assert.equal(attempt.prUrl, "https://github.com/example/repo/pull/7");
    assert.ok(ghCalls.some((args) => args[0] === "pr" && args.includes("--head") && args.includes(attempt.branch)));

    // The pushed branch on the local bare origin carries exactly the reviewed patch.
    const pushed = git(origin, ["rev-parse", `refs/heads/${attempt.branch}`]);
    assert.equal(pushed, attempt.commitSha);
    assert.match(git(origin, ["show", `${pushed}:product.txt`]), /shipped/);

    // The founder's checkout never moved: same HEAD, same branch, same working tree.
    assert.deepEqual({ head: git(repo, ["rev-parse", "HEAD"]), branch: git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]), status: git(repo, ["status", "--porcelain"]) }, before);

    const ship = inspectShip(venture.id, workspace.id, options);
    assert.equal(ship.receipts.length, 1, "a completed action records a durable receipt");
    assert.equal(ship.receipts[0].pushed, true);
    cleanup();
  });

  it("dry run proves the exact plan without creating a branch, pushing, or calling gh pr create", async () => {
    const context = fixture();
    const { repo, origin, options, venture, cleanup } = context;
    const workspace = await reviewableWorkspace(context);
    const ghCalls = [];
    options.shipGh = (cwd, args) => { ghCalls.push(args); return args[0] === "auth" ? "Logged in" : "unexpected"; };

    const { attempt } = await runShipAction(venture.id, workspace.id, { dryRun: true }, founder, options);
    assert.equal(attempt.outcome, "dry-run");
    assert.deepEqual(attempt.phases.map((phase) => phase.status), ["ready", "ready", "ready", "skipped", "skipped"]);
    assert.match(attempt.phases[3].detail, /git push -u origin feature\/implement-the-ship-pipeline/);
    assert.match(attempt.phases[4].detail, /gh pr create --head feature\/implement-the-ship-pipeline/);
    assert.equal(ghCalls.filter((args) => args[0] === "pr").length, 0, "a dry run never opens a pull request");
    assert.equal(git(origin, ["for-each-ref", "refs/heads", "--format=%(refname:short)"]), "main");
    assert.equal(git(repo, ["for-each-ref", "refs/heads/feature", "--format=%(refname:short)"]), "", "a dry run creates no branch");
    cleanup();
  });

  it("degrades honestly when gh is absent: the push lands, the PR step reports why it could not", async () => {
    const context = fixture();
    const { origin, options, venture, cleanup } = context;
    const workspace = await reviewableWorkspace(context);
    options.shipGh = ghUnavailable;

    const { attempt } = await runShipAction(venture.id, workspace.id, confirmedPlan(context, workspace), founder, options);
    assert.equal(attempt.outcome, "completed");
    assert.equal(attempt.pushed, true);
    assert.equal(attempt.phases[4].status, "skipped");
    assert.match(attempt.prNote, /gh.*not installed/i);
    assert.equal(git(origin, ["rev-parse", `refs/heads/${attempt.branch}`]), attempt.commitSha);
    assert.equal(ghAvailability(origin, ghUnavailable).available, false);
    cleanup();
  });

  it("records a failed push as a retryable receipt and succeeds on the retry", async () => {
    const context = fixture();
    const { repo, options, venture, cleanup } = context;
    const workspace = await reviewableWorkspace(context);
    options.shipGh = ghUnavailable;
    git(repo, ["remote", "remove", "origin"]);

    await assert.rejects(
      () => runShipAction(venture.id, workspace.id, confirmedPlan(context, workspace), founder, options),
      /no origin remote/,
    );
    const failed = inspectShip(venture.id, workspace.id, options);
    assert.equal(failed.receipts.at(-1).outcome, "failed");
    assert.equal(failed.receipts.at(-1).failedPhase, "push");
    const retained = failed.receipts.at(-1);
    assert.equal(git(repo, ["rev-parse", `refs/heads/${retained.branch}`]), retained.commitSha, "a failed push preserves the exact local commit for scoped retry");

    const origin2 = fs.mkdtempSync(path.join(os.tmpdir(), "drover-git-ship-origin2-"));
    git(origin2, ["init", "-q", "--bare"]);
    git(repo, ["remote", "add", "origin", origin2]);
    const { attempt } = await runShipAction(venture.id, workspace.id, confirmedPlan(context, workspace), founder, options);
    assert.equal(attempt.outcome, "completed");
    assert.equal(attempt.branch, failed.receipts.at(-1).branch, "the retry runs the same plan the founder already read");
    assert.equal(git(origin2, ["rev-parse", `refs/heads/${attempt.branch}`]), attempt.commitSha);
    assert.equal(inspectShip(venture.id, workspace.id, options).receipts.length, 2);
    fs.rmSync(origin2, { recursive: true, force: true });
    cleanup();
  });

  it("keeps the pushed branch when only the pull request fails, says so, and resumes at the PR phase", async () => {
    const context = fixture();
    const { repo, origin, options, venture, cleanup } = context;
    const workspace = await reviewableWorkspace(context);
    let prCalls = 0;
    let prReads = 0;
    options.shipGh = (cwd, args) => {
      if (args[0] === "auth") return "Logged in";
      if (args[1] === "view") {
        prReads += 1;
        throw new Error("no pull requests found for branch");
      }
      prCalls += 1;
      if (prCalls === 1) throw new Error("GraphQL: something went wrong");
      return "https://github.com/example/repo/pull/9";
    };

    await assert.rejects(
      () => runShipAction(venture.id, workspace.id, confirmedPlan(context, workspace), founder, options),
      /push succeeded but opening the pull request failed/,
    );
    const receipt = inspectShip(venture.id, workspace.id, { ...options, shipGitHubRead: false }).receipts.at(-1);
    assert.equal(receipt.outcome, "failed");
    assert.equal(receipt.failedPhase, "pr");
    assert.equal(receipt.pushed, true, "the receipt admits the push landed");
    // The pushed branch and its commit were kept, on origin and locally — no pretend rollback.
    assert.equal(git(origin, ["rev-parse", `refs/heads/${receipt.branch}`]), receipt.commitSha);
    assert.equal(git(repo, ["rev-parse", `refs/heads/${receipt.branch}`]), receipt.commitSha);

    // Shipping again with the same branch resumes at the PR phase: nothing pushes twice.
    const { attempt } = await runShipAction(venture.id, workspace.id, confirmedPlan(context, workspace), founder, options);
    assert.equal(attempt.outcome, "completed");
    assert.equal(attempt.branch, receipt.branch);
    assert.equal(attempt.commitSha, receipt.commitSha, "the retry reuses the pushed commit");
    assert.deepEqual(attempt.phases.map((phase) => phase.status), ["done", "done", "done", "done", "done"]);
    assert.match(attempt.phases[3].detail, /already on origin/);
    assert.equal(attempt.prUrl, "https://github.com/example/repo/pull/9");
    assert.equal(prCalls, 2, "the retry runs gh pr create exactly once more");
    assert.equal(prReads, 1, "the retry first verifies that the failed response did not already create a pull request");
    assert.equal(git(origin, ["rev-parse", `refs/heads/${attempt.branch}`]), receipt.commitSha, "origin still carries exactly one commit for this ship");
    cleanup();
  });

  it("reconciles an ambiguously failed PR response without creating a duplicate pull request", async () => {
    const context = fixture();
    const workspace = await reviewableWorkspace(context);
    let creates = 0;
    context.options.shipGh = (_cwd, args) => {
      if (args[0] === "auth") return "Logged in";
      if (args[1] === "view") return JSON.stringify({
        url: "https://github.com/example/repo/pull/10", number: 10, state: "OPEN",
        headRefName: "feature/implement-the-ship-pipeline", baseRefName: "main",
        mergeable: "UNKNOWN", reviewRequests: [], statusCheckRollup: [],
      });
      creates += 1;
      throw new Error("connection closed after GitHub accepted the request");
    };
    await assert.rejects(
      () => runShipAction(context.venture.id, workspace.id, confirmedPlan(context, workspace), founder, context.options),
      /opening the pull request failed/,
    );
    const { attempt } = await runShipAction(
      context.venture.id,
      workspace.id,
      confirmedPlan(context, workspace),
      founder,
      context.options,
    );
    assert.equal(attempt.outcome, "completed");
    assert.equal(attempt.prUrl, "https://github.com/example/repo/pull/10");
    assert.equal(creates, 1, "the reconciled retry never calls gh pr create twice");
    context.cleanup();
  });

  it("projects exact repository, verification, GitHub checks, reviews, and mergeability into Review", async () => {
    const context = fixture();
    const workspace = await reviewableWorkspace(context);
    context.options.shipGh = (_cwd, args) => {
      if (args[0] === "auth") return "Logged in";
      assert.deepEqual(args.slice(0, 3), ["pr", "view", "feature/implement-the-ship-pipeline"]);
      return JSON.stringify({
        url: "https://github.com/example/repo/pull/12",
        number: 12,
        state: "OPEN",
        isDraft: false,
        mergeable: "MERGEABLE",
        reviewDecision: "REVIEW_REQUIRED",
        reviewRequests: [{ login: "octocat" }],
        statusCheckRollup: [{ name: "test", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "https://checks/12" }],
        headRefName: "feature/implement-the-ship-pipeline",
        baseRefName: "main",
      });
    };
    const info = inspectShip(context.venture.id, workspace.id, context.options);
    assert.equal(info.repository.baseRef, "origin/main");
    assert.equal(info.repository.currentBranch, workspace.branch);
    assert.equal(info.repository.dirty, true, "the reviewed patch is named as dirty worktree state");
    assert.equal(info.repository.dirtyCount, 1);
    assert.equal(info.repository.commitCount, info.repository.commits.length);
    assert.ok(info.repository.verification.length >= 1);
    assert.ok(info.repository.verification.every((entry) => entry.status === "passed"));
    assert.equal(info.repository.remote.url, context.origin);
    assert.equal(info.repository.github.pullRequest.mergeable, "mergeable");
    assert.deepEqual(info.repository.github.pullRequest.reviewRequests, ["octocat"]);
    assert.equal(info.repository.github.pullRequest.checks[0].conclusion, "success");
    assert.match(info.plan.fingerprint, /^[0-9a-f]{64}$/);
    context.cleanup();
  });

  it("blocks a stale reviewed plan after safe fetch discovers remote drift and refreshes the plan", async () => {
    const context = fixture();
    const workspace = await reviewableWorkspace(context);
    context.options.shipGh = ghUnavailable;
    const reviewed = inspectShip(context.venture.id, workspace.id, context.options).plan;

    const remoteWriter = fs.mkdtempSync(path.join(os.tmpdir(), "drover-git-ship-drift-writer-"));
    git(remoteWriter, ["clone", "-q", context.origin, "."]);
    git(remoteWriter, ["config", "user.email", "drift@example.com"]);
    git(remoteWriter, ["config", "user.name", "Drift"]);
    fs.writeFileSync(path.join(remoteWriter, "remote-drift.txt"), "new base\n");
    git(remoteWriter, ["add", "remote-drift.txt"]);
    git(remoteWriter, ["commit", "-qm", "advance main after review"]);
    git(remoteWriter, ["push", "-q", "origin", "main"]);

    await assert.rejects(
      () => runShipAction(context.venture.id, workspace.id, {
        confirm: true,
        planFingerprint: reviewed.fingerprint,
      }, founder, context.options),
      (error) => error.code === "ship_plan_stale" && /Fetch found branch drift/.test(error.message),
    );
    const refreshed = inspectShip(context.venture.id, workspace.id, context.options);
    assert.notEqual(refreshed.plan.fingerprint, reviewed.fingerprint);
    assert.equal(refreshed.receipts.at(-1).failedPhase, "fetch");
    assert.equal(refreshed.receipts.at(-1).phases[0].status, "failed");
    assert.equal(git(context.origin, ["for-each-ref", "refs/heads/feature", "--format=%(refname:short)"]), "", "stale execution never created a branch");
    fs.rmSync(remoteWriter, { recursive: true, force: true });
    context.cleanup();
  });

  it("blocks before branch creation when fetch discovers the prepared branch now exists remotely", async () => {
    const context = fixture();
    const workspace = await reviewableWorkspace(context);
    context.options.shipGh = ghUnavailable;
    const reviewed = inspectShip(context.venture.id, workspace.id, context.options).plan;

    const remoteWriter = fs.mkdtempSync(path.join(os.tmpdir(), "drover-git-ship-branch-writer-"));
    git(remoteWriter, ["clone", "-q", context.origin, "."]);
    git(remoteWriter, ["config", "user.email", "branch@example.com"]);
    git(remoteWriter, ["config", "user.name", "Branch"]);
    git(remoteWriter, ["switch", "-qc", reviewed.branch]);
    fs.writeFileSync(path.join(remoteWriter, "claimed-branch.txt"), "already claimed\n");
    git(remoteWriter, ["add", "claimed-branch.txt"]);
    git(remoteWriter, ["commit", "-qm", "claim prepared branch"]);
    git(remoteWriter, ["push", "-q", "-u", "origin", reviewed.branch]);
    const remoteCommit = git(remoteWriter, ["rev-parse", "HEAD"]);

    await assert.rejects(
      () => runShipAction(context.venture.id, workspace.id, {
        confirm: true,
        planFingerprint: reviewed.fingerprint,
      }, founder, context.options),
      (error) => error.code === "ship_plan_stale" && /Fetch found branch drift/.test(error.message),
    );
    const refreshed = inspectShip(context.venture.id, workspace.id, context.options);
    assert.equal(refreshed.repository.remote.preparedBranchCommit, remoteCommit);
    assert.equal(refreshed.receipts.at(-1).failedPhase, "fetch");
    assert.equal(git(workspace.worktree, ["for-each-ref", `refs/heads/${reviewed.branch}`, "--format=%(refname)"]), "");
    fs.rmSync(remoteWriter, { recursive: true, force: true });
    context.cleanup();
  });

  it("requires the founder to confirm the exact reviewed plan fingerprint", async () => {
    const context = fixture();
    const workspace = await reviewableWorkspace(context);
    const plan = inspectShip(context.venture.id, workspace.id, context.options).plan;
    await assert.rejects(
      () => runShipAction(context.venture.id, workspace.id, { planFingerprint: plan.fingerprint }, founder, context.options),
      /explicit confirmation/,
    );
    await assert.rejects(
      () => runShipAction(context.venture.id, workspace.id, { confirm: true }, founder, context.options),
      (error) => error.code === "ship_plan_stale",
    );
    assert.equal(git(context.origin, ["for-each-ref", "refs/heads", "--format=%(refname:short)"]), "main");
    context.cleanup();
  });

  it("refuses to ship an unapproved checkpoint", async () => {
    const context = fixture();
    const workspace = openCodingWorkspace({
      ventureId: context.venture.id, runId: "drive-unapproved", threadRef: "thread:unapproved",
      participantRef: "codex", provider: "codex", repository: context.repo, goal: "Not yet reviewed", workRef: null,
    }, context.options);
    fs.writeFileSync(path.join(workspace.worktree, "product.txt"), "base\nunreviewed\n");
    await settleCodingWorkspace(context.venture.id, workspace.id, { runRef: "run:drive-unapproved", outcome: { kind: "completed" } }, context.options);
    await assert.rejects(
      () => runShipAction(context.venture.id, workspace.id, { confirm: true }, founder, context.options),
      /founder approval/,
    );
    context.cleanup();
  });
});
