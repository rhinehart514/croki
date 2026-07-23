import crypto from "node:crypto";

// The browser is not an authority boundary. Electron owns one random secret for the lifetime of the
// desktop process, shares it only with the brain child, and signs a narrow method + path claim for
// each same-origin request through Electron's session webRequest hook below the renderer. Browser
// code never receives the root secret. A copied claim cannot authorize another route or be used twice.

export const FOUNDER_CAPABILITY_HEADER = "x-drover-founder-capability";
export const FOUNDER_CAPABILITY_WINDOW_MS = 30_000;

const VERSION = "v1";
const usedNonces = new Map();

function error(message, { code = "founder_decision_forbidden", status = 403 } = {}) {
  return Object.assign(new Error(message), { code, status });
}

function hasLocalPageOrigin(headers) {
  const origin = String(headers.origin ?? "").trim();
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
    const requestHost = String(headers.host ?? "").trim();
    return loopback && (!requestHost || url.host === requestHost);
  } catch {
    return false;
  }
}

function isLoopbackAddress(address) {
  const value = String(address ?? "").trim().toLowerCase();
  return value === "127.0.0.1"
    || value === "::1"
    || value === "::ffff:127.0.0.1";
}

export function devFounderAuthorityEnabled(env = process.env) {
  return ["1", "true", "yes", "on"].includes(
    String(env.DROVER_DEV_FOUNDER ?? "").trim().toLowerCase(),
  );
}

function requestPath(req) {
  const raw = String(req?.url ?? "/internal/founder-write");
  try {
    return new URL(raw, "http://drover.local").pathname + new URL(raw, "http://drover.local").search;
  } catch {
    return raw;
  }
}

function signatureFor(secret, { method, path, issuedAt, nonce }) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${method}\n${path}\n${issuedAt}\n${nonce}`)
    .digest("base64url");
}

function equalSignature(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function pruneNonces(now) {
  for (const [nonce, expiresAt] of usedNonces) {
    if (expiresAt <= now) usedNonces.delete(nonce);
  }
}

export function founderAuthorityStatus(env = process.env) {
  const desktopHost = Boolean(String(env.GTM_IDE_FOUNDER_CAPABILITY ?? "").trim());
  const developmentLoopback = !desktopHost && devFounderAuthorityEnabled(env);
  return {
    available: desktopHost || developmentLoopback,
    transport: developmentLoopback ? "development-loopback" : "desktop-host",
    header: FOUNDER_CAPABILITY_HEADER,
    replayWindowMs: FOUNDER_CAPABILITY_WINDOW_MS,
  };
}

export function authorizeFounderWriteForRequest(req, action = "This decision", { now = Date.now(), env = process.env } = {}) {
  const hasHeaders = req && typeof req === "object" && req.headers && typeof req.headers === "object";
  const isAgent = String(req?.headers?.["x-gtm-actor"] ?? "").trim().toLowerCase() === "agent";
  if (isAgent) {
    throw error(`${action} is founder-only. A model or MCP session cannot make this decision.`);
  }
  if (!hasHeaders || !hasLocalPageOrigin(req.headers)) {
    throw error(`${action} must come from the local Croki page through its desktop host.`);
  }

  const secret = String(env.GTM_IDE_FOUNDER_CAPABILITY ?? "").trim();
  if (!secret && devFounderAuthorityEnabled(env)) {
    if (!isLoopbackAddress(req.socket?.remoteAddress)) {
      throw error(`${action} used the development founder hatch from outside loopback.`);
    }
    return;
  }
  if (!secret) {
    throw error("Founder writes are unavailable because this page was not opened by the Croki desktop host. Reads remain available; relaunch the desktop app to make changes.", {
      code: "founder_host_unavailable",
      status: 503,
    });
  }

  const claim = String(req.headers[FOUNDER_CAPABILITY_HEADER] ?? "").trim();
  const [version, issuedRaw, nonce, suppliedSignature, ...extra] = claim.split(".");
  const issuedAt = Number(issuedRaw);
  if (version !== VERSION || !Number.isFinite(issuedAt) || !nonce || !suppliedSignature || extra.length) {
    throw error(`${action} needs a fresh capability from the Croki desktop host.`, { code: "founder_capability_invalid" });
  }
  if (Math.abs(now - issuedAt) > FOUNDER_CAPABILITY_WINDOW_MS) {
    throw error(`${action} used an expired founder capability. Try the action again.`, { code: "founder_capability_stale" });
  }

  const method = String(req.method ?? "POST").toUpperCase();
  const path = requestPath(req);
  const expected = signatureFor(secret, { method, path, issuedAt, nonce });
  if (!equalSignature(suppliedSignature, expected)) {
    throw error(`${action} carried a forged or mismatched founder capability.`, { code: "founder_capability_invalid" });
  }

  pruneNonces(now);
  if (usedNonces.has(nonce)) {
    throw error(`${action} tried to replay a founder capability that was already used.`, { code: "founder_capability_replayed" });
  }
  usedNonces.set(nonce, issuedAt + FOUNDER_CAPABILITY_WINDOW_MS);
}

export function __resetFounderCapabilityReplayGuard() {
  usedNonces.clear();
}
