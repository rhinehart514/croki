// wall.test.mjs — F3 acceptance: park/queue/decide, the founder-only release boundary re-targeted from
// experiment-verdict-auth.test.mjs + founder-authority-route-guards.test.mjs, the away-hold ported from
// connectors/gate/default.mjs:150-179, the connector-level refusal ported from
// connectors/execute/http.mjs's hasOutwardRelease check, cross-venture 404 (run-venture-isolation.test.mjs
// FIX 4's pattern), founder-only kill (experiment-verdict-auth.test.mjs), and deploy's second explicit
// authorization (anti-cage.test.mjs:449-551).

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { park, queue, queueAll, decide, hasWallRelease } from "../../src/firm/wall.mjs";
import { createVenture, listVentures, setVentureDoc } from "../../src/firm/venture-store.mjs";
import { createBet } from "../../src/firm/bet.mjs";
import { claimFounderSession, founderBootstrapCode } from "../../src/routes/session-guard.mjs";
import { __resetPresence, __setPresenceClock, markPresent } from "../../src/presence.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-wall-")) };
}

function browserReq() {
  let cookie = null;
  claimFounderSession({ headers: {} }, { setHeader(_name, next) { cookie = next.split(";")[0]; } }, founderBootstrapCode());
  return { headers: { cookie } };
}

function agentReq() {
  const req = browserReq();
  req.headers["x-gtm-actor"] = "agent";
  return req;
}

function tokenlessReq() {
  return { headers: {} };
}

function makeBet(ventureId, options) {
  const bet = createBet({ ventureId, intent: "cold outbound to fintech ops" });
  setVentureDoc(ventureId, "bets", bet.id, bet, options);
  return bet;
}

describe("wall — park/queue", () => {
  it("parks an outward effect and it appears in the venture's queue", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Wall basics" }, options);
    const item = park({ ventureId: venture.id, effect: { kind: "send", message: "hi", recipients: ["a@x.com"] } }, options);
    assert.match(item.id, /^wall-/);
    assert.equal(item.decision, null);

    const q = queue(venture.id, options);
    assert.equal(q.length, 1);
    assert.equal(q[0].id, item.id);
  });

  it("requires a ventureId and an effect", () => {
    const options = freshRoot();
    assert.throws(() => park({ effect: {} }, options), /ventureId/);
    const venture = createVenture({ name: "No effect" }, options);
    assert.throws(() => park({ ventureId: venture.id }, options), /effect/);
  });

  it("queueAll concatenates every venture's queue, each item still venture-scoped", () => {
    const options = freshRoot();
    const a = createVenture({ name: "Venture A" }, options);
    const b = createVenture({ name: "Venture B" }, options);
    park({ ventureId: a.id, effect: { kind: "send" } }, options);
    park({ ventureId: b.id, effect: { kind: "publish" } }, options);

    const all = queueAll({ listVentureIds: (opts) => listVentures(opts).map((v) => v.id) }, options);
    assert.equal(all.length, 2);
    const byVenture = Object.fromEntries(all.map((item) => [item.ventureId, item]));
    assert.equal(byVenture[a.id].effect.kind, "send");
    assert.equal(byVenture[b.id].effect.kind, "publish");
  });
});

