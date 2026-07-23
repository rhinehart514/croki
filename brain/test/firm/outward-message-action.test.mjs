// outward-message-action.test.mjs — kind "message" as a first-class outward action in the current
// physics, mirrored on outward-action-loop.test.mjs's deploy proofs: host-stamped prepared contract
// with no network touch, founder-only execution over the real send path (fake transport), one durable
// lease per send, interruption leaving an explicit verification-required refusal, and the founder-granted
// "gmail-thread" return observation bounded to the exact thread the send receipt named.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, it } from "node:test";

import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-outward-message-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: modelRoutes } = await import("../../src/firm/model-routes.mjs");
const { observeGmailThreadReturn } = await import("../../src/firm/message-send.mjs");
const { createVenture } = await import("../../src/firm/venture-store.mjs");

async function call(method, pathname, body = null, { headers = {}, deps = {} } = {}) {
  const req = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = { "content-type": "application/json", ...founderHeaders({ method, path: pathname }), ...headers };
  let status = 0;
  let raw = "";
  const res = { writeHead(value) { status = value; }, setHeader() {}, end(value) { raw += value ?? ""; } };
  const handled = await modelRoutes({ req, res, url: new URL(pathname, "http://local"), deps });
  return { handled, status, body: raw ? JSON.parse(raw) : null };
}

function messageBody() {
  return {
    kind: "message",
    decisionRef: "decision:reach-ada",
    preparedMaterial: { to: "ada@acme.com", subject: "Quick question", body: "Noticed your team is scaling — worth a chat?" },
    expectedReturn: { source: "gmail-thread", purpose: "A reply from Ada in the exact thread.", windowHours: 24 },
  };
}

// The same fake sync transport shape effect-executors-message.test.mjs injects — no test shells out.
function fakeSendTransport({ messageId = "gmsg-1", threadId = "gthread-1", fail = null } = {}) {
  const calls = [];
  const transport = (args) => {
    calls.push(args);
    if (fail) return { ok: false, error: fail.error, ...(fail.needsReconnect ? { needsReconnect: true } : {}) };
    return { ok: true, messageId, threadId };
  };
  return { transport, calls };
}

function gmailMessage({ id, from, provenance = false, internalDate, snippet }) {
  return {
    ...(id ? { id } : {}),
    ...(snippet ? { snippet } : {}),
    ...(internalDate ? { internalDate: String(internalDate) } : {}),
    payload: { headers: [
      ...(from ? [{ name: "From", value: from }] : []),
      ...(provenance ? [{ name: "X-GTM-IDE-Provenance", value: "sent" }] : []),
    ] },
  };
}

async function preparedMessageAction(name) {
  const venture = createVenture({ name }, { root, seedFoundingCrew: false });
  const base = `/api/ventures/${venture.id}/outward-actions`;
  const prepared = await call("POST", base, messageBody());
  assert.equal(prepared.status, 201);
  return { venture, base, action: prepared.body.outwardAction };
}

describe("message preparation stamps the exact contract without touching the network", () => {
  it("freezes recipient, subject, body, and expected return — with no Gmail credential connected at all", async () => {
    const { action } = await preparedMessageAction("Message prepare");
    const contract = action.preparedMaterial.messageContract;
    assert.equal(contract.to, "ada@acme.com");
    assert.equal(contract.subject, "Quick question");
    assert.equal(contract.body, "Noticed your team is scaling — worth a chat?");
    assert.match(contract.digest, /^[0-9a-f]{64}$/);
    assert.equal(action.expectedReturn.source, "gmail-thread");
    assert.equal(action.executedAt, null, "preparation never equals execution");
  });

  it("stamps an honest unavailable reason instead of a contract when the exact recipient is missing", async () => {
    const venture = createVenture({ name: "Message unprepared" }, { root, seedFoundingCrew: false });
    const prepared = await call("POST", `/api/ventures/${venture.id}/outward-actions`, { ...messageBody(), preparedMaterial: { body: "hello" } });
    assert.equal(prepared.status, 201);
    assert.equal(prepared.body.outwardAction.preparedMaterial.messageContract, undefined);
    assert.match(prepared.body.outwardAction.preparedMaterial.messageUnavailableReason, /exact recipient/i);
  });
});

