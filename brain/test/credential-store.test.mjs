import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  getCredential,
  listCredentials,
  normalizeProvider,
  redactCredential,
  removeCredential,
  resolveCredentialToken,
  setCredential,
  setOAuthCredential,
} from "../src/credential-store.mjs";
import {
  createEphemeralCredentialProtection,
  createUnavailableCredentialProtection,
} from "../src/credential-protection.mjs";

describe("credential store", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-credentials-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("saves a founder-pasted credential and reads the token back at runtime", () => {
    setCredential({ provider: "clay", token: "clay-secret", label: "My Clay" }, options);
    const cred = getCredential("clay", options);
    assert.equal(cred.provider, "clay");
    assert.equal(cred.token, "clay-secret");
    assert.equal(cred.label, "My Clay");
    assert.ok(cred.savedAt);
  });

  it("stores only an authenticated opaque envelope, never plaintext secret fields", () => {
    setOAuthCredential({
      provider: "gmail",
      clientId: "client-sensitive",
      clientSecret: "secret-sensitive",
      refreshToken: "refresh-sensitive",
    }, options);
    const raw = fs.readFileSync(path.join(parent, "credentials", "founder.json"), "utf8");
    assert.equal(raw.includes("client-sensitive"), false);
    assert.equal(raw.includes("secret-sensitive"), false);
    assert.equal(raw.includes("refresh-sensitive"), false);
    const stored = JSON.parse(raw);
    assert.equal(stored.schemaVersion, 2);
    assert.equal(stored.credentials.gmail.sealed.version, 1);
    assert.equal(typeof stored.credentials.gmail.sealed.ciphertext, "string");
    assert.equal("clientSecret" in stored.credentials.gmail, false);
  });

  it("fails closed outside a protected host and never creates credential JSON", () => {
    const unavailable = createUnavailableCredentialProtection("No protected host in this test.");
    assert.throws(
      () => setCredential({ provider: "exa", token: "must-not-land" }, { ...options, secretProtection: unavailable }),
      /No protected host/,
    );
    assert.equal(fs.existsSync(path.join(parent, "credentials", "founder.json")), false);
  });

  it("migrates a legacy plaintext store atomically on its first protected read", () => {
    const directory = path.join(parent, "credentials");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "founder.json"), JSON.stringify({
      schemaVersion: 1,
      credentials: {
        gmail: {
          provider: "gmail",
          authType: "oauth",
          clientId: "legacy-client",
          clientSecret: "legacy-secret",
          refreshToken: "legacy-refresh",
          label: "Gmail (OAuth)",
          savedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    }));
    const protection = createEphemeralCredentialProtection();
    const migrated = getCredential("gmail", { ...options, secretProtection: protection });
    assert.equal(migrated.refreshToken, "legacy-refresh");
    const raw = fs.readFileSync(path.join(directory, "founder.json"), "utf8");
    assert.equal(raw.includes("legacy-refresh"), false);
    assert.equal(JSON.parse(raw).schemaVersion, 2);
  });

  it("does not destroy legacy plaintext when protected migration cannot encrypt", () => {
    const directory = path.join(parent, "credentials");
    const file = path.join(directory, "founder.json");
    fs.mkdirSync(directory, { recursive: true });
    const original = JSON.stringify({
      schemaVersion: 1,
      credentials: { exa: { provider: "exa", token: "legacy-exa", savedAt: "then" } },
    });
    fs.writeFileSync(file, original);
    const broken = {
      id: "broken-host",
      available: true,
      encrypt() { throw new Error("keychain locked"); },
      decrypt() { throw new Error("not reached"); },
    };
    assert.throws(() => getCredential("exa", { ...options, secretProtection: broken }), /keychain locked/);
    assert.equal(fs.readFileSync(file, "utf8"), original);
  });

  it("normalizes the provider so casing and whitespace address the same credential", () => {
    assert.equal(normalizeProvider(" Gmail "), "gmail");
    setCredential({ provider: "Gmail", token: "g-token" }, options);
    assert.equal(getCredential("gmail", options).token, "g-token");
    assert.equal(getCredential(" GMAIL ", options).token, "g-token");
  });

  it("set returns a redacted credential and never echoes the token", () => {
    const out = setCredential({ provider: "apollo", token: "apollo-secret" }, options);
    assert.equal(out.provider, "apollo");
    assert.equal(out.hasToken, true);
    assert.equal(out.token, undefined);
  });

  it("list redacts every credential — provider/label/savedAt/hasToken only, no token", () => {
    setCredential({ provider: "clay", token: "a", label: "Clay" }, options);
    setCredential({ provider: "apollo", token: "b" }, options);
    const list = listCredentials(options);
    assert.deepEqual(list.map((c) => c.provider), ["apollo", "clay"]); // sorted
    for (const entry of list) {
      assert.equal(entry.token, undefined);
      assert.equal(entry.hasToken, true);
    }
    assert.equal(JSON.stringify(list).includes("\"a\""), false);
    assert.equal(JSON.stringify(list).includes("\"b\""), false);
  });

  it("replacing a provider updates the token and preserves the first-saved time", () => {
    setCredential({ provider: "clay", token: "old", label: "Clay" }, options);
    const firstSavedAt = getCredential("clay", options).savedAt;
    setCredential({ provider: "clay", token: "new" }, options);
    const updated = getCredential("clay", options);
    assert.equal(updated.token, "new");
    assert.equal(updated.label, "Clay"); // label carried forward when not re-supplied
    assert.equal(updated.savedAt, firstSavedAt);
    assert.equal(listCredentials(options).length, 1); // replace, not duplicate
  });

  it("remove is idempotent — true when present, false when absent", () => {
    setCredential({ provider: "clay", token: "x" }, options);
    assert.equal(removeCredential("clay", options), true);
    assert.equal(getCredential("clay", options), null);
    assert.equal(removeCredential("clay", options), false);
  });

  it("is universal — a connection is founder-owned and reads back everywhere", () => {
    // A provider connected once works across every venture.
    setCredential({ provider: "clay", token: "the-one-token" }, options);
    assert.equal(getCredential("clay", options).token, "the-one-token");
    assert.equal(getCredential("clay", options).token, "the-one-token");
    assert.equal(getCredential("clay", options).token, "the-one-token");
    // Reconnecting updates the same universal connection, never a second copy.
    setCredential({ provider: "clay", token: "reconnected" }, options);
    assert.equal(getCredential("clay", options).token, "reconnected");
    assert.equal(listCredentials(options).length, 1);
  });

  it("persists durably and reloads across a fresh store read", () => {
    setCredential({ provider: "clay", token: "durable" }, options);
    // a brand-new resolve call (no in-memory state shared) reads the same persisted token
    assert.equal(resolveCredentialToken("clay", options), "durable");
  });

  it("banks a provider-resolved OAuth account address while legacy credentials keep it absent", () => {
    setOAuthCredential({
      provider: "gmail",
      clientId: "client",
      clientSecret: "secret",
      refreshToken: "refresh",
      accountAddress: " Founder@Example.com ",
    }, options);
    assert.equal(getCredential("gmail", options).accountAddress, "founder@example.com");
    assert.equal(listCredentials(options)[0].accountAddress, "founder@example.com");

    setOAuthCredential({
      provider: "google",
      clientId: "legacy-client",
      clientSecret: "legacy-secret",
      refreshToken: "legacy-refresh",
    }, options);
    assert.equal("accountAddress" in getCredential("google", options), false);
    assert.equal("accountAddress" in listCredentials(options).find((entry) => entry.provider === "google"), false);
  });

  it("requires a provider and a non-empty token", () => {
    assert.throws(() => setCredential({ provider: "", token: "x" }, options), /provider is required/);
    assert.throws(() => setCredential({ provider: "clay", token: "  " }, options), /token is required/);
  });

  describe("resolveCredentialToken — stored first, env fallback", () => {
    const ENV_KEY = "CREDENTIAL_STORE_TEST_KEY";
    afterEach(() => { delete process.env[ENV_KEY]; });

    it("prefers the founder's stored credential over the env var", () => {
      process.env[ENV_KEY] = "from-env";
      setCredential({ provider: "clay", token: "from-store" }, options);
      assert.equal(resolveCredentialToken("clay", { envKey: ENV_KEY, ...options }), "from-store");
    });

    it("falls back to the env var when no credential is stored (the engineer path still works)", () => {
      process.env[ENV_KEY] = "from-env";
      assert.equal(resolveCredentialToken("clay", { envKey: ENV_KEY, ...options }), "from-env");
    });

    it("derives the conventional ${PROVIDER}_API_KEY env var when no envKey is given", () => {
      process.env.CLAY_API_KEY = "conventional";
      try {
        assert.equal(resolveCredentialToken("clay", options), "conventional");
      } finally {
        delete process.env.CLAY_API_KEY;
      }
    });

    it("returns null when neither a stored credential nor an env var exists", () => {
      assert.equal(resolveCredentialToken("nonesuch", { envKey: ENV_KEY, ...options }), null);
    });
  });

  it("redactCredential returns null for a missing credential", () => {
    assert.equal(redactCredential(null), null);
  });
});