describe("wall — self-approval is rejected from every door (browser/API/MCP/model)", () => {
  it("a tokenless caller cannot release", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "No self approve tokenless" }, options);
    const item = park({ ventureId: venture.id, effect: { kind: "send" } }, options);
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "release" }, { req: tokenlessReq() }, {}, options),
      (err) => err.status === 403,
    );
  });

  it("an agent/MCP/model-stamped caller cannot release, even carrying a valid founder cookie", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "No self approve agent" }, options);
    const item = park({ ventureId: venture.id, effect: { kind: "send" } }, options);
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "release" }, { req: agentReq() }, {}, options),
      (err) => err.status === 403,
    );
  });

  it("an authenticated founder browser CAN release, and only through executeEffect", () => {
    const options = freshRoot();
    __resetPresence();
    markPresent("test");
    const venture = createVenture({ name: "Founder can release" }, options);
    const item = park({ ventureId: venture.id, effect: { kind: "send", message: "hi" } }, options);
    let executed = null;
    const receipt = decide(
      { ventureId: venture.id, itemId: item.id, decision: "release" },
      { req: browserReq() },
      { executeEffect: (effect) => { executed = effect; return { sent: true }; } },
      options,
    );
    assert.equal(receipt.decision, "release");
    assert.equal(receipt.decidedBy, "founder");
    assert.ok(receipt.releasedAt);
    assert.ok(executed, "the executor was actually invoked");
    assert.equal(executed.message, "hi");
    assert.deepEqual(receipt.executionResult, { sent: true });
    // The capability never rides the persisted receipt or the caller's return value.
    assert.equal("runtime" in receipt, false);
  });

  it("a decided item cannot be decided again (no second release on the same item)", () => {
    const options = freshRoot();
    __resetPresence();
    markPresent("test");
    const venture = createVenture({ name: "No double decide" }, options);
    const item = park({ ventureId: venture.id, effect: { kind: "send" } }, options);
    decide({ ventureId: venture.id, itemId: item.id, decision: "release" }, { req: browserReq() }, { executeEffect: () => ({}) }, options);
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "release" }, { req: browserReq() }, { executeEffect: () => ({}) }, options),
      /already decided/,
    );
  });
});

describe("wall — the outward capability is connector-level: an unreleased item can never reach a connector", () => {
  it("hasWallRelease is false for a plain effect object (nothing minted it)", () => {
    assert.equal(hasWallRelease({ kind: "send" }), false);
    assert.equal(hasWallRelease({ runtime: { outwardRelease: "forged" } }), false);
  });

  it("only the effect executeEffect receives during an actual release carries the capability", () => {
    const options = freshRoot();
    __resetPresence();
    markPresent("test");
    const venture = createVenture({ name: "Connector refusal" }, options);
    const item = park({ ventureId: venture.id, effect: { kind: "send" } }, options);
    let sawRelease = false;
    decide(
      { ventureId: venture.id, itemId: item.id, decision: "release" },
      { req: browserReq() },
      { executeEffect: (effect) => { sawRelease = hasWallRelease(effect); return {}; } },
      options,
    );
    assert.equal(sawRelease, true, "the executor's effect carries the freshly-minted capability");
  });

  it("decide() refuses to release at all without an executeEffect wired — a release can never silently no-op", () => {
    const options = freshRoot();
    __resetPresence();
    markPresent("test");
    const venture = createVenture({ name: "No executor wired" }, options);
    const item = park({ ventureId: venture.id, effect: { kind: "send" } }, options);
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "release" }, { req: browserReq() }, {}, options),
      /executeEffect/,
    );
  });
});

describe("wall — away holds standing outward effects; marking away needs nothing, marking present needs founder auth", () => {
  it("a release while the founder is away is rejected, even from an authenticated founder browser", () => {
    const options = freshRoot();
    __resetPresence(); // fresh boot -> away
    const venture = createVenture({ name: "Away holds" }, options);
    const item = park({ ventureId: venture.id, effect: { kind: "send" } }, options);
    let executed = false;
    assert.throws(
      () => decide(
        { ventureId: venture.id, itemId: item.id, decision: "release" },
        { req: browserReq() },
        { executeEffect: () => { executed = true; return {}; }, isFounderPresent: () => false },
        options,
      ),
      (err) => err.code === "wall_release_while_away",
    );
    assert.equal(executed, false, "the executor is never reached while away");
  });

  it("a kill does not touch anything outward and is never held by presence", () => {
    const options = freshRoot();
    __resetPresence(); // away
    const venture = createVenture({ name: "Kill not held by presence" }, options);
    const bet = makeBet(venture.id, options);
    const item = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "kill-proposal" } }, options);
    const receipt = decide(
      { ventureId: venture.id, itemId: item.id, decision: "kill", note: "too cold" },
      { req: browserReq() },
      { isFounderPresent: () => false },
      options,
    );
    assert.equal(receipt.decision, "kill");
    assert.equal(receipt.learning, "too cold");
  });
});

