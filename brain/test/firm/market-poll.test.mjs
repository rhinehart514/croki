// market-poll.test.mjs — F5 step 3 acceptance: a released send with a real messageId is indexed off
// the venture's own wall receipts, its thread is polled and classified deterministically (bounce beats
// reply, own-provenance excluded), and any detected signal feeds market.mjs's recordOutcome exactly once
// (dedupe proven across two polls) — never duplicating recordOutcome's own dedupe/join/park. No
// credential / nothing released yet is an honest no-op, never an error.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { founderRequest } from "../helpers/founder-capability.mjs";

import { pollReplies, buildSentIndex } from "../../src/firm/market-poll.mjs";
import { createVenture, setVentureDoc, listVentureDocs, getVentureDoc } from "../../src/firm/venture-store.mjs";
import { createBet } from "../../src/firm/bet.mjs";
import { park, decide } from "../../src/firm/wall.mjs";
import { setOAuthCredential } from "../../src/credential-store.mjs";
import { clearAccessTokenCache } from "../../src/connectors/execute/gmail-oauth.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-market-poll-")) };
}

function browserReq() {
  return founderRequest();
}

// A Gmail message shape (as the read transport returns it) — mirrors inbox-reader.test.mjs's own helper.
function gmailMessage(headers = {}, id = null, snippet = null) {
  return {
    ...(id ? { id } : {}),
    ...(snippet ? { snippet } : {}),
    payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })) },
  };
}

const OUR_PROVENANCE = "gtm-ide-sent";

// A fake read transport keyed by messageId -> threadId, and threadId -> thread payload. Mirrors the
// createGmailReadTransport shape (getMessage/getThread), no network.
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

// Sets up one venture with one bet, releases a "message" effect through the real wall (park + decide),
// and stamps a fake real Gmail messageId onto the release receipt's executionResult — exactly the shape
// buildSentIndex reads. Returns { venture, bet, messageId }.
function setupReleasedSend(options, { messageId = "gmsg-1", to = "ada@acme.com", workRef = "staged-offer-1" } = {}) {
  const venture = createVenture({ name: "Poll acceptance" }, options);
  const bet = createBet({ ventureId: venture.id, intent: "cold email to ada", teammateRef: "outreach-writer", configurationRevision: 4 });
  setVentureDoc(venture.id, "bets", bet.id, bet, options);
  const queued = park({ ventureId: venture.id, betId: bet.id, workRef, effect: { kind: "message", channel: "gmail", to, body: "hi" } }, options);
  // isFounderPresent is injected true directly rather than routed through presence.mjs's real
  // markPresent() lease — that lease is a process-wide singleton (brain/src/presence.mjs), so racing
  // its 60s wall-clock window against every other test file in the same `node --test` run is what
  // produced the intermittent wall_release_while_away flake. decide()'s own isFounderPresent dep
  // (wall.mjs:156) exists exactly so a caller can assert presence deterministically instead.
  decide(
    { ventureId: venture.id, itemId: queued.id, decision: "release" },
    { req: browserReq() },
    { executeEffect: () => ({ messageId }), isFounderPresent: () => true },
    options,
  );
  return { venture, bet, messageId };
}