describe("message execution is founder-gated, sends exactly the stamped contract, and records the Gmail receipt", () => {
  it("refuses an agent, then sends once for the founder with messageId and threadId on the receipt", async () => {
    const { base, action } = await preparedMessageAction("Message execute");
    const executePath = `${base}/${action.id}/execute`;

    const agent = await call("POST", executePath, {}, { headers: { "x-gtm-actor": "agent", "x-gtm-agent": "codex" } });
    assert.equal(agent.status, 403);

    const { transport, calls } = fakeSendTransport({ messageId: "gmsg-real-1", threadId: "gthread-real-1" });
    const executed = await call("POST", executePath, {}, { deps: { outwardAdapters: { messageDeps: { transport, token: "fake-token" } } } });
    assert.equal(executed.status, 200);
    assert.equal(calls.length, 1, "the transport ran exactly once");
    assert.equal(calls[0].to, "ada@acme.com");
    assert.equal(calls[0].subject, "Quick question");
    assert.equal(calls[0].body, "Noticed your team is scaling — worth a chat?");
    assert.equal(calls[0].provenance.actionRef, `outward-action:${action.id}`);
    const receipt = executed.body.outwardAction.executorReceipt;
    assert.equal(receipt.adapter, "gmail-message-send");
    assert.equal(receipt.messageId, "gmsg-real-1");
    assert.equal(receipt.threadId, "gthread-real-1");
    assert.equal(receipt.to, "ada@acme.com");
  });

  it("keeps a failed send retryable and an executed send unrepeatable", async () => {
    const { base, action } = await preparedMessageAction("Message retry");
    const executePath = `${base}/${action.id}/execute`;
    const failing = fakeSendTransport({ fail: { error: "Gmail API returned 500." } });
    const failed = await call("POST", executePath, {}, { deps: { outwardAdapters: { messageDeps: { transport: failing.transport, token: "fake-token" } } } });
    assert.equal(failed.status, 502);
    assert.match(failed.body.outwardAction.lastExecutionError, /500/);

    const { transport, calls } = fakeSendTransport({ messageId: "gmsg-retry-1" });
    const executed = await call("POST", executePath, {}, { deps: { outwardAdapters: { messageDeps: { transport, token: "fake-token" } } } });
    assert.equal(executed.status, 200);
    await call("POST", executePath, {}, { deps: { outwardAdapters: { messageDeps: { transport, token: "fake-token" } } } });
    assert.equal(calls.length, 1, "an executed message was sent through the transport twice");
  });

  it("acquires a durable lease before the transport so two founder clicks cannot send twice", async () => {
    const { base, action } = await preparedMessageAction("Message lease");
    const executePath = `${base}/${action.id}/execute`;
    let release;
    let began;
    const held = new Promise((resolve) => { release = resolve; });
    const started = new Promise((resolve) => { began = resolve; });
    let sends = 0;
    const deps = { executeOutwardAction: async () => { sends += 1; began(); await held; return { ok: true, receipt: { adapter: "gmail-message-send", messageId: "gmsg-once", threadId: "gthread-once" } }; } };
    const first = call("POST", executePath, {}, { deps });
    await started;
    const second = await call("POST", executePath, {}, { deps });
    assert.equal(second.status, 409);
    assert.equal(second.body.code, "outward_action_execution_unknown");
    release();
    assert.equal((await first).status, 200);
    assert.equal(sends, 1);
  });

  it("refuses a blind retry when interruption after execution began left no receipt", async () => {
    const { base, action } = await preparedMessageAction("Message interrupted");
    const executePath = `${base}/${action.id}/execute`;
    let began;
    const started = new Promise((resolve) => { began = resolve; });
    // The send begins and the process "dies": the adapter promise never settles, but the lease is durable.
    void call("POST", executePath, {}, { deps: { executeOutwardAction: () => { began(); return new Promise(() => {}); } } });
    await started;
    let sends = 0;
    const retried = await call("POST", executePath, {}, { deps: { executeOutwardAction: async () => { sends += 1; return { ok: true, receipt: {} }; } } });
    assert.equal(retried.status, 409);
    assert.equal(retried.body.code, "outward_action_execution_unknown");
    assert.match(retried.body.error, /verify/i);
    assert.equal(sends, 0, "a blind retry never reached the transport");
  });
});

