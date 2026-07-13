import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { run } from "../src/connectors/execute/http.mjs";
import { setCredential, removeCredential } from "../src/credential-store.mjs";
import { OUTWARD_RELEASE } from "../src/graph.mjs";

// These tests exercise the founder-RELEASED outward path, so each node carries the host-issued outward-
// release capability the graph runner threads onto node.runtime on a founder outward-approval run (rail 1).
const RELEASED = { outwardRelease: OUTWARD_RELEASE };

// Isolate the BYO-credential store to a temp home so resolving the send auth never touches ~/.gtm-ide.
process.env.GTM_IDE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-http-creds-"));

describe("HTTP execution connector", () => {
  it("sends only approved attributable actions with an idempotency key", async () => {
    const requests = [];
    const result = await run({
      config: {
        endpoint: "https://relay.example/send",
        channel: "email",
        fetchImpl: async (url, options) => {
          requests.push({ url, options });
          return { ok: true, status: 202, json: async () => ({ id: "provider-123" }) };
        },
      },
      runtime: RELEASED,
    }, [
      { email: "approved@example.com", draft: "Hello", approved: true, gtmActionId: "gtm-action-1" },
      { email: "pending@example.com", draft: "No", approved: false, gtmActionId: "gtm-action-2" },
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.meta.sent, 1);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.headers["Idempotency-Key"], "gtm-action-1");
    assert.equal(JSON.parse(requests[0].options.body).gtmActionId, "gtm-action-1");
    assert.equal(result.items[0].providerMessageId, "provider-123");
  });

  it("refuses an approved action that cannot be attributed", async () => {
    let called = false;
    const result = await run({
      config: {
        endpoint: "https://relay.example/send",
        fetchImpl: async () => { called = true; },
      },
      runtime: RELEASED,
    }, [{ approved: true, draft: "Hello" }]);

    assert.equal(called, false);
    assert.equal(result.ok, false);
    assert.match(result.items[0].error, /gtmActionId/);
  });
});

describe("HTTP send auth — BYO credential resolution (key resolution only, send-gating untouched)", () => {
  afterEach(() => {
    delete process.env.GTM_IDE_SEND_AUTH;
    // Credentials are universal now, so clear the stored http key between tests — otherwise the
    // "falls back to env when nothing stored" case would still see a key a prior test connected.
    removeCredential(null, "http");
  });

  async function runWithCapture(context) {
    const requests = [];
    const result = await run({
      config: {
        endpoint: "https://relay.example/send",
        fetchImpl: async (url, options) => {
          requests.push(options);
          return { ok: true, status: 202, json: async () => ({ id: "p-1" }) };
        },
      },
      runtime: RELEASED,
    }, [{ email: "a@example.com", draft: "Hi", approved: true, gtmActionId: "gtm-1" }], context);
    return { result, requests };
  }

  it("prefers a founder-pasted send credential over the env var", async () => {
    process.env.GTM_IDE_SEND_AUTH = "Bearer from-env";
    setCredential("proj-http", { provider: "http", token: "Bearer from-store" });
    const { requests } = await runWithCapture({ credentials: { projectId: "proj-http" } });
    assert.equal(requests[0].headers.Authorization, "Bearer from-store");
  });

  it("falls back to the env var when no credential is stored (the engineer path still works)", async () => {
    process.env.GTM_IDE_SEND_AUTH = "Bearer env-only";
    const { requests } = await runWithCapture({ credentials: { projectId: "proj-http-none" } });
    assert.equal(requests[0].headers.Authorization, "Bearer env-only");
  });

  it("sends with no Authorization header when neither a stored nor env credential exists", async () => {
    const { requests } = await runWithCapture({ credentials: { projectId: "proj-http-empty" } });
    assert.equal(requests[0].headers.Authorization, undefined);
  });

  it("never logs the resolved secret", async () => {
    process.env.GTM_IDE_SEND_AUTH = "Bearer top-secret-token";
    const logs = [];
    const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
    for (const k of Object.keys(orig)) console[k] = (...a) => logs.push(a.join(" "));
    try {
      await runWithCapture({ credentials: { projectId: "proj-http-log" } });
    } finally {
      Object.assign(console, orig);
    }
    assert.equal(logs.join("\n").includes("top-secret-token"), false);
  });
});
