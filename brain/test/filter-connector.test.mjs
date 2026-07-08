import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { meta, run } from "../src/connectors/score/default.mjs";
import { getConnector } from "../src/connectors/registry.mjs";

// Wave 6: the default filter connector was demoted from keyword ICP scoring to a pass-through. Fit
// judgment is an agent step now, not a substring count that silently drops real prospects.
describe("default filter connector — demoted to pass-through", () => {
  it("passes every item through untouched and drops no one", async () => {
    const upstream = [
      { type: "prospect", name: "Ada", summary: "builds developer tools" },
      { type: "prospect", name: "Bo", summary: "nothing matching any keyword" },
      { type: "other", id: "x" },
    ];
    const out = await run({ config: { keywords: ["fintech"], minFitScore: 0.9 } }, upstream);
    assert.equal(out.ok, true);
    assert.equal(out.items.length, 3, "no keyword count drops anyone");
    assert.deepEqual(out.items, upstream, "items pass through untouched — no injected score/fit fields");
    assert.equal(out.meta.passthrough, true);
  });

  it("is still registered as the default filter connector, no longer named 'Keyword score'", () => {
    const connector = getConnector("filter", "default");
    assert.ok(connector, "a default filter connector is still registered");
    assert.equal(connector.meta.type, "filter");
    assert.equal(/keyword score/i.test(connector.meta.name), false, "the keyword-score name is gone");
    assert.equal(meta.type, "filter");
  });
});
