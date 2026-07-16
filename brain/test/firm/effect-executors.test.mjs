// effect-executors.test.mjs — the real executeEffect wired end to end through the actual wall.mjs
// (no doubles for decide/park/queue): a bet forks a real product-change worktree, stages it for
// review, the founder reviews+approves the revision (act #1), then releases the wall item through
// wall.decide() with createEffectExecutor's real dispatcher wired in (act #2) — and the patch
// actually lands on the source repo. Also proves the unreleased-effect guard and the message/send
// refusal.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { founderRequest } from "../helpers/founder-capability.mjs";

import { createEffectExecutor, decideWithExecution } from "../../src/firm/effect-executors.mjs";
import { park, queue, decide, hasWallRelease } from "../../src/firm/wall.mjs";
import { createVenture } from "../../src/firm/venture-store.mjs";
import { createBet } from "../../src/firm/bet.mjs";
import { forkProductBet, stageProductBetForReview, getWorkspace } from "../../src/firm/product-change.mjs";
import { reviewProductBetChange } from "../../src/firm/product-change-decide.mjs";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "firm-effect-exec-repo-"));
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repo, "a.txt"), "before\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "base"]);
  return repo;
}

describe("effect-executors — the unreleased-effect guard holds even with a real workspaceId/revisionId", () => {
  it("refuses to apply an effect that never carried the wall's release capability", () => {
    const executeEffect = createEffectExecutor({ founderActor: "founder", options: {} });
    assert.throws(
      () => executeEffect({ kind: "product-change", workspaceId: "w1", revisionId: "r1" }, {}),
      /release capability/,
    );
  });

  it("message/send effects refuse politely rather than pretending to send", () => {
    const executeEffect = createEffectExecutor({ founderActor: "founder", options: {} });
    const released = { kind: "message", runtime: { outwardRelease: Symbol("not-the-real-one") } };
    assert.throws(() => executeEffect(released, {}), /release capability/);
  });

  it("an unrecognized effect kind refuses rather than guessing", () => {
    const executeEffect = createEffectExecutor({ founderActor: "founder", options: {} });
    assert.throws(() => executeEffect({ kind: "something-nobody-wired" }, {}), /No executor is wired/);
  });
});

describe("effect-executors — end to end: fork -> stage -> review -> release -> real apply", () => {
  it("one bet's product change lands on the real source repo only after review AND a founder release", async () => {
    const repo = fixtureRepo();
    const queueDir = fs.mkdtempSync(path.join(os.tmpdir(), "firm-effect-exec-queue-"));
    const options = { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-effect-exec-home-")), repoRoot: repo, queueDir };
    const venture = createVenture({ name: "Effect executor integration" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "wire the real executor" });

    // Fork: a real isolated worktree, a real diff.
    const enqueued = forkProductBet({ ventureId: venture.id, betId: bet.id, intent: bet.intent }, {
      ...options,
      runQuery: async ({ cwd }) => { fs.writeFileSync(path.join(cwd, "a.txt"), "after\n"); return { text: "done", error: null }; },
    });
    const built = await enqueued.build;
    assert.equal(built.status, "ready-for-review");

    // Stage: attach to bet.staged[] and park at the REAL wall (no double for park).
    const { workspaceId, revision } = await stageProductBetForReview(bet, path.basename(built.file), options, { park });
    const parked = queue(venture.id, options).find((item) => item.effect?.kind === "product-change");
    assert.ok(parked, "the product-change effect really parked at the wall queue");
    assert.equal(parked.effect.workspaceId, workspaceId);
    assert.equal(parked.effect.revisionId, revision.id);
    assert.match(parked.effect.diff, /\+after/);

    // A release BEFORE the founder has reviewed/approved the revision must fail — this is act #1
    // genuinely gating act #2, without any change to wall.mjs's decision enum.
    //
    // isFounderPresent is injected true directly rather than routed through presence.mjs's real
    // markPresent() lease — that lease is a process-wide singleton across every test FILE `node --test`
    // loads into one process, and this test's several `await` points give another file's own
    // __resetPresence()/markPresent() calls a real window to race it (the exact shape that produced an
    // intermittent wall_release_while_away flake elsewhere). decide()'s own isFounderPresent dep
    // (wall.mjs:156) exists exactly so a caller can assert presence deterministically instead.
    const prematureRelease = () => decideWithExecution(
      decide,
      { ventureId: venture.id, itemId: parked.id, decision: "release" },
      { req: founderRequest(), actor: "founder" },
      { isFounderPresent: () => true },
      options,
    );
    assert.throws(prematureRelease, /not approved/i);

    // Founder act #1: review + approve the staged revision.
    const reviewed = reviewProductBetChange(workspaceId, revision.id, "founder", { decision: "approve" }, options);
    assert.equal(reviewed.status, "approved");

    // Founder act #2: release the wall item — the real executor applies the patch.
    const receipt = decideWithExecution(
      decide,
      { ventureId: venture.id, itemId: parked.id, decision: "release" },
      { req: founderRequest(), actor: "founder" },
      { isFounderPresent: () => true },
      options,
    );
    assert.equal(receipt.decision, "release");
    assert.ok(receipt.releasedAt);
    assert.equal(receipt.executionResult.status, "applied");
    assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "after\n", "the founder-released patch actually lands on the real source repo");

    // The item is no longer in the live queue (decided items fall out); the workspace carries the
    // apply receipt.
    assert.equal(queue(venture.id, options).some((item) => item.id === parked.id), false);
    const workspace = getWorkspace(workspaceId, options);
    assert.ok(workspace.decisions.some((d) => d.type === "product_change_apply"));

    fs.rmSync(options.root, { recursive: true, force: true });
  });

  it("a plain agent/model effect can never carry hasWallRelease — only decide()'s own mint satisfies it", () => {
    assert.equal(hasWallRelease({ runtime: { outwardRelease: "founder" } }), false);
    assert.equal(hasWallRelease({}), false);
  });
});
