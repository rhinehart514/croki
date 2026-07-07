// gmail-transport.test.mjs — the REAL Gmail send leg, proven against a mock (no network, no real send).
//
// This pins the transport gmail.mjs injects: it turns an approved, provenance-stamped message into one
// Gmail REST API call and reports honestly. Paired with gmail-sender.test.mjs (the wall + guardrails),
// these two cover the whole send path end to end WITHOUT ever sending a real email. The last test wires
// the real transport THROUGH the connector to prove: no gate stamp → the transport is never called; a
// gate-approved item with a credential + this transport → it reaches a real (mocked) send.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createGmailTransport, defaultSendRunners } from "../src/connectors/execute/gmail-transport.mjs";
import * as gmail from "../src/connectors/execute/gmail.mjs";
import { setCredential } from "../src/credential-store.mjs";

const TOKEN = "ya29.mock-access-token-abc";

// A mock fetch that records the one request it is given and answers with a scriptable response. It never
// touches the network. `capture` lets a test read exactly what was about to go on the wire.
function mockFetch({ status = 200, body = { id: "gmail-msg-1" }, throwErr = null } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (throwErr) throw throwErr;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };
  return { impl, calls, get count() { return calls.length; } };
}

const message = (over = {}) => ({
  to: "recipient@example.com",
  from: "founder@example.com",
  subject: "Hello",
  body: "This is the body.",
  headers: { "X-GTM-IDE-Provenance": JSON.stringify({ marker: "gtm-ide", runId: "run-1", gtmActionId: "gtm-1" }) },
  credentialToken: TOKEN,
  ...over,
});

