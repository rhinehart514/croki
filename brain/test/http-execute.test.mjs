import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { run } from "../src/connectors/execute/http.mjs";

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
    }, [{ approved: true, draft: "Hello" }]);

    assert.equal(called, false);
    assert.equal(result.ok, false);
    assert.match(result.items[0].error, /gtmActionId/);
  });
});
