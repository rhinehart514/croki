// gmail-oauth.mjs — the DURABLE auth layer that sits BEFORE A3's Bearer send seam.
//
// A3's gmail-transport.mjs already speaks Bearer: it takes a `credentialToken` (an OAuth access token
// for the gmail.send scope) and delivers one message. A raw access token expires in ~1h, so pasting one
// is a chore the founder repeats forever. This module removes that chore: the founder connects Gmail ONCE
// via a loopback OAuth flow, we bank a REFRESH token, and at send time we mint a fresh access token from
// it and hand THAT to the unchanged transport. Nothing here sends, gates, or caps — gmail.mjs still owns
// the wall and the guardrails; this only supplies the key an already-approved send will leave with.
//
// SHAPE (fixed so the founder's Google Cloud registration matches):
//   • Client type: Google "Desktop app" OAuth client. Desktop clients permit loopback-IP redirects on
//     ANY localhost port with NO pre-registered redirect URI — so the dev server (4317) and the desktop
//     app's dynamic port both work with one client, zero redirect-URI bookkeeping.
//   • Scopes: gmail.send preserves the founder-approved delivery capability; gmail.readonly lets the
//     automatic outcome reader inspect sent threads for replies and bounces. Existing send-only grants keep
//     sending, but reads surface an explicit reconnect requirement until the founder re-consents.
//   • Flow: authorization-code + PKCE (S256) over a loopback redirect, access_type=offline &
//     prompt=consent so Google returns a REFRESH token. We store the refresh token (+ client id/secret).
//   • Refresh: grant_type=refresh_token mints a fresh access token; we cache it until ~1 min before
//     expiry so we do not mint on every send. invalid_grant (revoked/expired) surfaces as needsReconnect,
//     never a fake send.
//
// Dependency-free: native fetch, native http listener, native crypto. No googleapis npm package.

import crypto from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_SCOPES = `${GMAIL_SEND_SCOPE} ${GMAIL_READ_SCOPE}`;

// Reuse a minted access token until this long before its stated expiry — a small skew so a token never
// expires mid-flight between "we checked" and "Google received it".
const REFRESH_SKEW_MS = 60_000;

