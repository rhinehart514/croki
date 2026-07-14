// message-send.mjs — the real Gmail send transport for effect-executors.mjs's message/send branch.
//
// wall.decide() calls executeEffect(released, item) SYNCHRONOUSLY (wall.mjs:229 — no await; no test in
// this tree ever awaits decide(), and routes.mjs calls it un-awaited too). A real network send — and
// minting a fresh OAuth access token from a refresh token — are both unavoidably async in Node's fetch.
// Rather than weaken wall.mjs's contract (out of scope; builder-f3 owns it) or return a "pending"
// placeholder that a second, out-of-band writer would later have to mutate onto the SAME decisions-
// collection document decide() just wrote (a second writer racing decide()'s own single write path),
// this module makes BOTH calls decide() needs genuinely synchronous — the same posture agent-bridge.mjs's
// runClaudeQuerySync already uses for "the host needs a sync result from an inherently async operation":
// spawnSync out to curl. Both the token mint and the send are injectable (a test supplies its own sync
// fake), so no test ever shells out for real.
//
// This module talks to Gmail's REST API directly. effect-executors.mjs verifies the wall capability
// minted for this release before invoking it.
//
// credential-store.mjs's getCredential is reused as-is (the banked-credential SHAPE, not the async mint)
// — gmail-oauth.mjs's mintAccessToken/getFreshAccessToken are async by construction and are the keep-list
// path market-poll.mjs (a read, with room to await) already uses unchanged; this is a distinct SYNCHRONOUS
// mint of the exact same OAuth refresh-token grant, needed only because decide()'s call site cannot await.
//
// The provenance header (X-GTM-IDE-Provenance) is stamped on every send exactly as gmail.mjs's
// buildProvenance did, because market-poll.mjs's classifyThread/isOurOutbound (F5) excludes any message
// carrying it — without this header the firm's own sends would be miscounted as the recipient's reply.

import { spawnSync } from "node:child_process";
import { getCredential } from "../credential-store.mjs";
import { GOOGLE_TOKEN_ENDPOINT } from "../connectors/execute/gmail-oauth.mjs";

const GMAIL_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
export const PROVENANCE_HEADER = "X-GTM-IDE-Provenance";

function sanitizeHeaderValue(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function base64url(buffer) {
  return Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// A single spawnSync'd curl POST, shared by the token mint and the send — both are simple form/JSON
// POSTs against a fixed endpoint. Returns { status, body } or throws only on a genuine spawn failure
// (binary missing, timeout) — an HTTP-level error status is a normal return, not a throw.
function curlPost(url, { headers = {}, body, timeoutMs = 15000, binary = "curl" } = {}) {
  const args = ["-s", "-X", "POST", url, "-w", "\n%{http_code}"];
  for (const [name, value] of Object.entries(headers)) args.push("-H", `${name}: ${value}`);
  args.push("-d", body);
  const result = spawnSync(binary, args, { encoding: "utf8", timeout: timeoutMs });
  if (result.error || (result.status !== 0 && result.status !== null)) {
    throw new Error(result.error?.message ?? `curl exited ${result.status}`);
  }
  const stdout = result.stdout ?? "";
  const splitAt = stdout.lastIndexOf("\n");
  const httpCode = Number(stdout.slice(splitAt + 1).trim());
  const bodyText = stdout.slice(0, splitAt);
  let payload = {};
  try { payload = JSON.parse(bodyText || "{}"); } catch { payload = {}; }
  return { httpCode, payload };
}

// The exact RFC 2822 assembly gmail-transport.mjs already proves out, plus the provenance header
// market-poll.mjs's own-outbound exclusion depends on.
function buildRawMessage({ to, from, subject, body, provenance }) {
  const lines = [];
  if (from) lines.push(`From: ${sanitizeHeaderValue(from)}`);
  lines.push(`To: ${sanitizeHeaderValue(to)}`);
  lines.push(`Subject: ${sanitizeHeaderValue(subject || "")}`);
  lines.push(`${PROVENANCE_HEADER}: ${sanitizeHeaderValue(JSON.stringify(provenance))}`);
  lines.push("MIME-Version: 1.0");
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  lines.push(Buffer.from(String(body ?? ""), "utf8").toString("base64"));
  return lines.join("\r\n");
}

// A synchronous mint of a fresh access token from the SAME banked refresh-token grant getFreshAccessToken
// mints asynchronously — the identical OAuth "refresh_token" grant against Google's token endpoint, just
// via a blocking curl POST instead of fetch. Injectable (`deps.mintToken`) for tests; the live default is
// this real curl call. Returns { token } or { token: null, needsReconnect?, reason }, never throws for an
// expected auth failure.
export function mintAccessTokenSync({ clientId, clientSecret, refreshToken, endpoint = GOOGLE_TOKEN_ENDPOINT, binary, timeoutMs }) {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  }).toString();
  let httpCode;
  let payload;
  try {
    ({ httpCode, payload } = curlPost(endpoint, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      binary,
      timeoutMs,
    }));
  } catch (error) {
    return { token: null, reason: error instanceof Error ? error.message : String(error) };
  }
  if (httpCode >= 200 && httpCode < 300 && payload?.access_token) {
    return { token: payload.access_token };
  }
  if (payload?.error === "invalid_grant") {
    return { token: null, needsReconnect: true, reason: "Gmail connection was revoked or expired — reconnect Gmail to keep sending." };
  }
  return { token: null, reason: payload?.error_description || payload?.error || `Google token endpoint returned ${httpCode}.` };
}

