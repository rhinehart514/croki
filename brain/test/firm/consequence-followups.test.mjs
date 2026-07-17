// consequence-followups.test.mjs — the three consequence-robustness follow-ups closed:
//   1. preAuthorizedGrantId can no longer be forged onto parker-controlled effect content — park() strips it
//      and only its own host-side parameter stamps the marker on the ITEM.
//   2. A product-change apply failure returns { ok:false, executionError } (like message/deploy) so decide()
//      persists the failure onto the still-queued wall item instead of the throw bypassing that path.
//   3. A crash mid-apply that leaves a revision stuck 'applying' can be recovered by the founder and retried.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { founderRequest } from "../helpers/founder-capability.mjs";

import { park, queue, decide } from "../../src/firm/wall.mjs";
import { createEffectExecutor, decideWithExecution } from "../../src/firm/effect-executors.mjs";
import { createVenture } from "../../src/firm/venture-store.mjs";
import { createBet } from "../../src/firm/bet.mjs";
import { forkProductBet, stageProductBetForReview } from "../../src/firm/product-change.mjs";
import {
  reviewProductBetChange,
  applyProductBetChange,
  resetStuckProductBetChange,
} from "../../src/firm/product-change-decide.mjs";
import { getWorkspace, updateRevision } from "../../src/firm/product-change-workspace.mjs";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "firm-consequence-repo-"));
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repo, "a.txt"), "before\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "base"]);
  return repo;
}

