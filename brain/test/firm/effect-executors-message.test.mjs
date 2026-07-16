// effect-executors-message.test.mjs — the message/send branch of effect-executors.mjs (message-send.mjs)
// wired through the REAL wall: a released message effect sends exactly once (fake sync transport
// injected via createEffectExecutor's messageDeps), carries the provenance header, and lands a real
// messageId on the wall receipt. An unreleased/forged effect is refused at BOTH layers — the dispatcher
// (assertReleased/hasWallRelease) and, independently, message-send.mjs itself never runs at all when
// that guard throws first. A transport failure lands an honest executionError, never a throw and never a
// retry. The final test is the whole firm loop in one chain: park -> decide release -> executeMessage
// (fake transport) -> buildSentIndex finds the messageId -> pollReplies (fake read transport, a reply) ->
// the outcome lands on the exact bet via market.mjs's real recordOutcome.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { founderRequest } from "../helpers/founder-capability.mjs";

import { createEffectExecutor, decideWithExecution } from "../../src/firm/effect-executors.mjs";
import { PROVENANCE_HEADER } from "../../src/firm/message-send.mjs";
import { park, decide, queue, hasWallRelease } from "../../src/firm/wall.mjs";
import { createVenture, setVentureDoc, getVentureDoc, listVentureDocs } from "../../src/firm/venture-store.mjs";
import { createBet } from "../../src/firm/bet.mjs";
import { buildSentIndex, pollReplies } from "../../src/firm/market-poll.mjs";
import { setOAuthCredential } from "../../src/credential-store.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-effexec-msg-")) };
}

function browserReq() {
  return founderRequest();
}

function gmailMessage(headers = {}, id = null, snippet = null) {
  return {
    ...(id ? { id } : {}),
    ...(snippet ? { snippet } : {}),
    payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })) },
  };
}

// A fake SYNCHRONOUS send transport — the same shape createSyncGmailTransport() returns, injected via
// createEffectExecutor's messageDeps.transport so no test ever shells out to real curl.
function fakeSendTransport({ messageId = "gmsg-real-1", fail = null } = {}) {
  const calls = [];
  const transport = (args) => {
    calls.push(args);
    if (fail) return { ok: false, error: fail.error, ...(fail.needsReconnect ? { needsReconnect: true } : {}) };
    return { ok: true, messageId };
  };
  return { transport, calls };
}

function fakeReadTransport({ messageToThread = {}, threads = {} } = {}) {
  return {
    async getMessage(id) {
      const threadId = messageToThread[id];
      if (!threadId) return { ok: false, error: `no such message ${id}` };
      return { ok: true, payload: { threadId } };
    },
    async getThread(id) {
      const thread = threads[id];
      if (!thread) return { ok: false, error: `no such thread ${id}` };
      return { ok: true, payload: thread };
    },
  };
}

