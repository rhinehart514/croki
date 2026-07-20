import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { describe, it } from "node:test";

import { isCodingDirection } from "../../src/firm/code-intent.mjs";
import {
  applyCodingWorkspace,
  codingWorkspaceEnvironment,
  discardCodingWorkspace,
  openCodingWorkspace,
  recoverInterruptedCodingWorkspaces,
  revertCodingWorkspaceApply,
  reviewCodingWorkspace,
  restoreCodingWorkspaceCheckpoint,
  settleCodingWorkspace,
  updateCodingSession,
} from "../../src/firm/code-workspace.mjs";
import { captureCheckpoint, diffCheckpoints, restoreCheckpoint } from "../../src/native-code/t3-checkpoint-store.mjs";
import { createVenture } from "../../src/firm/venture-store.mjs";
import { getSemanticModel } from "../../src/firm/semantic-model-store.mjs";
import { driveTeammate } from "../../src/firm/work-loop.mjs";
import { buildThreadTimeline } from "../../src/firm/thread-timeline.mjs";

function git(cwd, args) { return execFileSync("git", args, { cwd, encoding: "utf8" }).trim(); }

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-native-code-home-"));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drover-native-code-repo-"));
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repo, ".gitignore"), ".drover-worktrees/\n");
  fs.writeFileSync(path.join(repo, "product.txt"), "base\n");
  git(repo, ["add", "."]); git(repo, ["commit", "-qm", "base"]);
  const options = { root, seedFoundingCrew: false };
  const venture = createVenture({ name: "Native coding", repository: repo }, options);
  return { root, repo, options, venture, cleanup: () => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(repo, { recursive: true, force: true }); } };
}

describe("native coding intent", () => {
  it("opens repository machinery only for implementation directions", () => {
    assert.equal(isCodingDirection("Implement the native coding surface"), true);
    assert.equal(isCodingDirection("Fix the broken apply path"), true);
    assert.equal(isCodingDirection("Review the current apply path"), false);
    assert.equal(isCodingDirection("Research better checkpoint approaches"), false);
  });
});

describe("licensed checkpoint boundary", () => {
  it("captures tracked and untracked work without changing the founder index, then restores it", () => {
    const { repo, cleanup } = fixture();
    const before = git(repo, ["status", "--porcelain"]);
    const baseline = captureCheckpoint({ worktree: repo, ref: "refs/drover/checkpoints/test/baseline", message: "baseline" });
    fs.writeFileSync(path.join(repo, "product.txt"), "changed\n");
    fs.writeFileSync(path.join(repo, "new.txt"), "new\n");
    const changed = captureCheckpoint({ worktree: repo, ref: "refs/drover/checkpoints/test/changed", message: "changed" });
    assert.match(diffCheckpoints({ worktree: repo, fromRef: baseline.ref, toRef: changed.ref }), /new\.txt/);
    assert.equal(git(repo, ["diff", "--cached", "--name-only"]), "", "temporary checkpoint index never stages founder files");
    restoreCheckpoint({ worktree: repo, ref: baseline.ref });
    assert.equal(fs.readFileSync(path.join(repo, "product.txt"), "utf8"), "base\n");
    assert.equal(fs.existsSync(path.join(repo, "new.txt")), false);
    assert.equal(before, "");
    cleanup();
  });
});

