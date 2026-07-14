// product-change.test.mjs — F4 acceptance: fork is a worktree. One bet carries a real code diff
// from fork → isolated worktree → retained diff at the wall → founder apply onto the source repo →
// receipt on the bet. Sandbox violations still fail exactly as feature-builder.test.mjs proves;
// nothing is committed by this contract or by a builder running inside it.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

import {
  forkProductBet,
  listBetProductChanges,
  stageProductBetForReview,
  getWorkspace,
} from "../../src/firm/product-change.mjs";
import {
  reviewProductBetChange,
  inspectProductBetChangeReadiness,
  applyProductBetChange,
  revertProductBetChange,
  discardProductBetChange,
} from "../../src/firm/product-change-decide.mjs";
import { createVenture } from "../../src/firm/venture-store.mjs";
import { createBet } from "../../src/firm/bet.mjs";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

// A real git repo, standing in for the founder's product repository — the thing this contract must
// never dirty except through an explicit, founder-applied patch.
function fixtureRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "firm-product-change-repo-"));
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repo, "a.txt"), "before\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "base"]);
  return repo;
}

function freshQueueDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "firm-product-change-queue-"));
}

// A recording double for the wall's park() — this suite never imports or touches F3's wall.mjs,
// which may not exist yet while it's built in parallel.
function spyPark() {
  const calls = [];
  const park = async (effect, options) => {
    calls.push({ effect, options });
    return { parked: true };
  };
  park.calls = calls;
  return park;
}

