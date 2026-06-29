// Open step kinds — the parts that used to dead-end:
//   - `skill` guidance now flows through the shared run context to a downstream `agent` step
//   - `code` steps now run a real, deterministic, NO-EVAL transform registry
//
// The wall is untouched: `code` is the deterministic spine (a fixed registry, never eval), and a
// `skill` step that finds judgment with nowhere to flow stays honestly applied:false.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStepRuntime, BUILTIN_CODE_TRANSFORMS } from "../src/step-runners.mjs";

describe("skill guidance flows to a downstream agent through the shared run context", () => {
  it("a skill step accumulates its guidance, and the agent step receives that same context", async () => {
    let seenContext = null;
    const runtime = createStepRuntime({
      skillLoader: (ref) => (ref === "positioning" ? "Lead with the now-you-can line." : null),
      agentInvoker: async ({ context, items }) => { seenContext = context; return { ok: true, items }; },
    });
    // graph.mjs threads one shared accumulator into every data-flow node's context.
    const ctx = { __skillGuidance: [] };
    await runtime.skill({ ref: "positioning" }, [{ id: "1" }], ctx);
    await runtime.agent({ ref: "drafter" }, [{ id: "1" }], ctx);

    assert.ok(Array.isArray(seenContext.__skillGuidance), "agent step saw the shared accumulator");
    assert.equal(seenContext.__skillGuidance.length, 1);
    assert.equal(seenContext.__skillGuidance[0].ref, "positioning");
    assert.match(seenContext.__skillGuidance[0].guidance, /now-you-can/);
  });

  it("dedupes by ref when two skill steps name the same skill", async () => {
    const runtime = createStepRuntime({ skillLoader: () => "doctrine" });
    const ctx = { __skillGuidance: [] };
    await runtime.skill({ ref: "positioning" }, [], ctx);
    await runtime.skill({ ref: "positioning" }, [], ctx);
    assert.equal(ctx.__skillGuidance.length, 1);
  });

  it("passes upstream items through unchanged (judgment is a side effect, not a transform)", async () => {
    const runtime = createStepRuntime({ skillLoader: () => "doctrine" });
    const items = [{ id: "a" }, { id: "b" }];
    const out = await runtime.skill({ ref: "positioning" }, items, { __skillGuidance: [] });
    assert.deepEqual(out.items, items);
  });
});

describe("code steps run real deterministic transforms (the spine), no eval", () => {
  function runtime() {
    return createStepRuntime({ codeTransforms: BUILTIN_CODE_TRANSFORMS });
  }

  it("dedupe by a field actually reduces a list", async () => {
    const out = await runtime().code(
      { ref: "dedupe", config: { by: "email" } },
      [{ email: "a@x.com" }, { email: "a@x.com" }, { email: "b@x.com" }],
    );
    assert.equal(out.ok, true);
    assert.equal(out.meta.applied, true);
    assert.equal(out.items.length, 2);
    assert.deepEqual(out.items.map((i) => i.email), ["a@x.com", "b@x.com"]);
  });

  it("dedupe with no field keys on whole-item identity", async () => {
    const out = await runtime().code({ ref: "dedupe", config: {} }, [{ a: 1 }, { a: 1 }, { a: 2 }]);
    assert.equal(out.items.length, 2);
  });

  it("filter keeps only items where field op value holds", async () => {
    const out = await runtime().code(
      { ref: "filter", config: { field: "score", op: "gte", value: 50 } },
      [{ score: 80 }, { score: 30 }, { score: 50 }],
    );
    assert.deepEqual(out.items.map((i) => i.score), [80, 50]);
    assert.equal(out.meta.applied, true);
  });

  it("filter default op 'exists' drops empty/missing fields", async () => {
    const out = await runtime().code(
      { ref: "filter", config: { field: "personalFact" } },
      [{ personalFact: "ships weekly" }, { personalFact: "" }, { other: 1 }],
    );
    assert.equal(out.items.length, 1);
    assert.equal(out.items[0].personalFact, "ships weekly");
  });

  it("limit caps the count", async () => {
    const out = await runtime().code({ ref: "limit", config: { count: 2 } }, [{ i: 1 }, { i: 2 }, { i: 3 }, { i: 4 }]);
    assert.equal(out.items.length, 2);
    assert.deepEqual(out.items.map((i) => i.i), [1, 2]);
  });

  it("sort orders by a field, ascending and descending, stably", async () => {
    const asc = await runtime().code({ ref: "sort", config: { by: "score" } }, [{ score: 3 }, { score: 1 }, { score: 2 }]);
    assert.deepEqual(asc.items.map((i) => i.score), [1, 2, 3]);
    const desc = await runtime().code({ ref: "sort", config: { by: "score", direction: "desc" } }, [{ score: 3 }, { score: 1 }, { score: 2 }]);
    assert.deepEqual(desc.items.map((i) => i.score), [3, 2, 1]);
  });

  it("rename-fields moves a field's value to its new name", async () => {
    const out = await runtime().code(
      { ref: "rename-fields", config: { map: { full_name: "name" } } },
      [{ full_name: "Ada Lovelace", title: "Engineer" }],
    );
    assert.equal(out.items[0].name, "Ada Lovelace");
    assert.equal(out.items[0].title, "Engineer");
    assert.equal("full_name" in out.items[0], false);
  });

  it("an unknown ref is an honest no-op (applied:false), never a wall", async () => {
    const items = [{ id: "1" }];
    const out = await runtime().code({ ref: "does-not-exist", config: {} }, items);
    assert.equal(out.ok, true);
    assert.equal(out.meta.applied, false);
    assert.deepEqual(out.items, items);
  });

  it("the transform registry holds only the documented deterministic functions", () => {
    assert.deepEqual(
      Object.keys(BUILTIN_CODE_TRANSFORMS).sort(),
      ["dedupe", "filter", "limit", "rename-fields", "sort"],
    );
    for (const fn of Object.values(BUILTIN_CODE_TRANSFORMS)) assert.equal(typeof fn, "function");
  });
});
