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
  commitCodingWorkspace,
  discardCodingWorkspace,
  openCodingWorkspace,
  recoverInterruptedCodingWorkspaces,
  revertCodingWorkspaceApply,
  reviewCodingProductConsequence,
  reviewCodingWorkspace,
  settleCodingWorkspace,
  updateCodingSession,
} from "../../src/firm/code-workspace.mjs";
import {
  addCodingReviewComment,
  compareCodingWorkspaceCheckpoints,
  restoreCodingWorkspaceCheckpoint,
} from "../../src/firm/repository-files.mjs";
import { captureCheckpoint, diffCheckpoints, restoreCheckpoint } from "../../src/native-code/t3-checkpoint-store.mjs";
import { createVenture, setVentureDoc } from "../../src/firm/venture-store.mjs";
import { getSemanticModel } from "../../src/firm/semantic-model-store.mjs";
import { driveTeammate } from "../../src/firm/work-loop.mjs";
import { buildThreadTimeline } from "../../src/firm/thread-timeline.mjs";
import { createWorkJournal } from "../../src/firm/work-journal.mjs";
import { applyFirmConfiguration, getFirmConfiguration } from "../../src/firm/configuration.mjs";

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
  it("projects a founder-cancelled coding Run with the canonical terminal word", async () => {
    const { repo, options, venture, cleanup } = fixture();
    const workspace = openCodingWorkspace({
      ventureId: venture.id, runId: "drive-cancelled", threadRef: "thread:cancelled",
      participantRef: "codex", provider: "codex", repository: repo, goal: "Stop this exact attempt",
    }, options);
    const settled = await settleCodingWorkspace(venture.id, workspace.id, {
      runRef: "run:drive-cancelled", outcome: { kind: "cancelled" },
    }, options);
    assert.equal(settled.status, "cancelled");
    assert.equal(settled.providerSessions.at(-1).terminal, "cancelled");
    discardCodingWorkspace(venture.id, workspace.id, options);
    cleanup();
  });

  it("drives a provider inside the worktree and projects exact work beside the durable thread", async () => {
    const { repo, options, venture, cleanup } = fixture();
    const initial = getFirmConfiguration(venture.id, options);
    applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: initial.revision,
      configuration: { ...initial, agents: [{ ref: "product-strategist", name: "Product Strategist", activation: "direct" }] },
      summary: "Configure Product / GTM outside direct Work",
    }, options);
    const runtime = {
      id: "codex", label: "Codex", supportsAbort: true,
      async drive(ctx) {
        assert.match(ctx.cwd, /\.drover-worktrees\/code-/);
        assert.deepEqual(ctx.tools, [], "ordinary repository-backed coding attaches no Croki MCP bridge");
        ctx.onRuntimeSession("provider-session-1");
        fs.writeFileSync(path.join(ctx.cwd, "product.txt"), "implemented in Croki\n");
        ctx.onToolResult({
          toolUseId: "native-edit-product",
          name: "apply_patch",
          target: path.join(ctx.cwd, "product.txt"),
          status: "passed",
          detail: "Updated",
          source: { path: path.join(ctx.cwd, "product.txt") },
        });
        ctx.onCommand({ command: "npm test", status: "passed", exitCode: 0, completedAt: new Date().toISOString(), output: "passed", verification: true });
        return { kind: "completed", summary: "Implemented and verified." };
      },
    };
    const result = await driveTeammate({
      ventureId: venture.id, teammateRef: "founding-teammate", goal: "Implement the real coding loop",
      initiatedBy: "founder", directSdk: true, runtime: "codex", options, deps: { runtime },
    });
    assert.equal(result.codingWorkspace.status, "reviewable");
    const model = getSemanticModel(venture.id, options);
    assert.deepEqual(model.runs[0].workRefs, [`work:${result.codingWorkspace.id}`]);
    assert.equal(model.runs[0].properties.provider, "codex");
    const threadId = model.runs[0].threadRef.replace(/^thread:/, "");
    const timeline = buildThreadTimeline(venture.id, threadId, options);
    const artifact = timeline.items.find((item) => item.ref === `work:${result.codingWorkspace.id}`);
    assert.equal(artifact.artifact.kind, "native-code");
    assert.match(artifact.artifact.diff, /implemented in Croki/);
    const journalProjection = createWorkJournal(options).readProjections(venture.id);
    const journalRun = journalProjection.runs[0];
    const sourceRefs = journalRun.activity.flatMap((activity) => activity.sourceRefs);
    assert.equal(sourceRefs.length, 1);
    assert.match(sourceRefs[0], /^repository:product\.txt#L1-L2:[0-9a-f]{12}$/);
    assert.deepEqual(artifact.artifact.sourceRefs, sourceRefs, "the exact native source reaches Review");
    assert.equal(JSON.stringify(journalProjection).includes("implemented in Croki"), false, "the journal retains no source body");
    let returnContext;
    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "founding-teammate",
      goal: "Explain the exact implementation we just made",
      initiatedBy: "founder",
      directSdk: true,
      runtime: "codex",
      target: { threadRef: model.runs[0].threadRef },
      options,
      deps: {
        runtime: {
          id: "codex",
          label: "Codex",
          async drive(ctx) {
            returnContext = ctx;
            return { kind: "completed", summary: "The implementation remains grounded." };
          },
        },
      },
    });
    assert.deepEqual(returnContext.tools, []);
    assert.match(returnContext.system, new RegExp(sourceRefs[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "the next task receives the retained source pointer without a Croki read tool");
    assert.deepEqual(journalRun.layerReceipts.map(({ type, status }) => [type, status]), [
      ["provider-settled", "succeeded"],
      ["checkpoint-captured", "succeeded"],
      ["diff-finalized", "succeeded"],
      ["commands-settled", "succeeded"],
      ["verification-settled", "succeeded"],
      ["timeline-settled", "succeeded"],
      ["projection-persisted", "succeeded"],
    ]);
    assert.equal(journalRun.quiescence.status, "ready");
    assert.equal(journalProjection.reviews.find((review) => review.id === result.codingWorkspace.id).ready, true);
    discardCodingWorkspace(venture.id, result.codingWorkspace.id, options);
    cleanup();
  });

  it("forks the founder's exact dirty source, captures provider proof, and applies only after exact approval", async () => {
    const { repo, options, venture, cleanup } = fixture();
    fs.writeFileSync(path.join(repo, "product.txt"), "founder in progress\n");
    const workspace = openCodingWorkspace({
      ventureId: venture.id, runId: "drive-1234567890", threadRef: "thread:direction-one",
      participantRef: "codex", provider: "codex", repository: repo, goal: "Implement proof",
      originMessageRef: "conversation:direction-one", workRef: null,
    }, options);
    assert.equal(fs.readFileSync(path.join(workspace.worktree, "product.txt"), "utf8"), "founder in progress\n", "the isolated baseline includes exact founder dirt");
    fs.writeFileSync(path.join(workspace.worktree, "product.txt"), "founder in progress\nimplemented\n");
    fs.writeFileSync(path.join(workspace.worktree, "proof.txt"), "untracked proof\n");
    updateCodingSession(venture.id, workspace.id, { runRef: "run:drive-1234567890", command: { command: "npm test", status: "passed", exitCode: 0, completedAt: new Date().toISOString(), output: "ok", verification: true } }, options);
    const settled = await settleCodingWorkspace(venture.id, workspace.id, { runRef: "run:drive-1234567890", outcome: { kind: "completed" } }, options);
    assert.equal(settled.status, "reviewable");
    assert.equal(settled.checkpoints.at(-1).runRef, "run:drive-1234567890");
    assert.equal(settled.checkpoints.at(-1).originMessageRef, "conversation:direction-one");
    assert.equal(settled.checkpoints.at(-1).direction, "Implement proof");
    assert.match(settled.diff, /implemented/);
    assert.match(settled.diff, /proof\.txt/);
    assert.equal(fs.readFileSync(path.join(repo, "product.txt"), "utf8"), "founder in progress\n", "provider work never touches the source checkout");
    assert.equal(getSemanticModel(venture.id, options).objects.some((entry) => entry.id === `capability-${workspace.id}`), false, "a provisional interpretation does not silently change Product truth");
    assert.equal(settled.productConsequence, null, "a routine diff does not manufacture Product or market claims");
    assert.deepEqual(settled.changeSummary, {
      requestedOutcome: "Implement proof",
      changedFiles: [{ status: "M", path: "product.txt" }, { status: "A", path: "proof.txt" }],
      verification: [
        { command: "npm test", kind: "provider-command", status: "passed", exitCode: 0, runRef: "run:drive-1234567890" },
        { command: "git diff --check", kind: "host", status: "passed", exitCode: 0, runRef: "run:drive-1234567890" },
      ],
    });
    const comment = addCodingReviewComment(venture.id, workspace.id, {
      checkpointId: settled.checkpoints.at(-1).id,
      path: "product.txt",
      startLine: 2,
      selectedText: "implemented",
      body: "Keep this exact implementation.",
      messageRef: "conversation:correction-one",
    }, options);
    assert.equal(comment.comment.anchor.path, "product.txt");
    assert.equal(comment.comment.anchor.startLine, 2);
    const compared = compareCodingWorkspaceCheckpoints(
      venture.id,
      workspace.id,
      "baseline",
      settled.checkpoints.at(-1).id,
      options,
    );
    assert.equal(compared.to.runRef, "run:drive-1234567890");
    assert.equal(compared.to.originMessageRef, "conversation:direction-one");
    assert.equal(compared.to.direction, "Implement proof");
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
    assert.equal(restored.checkpoints.length, settled.checkpoints.length + 1, "restore appends an audit receipt instead of rewriting checkpoint history");
    assert.equal(restored.checkpoints.at(-1).restoredFrom, "baseline");
    assert.equal(restored.checkpoints.at(-1).restoredBy, "founder");
    discardCodingWorkspace(venture.id, workspace.id, options);
    cleanup();
  });

  it("keeps an explicitly supplied coding interpretation provisional until founder adoption", async () => {
    const { repo, options, venture, cleanup } = fixture();
    const workspace = openCodingWorkspace({
      ventureId: venture.id, runId: "drive-product-review", threadRef: "thread:product-review",
      participantRef: "codex", provider: "codex", repository: repo, goal: "Improve onboarding", workRef: null,
    }, options);
    fs.writeFileSync(path.join(workspace.worktree, "product.txt"), "hello\nreviewable\n");
    updateCodingSession(venture.id, workspace.id, { runRef: "run:drive-product-review", command: { command: "npm test", status: "passed", exitCode: 0, completedAt: new Date().toISOString(), output: "ok", verification: true } }, options);
    const settled = await settleCodingWorkspace(venture.id, workspace.id, { runRef: "run:drive-product-review", outcome: { kind: "completed" } }, options);
    assert.equal(settled.productConsequence, null);
    setVentureDoc(venture.id, "codeWorkspaces", workspace.id, {
      ...settled,
      productConsequence: {
        capability: "Faster first value",
        system: ["product.txt"],
        claims: [{
          status: "source-bearing-proposal",
          statement: "The exact implementation may reduce the first-use delay; user evidence is still required.",
        }],
        releaseQuestion: "Who needs this proof?",
      },
    }, options);
    const revised = reviewCodingProductConsequence(venture.id, workspace.id, {
      decision: "revise", capability: "Faster first value", releaseQuestion: "Who needs this proof?",
    }, { authority: "founder", id: "founder" }, options);
    assert.equal(revised.productConsequence.review.decision, "provisional");
    const rejected = reviewCodingProductConsequence(venture.id, workspace.id, {
      decision: "reject", capability: revised.productConsequence.capability, releaseQuestion: revised.productConsequence.releaseQuestion,
    }, { authority: "founder", id: "founder" }, options);
    assert.equal(rejected.productConsequence.review.decision, "rejected");
    assert.equal(getSemanticModel(venture.id, options).objects.some((entry) => entry.id === `capability-${workspace.id}`), false);
    discardCodingWorkspace(venture.id, workspace.id, options);
    cleanup();
  });

  it("preserves an apply receipt when the isolated workspace is later discarded", async () => {
    const { repo, options, venture, cleanup } = fixture();
    options.nativeCodingHostVerification = false;
    const workspace = openCodingWorkspace({
      ventureId: venture.id, runId: "drive-apply-audit", threadRef: "thread:direction-apply-audit",
      participantRef: "codex", provider: "codex", repository: repo, goal: "Implement audited proof", workRef: null,
    }, options);
    fs.writeFileSync(path.join(workspace.worktree, "product.txt"), "audited implementation\n");
    updateCodingSession(venture.id, workspace.id, { runRef: "run:drive-apply-audit", command: { command: "npm test", status: "passed", exitCode: 0, completedAt: new Date().toISOString(), output: "ok", verification: true } }, options);
    await settleCodingWorkspace(venture.id, workspace.id, { runRef: "run:drive-apply-audit", outcome: { kind: "completed" } }, options);
    reviewCodingWorkspace(venture.id, workspace.id, "approve", "Exact patch reviewed", options);
    applyCodingWorkspace(venture.id, workspace.id, options);

    const discarded = discardCodingWorkspace(venture.id, workspace.id, options);
    assert.equal(discarded.consequence.action, "discarded");
    assert.equal(discarded.decisions.at(-1)?.action, "applied", "workspace cleanup must not erase the source-apply receipt");
    assert.equal(fs.readFileSync(path.join(repo, "product.txt"), "utf8"), "audited implementation\n");
    assert.equal(git(repo, ["for-each-ref", "--format=%(refname)", `refs/drover/checkpoints/${workspace.id}`]), "", "discard removes recoverable checkpoint refs");
    cleanup();
  });

  it("re-derives the product page map when a founder-confirmed apply lands page changes", async () => {
    const { repo, options, venture, cleanup } = fixture();
    options.nativeCodingHostVerification = false;
    const workspace = openCodingWorkspace({
      ventureId: venture.id, runId: "drive-page-map", threadRef: "thread:direction-page-map",
      participantRef: "codex", provider: "codex", repository: repo, goal: "Implement the landing page", workRef: null,
    }, options);
    fs.mkdirSync(path.join(workspace.worktree, "src", "app"), { recursive: true });
    fs.writeFileSync(path.join(workspace.worktree, "src", "app", "page.tsx"), "export default function HomePage() {\n  return <h1>Welcome home</h1>;\n}\n");
    updateCodingSession(venture.id, workspace.id, { runRef: "run:drive-page-map", command: { command: "npm test", status: "passed", exitCode: 0, completedAt: new Date().toISOString(), output: "ok", verification: true } }, options);
    await settleCodingWorkspace(venture.id, workspace.id, { runRef: "run:drive-page-map", outcome: { kind: "completed" } }, options);
    reviewCodingWorkspace(venture.id, workspace.id, "approve", "Exact patch reviewed", options);
    assert.equal(getSemanticModel(venture.id, options).objects.some((object) => object.type === "page"), false, "no page may reach the map before the change lands in source");

    const applied = applyCodingWorkspace(venture.id, workspace.id, options);
    assert.equal(applied.status, "applied");
    const page = getSemanticModel(venture.id, options).objects.find((object) => object.id === "page-home");
    assert.ok(page, "the applied page did not reach the product map");
    assert.equal(page.properties.page.route, "/");
    assert.match(page.properties.page.file, /^src\/app\/page\.tsx$/, "the map must cite the founder's source, not an isolated worktree");
    discardCodingWorkspace(venture.id, workspace.id, options);
    cleanup();
  });

  it("reports a page re-map failure without failing the founder's apply", async () => {
    const { repo, options, venture, cleanup } = fixture();
    options.nativeCodingHostVerification = false;
    const workspace = openCodingWorkspace({
      ventureId: venture.id, runId: "drive-page-map-error", threadRef: "thread:direction-page-map-error",
      participantRef: "codex", provider: "codex", repository: repo, goal: "Implement resilient apply", workRef: null,
    }, options);
    fs.writeFileSync(path.join(workspace.worktree, "product.txt"), "resilient apply\n");
    updateCodingSession(venture.id, workspace.id, { runRef: "run:drive-page-map-error", command: { command: "npm test", status: "passed", exitCode: 0, completedAt: new Date().toISOString(), output: "ok", verification: true } }, options);
    await settleCodingWorkspace(venture.id, workspace.id, { runRef: "run:drive-page-map-error", outcome: { kind: "completed" } }, options);
    reviewCodingWorkspace(venture.id, workspace.id, "approve", "Exact patch reviewed", options);

    options.productPageSync = () => { throw new Error("map derivation exploded"); };
    const applied = applyCodingWorkspace(venture.id, workspace.id, options);
    assert.equal(applied.status, "applied", "a map re-sync failure must never fail the apply");
    assert.equal(fs.readFileSync(path.join(repo, "product.txt"), "utf8"), "resilient apply\n");
    discardCodingWorkspace(venture.id, workspace.id, options);
    cleanup();
  });

  it("blocks provider commits while allowing the explicit founder commit action", async () => {
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
    updateCodingSession(venture.id, workspace.id, { runRef: "run:drive-guard", command: { command: "npm test", status: "passed", exitCode: 0, completedAt: new Date().toISOString(), output: "ok", verification: true } }, options);
    await settleCodingWorkspace(venture.id, workspace.id, { runRef: "run:drive-guard", outcome: { kind: "completed" } }, options);
    reviewCodingWorkspace(venture.id, workspace.id, "approve", "Exact patch reviewed", options);
    const committed = commitCodingWorkspace(venture.id, workspace.id, "founder approved commit", options);
    assert.equal(committed.status, "committed");
    const nested = fs.mkdtempSync(path.join(os.tmpdir(), "drover-guard-nested-"));
    git(nested, ["init", "-q"]); git(nested, ["config", "user.email", "test@example.com"]); git(nested, ["config", "user.name", "Test"]);
    fs.writeFileSync(path.join(nested, "allowed.txt"), "fixture\n"); git(nested, ["add", "."]);
    const nestedCommit = spawnSync("git", ["commit", "-m", "fixture commit"], { cwd: nested, env: codingWorkspaceEnvironment(workspace), encoding: "utf8" });
    assert.equal(nestedCommit.status, 0, nestedCommit.stderr);
    fs.rmSync(nested, { recursive: true, force: true });
    discardCodingWorkspace(venture.id, workspace.id, options);
    cleanup();
  });

  it("recovers an interrupted process honestly and preserves distinct attempts", async () => {
    const { repo, options, venture, cleanup } = fixture();
    const first = openCodingWorkspace({
      ventureId: venture.id, runId: "drive-first", threadRef: "thread:one", participantRef: "codex",
      provider: "codex", repository: repo, goal: "Implement recovery",
    }, options);
    fs.writeFileSync(path.join(first.worktree, "recovery.txt"), "survived\n");
    const [recovered] = await recoverInterruptedCodingWorkspaces(options);
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
