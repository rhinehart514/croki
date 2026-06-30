// gmail-sender.test.mjs — the gated BYO Gmail sender + its non-negotiable invariant.
//
// SENDING IS THE WALL: a message leaves ONLY after an explicit founder gate approval
// (item.approved === true, stamped by the gate at run time) — NEVER from composition, a run, or a
// connector default. These tests pin that invariant with a FAKE transport and an EMPTY credential
// store, and prove the three guardrails (rate limit, provenance, recall) and the honest no-op.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as gmail from "../src/connectors/execute/gmail.mjs";
import { getConnector, defaultGraphTemplate } from "../src/connectors/registry.mjs";
import { setCredential } from "../src/credential-store.mjs";

// A fake transport that records every call and NEVER touches the real world. It also captures the
// arguments so a test can assert the token was passed to it (and only to it) and the provenance header.
function fakeTransport({ fail = false } = {}) {
  const calls = [];
  const impl = async (message) => {
    calls.push(message);
    if (fail) return { ok: false, error: "fake transport refused" };
    return { ok: true, providerMessageId: `msg-${calls.length}`, recallHandle: `live-recall-${calls.length}` };
  };
  return { impl, calls, get count() { return calls.length; } };
}

// An EMPTY credential store rooted in a throwaway temp dir — no stored credential, so resolution falls
// to env (also unset in these tests) → null → honest staged no-op.
function emptyCredentialContext(extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-gmail-creds-"));
  return { context: { credentialOptions: { root }, projectId: "p-test", ...extra }, root };
}

const SECRET = "gmail-byo-secret-token-xyz";

// A context whose credential store HAS the founder's pasted Gmail token (the BYO path).
function credentialedContext(extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-gmail-creds-"));
  setCredential("p-test", { provider: "gmail", token: SECRET }, { root });
  return { context: { credentialOptions: { root }, projectId: "p-test", ...extra }, root };
}

const node = (config = {}) => ({ id: "exe-gmail", category: "execute", connector: "gmail", config });

const approvedItem = (over = {}) => ({
  gtmActionId: "gtm-send-1",
  approved: true,
  email: "founder@example.com",
  subject: "hi",
  draft: "Hello there.",
  ...over,
});

// ─── GATE PROOF: no send without an explicit founder approval ─────────────────────────────────

test("GATE PROOF — an UNAPPROVED item is never sent, even with a credential AND a wired transport", async () => {
  const t = fakeTransport();
  const { context } = credentialedContext();
  const result = await gmail.run(
    node({ transport: t.impl }),
    [
      { gtmActionId: "a", approved: false, email: "x@example.com", draft: "no" },
      { gtmActionId: "b", email: "y@example.com", draft: "also no" }, // approved undefined
    ],
    context,
  );
  // The exact assertion proving no send without founder approval:
  assert.equal(t.count, 0, "the transport must NEVER be called for an item the founder did not approve");
  assert.equal(result.meta.sent, 0);
  assert.deepEqual(result.items, []);
  assert.equal(result.ok, true);
});

test("INVARIANT — approval is read from the ITEM, never from composition-writable config or context", async () => {
  const t = fakeTransport();
  const { context } = credentialedContext({ approved: true }); // a forged context flag
  const result = await gmail.run(
    node({ transport: t.impl, approved: true, autonomy: "autonomous" }), // forged config flags
    [{ gtmActionId: "a", email: "x@example.com", draft: "no" }], // the ITEM is NOT approved
    context,
  );
  assert.equal(t.count, 0, "a config/context-forged approval can never send — only the item's gate stamp can");
  assert.equal(result.meta.sent, 0);
});

// ─── Honest no-op without a credential (never a fake "sent") ───────────────────────────────────