describe("product-change — fork cuts an isolated worktree keyed to the bet", () => {
  it("one bet carries a real diff from fork through an isolated worktree to ready-for-review", async () => {
    const repo = fixtureRepo();
    const queueDir = freshQueueDir();
    const options = { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-product-change-home-")), repoRoot: repo, queueDir };
    const venture = createVenture({ name: "Fork is a worktree" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "add a feature to a.txt" });

    const enqueued = forkProductBet({ ventureId: venture.id, betId: bet.id, intent: bet.intent }, {
      ...options,
      runQuery: async ({ cwd }) => {
        fs.writeFileSync(path.join(cwd, "a.txt"), "after\n");
        return { text: "Changed a.txt as requested.", error: null };
      },
    });
    assert.equal(enqueued.status, "queued");
    const built = await enqueued.build;
    assert.equal(built.status, "ready-for-review");
    assert.match(built.branch, /^dogfood\//);

    // Founder dirt is untouched throughout — the source repo's working file is still the base version.
    assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "before\n");

    const visible = listBetProductChanges(venture.id, bet.id, options);
    assert.equal(visible.length, 1);
    assert.equal(visible[0].status, "ready-for-review");
    assert.match(visible[0].diff, /-before/);
    assert.match(visible[0].diff, /\+after/);

    fs.rmSync(options.root, { recursive: true, force: true });
  });

  it("the bet's queue items never bleed into another venture or bet's list", async () => {
    const repo = fixtureRepo();
    const queueDir = freshQueueDir();
    const options = { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-product-change-home-")), repoRoot: repo, queueDir };
    const venture = createVenture({ name: "Isolation" }, options);
    const betA = createBet({ ventureId: venture.id, intent: "change A" });
    const betB = createBet({ ventureId: venture.id, intent: "change B" });

    const enqueuedA = forkProductBet({ ventureId: venture.id, betId: betA.id, intent: betA.intent }, {
      ...options, runQuery: async ({ cwd }) => { fs.writeFileSync(path.join(cwd, "a.txt"), "from A\n"); return { text: "A", error: null }; },
    });
    await enqueuedA.build;

    assert.equal(listBetProductChanges(venture.id, betA.id, options).length, 1);
    assert.equal(listBetProductChanges(venture.id, betB.id, options).length, 0);
    assert.equal(listBetProductChanges("some-other-venture", betA.id, options).length, 0);

    fs.rmSync(options.root, { recursive: true, force: true });
  });
});

describe("product-change — sandbox violations still fail exactly as the current contract proves", () => {
  it("a builder that attempts to commit is defensively uncommitted and stays ready-for-review", async () => {
    const repo = fixtureRepo();
    const queueDir = freshQueueDir();
    const options = { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-product-change-home-")), repoRoot: repo, queueDir };
    const venture = createVenture({ name: "Commit violation" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "try to commit" });

    const enqueued = forkProductBet({ ventureId: venture.id, betId: bet.id, intent: bet.intent }, {
      ...options,
      runQuery: async ({ cwd }) => {
        fs.writeFileSync(path.join(cwd, "generated.txt"), "review me\n");
        git(cwd, ["add", "generated.txt"]);
        git(cwd, ["-c", "user.name=violator", "-c", "user.email=violator@example.com", "commit", "-m", "must be undone"]);
        return { text: "claimed done", error: null };
      },
    });
    const built = await enqueued.build;
    assert.equal(built.status, "ready-for-review");
    assert.equal(built.commits, 0);
    assert.equal(fs.existsSync(path.join(repo, "generated.txt")), false, "founder dirt untouched");
    assert.equal(git(built.worktree, ["rev-list", "--count", `${git(repo, ["rev-parse", "HEAD"])}..HEAD`]), "0");

    fs.rmSync(options.root, { recursive: true, force: true });
  });

  it("a symlinked worktree root cannot redirect the change outside the repository", async () => {
    const repo = fixtureRepo();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "firm-product-change-outside-"));
    fs.symlinkSync(outside, path.join(repo, ".dogfood-worktrees"));
    const queueDir = freshQueueDir();
    const options = { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-product-change-home-")), repoRoot: repo, queueDir };
    const venture = createVenture({ name: "Symlink escape" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "escape the sandbox" });

    const enqueued = forkProductBet({ ventureId: venture.id, betId: bet.id, intent: bet.intent }, {
      ...options, runQuery: async () => ({ text: "never runs", error: null }),
    });
    const built = await enqueued.build;
    assert.equal(built.status, "failed");
    assert.match(built.error, /resolves outside/);
    assert.deepEqual(fs.readdirSync(outside), []);

    fs.rmSync(options.root, { recursive: true, force: true });
  });
});

describe("product-change — ready-for-review stages onto the bet and parks at the wall", () => {
  it("staging attaches a diff+patchHash artifact to bet.staged[] and calls the injected park exactly once", async () => {
    const repo = fixtureRepo();
    const queueDir = freshQueueDir();
    const options = { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-product-change-home-")), repoRoot: repo, queueDir };
    const venture = createVenture({ name: "Stage and park" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "stage me" });

    const enqueued = forkProductBet({ ventureId: venture.id, betId: bet.id, intent: bet.intent }, {
      ...options, runQuery: async ({ cwd }) => { fs.writeFileSync(path.join(cwd, "a.txt"), "after\n"); return { text: "done", error: null }; },
    });
    const built = await enqueued.build;
    const file = path.basename(built.file);

    const park = spyPark();
    const { bet: staged, workspaceId, revision } = await stageProductBetForReview(bet, file, options, { park });

    assert.equal(park.calls.length, 1);
    assert.equal(park.calls[0].effect.ventureId, venture.id);
    assert.equal(park.calls[0].effect.betId, bet.id);
    assert.match(park.calls[0].effect.effect.diff, /\+after/);
    assert.ok(park.calls[0].effect.effect.patchHash);

    assert.equal(staged.staged.length, 1);
    assert.equal(staged.staged[0].kind, "product-change");
    assert.match(staged.staged[0].diff, /\+after/);
    assert.ok(staged.staged[0].patchHash);
    assert.equal(revision.status, "proposed");
    assert.equal(getWorkspace(workspaceId, options).revisions.length, 1);

    // Staging the same ready diff again is idempotent — no duplicate wall park, no duplicate staged entry.
    const second = await stageProductBetForReview(staged, file, options, { park });
    assert.equal(park.calls.length, 1, "an already-staged diff does not park again");
    assert.equal(second.bet.staged.length, 1, "an already-staged diff is not duplicated on the bet");

    fs.rmSync(options.root, { recursive: true, force: true });
  });

  it("stageProductBetForReview never imports wall.mjs eagerly — a double is all a caller needs", async () => {
    const src = fs.readFileSync(new URL("../../src/firm/product-change.mjs", import.meta.url), "utf8");
    assert.ok(!/^import[^\n]*wall\.mjs/m.test(src), "product-change.mjs must not statically import ./wall.mjs (F3 lands it in parallel)");
    assert.match(src, /await import\(["']\.\/wall\.mjs["']\)/, "the default park must reach wall.mjs only through a lazy call-time import");
  });
});

describe("product-change — wall decide → apply is founder-gated exactly as today", () => {
  async function stagedFixture() {
    const repo = fixtureRepo();
    const queueDir = freshQueueDir();
    const options = { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-product-change-home-")), repoRoot: repo, queueDir };
    const venture = createVenture({ name: "Apply gating" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "apply me" });
    const enqueued = forkProductBet({ ventureId: venture.id, betId: bet.id, intent: bet.intent }, {
      ...options, runQuery: async ({ cwd }) => { fs.writeFileSync(path.join(cwd, "a.txt"), "after\n"); return { text: "done", error: null }; },
    });
    const built = await enqueued.build;
    const file = path.basename(built.file);
    const { workspaceId, revision } = await stageProductBetForReview(bet, file, options, { park: spyPark() });
    return { repo, options, venture, bet, workspaceId, revisionId: revision.id, file };
  }

  it("review, apply, and discard all reject a non-founder actor", async () => {
    const { workspaceId, revisionId, options, venture, bet, file } = await stagedFixture();
    assert.throws(() => reviewProductBetChange(workspaceId, revisionId, "agent", { decision: "approve" }, options), /founder-only/);
    assert.throws(() => reviewProductBetChange(workspaceId, revisionId, { kind: "model" }, { decision: "approve" }, options), /founder-only/);
    assert.throws(() => applyProductBetChange(workspaceId, revisionId, "agent", { confirm: true }, options), /founder-only/);
    assert.throws(() => discardProductBetChange(venture.id, bet.id, file, "agent", { confirm: true }, options), /founder-only/);
    fs.rmSync(options.root, { recursive: true, force: true });
  });

  it("apply requires explicit confirm even for the founder", async () => {
    const { workspaceId, revisionId, options } = await stagedFixture();
    reviewProductBetChange(workspaceId, revisionId, "founder", { decision: "approve" }, options);
    assert.throws(() => applyProductBetChange(workspaceId, revisionId, "founder", {}, options), /explicit confirmation/);
    fs.rmSync(options.root, { recursive: true, force: true });
  });

  it("the founder can review, confirm apply readiness, and apply onto the source repo — a receipt lands on the workspace", async () => {
    const { repo, options, workspaceId, revisionId } = await stagedFixture();
    reviewProductBetChange(workspaceId, revisionId, "founder", { decision: "approve" }, options);
    const readiness = inspectProductBetChangeReadiness(workspaceId, revisionId, options);
    assert.equal(readiness.ready, true, JSON.stringify(readiness));

    const applied = applyProductBetChange(workspaceId, revisionId, "founder", { confirm: true }, options);
    assert.equal(applied.status, "applied");
    assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "after\n", "the founder-applied patch lands on the real source repo");

    const workspace = getWorkspace(workspaceId, options);
    assert.equal(workspace.decisions.some((d) => d.type === "product_change_apply"), true, "an apply receipt is recorded on the workspace");
    assert.equal(workspace.decisions.some((d) => d.type === "product_change_review"), true, "a review receipt is recorded on the workspace");

    fs.rmSync(options.root, { recursive: true, force: true });
  });

  it("an applied change can be reverted by the founder, with confirm required", async () => {
    const { repo, options, workspaceId, revisionId } = await stagedFixture();
    reviewProductBetChange(workspaceId, revisionId, "founder", { decision: "approve" }, options);
    applyProductBetChange(workspaceId, revisionId, "founder", { confirm: true }, options);

    assert.throws(() => revertProductBetChange(workspaceId, revisionId, "founder", {}, options), /explicit confirmation/);
    const reverted = revertProductBetChange(workspaceId, revisionId, "founder", { confirm: true }, options);
    assert.equal(reverted.status, "reverted");
    assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "before\n");

    fs.rmSync(options.root, { recursive: true, force: true });
  });

  it("discard requires founder confirmation and removes only the namespaced isolated work", async () => {
    const { venture, bet, file, options } = await stagedFixture();
    assert.throws(() => discardProductBetChange(venture.id, bet.id, file, "founder", {}, options), /explicit confirmation/);
    const result = discardProductBetChange(venture.id, bet.id, file, "founder", { confirm: true }, options);
    assert.equal(result.status, "discarded");
    assert.equal(listBetProductChanges(venture.id, bet.id, options).length, 0);
    fs.rmSync(options.root, { recursive: true, force: true });
  });
});
