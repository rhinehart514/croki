// needs-connection.test.mjs — the honest last-mile: an approved item that CANNOT send says so.
//
// THE BUG THIS PINS. Before, an approved item with no connection quietly fell back to a local stage that
// returned ok:true and read like success — the founder believed the message went out when nothing did.
// The fix: every real sender (Gmail, HTTP, Slack) that cannot send because nothing is connected returns an
// explicit BLOCKED `needs_connection` result — machine-readable, distinct from a genuine failure, distinct
// from the local connector's intentional stage — so the run surfaces "connect to send" and the founder is
// never fooled. This file proves that shared contract across all three channels + the channel registry.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as gmail from "../src/connectors/execute/gmail.mjs";
import * as http from "../src/connectors/execute/http.mjs";
import * as slack from "../src/connectors/execute/slack.mjs";
import { needsConnectionResult, listChannels, getChannel } from "../src/connectors/execute/channels.mjs";
import { getConnector } from "../src/connectors/registry.mjs";
import { OUTWARD_RELEASE } from "../src/graph.mjs";

// The founder-RELEASED outward path carries this host-issued capability on node.runtime (rail 1). These
// tests pin the needs-connection / attribution / wall contracts, which all live DOWNSTREAM of the release
// gate, so each outward node that reaches them is a released one. (The rail-1 hold itself — an outward node
// WITHOUT this capability holding every approved item — is proven in outward-release.test.mjs.)
const RELEASED = { outwardRelease: OUTWARD_RELEASE };

// An isolated, empty credential store so nothing is "connected" — the exact state the fix must be honest
// about. Env send-keys are cleared per test where they matter.
function emptyContext(extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-needs-conn-"));
  return { credentialOptions: { root }, credentials: { options: { root } }, projectId: "p-nc", ...extra };
}

const approvedItem = (over = {}) => ({
  gtmActionId: "gtm-nc-1",
  approved: true,
  email: "founder@example.com",
  subject: "hi",
  draft: "Hello there.",
  ...over,
});

// A transport that would record a send if it were ever called — proves the wall holds: no connection means
// the transport is NEVER reached, so nothing is faked sent.
function spyTransport() {
  const calls = [];
  return { impl: async (m) => { calls.push(m); return { ok: true }; }, get count() { return calls.length; } };
}

// ─── The shared shape (unit) ────────────────────────────────────────────────────────────────────

test("needsConnectionResult is a BLOCKED (not failed, not staged) result carrying the items intact", () => {
  const r = needsConnectionResult({
    channel: "gmail",
    reason: "needs_connection",
    message: "Connect Gmail to send.",
    items: [approvedItem()],
  });
  assert.equal(r.ok, false);
  assert.equal(r.blocked, true, "blocked, so the engine treats it as a not-green blocked node, never a success");
  assert.equal(r.blockedReason, "needs_connection");
  assert.equal(r.needsConnection, true);
  assert.equal(r.channel, "gmail");
  assert.equal(r.meta.needsConnection, 1);
  const item = r.items[0];
  assert.equal(item.executionStatus, "needs_connection");
  assert.equal(item.applied, false);
  assert.equal(item.sentAt, null);
  // The approved work is preserved — the founder loses nothing.
  assert.equal(item.draft, "Hello there.");
  assert.equal(item.gtmActionId, "gtm-nc-1");
});

test("needs_reconnect is the sharper variant (a stale grant), still blocked", () => {
  const r = needsConnectionResult({ channel: "gmail", reason: "needs_reconnect", message: "Reconnect Gmail.", items: [approvedItem()] });
  assert.equal(r.blockedReason, "needs_reconnect");
  assert.equal(r.needsReconnect, true);
  assert.equal(r.items[0].executionStatus, "needs_reconnect");
  assert.equal(r.items[0].needsReconnect, true);
});

// ─── Gmail — no connection → blocked, never a silent stage ───────────────────────────────────────

test("GMAIL — an approved item with no connection is BLOCKED needs_connection, transport never called", async () => {
  const prior = { g: process.env.GMAIL_OAUTH_TOKEN, go: process.env.GOOGLE_OAUTH_TOKEN };
  delete process.env.GMAIL_OAUTH_TOKEN;
  delete process.env.GOOGLE_OAUTH_TOKEN;
  try {
    const t = spyTransport();
    const result = await gmail.run(
      { id: "exe", category: "execute", connector: "gmail", config: { transport: t.impl }, runtime: RELEASED },
      [approvedItem()],
      emptyContext(),
    );
    assert.equal(t.count, 0, "no connection → the send transport is never reached");
    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.equal(result.blockedReason, "needs_connection");
    assert.equal(result.items[0].executionStatus, "needs_connection");
    assert.notEqual(result.items[0].executionStatus, "sent");
    assert.notEqual(result.items[0].executionStatus, "staged");
  } finally {
    if (prior.g !== undefined) process.env.GMAIL_OAUTH_TOKEN = prior.g;
    if (prior.go !== undefined) process.env.GOOGLE_OAUTH_TOKEN = prior.go;
  }
});

// ─── HTTP — no endpoint connected → blocked needs_connection (not a bare error, not a silent stage) ─