test("without a resolved credential, an approved item is STAGED — honest no-op, never a fake send", async () => {
  const prior = { g: process.env.GMAIL_OAUTH_TOKEN, go: process.env.GOOGLE_OAUTH_TOKEN };
  delete process.env.GMAIL_OAUTH_TOKEN;
  delete process.env.GOOGLE_OAUTH_TOKEN;
  try {
    const t = fakeTransport();
    const { context } = emptyCredentialContext(); // empty store
    const result = await gmail.run(node({ transport: t.impl }), [approvedItem()], context);
    assert.equal(t.count, 0, "no credential → the transport is never called");
    assert.equal(result.meta.sent, 0);
    assert.equal(result.meta.staged, 1);
    assert.equal(result.meta.blocked, "missing_credential");
    const item = result.items[0];
    assert.equal(item.applied, false);
    assert.equal(item.executionStatus, "staged");
    assert.notEqual(item.executionStatus, "sent");
  } finally {
    if (prior.g !== undefined) process.env.GMAIL_OAUTH_TOKEN = prior.g;
    if (prior.go !== undefined) process.env.GOOGLE_OAUTH_TOKEN = prior.go;
  }
});

test("with a credential but NO wired transport, an approved item is staged (honest no-op)", async () => {
  const { context } = credentialedContext();
  const result = await gmail.run(node({}), [approvedItem()], context); // no transport
  assert.equal(result.meta.sent, 0);
  assert.equal(result.meta.staged, 1);
  assert.equal(result.meta.blocked, "missing_transport");
  assert.equal(result.items[0].executionStatus, "staged");
});

// ─── The happy path: credential + transport + gate stamp → a real (faked) send ─────────────────

test("with a credential, a transport, AND a gate-approved item, the message sends", async () => {
  const t = fakeTransport();
  const { context } = credentialedContext();
  const result = await gmail.run(node({ transport: t.impl, from: "jacob@example.com" }), [approvedItem()], context);
  assert.equal(result.ok, true);
  assert.equal(t.count, 1);
  assert.equal(result.meta.sent, 1);
  const item = result.items[0];
  assert.equal(item.applied, true);
  assert.equal(item.executionStatus, "sent");
  assert.equal(item.providerMessageId, "msg-1");
});

// ─── SECURITY: the token is handed to the transport and NOTHING else; never logged/returned ────

test("the resolved token reaches the transport but is NEVER placed on a returned item or meta", async () => {
  const t = fakeTransport();
  const { context } = credentialedContext();
  const result = await gmail.run(node({ transport: t.impl }), [approvedItem()], context);
  // The transport received the token (it needs it to send).
  assert.equal(t.calls[0].credentialToken, SECRET);
  // But the secret never leaks into the returned result.
  assert.equal(JSON.stringify(result).includes(SECRET), false, "the token must never appear in the connector's output");
});

// ─── GUARDRAIL 1: the per-run rate cap REFUSES to exceed N sends ────────────────────────────────

test("GUARDRAIL rate limit — sends up to the cap and holds the rest, never exceeding N", async () => {
  const t = fakeTransport();
  const { context } = credentialedContext();
  const items = [1, 2, 3, 4, 5].map((n) => approvedItem({ gtmActionId: `gtm-${n}` }));
  const result = await gmail.run(node({ transport: t.impl, rateLimit: 2 }), items, context);
  assert.equal(t.count, 2, "the transport is invoked at most `cap` times");
  assert.equal(result.meta.sent, 2);
  assert.equal(result.meta.rateLimited, 3);
  const held = result.items.filter((i) => i.executionStatus === "rate_limited");
  assert.equal(held.length, 3);
  assert.ok(held.every((i) => i.applied === false));
});

test("GUARDRAIL rate limit — a window budget already consumed is subtracted from the cap", async () => {
  const t = fakeTransport();
  const { context } = credentialedContext({ rateLimit: { windowSent: 2 } });
  const items = [1, 2, 3].map((n) => approvedItem({ gtmActionId: `gtm-${n}` }));
  const result = await gmail.run(node({ transport: t.impl, rateLimit: 3 }), items, context);
  assert.equal(t.count, 1, "cap 3 minus 2 already sent this window = 1 remaining");
  assert.equal(result.meta.sent, 1);
  assert.equal(result.meta.rateLimited, 2);
});