describe("executeMessage — a released message effect sends exactly once, provenance stamped, messageId lands on the receipt", () => {
  it("sends via the injected fake sync transport and stamps the receipt with a real messageId", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Send once" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "cold email to ada", teammateRef: "outreach-writer" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);
    const queued = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "message", to: "ada@acme.com", subject: "hi", body: "Interested in a pilot?" } }, options);

    const { transport, calls } = fakeSendTransport({ messageId: "gmsg-real-1" });
    const executeEffect = createEffectExecutor({ founderActor: "founder", options, messageDeps: { transport, token: "fake-token" } });

    const receipt = decide(
      { ventureId: venture.id, itemId: queued.id, decision: "release" },
      { req: browserReq() },
      { executeEffect, isFounderPresent: () => true },
      options,
    );

    assert.equal(receipt.decision, "release");
    assert.equal(receipt.executionResult.ok, true);
    assert.equal(receipt.executionResult.messageId, "gmsg-real-1");
    assert.equal(calls.length, 1, "the transport was called exactly once");
    assert.equal(calls[0].to, "ada@acme.com");
    assert.ok(calls[0].provenance, "a provenance object was stamped");
    assert.match(JSON.stringify(calls[0].provenance), /gtm-ide-firm/);
    assert.equal(calls[0].token, "fake-token", "the injected token reached the transport, never re-derived");
  });

  it("uses the banked Gmail profile address as the actual From header", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Verified sender" }, options);
    setOAuthCredential({
      provider: "gmail",
      clientId: "client",
      clientSecret: "secret",
      refreshToken: "refresh",
      accountAddress: "founder@example.com",
    }, options);
    const queued = park({
      ventureId: venture.id,
      effect: { kind: "message", from: "claimed@example.net", to: "buyer@example.com", body: "Hello" },
    }, options);
    const { transport, calls } = fakeSendTransport();
    const executeEffect = createEffectExecutor({ founderActor: "founder", options, messageDeps: { transport, token: "fake-token" } });
    decide(
      { ventureId: venture.id, itemId: queued.id, decision: "release" },
      { req: browserReq() },
      { executeEffect, isFounderPresent: () => true },
      options,
    );
    assert.equal(calls[0].from, "founder@example.com");
    assert.equal(queued.effect.fromAddress, "founder@example.com");
    assert.equal("costUsd" in queued.effect, false);
  });

  it("reads recipient/body defensively across the open effect shapes already staged elsewhere in this tree", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Open shape" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "angle", teammateRef: "closer" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);
    // {kind:"send", message, recipients:[...]}: wall.test.mjs's own convention.
    const queued = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "send", message: "hi there", recipients: ["bo@acme.com"] } }, options);
    const { transport, calls } = fakeSendTransport();
    const executeEffect = createEffectExecutor({ founderActor: "founder", options, messageDeps: { transport, token: "fake-token" } });
    decide({ ventureId: venture.id, itemId: queued.id, decision: "release" }, { req: browserReq() }, { executeEffect, isFounderPresent: () => true }, options);
    assert.equal(calls[0].to, "bo@acme.com");
    assert.equal(calls[0].body, "hi there");
  });
});

describe("executeMessage — refused at BOTH layers for an unreleased/forged effect", () => {
  it("the dispatcher's own hasWallRelease guard refuses before message-send.mjs is ever reached — the fake transport never runs", () => {
    const { transport, calls } = fakeSendTransport();
    const executeEffect = createEffectExecutor({ founderActor: "founder", options: {}, messageDeps: { transport, token: "x" } });
    const forged = { kind: "message", to: "x@acme.com", runtime: { outwardRelease: Symbol("forged") } };
    assert.throws(() => executeEffect(forged, {}), /release capability/);
    assert.equal(calls.length, 0, "message-send.mjs's transport is never invoked for an unreleased effect");
  });

  it("only decide()'s own mint of the capability can ever pass hasWallRelease — a plain effect object cannot forge it", () => {
    assert.equal(hasWallRelease({ kind: "message", runtime: { outwardRelease: "founder" } }), false);
    assert.equal(hasWallRelease({ kind: "message" }), false);
  });
});

describe("executeMessage — a transport failure lands an honest executionError, never a throw, never a retry", () => {
  it("records executionError on the receipt and never throws out of decide()", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Transport fails" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "angle", teammateRef: "closer" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);
    const queued = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "message", to: "x@acme.com", body: "hi" } }, options);
    const { transport } = fakeSendTransport({ fail: { error: "Gmail API 500: internal error" } });
    const executeEffect = createEffectExecutor({ founderActor: "founder", options, messageDeps: { transport, token: "fake-token" } });

    const receipt = decide(
      { ventureId: venture.id, itemId: queued.id, decision: "release" },
      { req: browserReq() },
      { executeEffect, isFounderPresent: () => true },
      options,
    );
    assert.equal(receipt.decision, "release", "decide() itself completes — the failure is on the execution result, not a thrown decide()");
    assert.equal(receipt.executionResult.ok, false);
    assert.match(receipt.executionResult.executionError, /internal error/);
    // The item fell out of the live queue once decided, exactly as any other decided item does — a
    // failed send is not silently retried by re-queuing.
    assert.equal(queue(venture.id, options).some((item) => item.id === queued.id), false);
  });

  it("no recipient on the effect refuses honestly before ever calling the transport", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "No recipient" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "angle", teammateRef: "closer" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);
    const queued = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "message", body: "hi" } }, options);
    const { transport, calls } = fakeSendTransport();
    const executeEffect = createEffectExecutor({ founderActor: "founder", options, messageDeps: { transport, token: "fake-token" } });
    const receipt = decide({ ventureId: venture.id, itemId: queued.id, decision: "release" }, { req: browserReq() }, { executeEffect, isFounderPresent: () => true }, options);
    assert.equal(receipt.executionResult.ok, false);
    assert.match(receipt.executionResult.executionError, /no recipient/i);
    assert.equal(calls.length, 0);
  });
});

