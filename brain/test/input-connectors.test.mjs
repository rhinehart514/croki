import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCsv, run as runCsv } from "../src/connectors/find/csv.mjs";
import { run as runApi } from "../src/connectors/find/api.mjs";

describe("manual data boundary connectors", () => {
  it("parses CSV rows, quoted commas, and stable ids", async () => {
    const csv = 'email,name,note\nada@example.com,Ada,"Builder, technical"\n';
    assert.equal(parseCsv(csv)[0].note, "Builder, technical");
    const result = await runCsv({ config: { csv } });
    assert.equal(result.items[0].id, "ada@example.com");
  });

  it("pulls an array from a configured API response", async () => {
    const result = await runApi({
      config: {
        endpoint: "https://example.com/accounts",
        arrayField: "data.accounts",
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          async json() { return { data: { accounts: [{ id: "a1", name: "Acme" }] } }; },
        }),
      },
    });
    assert.equal(result.items[0].name, "Acme");
  });
});
