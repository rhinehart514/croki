import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { run } from "../src/connectors/enrich/clay.mjs";
import { setCredential, removeCredential } from "../src/credential-store.mjs";

// Isolate the BYO-credential store to a temp home so resolving keys never touches ~/.gtm-ide.
process.env.GTM_IDE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-clay-creds-"));

const PROSPECTS = [{ type: "prospect", name: "Acme CEO", url: "https://acme.com" }];

describe("Clay enrich — BYO credential resolution (stored key wins, env fallback, never logged)", () => {
  let fetchCalls;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    fetchCalls = [];
    // Clay's table path requires CLAY_TABLE_ID set to attempt the API call.
    process.env.CLAY_TABLE_ID = "tbl-1";
    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      // Clay search shape — returns enriched results so run() takes the Clay path.
      return { ok: true, json: async () => ({ results: [{ title: "CEO", company: "Acme" }] }) };
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.CLAY_TABLE_ID;
    delete process.env.CLAY_API_KEY;
    delete process.env.EXA_API_KEY;
    // Credentials are now UNIVERSAL (founder-owned, not per-project), so a key stored in one test
    // persists into the next. Clear it so the "falls back to env when nothing stored" cases start clean.
    removeCredential(null, "clay");
    removeCredential(null, "exa");
  });

  function authHeaderOf(call) {
    return call.options.headers.Authorization;
  }

  it("uses a founder-pasted Clay key (no env var set)", async () => {
    setCredential("p-clay", { provider: "clay", token: "stored-clay-key" });
    const result = await run({}, PROSPECTS, { credentials: { projectId: "p-clay" } });
    assert.equal(result.meta.source, "clay");
    assert.equal(authHeaderOf(fetchCalls[0]), "Bearer stored-clay-key");
  });

  it("prefers the founder-pasted Clay key over the env var", async () => {
    process.env.CLAY_API_KEY = "env-clay-key";
    setCredential("p-clay2", { provider: "clay", token: "stored-wins" });
    await run({}, PROSPECTS, { credentials: { projectId: "p-clay2" } });
    assert.equal(authHeaderOf(fetchCalls[0]), "Bearer stored-wins");
  });

  it("falls back to the env Clay key when nothing is stored (engineer path still works)", async () => {
    process.env.CLAY_API_KEY = "env-clay-key";
    await run({}, PROSPECTS, { credentials: { projectId: "p-clay-none" } });
    assert.equal(authHeaderOf(fetchCalls[0]), "Bearer env-clay-key");
  });

  it("resolves a founder-pasted Exa key for the Exa enrichment fallback", async () => {
    // No Clay key at all → run() takes the Exa path; assert the stored Exa key flows into the request.
    setCredential("p-exa", { provider: "exa", token: "stored-exa-key" });
    const exaCalls = [];
    globalThis.fetch = async (url, options) => {
      exaCalls.push({ url, options });
      return { ok: true, json: async () => ({ results: [{ text: "Acme CEO - Founder at Acme | LinkedIn", url: "https://linkedin.com/in/x" }] }) };
    };
    const result = await run({}, PROSPECTS, { credentials: { projectId: "p-exa" } });
    assert.equal(result.meta.source, "exa-fallback");
    assert.equal(exaCalls[0].options.headers["x-api-key"], "stored-exa-key");
  });

  it("never logs the resolved secret", async () => {
    setCredential("p-log", { provider: "clay", token: "ultra-secret-clay" });
    const logs = [];
    const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
    for (const k of Object.keys(orig)) console[k] = (...a) => logs.push(a.join(" "));
    try {
      await run({}, PROSPECTS, { credentials: { projectId: "p-log" } });
    } finally {
      Object.assign(console, orig);
    }
    assert.equal(logs.join("\n").includes("ultra-secret-clay"), false);
  });
});
