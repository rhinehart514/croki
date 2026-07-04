import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildCompileDecompositionGrounding,
  normalizeRunPlan,
  decomposeRunPlan,
} from "../src/graph-intelligence/compile-decompose.mjs";

function sampleGraph() {
  return {
    nodes: [
      {
        id: "proof",
        domain: "product",
        type: "proof",
        statement: "Repo proves scan support.",
        solidity: "derived",
        weaknesses: [
          { kind: "coverage", statement: "open gap", status: "open" },
          { kind: "stale", statement: "resolved", status: "resolved" },
        ],
      },
      {
        id: "message",
        domain: "strategy",
        type: "message",
        statement: "Lead with scan proof.",
        solidity: null,
        weaknesses: [],
      },
    ],
  };
}

describe("compile-decompose grounding", () => {
  it("keeps only path nodes that exist in the graph, in path order, compacted", () => {
    const grounding = buildCompileDecompositionGrounding({
      graph: sampleGraph(),
      pathNodeIds: ["message", "ghost", "proof"],
    });
    assert.deepEqual(grounding.path.map((node) => node.id), ["message", "proof"], "unknown ids dropped, order preserved");
    const proof = grounding.path.find((node) => node.id === "proof");
    assert.equal(proof.domain, "product");
    assert.equal(proof.solidity, "derived");
    assert.deepEqual(proof.weaknesses, [{ kind: "coverage", statement: "open gap" }], "only OPEN weaknesses carried, compacted");
  });

  it("passes product truths and market objects through from the grounding bag", () => {
    const grounding = buildCompileDecompositionGrounding({
      graph: sampleGraph(),
      pathNodeIds: ["proof"],
      grounding: { productTruths: [{ claim: "x" }], marketObjects: [{ buyer: "y" }] },
    });
    assert.deepEqual(grounding.productTruths, [{ claim: "x" }]);
    assert.deepEqual(grounding.marketObjects, [{ buyer: "y" }]);
  });

  it("marks a measurement bindable when any join signal is present", () => {
    const bound = buildCompileDecompositionGrounding({
      graph: sampleGraph(),
      pathNodeIds: [],
      contract: { joinKey: "email", outcomeKinds: [], sources: [], successCriteria: "" },
    });
    assert.equal(bound.measurementBindable, true);
    assert.equal(bound.measurementWeakness, null, "no weakness when bindable");
    assert.deepEqual(bound.measurement, { joinKey: "email", outcomeKinds: [], sources: [], successCriteria: "" });
  });

  it("reports the missing measurement fields when the contract cannot bind", () => {
    const unbound = buildCompileDecompositionGrounding({
      graph: sampleGraph(),
      pathNodeIds: [],
      contract: { outcomeKinds: [], sources: [], joinKey: "   ", successCriteria: "" },
    });
    assert.equal(unbound.measurementBindable, false);
    assert.deepEqual(
      unbound.measurementWeakness.missing.sort(),
      ["joinKey", "outcomeKinds", "sources", "successCriteria"],
      "every empty binding field is named",
    );
  });

  it("treats a null contract as an unbindable measurement missing the whole contract", () => {
    const unbound = buildCompileDecompositionGrounding({ graph: sampleGraph(), pathNodeIds: [], contract: null });
    assert.equal(unbound.measurementBindable, false);
    assert.deepEqual(unbound.measurementWeakness.missing, ["contract"]);
    assert.equal(unbound.measurement, null);
  });
});

describe("compile-decompose normalizeRunPlan", () => {
  it("coerces a raw plan, keeping only object items in each array bag", () => {
    const plan = normalizeRunPlan(
      {
        audience: { segment: "founders" },
        assets: [{ id: "a" }, "junk", null, 5],
        tasks: [{ id: "t" }, undefined],
        patch: { note: "p" },
        gates: [{ id: "g" }, false],
        execution: [{ id: "e" }, "x"],
      },
      { pathId: "path-1", contract: { joinKey: "email" } },
    );
    assert.deepEqual(plan.audience, { segment: "founders" });
    assert.deepEqual(plan.assets, [{ id: "a" }], "non-object asset items dropped");
    assert.deepEqual(plan.tasks, [{ id: "t" }]);
    assert.deepEqual(plan.gates, [{ id: "g" }]);
    assert.deepEqual(plan.execution, [{ id: "e" }]);
    assert.equal(plan.pathId, "path-1");
  });

  it("falls back the measurement to the contract and the pathId to the supplied id", () => {
    const plan = normalizeRunPlan({}, { pathId: "fallback-path", contract: { joinKey: "user_id" } });
    assert.equal(plan.pathId, "fallback-path");
    assert.deepEqual(plan.measurement, { joinKey: "user_id" });
    assert.deepEqual(plan.assets, []);
    assert.equal(plan.audience, null);
    assert.equal(plan.patch, null);
  });

  it("prefers the plan's own measurement over the fallback contract", () => {
    const plan = normalizeRunPlan(
      { measurement: { joinKey: "own_key" } },
      { contract: { joinKey: "fallback_key" } },
    );
    assert.deepEqual(plan.measurement, { joinKey: "own_key" });
  });

  it("survives a non-object input by returning a fully-shaped empty plan", () => {
    const plan = normalizeRunPlan("not a plan", { pathId: "p" });
    assert.equal(plan.pathId, "p");
    assert.deepEqual(plan.assets, []);
    assert.deepEqual(plan.tasks, []);
    assert.deepEqual(plan.gates, []);
    assert.equal(plan.measurement, null);
  });
});

describe("compile-decompose decomposeRunPlan", () => {
  it("returns an empty normalized plan (contract as measurement) when no decompose runtime is wired", async () => {
    const plan = await decomposeRunPlan({
      graph: sampleGraph(),
      pathNodeIds: ["proof"],
      contract: { successCriteria: "one signup" },
      pathId: "path-x",
    });
    assert.equal(plan.pathId, "path-x");
    assert.deepEqual(plan.measurement, { successCriteria: "one signup" });
    assert.deepEqual(plan.tasks, []);
  });

  it("hands the built grounding to the decompose runtime and normalizes its runPlan", async () => {
    let seenGrounding = null;
    const plan = await decomposeRunPlan({
      graph: sampleGraph(),
      pathNodeIds: ["proof", "message"],
      contract: { joinKey: "email" },
      pathId: "path-y",
      decompose: async (grounding) => {
        seenGrounding = grounding;
        return { runPlan: { tasks: [{ id: "reach-out" }, "junk"], gates: [{ id: "gate" }] } };
      },
    });
    assert.equal(seenGrounding.path.length, 2, "grounding was built from the path and passed in");
    assert.equal(seenGrounding.measurementBindable, true);
    assert.deepEqual(plan.tasks, [{ id: "reach-out" }], "runtime output is normalized, junk dropped");
    assert.deepEqual(plan.gates, [{ id: "gate" }]);
    assert.equal(plan.pathId, "path-y");
  });

  it("accepts a bare plan object (no runPlan wrapper) from the runtime", async () => {
    const plan = await decomposeRunPlan({
      graph: sampleGraph(),
      pathNodeIds: [],
      pathId: "path-z",
      decompose: async () => ({ tasks: [{ id: "bare" }] }),
    });
    assert.deepEqual(plan.tasks, [{ id: "bare" }]);
    assert.equal(plan.pathId, "path-z");
  });
});