// Decode the base64url `raw` field back into the RFC 2822 message a test can assert on.
function decodeRaw(rawField) {
  const b64 = rawField.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

test("sends a message via the Gmail API and returns the provider message id", async () => {
  const f = mockFetch({ status: 200, body: { id: "gmail-msg-xyz" } });
  const transport = createGmailTransport({ fetchImpl: f.impl });
  const result = await transport(message());
  assert.equal(result.ok, true);
  assert.equal(result.providerMessageId, "gmail-msg-xyz");
  assert.equal(f.count, 1);
  // The request is a POST to the Gmail send endpoint with a Bearer token.
  const { url, init } = f.calls[0];
  assert.match(url, /gmail\.googleapis\.com.*messages\/send/);
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
});

test("the outbound raw message carries To, Subject, provenance header, and the body", async () => {
  const f = mockFetch();
  const transport = createGmailTransport({ fetchImpl: f.impl });
  await transport(message());
  const sentBody = JSON.parse(f.calls[0].init.body);
  const raw = decodeRaw(sentBody.raw);
  assert.match(raw, /To: recipient@example\.com/);
  assert.match(raw, /From: founder@example\.com/);
  assert.match(raw, /Subject: Hello/);
  assert.match(raw, /X-GTM-IDE-Provenance: /);
  // The provenance value survives intact on the wire (the tie back to the run + item).
  const provLine = raw.split("\r\n").find((l) => l.startsWith("X-GTM-IDE-Provenance:"));
  const prov = JSON.parse(provLine.slice("X-GTM-IDE-Provenance:".length).trim());
  assert.equal(prov.gtmActionId, "gtm-1");
  // The body (base64 CTE) decodes back to the original text.
  const bodyB64 = raw.split("\r\n\r\n")[1];
  assert.equal(Buffer.from(bodyB64, "base64").toString("utf8"), "This is the body.");
});

test("the token reaches the API but never appears in the transport's return value", async () => {
  const f = mockFetch();
  const transport = createGmailTransport({ fetchImpl: f.impl });
  const result = await transport(message());
  assert.equal(f.calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(JSON.stringify(result).includes(TOKEN), false, "the token must never be in the transport's output");
});

test("a non-ASCII subject is RFC 2047 encoded so it survives the wire", async () => {
  const f = mockFetch();
  const transport = createGmailTransport({ fetchImpl: f.impl });
  await transport(message({ subject: "Café ☕ update" }));
  const raw = decodeRaw(JSON.parse(f.calls[0].init.body).raw);
  const subjectLine = raw.split("\r\n").find((l) => l.startsWith("Subject:"));
  assert.match(subjectLine, /=\?UTF-8\?B\?/, "a unicode subject must be encoded, not sent raw");
});

test("a header-injection attempt in the subject cannot smuggle a second header", async () => {
  const f = mockFetch();
  const transport = createGmailTransport({ fetchImpl: f.impl });
  await transport(message({ subject: "ok\r\nBcc: sneaky@evil.com" }));
  const raw = decodeRaw(JSON.parse(f.calls[0].init.body).raw);
  assert.equal(/^Bcc:/m.test(raw), false, "CR/LF in a header value must be folded, never become a new header");
});

test("no recipient is an honest failure, never a send", async () => {
  const f = mockFetch();
  const transport = createGmailTransport({ fetchImpl: f.impl });
  const result = await transport(message({ to: null }));
  assert.equal(result.ok, false);
  assert.equal(f.count, 0, "with no recipient the API is never called");
  assert.match(result.error, /recipient|To/i);
});

test("a 401 from Google surfaces as a reconnect signal, never a fake send", async () => {
  const f = mockFetch({ status: 401, body: { error: { message: "Invalid Credentials" } } });
  const transport = createGmailTransport({ fetchImpl: f.impl });
  const result = await transport(message());
  assert.equal(result.ok, false);
  assert.equal(result.needsReconnect, true);
  assert.match(result.error, /401/);
});

test("a network error is caught and returned as a failure, never thrown", async () => {
  const f = mockFetch({ throwErr: new Error("network down") });
  const transport = createGmailTransport({ fetchImpl: f.impl });
  const result = await transport(message());
  assert.equal(result.ok, false);
  assert.match(result.error, /network down/);
});

test("defaultSendRunners exposes a gmail runner", () => {
  const runners = defaultSendRunners();
  assert.equal(typeof runners.gmail, "function");
});

// ─── THROUGH THE CONNECTOR: the wall holds, and an approved item reaches a real (mocked) send ──────

function credentialedContext(sendRunners) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-gmail-tx-"));
  setCredential("p-test", { provider: "gmail", token: TOKEN }, { root });
  return { credentialOptions: { root }, projectId: "p-test", sendRunners };
}

const node = (config = {}) => ({ id: "exe-gmail", category: "execute", connector: "gmail", config });

test("WALL — with the real transport wired, an UNAPPROVED item is still never sent", async () => {
  const f = mockFetch();
  const context = credentialedContext({ gmail: createGmailTransport({ fetchImpl: f.impl }) });
  const result = await gmail.run(
    node(),
    [{ gtmActionId: "a", email: "x@example.com", draft: "no", approved: false }],
    context,
  );
  assert.equal(f.count, 0, "the transport must never be reached for an item the founder did not approve");
  assert.equal(result.meta.sent, 0);
});

test("SEND — a gate-approved item with a credential + the real transport reaches a live send", async () => {
  const f = mockFetch({ status: 200, body: { id: "gmail-live-1" } });
  const context = credentialedContext({ gmail: createGmailTransport({ fetchImpl: f.impl }) });
  context.__run = { runId: "run-42", originRunId: "run-42", graphId: "flow-9" };
  const result = await gmail.run(
    node({ from: "founder@example.com" }),
    [{ gtmActionId: "gtm-live", approved: true, email: "buyer@example.com", subject: "hi", draft: "Hello." }],
    context,
  );
  assert.equal(result.ok, true);
  assert.equal(f.count, 1, "an approved item reaches the Gmail API exactly once");
  const item = result.items[0];
  assert.equal(item.executionStatus, "sent");
  assert.equal(item.applied, true);
  assert.equal(item.providerMessageId, "gmail-live-1");
  // Provenance made it onto the wire, tying the send to the run + item.
  const raw = decodeRaw(JSON.parse(f.calls[0].init.body).raw);
  assert.match(raw, /X-GTM-IDE-Provenance:/);
  const provLine = raw.split("\r\n").find((l) => l.startsWith("X-GTM-IDE-Provenance:"));
  assert.equal(JSON.parse(provLine.slice("X-GTM-IDE-Provenance:".length).trim()).runId, "run-42");
});