describe("Run-linked coding workspace", () => {
  it("drives a provider inside the worktree and projects exact work beside the durable thread", async () => {
    const { repo, options, venture, cleanup } = fixture();
    const runtime = {
      id: "codex", label: "Codex", supportsAbort: true,
      async drive(ctx) {
        assert.match(ctx.cwd, /\.drover-worktrees\/code-/);
        ctx.onRuntimeSession("provider-session-1");
        fs.writeFileSync(path.join(ctx.cwd, "product.txt"), "implemented in Drover\n");
        ctx.onCommand({ command: "npm test", status: "passed", exitCode: 0, completedAt: new Date().toISOString(), output: "passed", verification: true });
        return { kind: "completed", summary: "Implemented and verified." };
      },
    };
    const result = await driveTeammate({
      ventureId: venture.id, teammateRef: "founding-teammate", goal: "Implement the real coding loop",
      initiatedBy: "founder", options, deps: { runtime },
    });
    assert.equal(result.codingWorkspace.status, "reviewable");
    const model = getSemanticModel(venture.id, options);
    assert.deepEqual(model.runs[0].workRefs, [`work:${result.codingWorkspace.id}`]);
    assert.equal(model.runs[0].properties.provider, "codex");
    const threadId = model.runs[0].threadRef.replace(/^thread:/, "");
    const timeline = buildThreadTimeline(venture.id, threadId, options);
    const artifact = timeline.items.find((item) => item.ref === `work:${result.codingWorkspace.id}`);
    assert.equal(artifact.artifact.kind, "native-code");
    assert.match(artifact.artifact.diff, /implemented in Drover/);
    discardCodingWorkspace(venture.id, result.codingWorkspace.id, options);
    cleanup();
  });

  it("forks the founder's exact dirty source, captures provider proof, and applies only after exact approval", () => {
    const { repo, options, venture, cleanup } = fixture();
    fs.writeFileSync(path.join(repo, "product.txt"), "founder in progress\n");
    const workspace = openCodingWorkspace({
      ventureId: venture.id, runId: "drive-1234567890", threadRef: "thread:direction-one",
      participantRef: "codex", provider: "codex", repository: repo, goal: "Implement proof", workRef: null,
    }, options);
    assert.equal(fs.readFileSync(path.join(workspace.worktree, "product.txt"), "utf8"), "founder in progress\n", "the isolated baseline includes exact founder dirt");
    fs.writeFileSync(path.join(workspace.worktree, "product.txt"), "founder in progress\nimplemented\n");
    fs.writeFileSync(path.join(workspace.worktree, "proof.txt"), "untracked proof\n");
    updateCodingSession(venture.id, workspace.id, { runRef: "run:drive-1234567890", command: { command: "npm test", status: "passed", exitCode: 0, completedAt: new Date().toISOString(), output: "ok", verification: true } }, options);
    const settled = settleCodingWorkspace(venture.id, workspace.id, { runRef: "run:drive-1234567890", outcome: { kind: "completed" } }, options);
    assert.equal(settled.status, "reviewable");
    assert.match(settled.diff, /implemented/);
    assert.match(settled.diff, /proof\.txt/);
    assert.equal(fs.readFileSync(path.join(repo, "product.txt"), "utf8"), "founder in progress\n", "provider work never touches the source checkout");
    assert.ok(getSemanticModel(venture.id, options).objects.some((entry) => entry.id === `capability-${workspace.id}`), "the implementation creates a tentative, source-bearing Product consequence");
    assert.deepEqual(settled.productConsequence.claims.map((claim) => claim.status), ["supported-by-implementation", "unsupported", "stale-not-identified"]);

    reviewCodingWorkspace(venture.id, workspace.id, "approve", "Exact patch reviewed", options);
    const applied = applyCodingWorkspace(venture.id, workspace.id, options);
    assert.equal(applied.status, "applied");
    assert.equal(fs.readFileSync(path.join(repo, "product.txt"), "utf8"), "founder in progress\nimplemented\n");
    assert.equal(fs.readFileSync(path.join(repo, "proof.txt"), "utf8"), "untracked proof\n");
    const reverted = revertCodingWorkspaceApply(venture.id, workspace.id, options);
    assert.equal(reverted.status, "reviewable");
    assert.equal(fs.readFileSync(path.join(repo, "product.txt"), "utf8"), "founder in progress\n");
    assert.equal(fs.existsSync(path.join(repo, "proof.txt")), false);
    const restored = restoreCodingWorkspaceCheckpoint(venture.id, workspace.id, "baseline", options);
    assert.equal(restored.status, "no-change");
    assert.equal(restored.consequence, null, "restoring repository state invalidates prior review");
    assert.equal(restored.checkpoints.at(-1).restoredFrom, "baseline");
    discardCodingWorkspace(venture.id, workspace.id, options);
    cleanup();
  });

  it("preserves an apply receipt when the isolated workspace is later discarded", () => {
    const { repo, options, venture, cleanup } = fixture();
    options.nativeCodingHostVerification = false;
    const workspace = openCodingWorkspace({
      ventureId: venture.id, runId: "drive-apply-audit", threadRef: "thread:direction-apply-audit",
      participantRef: "codex", provider: "codex", repository: repo, goal: "Implement audited proof", workRef: null,
    }, options);
    fs.writeFileSync(path.join(workspace.worktree, "product.txt"), "audited implementation\n");
    updateCodingSession(venture.id, workspace.id, { runRef: "run:drive-apply-audit", command: { command: "npm test", status: "passed", exitCode: 0, completedAt: new Date().toISOString(), output: "ok", verification: true } }, options);
    settleCodingWorkspace(venture.id, workspace.id, { runRef: "run:drive-apply-audit", outcome: { kind: "completed" } }, options);
    reviewCodingWorkspace(venture.id, workspace.id, "approve", "Exact patch reviewed", options);
    applyCodingWorkspace(venture.id, workspace.id, options);

    const discarded = discardCodingWorkspace(venture.id, workspace.id, options);
    assert.equal(discarded.consequence.action, "discarded");
    assert.equal(discarded.decisions.at(-1)?.action, "applied", "workspace cleanup must not erase the source-apply receipt");
    assert.equal(fs.readFileSync(path.join(repo, "product.txt"), "utf8"), "audited implementation\n");
    assert.equal(git(repo, ["for-each-ref", "--format=%(refname)", `refs/drover/checkpoints/${workspace.id}`]), "", "discard removes recoverable checkpoint refs");
    cleanup();
  });

  it("blocks provider commits through the workspace environment", () => {
    const { repo, options, venture, cleanup } = fixture();
    const workspace = openCodingWorkspace({
      ventureId: venture.id, runId: "drive-guard", threadRef: "thread:direction-guard",
      participantRef: "claude", provider: "claude-code", repository: repo, goal: "Implement guard",
    }, options);
    fs.writeFileSync(path.join(workspace.worktree, "guard.txt"), "guarded\n");
    git(workspace.worktree, ["add", "guard.txt"]);
    const attempt = spawnSync("git", ["commit", "-m", "provider must not commit"], { cwd: workspace.worktree, env: codingWorkspaceEnvironment(workspace), encoding: "utf8" });
    assert.notEqual(attempt.status, 0);
    assert.match(attempt.stderr, /founder-held consequences/);
    const nested = fs.mkdtempSync(path.join(os.tmpdir(), "drover-guard-nested-"));
    git(nested, ["init", "-q"]); git(nested, ["config", "user.email", "test@example.com"]); git(nested, ["config", "user.name", "Test"]);
    fs.writeFileSync(path.join(nested, "allowed.txt"), "fixture\n"); git(nested, ["add", "."]);
    const nestedCommit = spawnSync("git", ["commit", "-m", "fixture commit"], { cwd: nested, env: codingWorkspaceEnvironment(workspace), encoding: "utf8" });
    assert.equal(nestedCommit.status, 0, nestedCommit.stderr);
    fs.rmSync(nested, { recursive: true, force: true });
    discardCodingWorkspace(venture.id, workspace.id, options);
    cleanup();
  });

  it("recovers an interrupted process honestly and preserves distinct attempts", () => {
    const { repo, options, venture, cleanup } = fixture();
    const first = openCodingWorkspace({
      ventureId: venture.id, runId: "drive-first", threadRef: "thread:one", participantRef: "codex",
      provider: "codex", repository: repo, goal: "Implement recovery",
    }, options);
    fs.writeFileSync(path.join(first.worktree, "recovery.txt"), "survived\n");
    const [recovered] = recoverInterruptedCodingWorkspaces(options);
    assert.equal(recovered.id, first.id);
    assert.equal(recovered.status, "interrupted");
    assert.match(recovered.diff, /survived/);

    reviewCodingWorkspace(venture.id, first.id, "approve", "Recovered patch reviewed", options);

    const resumed = openCodingWorkspace({
      ventureId: venture.id, runId: "drive-resume", threadRef: "thread:one", participantRef: "codex",
      provider: "codex", repository: repo, goal: "Continue the implementation",
    }, options);
    assert.equal(resumed.id, first.id);
    assert.deepEqual(resumed.runRefs, ["run:drive-first", "run:drive-resume"]);
    assert.equal(resumed.consequence, null, "a new provider revision cannot inherit approval of the prior checkpoint");

    const alternative = openCodingWorkspace({
      ventureId: venture.id, runId: "drive-alternative", threadRef: "thread:one", participantRef: "claude",
      provider: "claude-code", repository: repo, goal: "Try another implementation approach",
    }, options);
    assert.notEqual(alternative.id, first.id);
    discardCodingWorkspace(venture.id, alternative.id, options);
    discardCodingWorkspace(venture.id, first.id, options);
    cleanup();
  });
});
