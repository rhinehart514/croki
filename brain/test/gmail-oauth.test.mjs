// gmail-oauth.test.mjs — the DURABLE Gmail auth layer, proven entirely against mocks (no browser, no
// real Google call, no real send). It pins the refresh-token flow, cache behavior, reconnect signal,
// and loopback callback/PKCE protections independently of the retired graph execute connector.
// Plus unit coverage of the PKCE + consent-URL construction that the founder's Google client must match.

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  buildAuthUrl,
  parseCallback,
  pkcePair,
  exchangeCode,
  mintAccessToken,
  getFreshAccessToken,
  clearAccessTokenCache,
  createCallbackListener,
  resolveGmailProfileAddress,
  runLoopbackConnect,
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

test("Gmail profile lookup returns only the provider-backed mailbox address and fails to absence", async () => {
  const calls = [];
  const address = await resolveGmailProfileAddress({
    accessToken: "ya29.profile",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({ emailAddress: "Founder@Example.com" }) };
    },
  });
  assert.equal(address, "founder@example.com");
  assert.match(calls[0].url, /gmail\/v1\/users\/me\/profile$/);
  assert.equal(calls[0].init.headers.Authorization, "Bearer ya29.profile");

  assert.equal(await resolveGmailProfileAddress({
    accessToken: "ya29.denied",
    fetchImpl: async () => ({ ok: false, json: async () => ({ error: "denied" }) }),
  }), null);
  assert.equal(await resolveGmailProfileAddress({
    accessToken: "ya29.malformed",
    fetchImpl: async () => ({ ok: true, json: async () => ({ emailAddress: "not-an-address" }) }),
  }), null);
});

test("the connect flow returns the verified Gmail profile address beside the durable refresh token", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (String(url).includes("/token")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "ya29.connected", refresh_token: "rt-connected", expires_in: 3600 }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ emailAddress: "Founder@Example.com" }) };
  };
  const connected = await runLoopbackConnect({
    clientId: "client",
    clientSecret: "secret",
    fetchImpl,
    openBrowser: async (rawAuthUrl) => {
      const authUrl = new URL(rawAuthUrl);
      const redirectUri = authUrl.searchParams.get("redirect_uri");
      const state = authUrl.searchParams.get("state");
      const response = await fetch(`${redirectUri}/?code=profile-code&state=${encodeURIComponent(state)}`);
      assert.equal(response.status, 200);
    },
  });
  assert.deepEqual(connected, { refreshToken: "rt-connected", accountAddress: "founder@example.com" });
  assert.equal(calls.some((call) => String(call.url).endsWith("/users/me/profile")), true);
});
