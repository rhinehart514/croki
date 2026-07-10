// inbox-reader.test.mjs — the AUTOMATIC outcome reader (connectors/measure/inbox-reader.mjs).
//
// What this proves (deterministic halves + the poller wiring, no network, no model):
//   - joinSentItems indexes ONLY items Drover truly sent (a Gmail provider message id AND a joinKey),
//     keyed by that message id, so a polled thread joins back to the right run item; a staged-but-unsent
//     item is skipped, never guessed.
//   - classifyThread is a deterministic lookup: a real reply from the recipient → "reply" (positive), a
//     mailer-daemon / delivery-status message → "bounce" (negative, and it dominates), our own outbound
//     (carrying the provenance marker) is never counted, and a thread with only our outbound → null.
//   - The poller feeds a detected signal through the EXISTING ingestOutcome path keyed on the sent item's
//     joinKey, so a win attributes to its exact run automatically — verified by reading the Result store.
//   - Honest-blind, exactly like connectors/measure/default.mjs: a signal whose sent message maps to no
//     known joinKey ingests as unattributed (joined:false), never credited to a run it did not come from;
//     a Gmail read refusal (403 send-only scope) or a missing credential ingests NOTHING and reports why,
//     never a fabricated attribution.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  extractEmail,
  joinSentItems,
  classifyThread,
  pollInboxOutcomes,
} from "../src/connectors/measure/inbox-reader.mjs";
import { gtmPathStore, runStore, resultStore } from "../src/gtm-store.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "inbox-reader-")) };
}

// A Gmail message shape (as the read transport returns): payload.headers is [{ name, value }].
function gmailMessage(headers = {}, id = null) {
  return {
    ...(id ? { id } : {}),
    payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })) },
  };
}

const OUR_PROVENANCE = JSON.stringify({ marker: "gtm-ide", runId: "run-1" });

// ── extractEmail ────────────────────────────────────────────────────────────────────────────────
describe("extractEmail", () => {
  it("pulls a bare address out of a decorated header and lower-cases it", () => {
    assert.equal(extractEmail("Ada Lovelace <Ada@Acme.com>"), "ada@acme.com");
    assert.equal(extractEmail("bo@startup.io"), "bo@startup.io");
    assert.equal(extractEmail("no address here"), null);
    assert.equal(extractEmail(null), null);
  });
});

// ── joinSentItems ───────────────────────────────────────────────────────────────────────────────
describe("joinSentItems", () => {
  it("indexes only truly-sent items (provider id + joinKey), keyed by the Gmail message id", () => {
    const runs = [
      {
        id: "run-1",
        items: [
          // sent: has both a provider message id and a joinKey → indexed
          { joinKey: "jk-ada", providerMessageId: "gmsg-ada", to: "Ada <ada@acme.com>", sentAt: "2026-07-09T10:00:00Z" },
          // staged but never sent (no provider id) → skipped, not guessed
          { joinKey: "jk-bo", to: "bo@acme.com" },
          // sent by a transport that returned no id → not joinable → skipped
          { joinKey: "jk-cy", providerMessageId: null, to: "cy@acme.com" },
        ],
      },
    ];
    const index = joinSentItems(runs);
    assert.equal(index.size, 1);
    const ada = index.get("gmsg-ada");
    assert.equal(ada.joinKey, "jk-ada");
    assert.equal(ada.recipient, "ada@acme.com");
    assert.equal(ada.runId, "run-1");
    assert.equal(index.has("jk-bo"), false);
  });

  it("returns an empty index for no runs", () => {
    assert.equal(joinSentItems(undefined).size, 0);
    assert.equal(joinSentItems([]).size, 0);
  });
});