describe("buildSentIndex — released wall items with a real messageId become the sent-item index", () => {
  it("indexes a released message effect, keyed by its messageId, joined through the bet's own joinKey", () => {
    const options = freshRoot();
    const { venture, bet, messageId } = setupReleasedSend(options);
    const index = buildSentIndex(venture.id, options);
    assert.equal(index.size, 1);
    const entry = index.get(messageId);
    assert.equal(entry.joinKey, bet.joinKey);
    assert.equal(entry.betId, bet.id);
    assert.equal(entry.workRef, "staged-offer-1");
    assert.equal(entry.recipient, "ada@acme.com");
    assert.equal(entry.configurationRevision, 4);
  });

  it("never indexes a parked-but-not-yet-decided item, or a killed bet's item", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Not released" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "angle", teammateRef: "closer" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);
    park({ ventureId: venture.id, betId: bet.id, effect: { kind: "message", to: "x@acme.com" } }, options);
    assert.equal(buildSentIndex(venture.id, options).size, 0);
  });

  it("never indexes a released item with no real messageId in its executionResult (e.g. today's honest 'not wired yet' refusal upstream never reaches here since decide() only writes executionResult on success)", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "No message id" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "angle", teammateRef: "closer" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);
    const queued = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "message", to: "x@acme.com" } }, options);
    decide({ ventureId: venture.id, itemId: queued.id, decision: "release" }, { req: browserReq() }, { executeEffect: () => ({ ok: true }), isFounderPresent: () => true }, options);
    assert.equal(buildSentIndex(venture.id, options).size, 0);
  });
});

describe("pollReplies — a real reply lands as an outcome on its exact bet, once", () => {
  it("classifies a reply, feeds recordOutcome, and the outcome appears as evidence on the exact bet", async () => {
    const options = freshRoot();
    const { venture, bet, messageId } = setupReleasedSend(options);
    const readTransport = fakeReadTransport({
      messageToThread: { [messageId]: "thread-1" },
      threads: {
        "thread-1": {
          messages: [
            gmailMessage({ From: "founder@drover.co", "X-GTM-IDE-Provenance": OUR_PROVENANCE }),
            gmailMessage({ From: "Ada <ada@acme.com>" }, "gmail-reply-1", "Interested — can we talk Thursday?"),
          ],
        },
      },
    });

    const result = await pollReplies(venture.id, { ...options, readTransport, token: "fake-token" });
    assert.equal(result.polled, 1);
    assert.equal(result.ingested.length, 1);
    assert.equal(result.ingested[0].outcomeKind, "reply");
    assert.equal(result.ingested[0].joined, true);

    const reloaded = getVentureDoc(venture.id, "bets", bet.id, options);
    const outcomeRefs = (reloaded.evidence ?? []).filter((e) => e.type === "outcome");
    assert.equal(outcomeRefs.length, 1);
    const outcomes = listVentureDocs(venture.id, "outcomes", options);
    assert.equal(outcomes[0].outcomeKind, "reply");
    assert.equal(outcomes[0].from, "ada@acme.com");
    assert.equal(outcomes[0].source, "connected-account");
    assert.equal(outcomes[0].workRef, "staged-offer-1", "the return stays attached to the exact originating work");
    assert.equal(outcomes[0].configurationRevision, 4);

    // One decide-together item parked at the wall for this outcome.
    const decisions = listVentureDocs(venture.id, "decisions", options);
    const outcomeItems = decisions.filter((d) => d.purpose === "review-outcome");
    assert.equal(outcomeItems.length, 1);
    assert.equal(outcomeItems[0].betId, bet.id);
    assert.equal(outcomeItems[0].workRef, "staged-offer-1");
    assert.equal(outcomeItems[0].configurationRevision, 4);
  });

  it("dedupes across two polls — the same reply thread ingests as one outcome, not two", async () => {
    const options = freshRoot();
    const { venture, bet, messageId } = setupReleasedSend(options);
    const readTransport = fakeReadTransport({
      messageToThread: { [messageId]: "thread-1" },
      threads: {
        "thread-1": {
          messages: [
            gmailMessage({ From: "Ada <ada@acme.com>" }, "gmail-reply-1", "Interested!"),
          ],
        },
      },
    });

    const first = await pollReplies(venture.id, { ...options, readTransport, token: "fake-token" });
    assert.equal(first.ingested[0].deduped, false);
    const second = await pollReplies(venture.id, { ...options, readTransport, token: "fake-token" });
    assert.equal(second.ingested[0].deduped, true, "the second poll recognizes the same reply, not a fresh outcome");

    const reloaded = getVentureDoc(venture.id, "bets", bet.id, options);
    const outcomeRefs = (reloaded.evidence ?? []).filter((e) => e.type === "outcome");
    assert.equal(outcomeRefs.length, 1, "exactly one outcome recorded despite two polls over the same thread");
  });
});