describe("wall — kill writes the receipt + learning and is the only path to endedBy", () => {
  it("decide({decision:'kill'}) ends the bet, persists it, and records the learning", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Kill path" }, options);
    const bet = makeBet(venture.id, options);
    const item = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "kill-proposal" } }, options);

    const receipt = decide(
      { ventureId: venture.id, itemId: item.id, decision: "kill", note: "no replies after three weeks" },
      { req: browserReq() },
      {},
      options,
    );
    assert.equal(receipt.decision, "kill");
    assert.equal(receipt.learning, "no replies after three weeks");
  });

  it("the persisted bet document carries endedAt/endedBy/learning after a kill decision", async () => {
    const { getVentureDoc } = await import("../../src/firm/venture-store.mjs");
    const options = freshRoot();
    const venture = createVenture({ name: "Kill persists" }, options);
    const bet = makeBet(venture.id, options);
    const item = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "kill-proposal" } }, options);
    decide({ ventureId: venture.id, itemId: item.id, decision: "kill", note: "dead channel" }, { req: browserReq() }, {}, options);

    const endedBet = getVentureDoc(venture.id, "bets", bet.id, options);
    assert.ok(endedBet.endedAt);
    assert.equal(endedBet.endedBy, "founder");
    assert.equal(endedBet.learning, "dead channel");
  });

  it("a tokenless or agent-stamped caller cannot kill", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "No self-kill" }, options);
    const bet = makeBet(venture.id, options);
    const item = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "kill-proposal" } }, options);
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "kill" }, { req: tokenlessReq() }, {}, options),
      (err) => err.status === 403,
    );
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "kill" }, { req: agentReq() }, {}, options),
      (err) => err.status === 403,
    );
  });
});

describe("wall — cross-venture decide fails closed as 404", () => {
  it("deciding venture B's item under venture A's id fails closed", () => {
    const options = freshRoot();
    const a = createVenture({ name: "Venture A" }, options);
    const b = createVenture({ name: "Venture B" }, options);
    const item = park({ ventureId: b.id, effect: { kind: "send" } }, options);
    assert.throws(
      () => decide({ ventureId: a.id, itemId: item.id, decision: "release" }, { req: browserReq() }, { executeEffect: () => ({}) }, options),
      (err) => err.code === "wall_item_not_in_venture" && err.status === 404,
    );
  });

  it("deciding an item id that never existed fails closed the same way", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Never existed" }, options);
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: "wall-ghost", decision: "release" }, { req: browserReq() }, {}, options),
      (err) => err.code === "wall_item_not_in_venture" && err.status === 404,
    );
  });
});