// ── classifyThread ──────────────────────────────────────────────────────────────────────────────
describe("classifyThread", () => {
  const sentToAda = { recipient: "ada@acme.com" };

  it("detects a real reply from the recipient as a positive 'reply'", () => {
    const thread = {
      messages: [
        gmailMessage({ From: "founder@drover.co", [`X-GTM-IDE-Provenance`]: OUR_PROVENANCE }), // our outbound
        gmailMessage({ From: "Ada <ada@acme.com>" }, "gmail-reply-1"), // her reply
      ],
    };
    assert.deepEqual(classifyThread(thread, sentToAda), {
      outcomeKind: "reply",
      signal: "positive",
      providerEventId: "gmail-reply-1",
    });
  });

  it("never counts our own provenance-stamped outbound as a reply", () => {
    const thread = { messages: [gmailMessage({ From: "founder@drover.co", "X-GTM-IDE-Provenance": OUR_PROVENANCE })] };
    assert.equal(classifyThread(thread, sentToAda), null);
  });

  it("detects a mailer-daemon bounce as a negative, and a bounce dominates a reply", () => {
    const bounceThread = {
      messages: [
        gmailMessage({ From: "founder@drover.co", "X-GTM-IDE-Provenance": OUR_PROVENANCE }),
        gmailMessage({ From: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>" }),
      ],
    };
    assert.deepEqual(classifyThread(bounceThread, sentToAda), { outcomeKind: "bounce", signal: "negative" });

    // A delivery-status content-type is also a bounce, and even alongside a reply the bounce wins.
    const both = {
      messages: [
        gmailMessage({ From: "ada@acme.com" }),
        gmailMessage({ From: "postmaster@acme.com", "Content-Type": "multipart/report; report-type=delivery-status" }),
      ],
    };
    assert.equal(classifyThread(both, sentToAda).outcomeKind, "bounce");
  });

  it("scopes a reply to the recipient we actually wrote to", () => {
    // A message from a DIFFERENT person in the thread is not the recipient's answer.
    const thread = { messages: [gmailMessage({ From: "someone-else@other.com" })] };
    assert.equal(classifyThread(thread, sentToAda), null);
  });

  it("falls back to any non-bounce inbound when the recipient was not stored", () => {
    const thread = { messages: [gmailMessage({ From: "whoever@wherever.com" })] };
    assert.deepEqual(classifyThread(thread, {}), { outcomeKind: "reply", signal: "positive" });
  });

  it("returns null for a thread with only our outbound (no signal yet)", () => {
    const thread = { messages: [gmailMessage({ From: "founder@drover.co", "X-GTM-IDE-Provenance": OUR_PROVENANCE })] };
    assert.equal(classifyThread(thread, sentToAda), null);
    assert.equal(classifyThread({ messages: [] }, sentToAda), null);
  });
});

// ── pollInboxOutcomes — the end-to-end wiring through the real ingest path ────────────────────────
// Seed a project with a staged run whose item carries a provider message id (as if Drover sent it), then
// drive the poller with a fake read transport + an injected token so no network or Google is touched.
function seedSentRun(options, { projectId = "acme", providerMessageId = "gmsg-ada", to = "ada@acme.com" } = {}) {
  const gtmPath = gtmPathStore.create(
    { projectId, summary: "Outbound to Ada", bet: { buyer: "Ada", channel: "gmail", offer: "demo" }, status: "selected" },
    options,
  );
  const run = runStore.create(
    {
      projectId,
      pathId: gtmPath.id,
      status: "staged",
      items: [{ joinKey: "jk-ada", providerMessageId, to, channel: "gmail", message: "hey Ada" }],
    },
    options,
  );
  return { projectId, runId: run.id, pathId: gtmPath.id };
}

// A fake read transport: getMessage returns a fixed threadId; getThread returns a scripted thread.
function fakeRead(thread, { threadId = "thr-1" } = {}) {
  return {
    getMessage: async () => ({ ok: true, payload: { threadId } }),
    getThread: async () => ({ ok: true, payload: thread }),
  };
}

describe("pollInboxOutcomes — automatic attribution", () => {
  it("attributes a detected reply to its exact run item through the real ingest path", async () => {
    const options = freshRoot();
    const { projectId } = seedSentRun(options);

    const replyThread = { messages: [gmailMessage({ From: "ada@acme.com" }, "gmail-reply-1")] };
    const report = await pollInboxOutcomes(projectId, {
      ...options,
      token: "fake-access-token",
      readTransport: fakeRead(replyThread),
    });

    assert.equal(report.ok, true);
    assert.equal(report.ingested.length, 1);
    assert.equal(report.ingested[0].outcomeKind, "reply");
    assert.equal(report.ingested[0].joined, true);
    assert.equal(report.unattributed, 0);

    // The Result actually landed in the store, joined to the run item on jk-ada.
    const results = resultStore.list({ ...options, projectId });
    assert.equal(results.length, 1);
    assert.equal(results[0].joinKey, "jk-ada");
    assert.equal(results[0].outcomeKind, "reply");
    assert.equal(results[0].source, "connected-account");
    assert.equal(results[0].providerEventId, "gmail-reply-1");
    assert.equal(results[0].providerSourceId, "thr-1");
  });

  it("reports blind and ingests nothing when Gmail refuses the read (send-only scope, 403)", async () => {
    const options = freshRoot();
    const { projectId } = seedSentRun(options);

    const denied = {
      getMessage: async () => ({ ok: false, error: "Insufficient Permission", needsReadScope: true }),
      getThread: async () => { throw new Error("should never be reached — the message read already failed"); },
    };
    const report = await pollInboxOutcomes(projectId, { ...options, token: "fake-access-token", readTransport: denied });

    assert.equal(report.ok, false);
    assert.equal(report.needsReadScope, true);
    assert.equal(report.ingested.length, 0);
    // Nothing was fabricated into the store.
    assert.equal(resultStore.list({ ...options, projectId }).length, 0);
  });

  it("reports blind with no connected Gmail credential (nothing to poll with)", async () => {
    const options = freshRoot();
    const { projectId } = seedSentRun(options);
    // No token injected and no banked OAuth credential in this fresh root → honest blind.
    const report = await pollInboxOutcomes(projectId, { ...options });
    assert.equal(report.ok, false);
    assert.equal(report.ingested.length, 0);
    assert.match(report.reason, /No connected Gmail/);
  });

  it("is a no-op when nothing has been sent yet", async () => {
    const options = freshRoot();
    const gtmPath = gtmPathStore.create({ projectId: "empty", summary: "p", bet: { channel: "gmail" }, status: "selected" }, options);
    // A staged run with an item that was never sent (no providerMessageId) → nothing to read outcomes for.
    runStore.create({ projectId: "empty", pathId: gtmPath.id, items: [{ joinKey: "jk-none" }] }, options);
    const report = await pollInboxOutcomes("empty", { ...options, token: "fake" });
    assert.equal(report.ok, true);
    assert.equal(report.ingested.length, 0);
    assert.match(report.reason, /Nothing sent/);
  });
});