// ─── GUARDRAIL 2: provenance ───────────────────────────────────────────────────────────────────

test("GUARDRAIL provenance — every send carries a stamped marker tying it to the run + item", async () => {
  const t = fakeTransport();
  const { context } = credentialedContext();
  context.__run = { runId: "run-9", originRunId: "run-9", graphId: "flow-7" };
  const result = await gmail.run(node({ transport: t.impl }), [approvedItem({ gtmActionId: "gtm-prov" })], context);
  const sent = result.items[0];
  assert.equal(sent.provenance.runId, "run-9");
  assert.equal(sent.provenance.graphId, "flow-7");
  assert.equal(sent.provenance.gtmActionId, "gtm-prov");
  // The provenance also rides the outbound message headers.
  const header = JSON.parse(t.calls[0].headers["X-GTM-IDE-Provenance"]);
  assert.equal(header.gtmActionId, "gtm-prov");
  assert.equal(header.runId, "run-9");
});

test("GUARDRAIL provenance — a non-attributable item (no gtmActionId) is REFUSED, never sent", async () => {
  const t = fakeTransport();
  const { context } = credentialedContext();
  const result = await gmail.run(node({ transport: t.impl }), [approvedItem({ gtmActionId: undefined })], context);
  assert.equal(t.count, 0, "a send with no attribution id never reaches the transport");
  assert.equal(result.ok, false);
  assert.match(result.items[0].error, /non-attributable/i);
});

// ─── GUARDRAIL 3: recall window ────────────────────────────────────────────────────────────────

test("GUARDRAIL recall — every send records a recall handle and an undo window", async () => {
  const t = fakeTransport();
  const { context } = credentialedContext();
  const result = await gmail.run(node({ transport: t.impl, recallWindowMs: 60_000 }), [approvedItem({ gtmActionId: "gtm-r" })], context);
  const recall = result.items[0].recall;
  assert.equal(recall.handle, "recall-gtm-r");
  assert.equal(recall.windowMs, 60_000);
  assert.ok(recall.recallableUntil);
  assert.equal(recall.transportRecall, "live-recall-1", "a live transport recall token is recorded as the injection point");
  // Recallable now, not after the window passes — an honest window, not a fake undo.
  assert.equal(gmail.isRecallable(recall, Date.now()), true);
  assert.equal(gmail.isRecallable(recall, Date.now() + 120_000), false);
});

// ─── A transport failure is recorded as a failure, never swallowed or faked sent ───────────────

test("a transport failure is recorded as failed — never a fake sent", async () => {
  const t = fakeTransport({ fail: true });
  const { context } = credentialedContext();
  const result = await gmail.run(node({ transport: t.impl }), [approvedItem()], context);
  assert.equal(result.ok, false);
  assert.equal(result.meta.sent, 0);
  assert.equal(result.items[0].executionStatus, "failed");
  assert.notEqual(result.items[0].executionStatus, "sent");
});

// ─── Registry + meta wall ──────────────────────────────────────────────────────────────────────

test("declares the wall in its meta and registers in the execute family without disturbing the template", () => {
  assert.equal(gmail.meta.category, "execute");
  assert.ok(gmail.meta.allowed.includes("send"));
  for (const verb of ["send_without_approval", "send_from_composition", "send_from_run"]) {
    assert.ok(gmail.meta.blocked.includes(verb), `expected blocked verb: ${verb}`);
  }
  const connector = getConnector("execute", "gmail");
  assert.ok(connector, "gmail connector should resolve from the registry");
  assert.equal(connector.meta.id, "gmail");
  // The other execute connectors still resolve.
  assert.ok(getConnector("execute", "local"));
  assert.ok(getConnector("execute", "http"));
  assert.ok(getConnector("execute", "deploy"));
  // The default template is untouched — still a single local execute node, no gmail node.
  const exeNodes = defaultGraphTemplate().nodes.filter((n) => n.category === "execute");
  assert.equal(exeNodes.length, 1);
  assert.equal(exeNodes[0].connector, "local");
});
