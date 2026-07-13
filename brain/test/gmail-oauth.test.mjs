// gmail-oauth.test.mjs — the DURABLE Gmail auth layer, proven entirely against mocks (no browser, no
// real Google call, no real send). It pins the refresh-token flow that sits BEFORE A3's Bearer transport:
//   (a) a banked refresh token mints an access token and that token feeds the transport;
//   (b) a cached unexpired access token is reused, not re-minted;
//   (c) invalid_grant surfaces as needsReconnect and NEVER a fake send;
//   (d) the loopback callback parses the code and rejects a mismatched state (CSRF guard);
//   (e) the WALL still holds — an unapproved item never sends even with a valid, durable connection.
// Plus unit coverage of the PKCE + consent-URL construction that the founder's Google client must match.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import * as gmail from "../src/connectors/execute/gmail.mjs";
import { setOAuthCredential } from "../src/credential-store.mjs";
import { OUTWARD_RELEASE } from "../src/graph.mjs";
import {
  buildAuthUrl,
  parseCallback,
  pkcePair,
  exchangeCode,
  mintAccessToken,
  getFreshAccessToken,
  clearAccessTokenCache,
  createCallbackListener,
  GMAIL_SEND_SCOPE,
  GMAIL_READ_SCOPE,
} from "../src/connectors/execute/gmail-oauth.mjs";

// A mock token-endpoint fetch: answers the queued responses in order (last repeats), counting hits so a
// test can prove exactly how many times Google's token endpoint was reached. Never touches the network.
function mockTokenFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    const i = Math.min(calls.length, responses.length - 1);
    calls.push({ url, init });
    const { status = 200, body = {} } = responses[i];
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { impl, calls, get count() { return calls.length; } };
}

// A fake send transport that captures every message (so a test can read the credentialToken it was fed)
// and never delivers anything real.
function capturingTransport() {
  const calls = [];
  const impl = async (message) => { calls.push(message); return { ok: true, providerMessageId: `m-${calls.length}` }; };
  return { impl, calls, get count() { return calls.length; } };
}

function freshRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gtm-gmail-oauth-"));
}

// The founder-RELEASED outward path carries the host-issued outward-release capability on node.runtime
// (EXPERIMENT-MACHINE-SPEC rail 1); these live-send tests exercise that path.
const node = (config = {}) => ({
  id: "exe-gmail", category: "execute", connector: "gmail", config,
  runtime: { outwardRelease: OUTWARD_RELEASE },
});
const approvedItem = (over = {}) => ({ gtmActionId: "gtm-1", approved: true, email: "buyer@example.com", subject: "hi", draft: "Hello.", ...over });

// ─── (a) a banked refresh token mints an access token that feeds the transport ────────────────────

test("a stored refresh token mints an access token and feeds it to the transport", async () => {
  clearAccessTokenCache();
  const root = freshRoot();
  setOAuthCredential("p-test", { provider: "gmail", clientId: "cid", clientSecret: "csecret", refreshToken: "rt-a" }, { root });
  const tokenFetch = mockTokenFetch([{ status: 200, body: { access_token: "ya29.fresh-a", expires_in: 3600 } }]);
  const transport = capturingTransport();
  const context = {
    credentialOptions: { root },
    projectId: "p-test",
    oauthFetch: tokenFetch.impl,
    sendRunners: { gmail: transport.impl },
    __run: { runId: "r1", originRunId: "r1", graphId: "g1" },
  };

  const result = await gmail.run(node({ from: "founder@example.com" }), [approvedItem()], context);

  assert.equal(result.items[0].executionStatus, "sent");
  assert.equal(result.items[0].applied, true);
  assert.equal(transport.count, 1, "the transport is reached exactly once for the approved item");
  assert.equal(transport.calls[0].credentialToken, "ya29.fresh-a", "the MINTED access token is what the transport sends with");
  assert.equal(tokenFetch.count, 1, "one refresh call minted the access token");
  // The refresh call was a proper refresh_token grant carrying the banked refresh token.
  assert.match(tokenFetch.calls[0].init.body, /grant_type=refresh_token/);
  assert.match(tokenFetch.calls[0].init.body, /refresh_token=rt-a/);
});