// base64url without padding — the encoding OAuth PKCE and state params use (RFC 7636 / RFC 4648 §5).
function base64url(buffer) {
  return Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// A PKCE verifier + its S256 challenge. The verifier stays local; only the challenge rides the auth URL,
// so an intercepted authorization code is useless without the verifier the token exchange also demands.
export function pkcePair() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

// An unguessable state value bound to this one connect attempt — the callback must echo it back or we
// refuse (CSRF guard). Not a secret, just single-use entropy.
export function generateState() {
  return base64url(crypto.randomBytes(16));
}

// Build the Google consent URL. access_type=offline + prompt=consent are what make Google return a
// REFRESH token (the whole point — a durable grant, not a one-hour access token).
export function buildAuthUrl({ clientId, redirectUri, state, codeChallenge, scope = GMAIL_SCOPES }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

// Parse the loopback callback URL. Returns { code } only when the state matches the one we issued; a
// missing/mismatched state or an error param throws so a forged or failed callback can never mint a token.
export function parseCallback(rawUrl, expectedState) {
  const u = new URL(rawUrl, "http://127.0.0.1");
  const err = u.searchParams.get("error");
  if (err) throw new Error(`Google returned an OAuth error: ${err}`);
  const state = u.searchParams.get("state");
  if (!state || state !== expectedState) {
    throw new Error("OAuth state mismatch — refusing the callback (possible CSRF).");
  }
  const code = u.searchParams.get("code");
  if (!code) throw new Error("OAuth callback carried no authorization code.");
  return { code };
}

// Pull a human reason out of Google's token-endpoint error envelope without echoing the request.
function describeTokenError(status, payload) {
  const detail = payload?.error_description || payload?.error;
  return detail ? `Google token endpoint ${status}: ${detail}` : `Google token endpoint returned ${status}.`;
}

// One x-www-form-urlencoded POST to a token endpoint. `fetchImpl` is overridable so tests drive it against
// a mock with no network; default is native global fetch.
async function postForm(endpoint, form, fetchImpl) {
  const doFetch = typeof fetchImpl === "function" ? fetchImpl : (typeof fetch === "function" ? fetch : null);
  if (!doFetch) throw new Error("No fetch implementation available to reach Google's token endpoint.");
  const res = await doFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const payload = await res.json().catch(() => ({}));
  return { res, payload };
}

// Exchange the one-time authorization code for tokens. This is the leg that yields the REFRESH token we
// bank; the PKCE verifier is proven here so the exchange is bound to the same client that started the flow.
export async function exchangeCode({
  clientId, clientSecret, code, codeVerifier, redirectUri,
  fetchImpl, tokenEndpoint = GOOGLE_TOKEN_ENDPOINT, now = Date.now,
}) {
  const { res, payload } = await postForm(tokenEndpoint, {
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  }, fetchImpl);
  if (!res.ok) throw new Error(describeTokenError(res.status, payload));
  return {
    refreshToken: payload.refresh_token ?? null,
    accessToken: payload.access_token ?? null,
    expiresAt: now() + (Number(payload.expires_in) || 3600) * 1000,
    scope: payload.scope ?? null,
  };
}

// Mint a fresh access token from a stored refresh token. A revoked/expired grant (Google 400
// invalid_grant) throws an error flagged `needsReconnect` so the caller stages an honest reconnect
// prompt — NEVER a fake send. Any other failure throws a described error.
export async function mintAccessToken({
  clientId, clientSecret, refreshToken,
  fetchImpl, tokenEndpoint = GOOGLE_TOKEN_ENDPOINT, now = Date.now,
}) {
  const { res, payload } = await postForm(tokenEndpoint, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  }, fetchImpl);
  if (!res.ok) {
    if (payload?.error === "invalid_grant") {
      const e = new Error("Gmail connection was revoked or expired — reconnect Gmail to keep sending.");
      e.needsReconnect = true;
      throw e;
    }
    throw new Error(describeTokenError(res.status, payload));
  }
  return { accessToken: payload.access_token, expiresAt: now() + (Number(payload.expires_in) || 3600) * 1000 };
}

// The in-process cache of minted access tokens, keyed by client+refresh token. Module-level so it
// survives across sends within one server process; cleared explicitly in tests.
const accessTokenCache = new Map();

export function clearAccessTokenCache() {
  accessTokenCache.clear();
}

// Resolve a fresh access token, reusing a cached one until ~1 min before expiry so we do not mint on every
// send. A cache miss (or near-expiry) mints once and banks it. invalid_grant propagates (needsReconnect).
export async function getFreshAccessToken({
  clientId, clientSecret, refreshToken,
  fetchImpl, tokenEndpoint, now = Date.now, cache = accessTokenCache,
}) {
  const key = `${clientId}:${refreshToken}`;
  const cached = cache.get(key);
  if (cached && now() < cached.expiresAt - REFRESH_SKEW_MS) return cached.accessToken;
  const { accessToken, expiresAt } = await mintAccessToken({ clientId, clientSecret, refreshToken, fetchImpl, tokenEndpoint, now });
  cache.set(key, { accessToken, expiresAt });
  return accessToken;
}

const SUCCESS_HTML =
  "<!doctype html><meta charset=utf-8><title>Gmail connected</title>" +
  "<body style=\"font:15px -apple-system,system-ui,sans-serif;color:#18181b;background:#fafafa;" +
  "display:flex;align-items:center;justify-content:center;height:100vh;margin:0\">" +
  "<div style=\"text-align:center\"><div style=\"font-size:15px;font-weight:600\">Gmail connected</div>" +
  "<div style=\"margin-top:6px;color:#71717a\">You can close this tab and return to Drover.</div></div>";

function errorHtml(message) {
  return "<!doctype html><meta charset=utf-8><title>Connect failed</title>" +
    "<body style=\"font:15px -apple-system,system-ui,sans-serif;color:#18181b;background:#fafafa;" +
    "display:flex;align-items:center;justify-content:center;height:100vh;margin:0\">" +
    `<div style="text-align:center"><div style="font-size:15px;font-weight:600">Could not connect Gmail</div>` +
    `<div style="margin-top:6px;color:#71717a">${String(message).replace(/[<>&]/g, "")}</div></div>`;
}

// A short-lived local HTTP listener that catches ONE Google loopback callback. Requests without a `code`
// or `error` query (a browser's favicon probe, a stray hit) are ignored with 204 so they cannot poison the
// wait. The first real callback resolves (valid state) or rejects (bad state / error) the code promise and
// shows the founder a plain "you can close this tab" page. Exported so a test can drive the listener
// directly with a real loopback request — no browser, no Google.
export function createCallbackListener({ expectedState, listenHost = "127.0.0.1", timeoutMs = 5 * 60_000 } = {}) {
  let resolveCode;
  let rejectCode;
  let settled = false;
  const codePromise = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
  // The callback can settle (e.g. a bad-state rejection) BEFORE the caller attaches its handler via
  // waitForCode(). Attach a no-op catch on a derived promise so that early rejection is never flagged as
  // unhandled; this derived branch does not consume the rejection for waitForCode's own consumer.
  codePromise.catch(() => {});
  const settle = (fn, value) => { if (settled) return; settled = true; fn(value); };

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, `http://${listenHost}`);
    if (!u.searchParams.has("code") && !u.searchParams.has("error")) {
      res.writeHead(204);
      res.end();
      return;
    }
    try {
      const { code } = parseCallback(req.url, expectedState);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(SUCCESS_HTML);
      settle(resolveCode, { code });
    } catch (err) {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end(errorHtml(err.message));
      settle(rejectCode, err);
    }
  });

  const timer = setTimeout(() => settle(rejectCode, new Error("Gmail connect timed out waiting for consent.")), timeoutMs);
  if (typeof timer.unref === "function") timer.unref();

  return {
    server,
    // Bind to an ephemeral free port on the loopback host; resolves the chosen port.
    listen: () => new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, listenHost, () => resolve(server.address().port));
    }),
    waitForCode: () => codePromise.finally(() => clearTimeout(timer)),
  };
}

