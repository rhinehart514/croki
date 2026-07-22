import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildExaReadTools, fetchExaPage, searchExa } from "../src/connected-read-capabilities.mjs";

function response(payload, ok = true, status = 200) {
  return { ok, status, async json() { return payload; } };
}

describe("Exa read capability", () => {
  it("stays absent without a credential", () => {
    assert.deepEqual(buildExaReadTools({ token: null }), []);
  });

  it("searches with the secret in a header and never returns it", async () => {
    let request;
    const result = await searchExa({ query: "buyer evidence", maxResults: 3 }, {
      token: "exa-secret",
      fetchImpl: async (url, init) => {
        request = { url, init };
        return response({ results: [{ title: "Evidence", url: "https://example.com", text: "Proof" }] });
      },
    });
    assert.equal(request.url, "https://api.exa.ai/search");
    assert.equal(request.init.headers["x-api-key"], "exa-secret");
    assert.equal(JSON.stringify(result).includes("exa-secret"), false);
    assert.equal(result.results[0].url, "https://example.com");
  });

  it("reads only HTTP(S) sources", async () => {
    await assert.rejects(() => fetchExaPage({ url: "file:///secret" }, { token: "key", fetchImpl: async () => response({}) }), /HTTP or HTTPS/);
  });
});