describe("follow-up 1 — preAuthorizedGrantId cannot be forged onto effect content", () => {
  it("park() strips a parker-supplied preAuthorizedGrantId from the effect; only its own host param stamps the item field", () => {
    const options = { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-consequence-strip-")) };
    const venture = createVenture({ name: "strip forged marker" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "outreach", teammateRef: "sable" });

    // A model/teammate stuffs a grant id into the effect it controls, trying to display its own act as
    // founder-blessed. park() strips it — it is an authorization claim, and the parker is never the founder.
    const forged = park({
      ventureId: venture.id, betId: bet.id, purpose: "release",
      effect: { kind: "message", channel: "gmail", to: "x@acme.com", preAuthorizedGrantId: "grant-forged" },
    }, options);
    assert.equal(forged.effect.preAuthorizedGrantId, undefined, "the forged marker is stripped off the effect");
    assert.equal(forged.preAuthorizedGrantId, null, "no host pre-authorization was stamped");

    // The genuine host path (grant-stage-outward) sets it through park()'s own parameter — on the ITEM.
    const blessed = park({
      ventureId: venture.id, betId: bet.id, purpose: "release", blocksBet: false,
      preAuthorizedGrantId: "grant-real",
      effect: { kind: "message", channel: "gmail", to: "y@acme.com" },
    }, options);
    assert.equal(blessed.preAuthorizedGrantId, "grant-real", "the host param stamps the item field");
    assert.equal(blessed.effect.preAuthorizedGrantId, undefined, "never on parker-controlled effect content");
  });
});

describe("follow-up 2 — a product-change apply failure returns { ok:false } and is persisted", () => {
  it("a failed apply keeps the wall item queued with lastExecutionError instead of throwing past the persist path", async () => {
    const repo = fixtureRepo();
    const queueDir = fs.mkdtempSync(path.join(os.tmpdir(), "firm-consequence-queue-"));
    const options = { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-consequence-home-")), repoRoot: repo, queueDir };
    const venture = createVenture({ name: "apply failure is persisted" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "change a.txt" });

    const enqueued = forkProductBet({ ventureId: venture.id, betId: bet.id, intent: bet.intent }, {
      ...options,
      runQuery: async ({ cwd }) => { fs.writeFileSync(path.join(cwd, "a.txt"), "after\n"); return { text: "done", error: null }; },
    });
    await enqueued.build;
    const { workspaceId, revision } = await stageProductBetForReview(bet, path.basename(enqueued.file), options, { park });
    const parked = queue(venture.id, options).find((item) => item.effect?.kind === "product-change");
    reviewProductBetChange(workspaceId, revision.id, "founder", { decision: "approve" }, options);

    // Dirty the SOURCE repo so the apply readiness check fails — apply throws inside applyProductBetChange,
    // which executeProductChange must now normalize to { ok:false } rather than letting the throw escape.
    fs.writeFileSync(path.join(repo, "a.txt"), "founder edited this\n");

    const release = () => decideWithExecution(
      decide,
      { ventureId: venture.id, itemId: parked.id, decision: "release" },
      { req: founderRequest(), actor: "founder" },
      { isFounderPresent: () => true },
      options,
    );
    // decide() surfaces the failure the same way message/deploy failures surface — a 502, never a fake success.
    assert.throws(release, (error) => error.code === "wall_release_execution_failed");

    // The item stays queued and carries the durable failure — the founder can retry, exactly like a failed send.
    const stillQueued = queue(venture.id, options).find((item) => item.id === parked.id);
    assert.ok(stillQueued, "the item stays in the founder's queue after a failed apply");
    assert.equal(stillQueued.decision, null, "the failed apply never consumed the decision");
    assert.ok(stillQueued.lastExecutionError, "the failure is persisted on the item for a retry");

    // And the source repo carries only the founder's own edit — nothing from the failed apply landed.
    assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "founder edited this\n");
    fs.rmSync(options.root, { recursive: true, force: true });
  });
});

describe("follow-up 3 — a stuck 'applying' revision can be recovered by the founder", () => {
  it("recovers a stuck applying revision back to approved and lets the release be retried", async () => {
    const repo = fixtureRepo();
    const queueDir = fs.mkdtempSync(path.join(os.tmpdir(), "firm-consequence-stuck-queue-"));
    const options = { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-consequence-stuck-home-")), repoRoot: repo, queueDir };
    const venture = createVenture({ name: "stuck applying recovery" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "change a.txt" });

    const enqueued = forkProductBet({ ventureId: venture.id, betId: bet.id, intent: bet.intent }, {
      ...options,
      runQuery: async ({ cwd }) => { fs.writeFileSync(path.join(cwd, "a.txt"), "after\n"); return { text: "done", error: null }; },
    });
    await enqueued.build;
    const { workspaceId, revision } = await stageProductBetForReview(bet, path.basename(enqueued.file), options, { park });
    reviewProductBetChange(workspaceId, revision.id, "founder", { decision: "approve" }, options);

    // Simulate a crash mid-apply: the 'applying' flip persisted, then the process died before the terminal
    // write — durable state is stuck 'applying' forever.
    updateRevision(workspaceId, revision.id, (current) => ({ ...current, status: "applying", applyStartedAt: new Date().toISOString() }), options);
    const stuck = getWorkspace(workspaceId, options).revisions.find((r) => r.id === revision.id);
    assert.equal(stuck.status, "applying", "the revision is stuck applying");

    // A non-founder cannot recover it (same boundary as every other decision here).
    assert.throws(() => resetStuckProductBetChange(workspaceId, revision.id, "teammate", { confirm: true }, options), /founder-only/i);

    // The founder recovers it explicitly — rewound to approved, never self-approving anything unreviewed.
    const recovered = resetStuckProductBetChange(workspaceId, revision.id, "founder", { confirm: true }, options);
    assert.equal(recovered.status, "approved", "recovery rewinds the stuck applying flip to approved");

    // A revision that is not stuck refuses recovery — this is not a general status override.
    assert.throws(() => resetStuckProductBetChange(workspaceId, revision.id, "founder", { confirm: true }, options), (e) => e.code === "product_change_not_stuck");

    // The recovered revision can now be applied for real (source repo is clean).
    const applied = applyProductBetChange(workspaceId, revision.id, "founder", { confirm: true }, options);
    assert.equal(applied.status, "applied", "the retry lands after recovery");
    assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "after\n");
    fs.rmSync(options.root, { recursive: true, force: true });
  });

  it("the approved-only gate directly re-attempts a stuck applying revision without an explicit reset", async () => {
    const repo = fixtureRepo();
    const queueDir = fs.mkdtempSync(path.join(os.tmpdir(), "firm-consequence-reattempt-queue-"));
    const options = { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-consequence-reattempt-home-")), repoRoot: repo, queueDir };
    const venture = createVenture({ name: "stuck applying re-attempt" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "change a.txt" });

    const enqueued = forkProductBet({ ventureId: venture.id, betId: bet.id, intent: bet.intent }, {
      ...options,
      runQuery: async ({ cwd }) => { fs.writeFileSync(path.join(cwd, "a.txt"), "after\n"); return { text: "done", error: null }; },
    });
    await enqueued.build;
    const { workspaceId, revision } = await stageProductBetForReview(bet, path.basename(enqueued.file), options, { park });
    reviewProductBetChange(workspaceId, revision.id, "founder", { decision: "approve" }, options);
    updateRevision(workspaceId, revision.id, (current) => ({ ...current, status: "applying", applyStartedAt: new Date().toISOString() }), options);

    // applyProductBetChange tolerates 'applying' as a genuinely-approved re-attempt (it can only be reached
    // from an already-approved revision), so the retry lands rather than being refused forever.
    const applied = applyProductBetChange(workspaceId, revision.id, "founder", { confirm: true }, options);
    assert.equal(applied.status, "applied", "a stuck applying revision re-attempts and lands");
    fs.rmSync(options.root, { recursive: true, force: true });
  });
});
