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
} from "../src/credential-store.mjs";

describe("credential store", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-credentials-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("saves a founder-pasted credential and reads the token back at runtime", () => {
    setCredential("p1", { provider: "clay", token: "clay-secret", label: "My Clay" }, options);
    const cred = getCredential("p1", "clay", options);
    assert.equal(cred.provider, "clay");
    assert.equal(cred.token, "clay-secret");
    assert.equal(cred.label, "My Clay");
    assert.ok(cred.savedAt);
  });

  it("normalizes the provider so casing and whitespace address the same credential", () => {
    assert.equal(normalizeProvider(" Gmail "), "gmail");
    setCredential("p1", { provider: "Gmail", token: "g-token" }, options);
    assert.equal(getCredential("p1", "gmail", options).token, "g-token");
    assert.equal(getCredential("p1", " GMAIL ", options).token, "g-token");
  });

  it("set returns a redacted credential and never echoes the token", () => {
    const out = setCredential("p1", { provider: "apollo", token: "apollo-secret" }, options);
    assert.equal(out.provider, "apollo");
    assert.equal(out.hasToken, true);
    assert.equal(out.token, undefined);
  });

  it("list redacts every credential — provider/label/savedAt/hasToken only, no token", () => {
    setCredential("p1", { provider: "clay", token: "a", label: "Clay" }, options);
    setCredential("p1", { provider: "apollo", token: "b" }, options);
    const list = listCredentials("p1", options);
    assert.deepEqual(list.map((c) => c.provider), ["apollo", "clay"]); // sorted
    for (const entry of list) {
      assert.equal(entry.token, undefined);
      assert.equal(entry.hasToken, true);
    }
    assert.equal(JSON.stringify(list).includes("\"a\""), false);
    assert.equal(JSON.stringify(list).includes("\"b\""), false);
  });

  it("replacing a provider updates the token and preserves the first-saved time", () => {
    setCredential("p1", { provider: "clay", token: "old", label: "Clay" }, options);
    const firstSavedAt = getCredential("p1", "clay", options).savedAt;
    setCredential("p1", { provider: "clay", token: "new" }, options);
    const updated = getCredential("p1", "clay", options);
    assert.equal(updated.token, "new");
    assert.equal(updated.label, "Clay"); // label carried forward when not re-supplied
    assert.equal(updated.savedAt, firstSavedAt);
    assert.equal(listCredentials("p1", options).length, 1); // replace, not duplicate
  });

  it("remove is idempotent — true when present, false when absent", () => {
    setCredential("p1", { provider: "clay", token: "x" }, options);
    assert.equal(removeCredential("p1", "clay", options), true);
    assert.equal(getCredential("p1", "clay", options), null);
    assert.equal(removeCredential("p1", "clay", options), false);
  });

  it("is project-scoped — one project's credential never leaks into another", () => {
    setCredential("p1", { provider: "clay", token: "p1-token" }, options);
    setCredential("p2", { provider: "clay", token: "p2-token" }, options);
    assert.equal(getCredential("p1", "clay", options).token, "p1-token");
    assert.equal(getCredential("p2", "clay", options).token, "p2-token");
    assert.equal(getCredential("p3", "clay", options), null);
  });

  it("persists durably and reloads across a fresh store read", () => {
    setCredential("p9", { provider: "clay", token: "durable" }, options);
    // a brand-new resolve call (no in-memory state shared) reads the same persisted token
    assert.equal(resolveCredentialToken("p9", "clay", options), "durable");
  });

  it("requires a provider and a non-empty token", () => {
    assert.throws(() => setCredential("p1", { provider: "", token: "x" }, options), /provider is required/);
    assert.throws(() => setCredential("p1", { provider: "clay", token: "  " }, options), /token is required/);
  });

  describe("resolveCredentialToken — stored first, env fallback", () => {
    const ENV_KEY = "CREDENTIAL_STORE_TEST_KEY";
    afterEach(() => { delete process.env[ENV_KEY]; });

    it("prefers the founder's stored credential over the env var", () => {
      process.env[ENV_KEY] = "from-env";
      setCredential("p1", { provider: "clay", token: "from-store" }, options);
      assert.equal(resolveCredentialToken("p1", "clay", { envKey: ENV_KEY, ...options }), "from-store");
    });

    it("falls back to the env var when no credential is stored (the engineer path still works)", () => {
      process.env[ENV_KEY] = "from-env";
      assert.equal(resolveCredentialToken("p1", "clay", { envKey: ENV_KEY, ...options }), "from-env");
    });

    it("derives the conventional ${PROVIDER}_API_KEY env var when no envKey is given", () => {
      process.env.CLAY_API_KEY = "conventional";
      try {
        assert.equal(resolveCredentialToken("p1", "clay", options), "conventional");
      } finally {
        delete process.env.CLAY_API_KEY;
      }
    });

    it("returns null when neither a stored credential nor an env var exists", () => {
      assert.equal(resolveCredentialToken("p1", "nonesuch", { envKey: ENV_KEY, ...options }), null);
    });
  });

  it("redactCredential returns null for a missing credential", () => {
    assert.equal(redactCredential(null), null);
  });
});
