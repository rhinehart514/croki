// Founder-owned credentials are universal across ventures. Public reads are always redacted; only a
// runtime preparing a provider call receives the stored secret.

import { now } from "./store-fs.mjs";
import { persistence } from "./persistence.mjs";

const COLLECTION = "credentials";
const KEY = "founder";

export function normalizeProvider(provider) {
  return String(provider || "").trim().toLowerCase();
}

function emptyStore() {
  return { schemaVersion: 1, credentials: {}, updatedAt: now() };
}

function loadStore(options = {}) {
  const stored = persistence(options).get(COLLECTION, KEY);
  return stored ? {
    ...emptyStore(),
    ...stored,
    schemaVersion: 1,
    credentials: stored.credentials && typeof stored.credentials === "object" ? stored.credentials : {},
  } : emptyStore();
}

function saveStore(store, options = {}) {
  const durable = { ...store, schemaVersion: 1, updatedAt: now() };
  persistence(options).set(COLLECTION, KEY, durable);
  return durable;
}

export function redactCredential(credential) {
  if (!credential) return null;
  return {
    provider: credential.provider,
    label: credential.label ?? null,
    savedAt: credential.savedAt,
    hasToken: Boolean(credential.token || credential.refreshToken),
    authType: credential.authType ?? "token",
  };
}

export function setCredential(input = {}, options = {}) {
  const provider = normalizeProvider(input.provider);
  if (!provider) throw new Error("A credential provider is required.");
  const token = String(input.token ?? "").trim();
  if (!token) throw new Error("A credential token is required.");
  const store = loadStore(options);
  const existing = store.credentials[provider];
  const credential = {
    provider,
    token,
    label: input.label != null ? String(input.label).slice(0, 80) : (existing?.label ?? null),
    savedAt: existing?.savedAt || now(),
  };
  const saved = saveStore({ ...store, credentials: { ...store.credentials, [provider]: credential } }, options);
  return redactCredential(saved.credentials[provider]);
}

export function setOAuthCredential(input = {}, options = {}) {
  const provider = normalizeProvider(input.provider || "gmail");
  const clientId = String(input.clientId ?? "").trim();
  const clientSecret = String(input.clientSecret ?? "").trim();
  const refreshToken = String(input.refreshToken ?? "").trim();
  if (!provider) throw new Error("A credential provider is required.");
  if (!clientId || !clientSecret) throw new Error("An OAuth client id and secret are required.");
  if (!refreshToken) throw new Error("An OAuth refresh token is required.");
  const store = loadStore(options);
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

export function getCredential(provider, options = {}) {
  return loadStore(options).credentials[normalizeProvider(provider)] ?? null;
}

export function listCredentials(options = {}) {
  return Object.values(loadStore(options).credentials).map(redactCredential)
    .sort((left, right) => left.provider.localeCompare(right.provider));
}

export function removeCredential(provider, options = {}) {
  const key = normalizeProvider(provider);
  const store = loadStore(options);
  if (!(key in store.credentials)) return false;
  const { [key]: _removed, ...credentials } = store.credentials;
  saveStore({ ...store, credentials }, options);
  return true;
}

export function resolveCredentialToken(provider, { envKey, ...options } = {}) {
  const stored = getCredential(provider, options);
  if (stored?.token) return stored.token;
  const key = envKey || `${normalizeProvider(provider).toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
  return process.env[key] || null;
}