describe("the full-circle firm loop: park -> decide release -> real send -> buildSentIndex -> pollReplies -> outcome on the bet", () => {
  it("a released message effect really sends, its messageId is indexed off the wall receipt, its thread is polled and classified, and the reply lands as an outcome on the exact bet", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Full circle" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "cold email to ada", teammateRef: "outreach-writer" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);

    // 1. park: a teammate's stage_outward-shaped message effect reaches the wall.
    const queued = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "message", to: "ada@acme.com", subject: "Quick question", body: "Noticed your team is scaling — worth a chat?" } }, options);
    assert.equal(queue(venture.id, options).length, 1);

    // 2. decide release -> executeMessage (fake sync transport, real dispatcher + real message-send.mjs
    // message-field reading + real provenance stamping) -> a real messageId lands on the receipt.
    const { transport } = fakeSendTransport({ messageId: "gmsg-fullcircle-1" });
    const executeEffect = createEffectExecutor({ founderActor: "founder", options, messageDeps: { transport, token: "fake-token" } });
    const receipt = decideWithExecution(
      decide,
      { ventureId: venture.id, itemId: queued.id, decision: "release" },
      { req: browserReq(), actor: "founder" },
      { executeEffect, isFounderPresent: () => true },
      options,
    );
    assert.equal(receipt.executionResult.ok, true);
    assert.equal(receipt.executionResult.messageId, "gmsg-fullcircle-1");
    assert.equal(queue(venture.id, options).length, 0, "the decided item fell out of the live queue");

    // 3. buildSentIndex (market-poll.mjs, REAL — no double) finds the just-sent message, keyed by its
    // real messageId, joined through the bet's own joinKey.
    const sentIndex = buildSentIndex(venture.id, options);
    assert.equal(sentIndex.size, 1);
    const entry = sentIndex.get("gmsg-fullcircle-1");
    assert.equal(entry.joinKey, bet.joinKey);
    assert.equal(entry.betId, bet.id);
    assert.equal(entry.recipient, "ada@acme.com");

    // 4. pollReplies (market-poll.mjs, REAL) — a fake READ transport supplies Ada's reply on that exact
    // thread; classifyThread (ported, unmodified) reads it as a positive reply; recordOutcome (market.mjs,
    // REAL — no double) dedupes/joins/parks it.
    const readTransport = fakeReadTransport({
      messageToThread: { "gmsg-fullcircle-1": "thread-fullcircle" },
      threads: {
        "thread-fullcircle": {
          messages: [
            gmailMessage({ From: "founder@drover.co", [PROVENANCE_HEADER]: "sent" }), // our own outbound — excluded
            gmailMessage({ From: "Ada <ada@acme.com>" }, "gmail-reply-1", "Yes! Let's talk Thursday."),
          ],
        },
      },
    });
    const polled = await pollReplies(venture.id, { ...options, readTransport, token: "fake-read-token" });
    assert.equal(polled.polled, 1);
    assert.equal(polled.ingested[0].outcomeKind, "reply");
    assert.equal(polled.ingested[0].joined, true);

    // 5. The outcome landed on the EXACT bet — the whole loop's join held end to end.
    const reloaded = getVentureDoc(venture.id, "bets", bet.id, options);
    const outcomeRefs = (reloaded.evidence ?? []).filter((e) => e.type === "outcome");
    assert.equal(outcomeRefs.length, 1);
    const outcomes = listVentureDocs(venture.id, "outcomes", options);
    assert.equal(outcomes[0].outcomeKind, "reply");
    assert.equal(outcomes[0].from, "ada@acme.com");
    assert.equal(outcomes[0].body, "Yes! Let's talk Thursday.");

    // And one decide-together wall item parked for the founder to read the outcome — never auto-anything.
    const outcomeItems = queue(venture.id, options).filter((d) => d.purpose === "review-outcome");
    assert.equal(outcomeItems.length, 1);
    assert.equal(outcomeItems[0].betId, bet.id);
  });
});