// Open a URL in the founder's default browser, cross-platform. Resolves once the open command is spawned —
// we do NOT wait for the browser; the loopback listener is what waits for the consent to complete.
function defaultOpenBrowser(url) {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.once("error", reject);
    child.unref();
    resolve();
  });
}

// The full one-time connect: start a loopback listener on a free port, open Google's consent URL with
// PKCE + offline access, catch the callback, exchange the code, and return the REFRESH token to bank.
// `openBrowser` and `fetchImpl` are injectable so tests exercise the orchestration without a real browser
// or network. Never stores anything itself — the caller banks the refresh token in the credential store.
export async function runLoopbackConnect({
  clientId, clientSecret,
  fetchImpl, openBrowser = defaultOpenBrowser, tokenEndpoint,
  listenHost = "127.0.0.1", timeoutMs,
} = {}) {
  if (!clientId || !clientSecret) {
    throw new Error("A Google OAuth client id and secret are required to connect Gmail.");
  }
  const { verifier, challenge } = pkcePair();
  const state = generateState();
  const listener = createCallbackListener({ expectedState: state, listenHost, timeoutMs });
  const port = await listener.listen();
  const redirectUri = `http://${listenHost}:${port}`;
  const authUrl = buildAuthUrl({ clientId, redirectUri, state, codeChallenge: challenge });
  try {
    await openBrowser(authUrl);
    const { code } = await listener.waitForCode();
    const tokens = await exchangeCode({ clientId, clientSecret, code, codeVerifier: verifier, redirectUri, fetchImpl, tokenEndpoint });
    if (!tokens.refreshToken) {
      // Google withholds a refresh token when the app was already authorized. prompt=consent normally
      // forces one; if it is still missing, the founder must revoke Drover's access and reconnect.
      throw new Error("Google returned no refresh token — remove Drover under your Google account's third-party access, then reconnect so consent is prompted again.");
    }
    return { refreshToken: tokens.refreshToken };
  } finally {
    listener.server.close();
  }
}