describe("wall — deploy keeps its second explicit authorization", () => {
  it("park() strips a parker-supplied deployConfirmed claim before the item is ever saved", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Strip forged confirm" }, options);
    const item = park({ ventureId: venture.id, effect: { kind: "deploy", diff: "d1", deployConfirmed: true } }, options);
    assert.equal("deployConfirmed" in item.effect, false, "the parker's claim never survives park()");
    assert.equal(item.deployAuthorizedAt, null);
  });

  it("releasing a deploy effect with no authorize-deploy decision is refused, the executor is never called", () => {
    const options = freshRoot();
    __resetPresence();
    markPresent("test");
    const venture = createVenture({ name: "Deploy needs confirm" }, options);
    const item = park({ ventureId: venture.id, effect: { kind: "deploy", diff: "d1", environment: "prod" } }, options);
    let called = false;
    assert.throws(
      () => decide(
        { ventureId: venture.id, itemId: item.id, decision: "release" },
        { req: browserReq() },
        { executeEffect: () => { called = true; return {}; } },
        options,
      ),
      (err) => err.code === "wall_deploy_needs_confirmation",
    );
    assert.equal(called, false);
  });

  it("a parked deploy effect arriving with a forged deployConfirmed:true STILL refuses release without the separate authorize-deploy decision", () => {
    const options = freshRoot();
    __resetPresence();
    markPresent("test");
    const venture = createVenture({ name: "Forged confirm still refused" }, options);
    // Even if a caller somehow got a raw object with deployConfirmed:true onto the item pre-park, park()
    // already stripped it above; here we prove the RELEASE side independently never trusts item.effect
    // for this — only item.deployAuthorizedAt, which nothing but a prior authorize-deploy decide() sets.
    const item = park({ ventureId: venture.id, effect: { kind: "deploy", diff: "d1", deployConfirmed: true } }, options);
    let called = false;
    assert.throws(
      () => decide(
        { ventureId: venture.id, itemId: item.id, decision: "release" },
        { req: browserReq() },
        { executeEffect: () => { called = true; return {}; } },
        options,
      ),
      (err) => err.code === "wall_deploy_needs_confirmation",
    );
    assert.equal(called, false);
  });

  it("authorize-deploy is founder-only: a tokenless or agent-stamped caller cannot stamp it", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Authorize-deploy founder only" }, options);
    const item = park({ ventureId: venture.id, effect: { kind: "deploy", diff: "d1" } }, options);
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "authorize-deploy" }, { req: tokenlessReq() }, {}, options),
      (err) => err.status === 403,
    );
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "authorize-deploy" }, { req: agentReq() }, {}, options),
      (err) => err.status === 403,
    );
  });

  it("authorize-deploy refuses on a non-deploy effect — nothing to authorize", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Authorize-deploy wrong kind" }, options);
    const item = park({ ventureId: venture.id, effect: { kind: "send" } }, options);
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "authorize-deploy" }, { req: browserReq() }, {}, options),
      /not a deploy effect/,
    );
  });

  it("the full two-step — founder authorize-deploy, then founder release — ships exactly once", () => {
    const options = freshRoot();
    __resetPresence();
    markPresent("test");
    const venture = createVenture({ name: "Two-step deploy" }, options);
    const item = park({ ventureId: venture.id, effect: { kind: "deploy", diff: "d1", environment: "prod" } }, options);

    const authorized = decide({ ventureId: venture.id, itemId: item.id, decision: "authorize-deploy" }, { req: browserReq() }, {}, options);
    assert.ok(authorized.deployAuthorizedAt);
    assert.equal(authorized.deployAuthorizedBy, "founder");
    assert.equal(authorized.decision, null, "authorize-deploy does not itself decide the item — it stays queued");

    let calls = 0;
    let deployed = null;
    const receipt = decide(
      { ventureId: venture.id, itemId: item.id, decision: "release" },
      { req: browserReq() },
      { executeEffect: (effect) => { calls += 1; deployed = effect; return { ok: true }; } },
      options,
    );
    assert.equal(calls, 1, "the deploy ships exactly once");
    assert.equal(receipt.decision, "release");
    assert.ok(deployed);
    assert.equal(hasWallRelease(deployed), true);

    // And it cannot be released a second time — the item is decided now.
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "release" }, { req: browserReq() }, { executeEffect: () => { calls += 1; return {}; } }, options),
      /already decided/,
    );
    assert.equal(calls, 1, "still exactly one ship");
  });
});

describe("wall — a bad decision value is rejected before anything is touched", () => {
  it("decide() throws on an unrecognized decision string", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Bad decision" }, options);
    const item = park({ ventureId: venture.id, effect: { kind: "send" } }, options);
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "yolo" }, { req: browserReq() }, {}, options),
      /recognized decision/,
    );
    assert.equal(queue(venture.id, options).length, 1, "the item is still queued, untouched");
  });
});