// The default LIVE send transport: a genuinely synchronous Gmail send via spawnSync + curl. Never used
// in a test — every test injects its own sync fake. Returns { ok, messageId?, error?, needsReconnect? }.
export function createSyncGmailTransport({ endpoint = GMAIL_SEND_ENDPOINT, binary, timeoutMs } = {}) {
  return function sendSync({ to, from, subject, body, provenance, token }) {
    const raw = base64url(buildRawMessage({ to, from, subject, body, provenance }));
    let httpCode;
    let payload;
    try {
      ({ httpCode, payload } = curlPost(endpoint, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
        binary,
        timeoutMs,
      }));
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (httpCode >= 200 && httpCode < 300) return { ok: true, messageId: payload?.id ?? null };
    const needsReconnect = httpCode === 401 || httpCode === 403;
    return { ok: false, error: payload?.error?.message || `Gmail API returned ${httpCode}.`, ...(needsReconnect ? { needsReconnect: true } : {}) };
  };
}

// Resolve a fresh Gmail SEND token off the venture's banked credential — the SAME credential shape
// market-poll.mjs reads for a read-scoped token, keyed by ventureId like every other venture-scoped
// credential read in this tree. Synchronous throughout. Honest null when nothing is connected.
function resolveSendTokenSync(ventureId, options = {}, mintToken = mintAccessTokenSync) {
  const credential = getCredential("gmail", options) ?? getCredential("google", options);
  if (!(credential?.authType === "oauth" && credential.refreshToken && credential.clientId && credential.clientSecret)) {
    return { token: null, reason: "No connected Gmail account to send from." };
  }
  return mintToken({
    clientId: credential.clientId,
    clientSecret: credential.clientSecret,
    refreshToken: credential.refreshToken,
  });
}

// The recipient/subject/body are read defensively across the aliases open-shaped bets have already
// staged under in this tree (wall.test.mjs/market-poll.test.mjs: {message, recipients}, {to, body},
// {message} alone) — there is no schema on what stage_outward's effect carries.
function readMessageFields(effect) {
  const to = effect.to ?? effect.recipient ?? (Array.isArray(effect.recipients) ? effect.recipients[0] : effect.recipients) ?? null;
  const body = effect.body ?? effect.message ?? effect.draft ?? "";
  const subject = effect.subject ?? null;
  return { to: sanitizeHeaderValue(to) || null, body, subject };
}

// sendReleasedMessage — the one call effect-executors.mjs's executeMessage makes, entirely synchronous
// so decide()'s own contract is never touched. `deps.transport` overrides the live send (test injection,
// mirrors createGmailTransport's fetchImpl seam); `deps.mintToken` overrides the token mint the same way;
// `deps.token` skips minting entirely when a caller already has one (mirrors market-poll.mjs's own
// `options.token` convention). Returns { ok, messageId?, provenance, error?, needsReconnect? } — never
// throws for an expected failure (no recipient, no credential, mint/send refusal).
export function sendReleasedMessage({ ventureId, effect, betId }, options = {}, deps = {}) {
  const { to, body, subject } = readMessageFields(effect);
  if (!to) {
    return { ok: false, error: "Message effect has no recipient; refusing to send with no To." };
  }
  const resolved = deps.token
    ? { token: deps.token }
    : resolveSendTokenSync(ventureId, options, deps.mintToken);
  if (!resolved.token) {
    return { ok: false, error: resolved.reason ?? "No Gmail send access.", ...(resolved.needsReconnect ? { needsReconnect: true } : {}) };
  }

  const provenance = { marker: "gtm-ide-firm", ventureId, betId: betId ?? null, stampedAt: new Date().toISOString() };
  const transport = deps.transport ?? createSyncGmailTransport();
  const outcome = transport({ to, from: effect.from ?? null, subject, body, provenance, token: resolved.token });
  if (!outcome.ok) return { ok: false, error: outcome.error, ...(outcome.needsReconnect ? { needsReconnect: true } : {}) };
  return { ok: true, messageId: outcome.messageId, provenance };
}
