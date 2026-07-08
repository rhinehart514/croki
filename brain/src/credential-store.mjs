// The BYO-credential store — durable, UNIVERSAL, founder-owned API credentials.
//
// Today every connector reads its key from `process.env` only (see connectors/enrich/clay.mjs:
// `process.env.CLAY_API_KEY`). That works for an engineer who can export an env var, but it locks
// out a non-technical founder who just wants to paste a Gmail / Apollo / Clay key into the product
// and run. This store is the durable place those pasted credentials live, so a connector can read a
// key at RUNTIME instead of demanding it be in the process environment.
//
// A connection belongs to the FOUNDER, not to a project. A Gmail login connected once works across
// every venture — you don't reconnect the same inbox per pipeline. So all credentials live in ONE
// universal document, keyed by provider (lowercased); the projectId argument the API still accepts is
// ignored for storage, kept only so callers don't have to change. (Before 2026-07-08 this store was
// per-project; it was made universal on Jacob's call that connections are his, not a project's.)
//
// Scope: host-owned DURABLE STATE, not intelligence. It stages a secret for later use; it never
// sends, publishes, or charges, so it sits comfortably inside the Wall — the gate still governs any
// outbound action, this just lets the founder supply the key that action will need.
//
// SECURITY: a token is never logged, never printed, and never returned by `list` — `list` redacts to
// `{ provider, label, savedAt, hasToken }`. Only `get` (the runtime read) and `resolveCredentialToken`
// return the raw token, to the caller that is about to use it.

import { now } from "./store-fs.mjs";
import { persistence } from "./persistence.mjs";

const SCHEMA_VERSION = 1;
const COLLECTION = "credentials";
// The single slot every project shares. Connections are founder-owned and universal, so the projectId
// a caller passes never changes which document is read or written — it always resolves here.
const UNIVERSAL_KEY = "global";

function keyFor() {
  return UNIVERSAL_KEY;
}

// Normalize a provider label to its stable key: lowercased, trimmed, filesystem/lookup-safe. So
// "Gmail", " gmail ", and "gmail" all address the same credential.
export function normalizeProvider(provider) {
  return String(provider || "").trim().toLowerCase();
}

function emptyStore() {
  // The document is universal, so it records the shared slot id, not any caller's projectId.
  return { schemaVersion: SCHEMA_VERSION, projectId: UNIVERSAL_KEY, credentials: {}, updatedAt: now() };
}

function loadStore(projectId, options = {}) {
  const stored = persistence(options).get(COLLECTION, keyFor(projectId));
  if (!stored) return emptyStore(projectId);
  return {
    ...emptyStore(projectId),
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    credentials: stored.credentials && typeof stored.credentials === "object" ? stored.credentials : {},
  };
}

function saveStore(store, options = {}) {
  const durable = {
    ...store,
    schemaVersion: SCHEMA_VERSION,
    credentials: store.credentials && typeof store.credentials === "object" ? store.credentials : {},
    updatedAt: now(),
  };
  persistence(options).set(COLLECTION, keyFor(durable.projectId), durable);
  return durable;
}

// Strip the token out of a credential for any surface that should never see the secret (the list
// view, an API response, a log line). Reports only that a token IS present, not its value.
export function redactCredential(credential) {
  if (!credential) return null;
  return {
    provider: credential.provider,
    label: credential.label ?? null,
    savedAt: credential.savedAt,
    // Present for a pasted token OR a banked OAuth refresh token — either means "connected, has a key".
    hasToken: Boolean(credential.token || credential.refreshToken),
    // How the sender is connected: "oauth" (durable, banked refresh token) or "token" (pasted, expiring).
    // Non-secret; lets the UI say whether a reconnect will ever be needed. Never exposes the secrets.
    authType: credential.authType ?? "token",
  };
}