// ─── (b) a cached unexpired access token is reused, not re-minted ──────────────────────────────────

test("a cached, unexpired access token is reused instead of minting again", async () => {
  clearAccessTokenCache();
  const tokenFetch = mockTokenFetch([{ status: 200, body: { access_token: "ya29.cached", expires_in: 3600 } }]);
  const args = { clientId: "c", clientSecret: "s", refreshToken: "rt-b", fetchImpl: tokenFetch.impl };
  const first = await getFreshAccessToken(args);
  const second = await getFreshAccessToken(args);
  assert.equal(first, "ya29.cached");
  assert.equal(second, "ya29.cached");
  assert.equal(tokenFetch.count, 1, "the second resolve reuses the cached token — no second mint");
});

test("an access token within ~1 min of expiry is re-minted, not served stale", async () => {
  clearAccessTokenCache();
  const nowRef = { t: 1_000_000 };
  const now = () => nowRef.t;
  const tokenFetch = mockTokenFetch([
    { status: 200, body: { access_token: "ya29.one", expires_in: 3600 } },
    { status: 200, body: { access_token: "ya29.two", expires_in: 3600 } },
  ]);
  const args = { clientId: "c", clientSecret: "s", refreshToken: "rt-exp", fetchImpl: tokenFetch.impl, now };
  const first = await getFreshAccessToken(args);
  assert.equal(first, "ya29.one");
  // Advance to 30s before expiry — inside the 60s refresh skew, so the cache must NOT serve it.
  nowRef.t = 1_000_000 + 3600 * 1000 - 30_000;
  const second = await getFreshAccessToken(args);
  assert.equal(second, "ya29.two", "near expiry, a fresh token is minted");
  assert.equal(tokenFetch.count, 2);
});

// ─── (c) invalid_grant → needsReconnect, never a fake send ─────────────────────────────────────────

test("a revoked refresh token (invalid_grant) surfaces needs_reconnect and never fakes a send", async () => {
  clearAccessTokenCache();
  const root = freshRoot();
  setOAuthCredential("p-test", { provider: "gmail", clientId: "cid", clientSecret: "csecret", refreshToken: "rt-revoked" }, { root });
  const tokenFetch = mockTokenFetch([{ status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } }]);
  const transport = capturingTransport();
  const context = {
    credentialOptions: { root },
    projectId: "p-test",
    oauthFetch: tokenFetch.impl,
    sendRunners: { gmail: transport.impl },
    __run: { runId: "r1", originRunId: "r1", graphId: "g1" },
  };

  const result = await gmail.run(node(), [approvedItem()], context);

  assert.equal(transport.count, 0, "a revoked grant NEVER reaches the send transport");
  assert.equal(result.meta.sent, 0);
  // Honest blocked needs-reconnect — not a silent staged no-op that reads like success.
  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
  assert.equal(result.items[0].executionStatus, "needs_reconnect");
  assert.equal(result.items[0].needsReconnect, true);
  assert.equal(result.meta.blocked, "needs_reconnect");
});

test("mintAccessToken throws a needsReconnect error on invalid_grant", async () => {
  clearAccessTokenCache();
  const tokenFetch = mockTokenFetch([{ status: 400, body: { error: "invalid_grant" } }]);
  await assert.rejects(
    () => mintAccessToken({ clientId: "c", clientSecret: "s", refreshToken: "rt", fetchImpl: tokenFetch.impl }),
    (err) => err.needsReconnect === true,
  );
});

// ─── (d) the loopback callback parses the code and rejects a mismatched state ──────────────────────

