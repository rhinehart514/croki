// Founder-owned credentials are universal across ventures. Public reads are always redacted; only a
// runtime preparing a provider call receives the stored secret.

import { now } from "./store-fs.mjs";
import { persistence } from "./persistence.mjs";
import { credentialProtection } from "./credential-protection.mjs";

const COLLECTION = "credentials";
const KEY = "founder";
const SCHEMA_VERSION = 2;
const SECRET_VERSION = 1;
const SECRET_FIELDS = ["token", "clientId", "clientSecret", "refreshToken"];

export function normalizeProvider(provider) {
  return String(provider || "").trim().toLowerCase();
}

function emptyStore() {
  return { schemaVersion: SCHEMA_VERSION, credentials: {}, updatedAt: now() };
}

function hasLegacySecret(credential) {
  return SECRET_FIELDS.some((field) => typeof credential?.[field] === "string" && credential[field]);
}

function sealCredential(credential, protection) {
  const secrets = { provider: credential.provider };
  for (const field of SECRET_FIELDS) {
    if (typeof credential[field] === "string" && credential[field]) secrets[field] = credential[field];
  }
  const metadata = { ...credential };
  for (const field of SECRET_FIELDS) delete metadata[field];
  return {
    ...metadata,
    sealed: {
      version: SECRET_VERSION,
      protector: protection.id,
      ciphertext: protection.encrypt(JSON.stringify(secrets)),
    },
  };
}

function unsealCredential(credential, protection) {
  if (hasLegacySecret(credential)) {
    if (protection.available === false) protection.decrypt("");
    return credential;
  }
  const envelope = credential?.sealed;
  if (!envelope) return credential ?? null;
  if (envelope.version !== SECRET_VERSION) {
    throw new Error(`Unsupported credential secret version: ${envelope.version}.`);
  }
  if (envelope.protector !== protection.id) {
    const error = new Error(`Credential protection ${envelope.protector} is unavailable in this host.`);
    error.code = "CREDENTIAL_PROTECTION_MISMATCH";
    throw error;
  }
  let secrets;
  try {
    secrets = JSON.parse(protection.decrypt(envelope.ciphertext));
  } catch (cause) {
    if (cause?.code) throw cause;
    const error = new Error(`Could not decrypt the ${credential.provider} credential.`, { cause });
    error.code = "CREDENTIAL_DECRYPT_FAILED";
    throw error;
  }
  if (!secrets || secrets.provider !== credential.provider) {
    throw new Error(`The protected credential does not belong to ${credential.provider}.`);
  }
  const { sealed: _sealed, ...metadata } = credential;
  return { ...metadata, ...secrets };
}

function loadStore(options = {}) {
  const stored = persistence(options).get(COLLECTION, KEY);
  const store = stored ? {
    ...emptyStore(),
    ...stored,
    schemaVersion: Number(stored.schemaVersion) || 1,
    credentials: stored.credentials && typeof stored.credentials === "object" ? stored.credentials : {},
  } : emptyStore();
  const legacy = Object.values(store.credentials).some(hasLegacySecret);
  if (!legacy) return { ...store, schemaVersion: SCHEMA_VERSION };

  const protection = credentialProtection(options);
  if (protection.available === false) return store;
  const credentials = Object.fromEntries(Object.entries(store.credentials).map(([provider, credential]) => [
    provider,
    hasLegacySecret(credential) ? sealCredential(credential, protection) : credential,
  ]));
  return saveStore({ ...store, credentials }, options);
}

function saveStore(store, options = {}) {
  for (const credential of Object.values(store.credentials ?? {})) {
    if (hasLegacySecret(credential)) {
      throw new Error("Refusing to persist a plaintext credential.");
    }
  }
  const durable = { ...store, schemaVersion: SCHEMA_VERSION, updatedAt: now() };
  persistence(options).set(COLLECTION, KEY, durable);
  return durable;
}

export function redactCredential(credential) {
  if (!credential) return null;
  return {
    provider: credential.provider,
    label: credential.label ?? null,
    ...(credential.accountAddress ? { accountAddress: credential.accountAddress } : {}),
    savedAt: credential.savedAt,
    hasToken: Boolean(credential.sealed || credential.token || credential.refreshToken),
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
  const credential = sealCredential({
    provider,
    token,
    label: input.label != null ? String(input.label).slice(0, 80) : (existing?.label ?? null),
    savedAt: existing?.savedAt || now(),
  }, credentialProtection(options));
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
  const accountAddress = String(input.accountAddress ?? "").trim().toLowerCase();
  const credential = sealCredential({
    provider,
    authType: "oauth",
    clientId,
    clientSecret,
    refreshToken,
    label: input.label != null ? String(input.label).slice(0, 80) : (existing?.label ?? "Gmail (OAuth)"),
    ...(accountAddress ? { accountAddress } : {}),
    savedAt: existing?.savedAt || now(),
  }, credentialProtection(options));
  const saved = saveStore({ ...store, credentials: { ...store.credentials, [provider]: credential } }, options);
  return redactCredential(saved.credentials[provider]);
}

export function getCredential(provider, options = {}) {
  const credential = loadStore(options).credentials[normalizeProvider(provider)] ?? null;
  return credential ? unsealCredential(credential, credentialProtection(options)) : null;
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