// Save (or replace, by provider) a founder-pasted credential for a project. Returns the REDACTED
// credential — the caller that just saved a secret does not need it echoed back, and a redacted
// return keeps the token out of logs/responses by construction.
export function setCredential(projectId, input = {}, options = {}) {
  const provider = normalizeProvider(input.provider);
  if (!provider) throw new Error("A credential provider is required.");
  const token = String(input.token ?? "").trim();
  if (!token) throw new Error("A credential token is required.");

  const store = loadStore(projectId, options);
  const existing = store.credentials[provider];
  const credential = {
    provider,
    token,
    label: input.label != null ? String(input.label).slice(0, 80) : (existing?.label ?? null),
    // First-saved time is preserved across an update so `savedAt` reads as "when the founder first
    // connected this provider"; the document's own `updatedAt` carries the last-touched time.
    savedAt: existing?.savedAt || now(),
  };
  const saved = saveStore({ ...store, credentials: { ...store.credentials, [provider]: credential } }, options);
  return redactCredential(saved.credentials[provider]);
}

// Save (or replace, by provider) a DURABLE OAuth credential — the banked refresh token plus the client
// id/secret it refreshes against. This is the Gmail loopback-flow's product: the founder connects once and
// this credential lets a send mint a fresh access token forever, with no re-paste. Stored alongside pasted
// token credentials in the same per-project document, keyed by provider; the token-minting layer keys off
// `authType === "oauth"`. Returns the REDACTED credential — the secrets are never echoed back.
export function setOAuthCredential(projectId, input = {}, options = {}) {
  const provider = normalizeProvider(input.provider || "gmail");
  if (!provider) throw new Error("A credential provider is required.");
  const clientId = String(input.clientId ?? "").trim();
  const clientSecret = String(input.clientSecret ?? "").trim();
  const refreshToken = String(input.refreshToken ?? "").trim();
  if (!clientId || !clientSecret) throw new Error("An OAuth client id and secret are required.");
  if (!refreshToken) throw new Error("An OAuth refresh token is required.");

  const store = loadStore(projectId, options);
  const existing = store.credentials[provider];
  const credential = {
    provider,
    authType: "oauth",
    clientId,
    clientSecret,
    refreshToken,
    label: input.label != null ? String(input.label).slice(0, 80) : (existing?.label ?? "Gmail (OAuth)"),
    savedAt: existing?.savedAt || now(),
  };
  const saved = saveStore({ ...store, credentials: { ...store.credentials, [provider]: credential } }, options);
  return redactCredential(saved.credentials[provider]);
}

// The runtime read: the full credential INCLUDING the token, for the connector about to use it.
// Null when the project has no credential for this provider. Never logs the token.
export function getCredential(projectId, provider, options = {}) {
  const store = loadStore(projectId, options);
  return store.credentials[normalizeProvider(provider)] ?? null;
}

// Every provider a project has connected, REDACTED — provider, label, when, and whether a token is
// present. Never the token itself. Sorted by provider for stable display.
export function listCredentials(projectId, options = {}) {
  const store = loadStore(projectId, options);
  return Object.values(store.credentials)
    .map(redactCredential)
    .sort((a, b) => a.provider.localeCompare(b.provider));
}

// Remove a project's credential for a provider. Returns true when one was actually removed, false
// when there was none — so a disconnect is idempotent.
export function removeCredential(projectId, provider, options = {}) {
  const key = normalizeProvider(provider);
  const store = loadStore(projectId, options);
  if (!(key in store.credentials)) return false;
  const { [key]: _removed, ...rest } = store.credentials;
  saveStore({ ...store, credentials: rest }, options);
  return true;
}

// The runtime resolution a connector calls: prefer the founder's pasted credential for this project,
// then fall back to the process env var (the engineer path that still works). Deterministic routing —
// code, not a model call — so BYO and env-only coexist with no behavior change for existing setups.
// `envKey` names the env var to fall back to; absent it, the convention is `${PROVIDER}_API_KEY`.
// Returns the raw token string or null. Never logs the token.
export function resolveCredentialToken(projectId, provider, { envKey, ...options } = {}) {
  const stored = getCredential(projectId, provider, options);
  if (stored?.token) return stored.token;
  const key = envKey || `${normalizeProvider(provider).toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
  return process.env[key] || null;
}