test("the loopback listener catches a valid callback and yields its code", async () => {
  const state = "state-good-xyz";
  const listener = createCallbackListener({ expectedState: state });
  const port = await listener.listen();
  const res = await fetch(`http://127.0.0.1:${port}/?code=auth-code-1&state=${state}`);
  assert.equal(res.status, 200);
  const { code } = await listener.waitForCode();
  assert.equal(code, "auth-code-1");
  listener.server.close();
});

test("the loopback listener REJECTS a mismatched state param (CSRF guard)", async () => {
  const listener = createCallbackListener({ expectedState: "the-real-state" });
  const port = await listener.listen();
  const res = await fetch(`http://127.0.0.1:${port}/?code=x&state=forged`);
  assert.equal(res.status, 400);
  await assert.rejects(listener.waitForCode(), /state mismatch/i);
  listener.server.close();
});

test("parseCallback accepts a matching state and rejects a mismatch, missing code, and error param", () => {
  assert.deepEqual(parseCallback("/?code=abc&state=s1", "s1"), { code: "abc" });
  assert.throws(() => parseCallback("/?code=abc&state=other", "s1"), /state mismatch/i);
  assert.throws(() => parseCallback("/?state=s1", "s1"), /no authorization code/i);
  assert.throws(() => parseCallback("/?error=access_denied&state=s1", "s1"), /OAuth error/i);
});

// ─── (e) the WALL still holds — an unapproved item never sends, even with a valid connection ───────

test("WALL — with a valid durable Gmail connection, an UNAPPROVED item is still never sent", async () => {
  clearAccessTokenCache();
  const root = freshRoot();
  setOAuthCredential("p-test", { provider: "gmail", clientId: "cid", clientSecret: "csecret", refreshToken: "rt-e" }, { root });
  const tokenFetch = mockTokenFetch([{ status: 200, body: { access_token: "ya29.valid", expires_in: 3600 } }]);
  const transport = capturingTransport();
  const context = {
    credentialOptions: { root },
    projectId: "p-test",
    oauthFetch: tokenFetch.impl,
    sendRunners: { gmail: transport.impl },
    __run: { runId: "r1", originRunId: "r1", graphId: "g1" },
  };

  const result = await gmail.run(node(), [{ gtmActionId: "a", email: "x@example.com", draft: "no", approved: false }], context);

  assert.equal(transport.count, 0, "the send transport is never reached for an item the founder did not approve");
  assert.equal(tokenFetch.count, 0, "with nothing approved, no token is even minted");
  assert.equal(result.meta.sent, 0);
});

// ─── supporting: the consent URL + PKCE the founder's Google Desktop client must match ─────────────

test("buildAuthUrl requests offline access, forced consent, S256 PKCE, and the send + reply-read scopes", () => {
  const url = new URL(buildAuthUrl({ clientId: "cid", redirectUri: "http://127.0.0.1:5051", state: "st", codeChallenge: "chal" }));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("redirect_uri"), "http://127.0.0.1:5051");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.deepEqual(
    new Set(url.searchParams.get("scope").split(" ")),
    new Set([GMAIL_SEND_SCOPE, GMAIL_READ_SCOPE]),
  );
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("code_challenge"), "chal");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});

test("pkcePair produces a challenge that is the S256 of its verifier", () => {
  const { verifier, challenge } = pkcePair();
  const expected = crypto.createHash("sha256").update(verifier).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.equal(challenge, expected);
});

test("exchangeCode returns the refresh token banked from the code grant", async () => {
  const tokenFetch = mockTokenFetch([{ status: 200, body: { access_token: "ya29.x", refresh_token: "rt-new", expires_in: 3600, scope: GMAIL_SEND_SCOPE } }]);
  const tokens = await exchangeCode({
    clientId: "cid", clientSecret: "csecret", code: "code-1", codeVerifier: "ver", redirectUri: "http://127.0.0.1:5051", fetchImpl: tokenFetch.impl,
  });
  assert.equal(tokens.refreshToken, "rt-new");
  assert.match(tokenFetch.calls[0].init.body, /grant_type=authorization_code/);
  assert.match(tokenFetch.calls[0].init.body, /code_verifier=ver/);
});