describe("pollReplies — a bounce classifies as bounce, our own outbound is excluded", () => {
  it("a mailer-daemon bounce dominates and records as outcomeKind bounce", async () => {
    const options = freshRoot();
    const { venture, messageId } = setupReleasedSend(options);
    const readTransport = fakeReadTransport({
      messageToThread: { [messageId]: "thread-bounce" },
      threads: {
        "thread-bounce": {
          messages: [
            gmailMessage({ From: "mailer-daemon@googlemail.com" }, "gmail-bounce-1"),
          ],
        },
      },
    });
    const result = await pollReplies(venture.id, { ...options, readTransport, token: "fake-token" });
    assert.equal(result.ingested[0].outcomeKind, "bounce");
  });

  it("a thread with only our own outbound (provenance header) never ingests anything", async () => {
    const options = freshRoot();
    const { venture, messageId } = setupReleasedSend(options);
    const readTransport = fakeReadTransport({
      messageToThread: { [messageId]: "thread-quiet" },
      threads: {
        "thread-quiet": {
          messages: [
            gmailMessage({ From: "founder@drover.co", "X-GTM-IDE-Provenance": OUR_PROVENANCE }),
          ],
        },
      },
    });
    const result = await pollReplies(venture.id, { ...options, readTransport, token: "fake-token" });
    assert.equal(result.polled, 1, "the thread was still read");
    assert.equal(result.ingested.length, 0, "no signal — our own outbound is never counted");
  });
});

describe("pollReplies — no credential / nothing released is an honest no-op, never an error", () => {
  it("a venture with no released send yet returns polled:0 with a reason, no throw", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Nothing released" }, options);
    const result = await pollReplies(venture.id, options);
    assert.equal(result.polled, 0);
    assert.match(result.reason, /nothing/i);
  });

  it("a released send but no connected Gmail credential returns polled:0 with a reason, no throw", async () => {
    const options = freshRoot();
    const { venture } = setupReleasedSend(options);
    const result = await pollReplies(venture.id, options); // no options.token — forces resolveReadToken
    assert.equal(result.polled, 0);
    assert.match(result.reason, /no connected gmail/i);
  });

  it("resolves a real read token from a connected OAuth credential via the injected oauthFetch, keyed by ventureId", async () => {
    const options = freshRoot();
    const { venture, messageId } = setupReleasedSend(options, { messageId: "gmsg-oauth" });
    clearAccessTokenCache();
    setOAuthCredential({
      provider: "gmail",
      clientId: "client-1",
      clientSecret: "secret-1",
      refreshToken: `refresh-${venture.id}`,
    }, options);

    const oauthFetch = async () => ({
      ok: true,
      json: async () => ({ access_token: "minted-token", expires_in: 3600 }),
    });
    const readTransport = fakeReadTransport({
      messageToThread: { [messageId]: "thread-1" },
      threads: { "thread-1": { messages: [gmailMessage({ From: "ada@acme.com" }, "gmail-reply-1", "yes!")] } },
    });

    const result = await pollReplies(venture.id, { ...options, oauthFetch, readTransport });
    assert.equal(result.polled, 1);
    assert.equal(result.ingested[0].outcomeKind, "reply");
  });

  it("never throws when the read transport refuses (honest reason surfaced, not an exception)", async () => {
    const options = freshRoot();
    const { venture, messageId } = setupReleasedSend(options);
    const readTransport = {
      async getMessage() { return { ok: false, error: "send-only scope", needsReadScope: true }; },
      async getThread() { return { ok: false, error: "unreachable" }; },
    };
    const result = await pollReplies(venture.id, { ...options, readTransport, token: "fake-token" });
    assert.equal(result.polled, 0);
    assert.equal(result.needsReadScope, true);
    void messageId;
  });
});
