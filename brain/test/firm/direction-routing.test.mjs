// direction-routing.test.mjs — a direction is claimed by the right teammate with a one-line why
// (build contract §4A.1). Deterministic-first: an explicit target and a crew-of-one never touch the
// model; only a genuinely fuzzy multi-crew match does, through an injected classifier so no test hits
// the network.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { routeDirection } from "../../src/firm/direction-routing.mjs";

function config(agents, coordinatorRef = null) {
  return {
    agents: agents.map((a) => ({ activation: "direct-or-relevant", ...a })),
    coordination: { coordinatorRef },
  };
}

describe("routeDirection — deterministic-first claiming", () => {
  it("claims an explicitly targeted teammate directly, never calling the model", async () => {
    let classifyCalls = 0;
    const routed = await routeDirection(
      { direction: "reach out to buyers", configuration: config([{ ref: "yara", name: "Yara" }, { ref: "reed", name: "Reed" }]), targetedRefs: ["reed"] },
      { classify: async () => { classifyCalls += 1; return { ref: "yara" }; } },
    );
    assert.equal(routed.teammateRef, "reed");
    assert.equal(routed.usedModel, false);
    assert.match(routed.why, /named for this/i);
    assert.equal(classifyCalls, 0, "an explicit target skips the model");
  });

  it("a crew of one claims directly with no model call", async () => {
    let classifyCalls = 0;
    const routed = await routeDirection(
      { direction: "anything", configuration: config([{ ref: "solo", name: "Solo", perspective: "does it all" }]) },
      { classify: async () => { classifyCalls += 1; return null; } },
    );
    assert.equal(routed.teammateRef, "solo");
    assert.equal(routed.usedModel, false);
    assert.equal(classifyCalls, 0);
  });

  it("uses the injected classifier for a genuinely fuzzy multi-crew match and carries its one-line why", async () => {
    const configuration = config([
      { ref: "buyer-lens", name: "Bo", perspective: "reads buyer questions" },
      { ref: "builder", name: "Bea", perspective: "builds the product" },
    ]);
    const routed = await routeDirection(
      { direction: "a prospect asked what our pricing is", configuration },
      { classify: async () => ({ ref: "buyer-lens", why: "This is a buyer question — mine." }) },
    );
    assert.equal(routed.teammateRef, "buyer-lens");
    assert.equal(routed.usedModel, true);
    assert.equal(routed.why, "This is a buyer question — mine.");
  });

  it("falls back to the coordinator when the model is unsure, returns an unknown ref, or throws", async () => {
    const configuration = config(
      [{ ref: "coordinator", name: "Coordinator" }, { ref: "other", name: "Other" }],
      "coordinator",
    );
    for (const classify of [async () => null, async () => ({ ref: "ghost" }), async () => { throw new Error("model down"); }]) {
      const routed = await routeDirection({ direction: "fuzzy", configuration }, { classify });
      assert.equal(routed.teammateRef, "coordinator");
      assert.equal(routed.usedModel, false);
    }
  });

  it("the model can only ever pick a configured participant — it can never invent one", async () => {
    const configuration = config([{ ref: "a", name: "A" }, { ref: "b", name: "B" }], "a");
    const routed = await routeDirection(
      { direction: "x", configuration },
      { classify: async () => ({ ref: "not-in-crew", why: "trust me" }) },
    );
    assert.equal(routed.teammateRef, "a", "an unknown model ref is discarded for the deterministic coordinator");
  });

  it("refuses to invent an activation path: a relevance-only crew with no coordinator claims no one", async () => {
    const routed = await routeDirection(
      { direction: "x", configuration: config([{ ref: "observer", name: "Observer", activation: "relevant" }]) },
      {},
    );
    assert.equal(routed.teammateRef, null);
  });
});