test("HTTP — approved items with no endpoint connected are BLOCKED needs_connection, carried intact", async () => {
  const prior = process.env.GTM_IDE_SEND_ENDPOINT;
  delete process.env.GTM_IDE_SEND_ENDPOINT;
  try {
    const result = await http.run(
      { config: {}, runtime: RELEASED },
      [approvedItem({ gtmActionId: "gtm-http-1" })],
      emptyContext(),
    );
    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.equal(result.blockedReason, "needs_connection");
    assert.equal(result.meta.needsConnection, 1);
    assert.equal(result.items[0].executionStatus, "needs_connection");
    assert.equal(result.items[0].draft, "Hello there.", "approved content is preserved");
  } finally {
    if (prior !== undefined) process.env.GTM_IDE_SEND_ENDPOINT = prior;
  }
});

test("HTTP — with nothing approved and no endpoint, it's a plain no-op (nothing to block on)", async () => {
  const prior = process.env.GTM_IDE_SEND_ENDPOINT;
  delete process.env.GTM_IDE_SEND_ENDPOINT;
  try {
    const result = await http.run({ config: {} }, [{ approved: false }], emptyContext());
    assert.equal(result.ok, true);
    assert.equal(result.items.length, 0);
  } finally {
    if (prior !== undefined) process.env.GTM_IDE_SEND_ENDPOINT = prior;
  }
});

// ─── Slack — the third channel proves the menu isn't email-shaped, same contract ─────────────────

test("SLACK — no webhook connected → BLOCKED needs_connection, transport never called", async () => {
  const prior = process.env.GTM_IDE_SLACK_WEBHOOK;
  delete process.env.GTM_IDE_SLACK_WEBHOOK;
  try {
    const t = spyTransport();
    const result = await slack.run(
      { id: "exe", category: "execute", connector: "slack", config: {}, runtime: RELEASED },
      [approvedItem({ gtmActionId: "gtm-slack-1" })],
      { ...emptyContext(), sendRunners: { slack: t.impl } },
    );
    assert.equal(t.count, 0, "no webhook → the transport is never reached");
    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.equal(result.blockedReason, "needs_connection");
    assert.equal(result.channel, "slack");
    assert.equal(result.items[0].executionStatus, "needs_connection");
  } finally {
    if (prior !== undefined) process.env.GTM_IDE_SLACK_WEBHOOK = prior;
  }
});

test("SLACK — the WALL holds: an UNAPPROVED item never posts, even with a webhook connected", async () => {
  const posts = [];
  const result = await slack.run(
    { id: "exe", category: "execute", connector: "slack", config: { webhook: "https://hooks.slack.example/x", fetchImpl: async (u, o) => { posts.push({ u, o }); return { ok: true, status: 200 }; } } },
    [{ gtmActionId: "a", approved: false, draft: "no" }],
    emptyContext(),
  );
  assert.equal(posts.length, 0, "an item the founder did not approve never posts");
  assert.equal(result.meta.sent, 0);
  assert.deepEqual(result.items, []);
});

test("SLACK — an approved item WITH a connected webhook actually posts (happy path)", async () => {
  const posts = [];
  const result = await slack.run(
    { id: "exe", category: "execute", connector: "slack", config: { webhook: "https://hooks.slack.example/x", fetchImpl: async (u, o) => { posts.push({ u, o }); return { ok: true, status: 200 }; } }, runtime: RELEASED },
    [approvedItem({ gtmActionId: "gtm-slack-ok" })],
    emptyContext(),
  );
  assert.equal(posts.length, 1, "the connected webhook is posted to exactly once");
  assert.equal(result.ok, true);
  assert.equal(result.meta.sent, 1);
  assert.equal(result.items[0].executionStatus, "sent");
  assert.equal(JSON.parse(posts[0].o.body).gtmActionId, "gtm-slack-ok", "attribution rides the post");
});

test("SLACK — an approved item with no gtmActionId is refused (non-attributable), never posted", async () => {
  const posts = [];
  const result = await slack.run(
    { id: "exe", category: "execute", connector: "slack", config: { webhook: "https://hooks.slack.example/x", fetchImpl: async (u, o) => { posts.push({ u, o }); return { ok: true, status: 200 }; } }, runtime: RELEASED },
    [approvedItem({ gtmActionId: undefined })],
    emptyContext(),
  );
  assert.equal(posts.length, 0);
  assert.equal(result.ok, false);
  assert.match(result.items[0].error, /non-attributable/i);
});

// ─── The channel registry — extensible, and Slack is a first-class entry ─────────────────────────

test("the channel registry lists Gmail, HTTP, and the new Slack channel; each connector resolves", () => {
  const ids = listChannels().map((c) => c.id);
  assert.ok(ids.includes("gmail"));
  assert.ok(ids.includes("http"));
  assert.ok(ids.includes("slack"), "the menu is no longer email-shaped — a third channel is registered");
  // Slack is honestly marked a stub.
  assert.equal(getChannel("slack").stub, true);
  assert.equal(getChannel("gmail").stub, false);
  // Every channel's execute connector resolves from the registry.
  for (const c of listChannels()) {
    assert.ok(getConnector("execute", c.connector), `execute connector "${c.connector}" should resolve`);
  }
});

test("slack connector declares the wall in its meta and registers in the execute family", () => {
  assert.equal(slack.meta.category, "execute");
  assert.ok(slack.meta.allowed.includes("send"));
  for (const verb of ["send_without_approval", "send_from_composition", "send_from_run"]) {
    assert.ok(slack.meta.blocked.includes(verb), `expected blocked verb: ${verb}`);
  }
});