describe("gmail-thread observation stays bounded to the exact thread the send receipt named", () => {
  async function executedMessageAction(name, { threadId = "gthread-obs-1" } = {}) {
    const { venture, base, action } = await preparedMessageAction(name);
    const { transport } = fakeSendTransport({ messageId: "gmsg-obs-1", threadId });
    const executed = await call("POST", `${base}/${action.id}/execute`, {}, { deps: { outwardAdapters: { messageDeps: { transport, token: "fake-token" } } } });
    assert.equal(executed.status, 200);
    return { venture, base, action: executed.body.outwardAction };
  }

  it("refuses a grant when the send receipt carries no thread id", async () => {
    const { base, action } = await executedMessageAction("No thread receipt", { threadId: null });
    const granted = await call("POST", `${base}/${action.id}/observations`, {});
    assert.equal(granted.status, 409);
    assert.match(granted.body.error, /no Gmail thread/i);
  });

  it("refuses widening to a different thread than the send created", async () => {
    const { base, action } = await executedMessageAction("Widened thread");
    const widened = await call("POST", `${base}/${action.id}/observations`, { target: { threadId: "some-other-thread" } });
    assert.equal(widened.status, 403);
  });

  it("reports a matched reply as exact facts, silence as silence, and failure as retryable", async () => {
    const { venture, base, action } = await executedMessageAction("Thread return");
    const granted = await call("POST", `${base}/${action.id}/observations`, {});
    assert.equal(granted.status, 201);
    const observation = granted.body.observation;
    assert.equal(observation.source, "gmail-thread");
    assert.deepEqual(observation.target, { threadId: "gthread-obs-1" });
    assert.deepEqual(observation.returnConditions, [{ type: "thread-reply" }]);
    assert.deepEqual(observation.authority.reads, ["gmail:exact-thread"]);
    const checkPath = `${base}/${action.id}/observations/${observation.id}/check`;
    const sentTime = Date.parse(action.executedAt);

    // A failed read grants nothing and leaves the same bounded window open for a retry.
    const failed = await call("POST", checkPath, {}, { deps: { observationAdapters: { token: "read-token", readTransport: { getThread: async () => ({ ok: false, error: "Gmail API returned 503." }) } } } });
    assert.equal(failed.status, 200);
    assert.equal(failed.body.evidence, null);
    assert.equal(failed.body.contract.lastResult.state, "failed");

    // Nothing beyond our own outbound: uninterpreted silence.
    const quietThread = { messages: [gmailMessage({ id: "gmsg-obs-1", from: "founder@drover.co", provenance: true, internalDate: sentTime })] };
    const silent = await call("POST", checkPath, {}, { deps: { observationAdapters: { token: "read-token", readTransport: { getThread: async () => ({ ok: true, payload: quietThread }) } } } });
    assert.equal(silent.body.evidence.state, "silence");
    assert.deepEqual(silent.body.evidence.facts.returns, []);
    assert.equal(silent.body.evidence.interpretation, null);

    // A newer message from someone else in the exact thread: exact response facts, no interpretation.
    const replyTime = sentTime + 60_000;
    const repliedThread = { messages: [
      gmailMessage({ id: "gmsg-obs-1", from: "founder@drover.co", provenance: true, internalDate: sentTime }),
      gmailMessage({ id: "gmsg-reply-1", from: "Ada <ada@acme.com>", internalDate: replyTime, snippet: "Yes — Thursday works." }),
    ] };
    const returned = await call("POST", checkPath, {}, { deps: { observationAdapters: { token: "read-token", readTransport: { getThread: async () => ({ ok: true, payload: repliedThread }) } } } });
    assert.equal(returned.body.evidence.state, "returned");
    assert.deepEqual(returned.body.evidence.facts.returns, [{ messageId: "gmsg-reply-1", from: "ada@acme.com", date: new Date(replyTime).toISOString(), snippet: "Yes — Thursday works." }]);
    assert.equal(returned.body.evidence.interpretation, null);

    const movement = await call("GET", `/api/ventures/${venture.id}/market-movement`);
    assert.equal(movement.body.marketMovement.actions[0].state, "returned");
  });
});

it("the gmail-thread adapter excludes our own sends and the sender, and only counts messages newer than the send", async () => {
  const sentAt = "2026-07-22T12:00:00.000Z";
  const sentTime = Date.parse(sentAt);
  const contract = { source: "gmail-thread", target: { threadId: "gthread-unit" }, sentAt, senderAddress: "founder@drover.co" };
  const thread = { messages: [
    gmailMessage({ id: "ours", from: "founder@drover.co", provenance: true, internalDate: sentTime }),
    gmailMessage({ id: "manual-followup", from: "founder@drover.co", internalDate: sentTime + 1000 }),
    gmailMessage({ id: "older", from: "ada@acme.com", internalDate: sentTime - 1000, snippet: "earlier thread history" }),
    gmailMessage({ id: "reply", from: "ada@acme.com", internalDate: sentTime + 2000, snippet: "Sounds good." }),
  ] };
  const result = await observeGmailThreadReturn(contract, {}, { token: "read-token", readTransport: { getThread: async (id) => (id === "gthread-unit" ? { ok: true, payload: thread } : { ok: false, error: "wrong thread" }) } });
  assert.equal(result.state, "returned");
  assert.equal(result.facts.messagesObserved, 4);
  assert.deepEqual(result.facts.returns, [{ messageId: "reply", from: "ada@acme.com", date: new Date(sentTime + 2000).toISOString(), snippet: "Sounds good." }]);
  assert.equal("interpretation" in result, false);
});
