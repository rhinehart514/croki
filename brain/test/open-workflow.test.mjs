import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runGraph } from "../src/graph.mjs";
import { applyGraphOperations, validateGraph } from "../src/graph-operations.mjs";
import { makeStepRuntime, defaultStepRuntime } from "../src/step-runners.mjs";

// A minimal source step so workflows have real upstream items to act on.
function source(id, items) {
  return { id, category: "source", connector: "manual", label: "Seed", position: { x: 0, y: 0 }, config: { items } };
}

describe("open workflow — backward compatibility", () => {
  it("runs a tool-only graph exactly as before (no kind field)", async () => {
    const graph = { id: "bc", nodes: [source("s", [{ id: "p1", email: "a@b.com" }])], edges: [] };
    const result = await runGraph(graph);
    assert.equal(result.nodes.s.ok, true);
    assert.equal(result.nodes.s.items.length, 1);
    assert.equal(result.nodes.s.items[0].email, "a@b.com");
  });
});

describe("open workflow — agent step (subagent as a workflow node)", () => {
  it("dispatches an agent node through the injected step runtime", async () => {
    const graph = {
      id: "ag",
      nodes: [
        source("s", [{ id: "p1", email: "a@b.com" }]),
        { id: "a", kind: "agent", ref: "gtm-enrich", label: "Enrich via subagent", position: { x: 200, y: 0 }, config: {} },
      ],
      edges: [{ id: "e", source: "s", target: "a", edgeType: "data" }],
    };
    // The agent layer is rented, not built — inject a fake invoker the way the live
    // server would inject a real Claude Code / Codex one.
    const stepRuntime = makeStepRuntime({
      agent: async (node, upstream) => ({
        ok: true,
        items: upstream.map((item) => ({ ...item, enrichedBy: node.ref })),
        meta: { calls: upstream.length },
      }),
    });
    const result = await runGraph(graph, { stepRuntime });
    assert.equal(result.nodes.a.ok, true);
    assert.equal(result.nodes.a.kind, "agent");
    assert.equal(result.nodes.a.items[0].enrichedBy, "gtm-enrich");
    assert.equal(result.nodes.a.meta.calls, 1);
  });

  it("reports an honest blocked state when no agent runtime is attached", async () => {
    const graph = {
      id: "ag2",
      nodes: [{ id: "a", kind: "agent", ref: "gtm-signal-github", label: "Pull stargazers", position: { x: 0, y: 0 }, config: {} }],
      edges: [],
    };
    const result = await runGraph(graph); // default step runtime, no invoker
    assert.equal(result.nodes.a.ok, false);
    assert.match(result.nodes.a.error, /needs an agent runtime/);
  });
});

describe("open workflow — skill step (judgment as a workflow node)", () => {
  it("passes items through and attaches skill guidance", async () => {
    const graph = {
      id: "sk",
      nodes: [
        source("s", [{ id: "p1" }]),
        { id: "k", kind: "skill", ref: "positioning", label: "Apply positioning", position: { x: 200, y: 0 }, config: {} },
      ],
      edges: [{ id: "e", source: "s", target: "k", edgeType: "data" }],
    };
    const stepRuntime = makeStepRuntime({
      skill: async (node, upstream) => ({ ok: true, items: upstream, meta: { kind: "skill", ref: node.ref, applied: true, guidance: "lead with the now-you-can line" } }),
    });
    const result = await runGraph(graph, { stepRuntime });
    assert.equal(result.nodes.k.ok, true);
    assert.equal(result.nodes.k.kind, "skill");
    assert.equal(result.nodes.k.items.length, 1);
    assert.equal(result.nodes.k.meta.applied, true);
  });

  it("the default skill runner is honest about no loader", async () => {
    const out = await defaultStepRuntime.skill({ ref: "positioning" }, [{ id: "x" }], {});
    assert.equal(out.ok, true);
    assert.equal(out.meta.applied, false); // no loader attached → no guidance, said honestly
  });
});

describe("open workflow — validation and typed operations", () => {
  it("accepts an agent node with a ref", () => {
    const v = validateGraph({ nodes: [{ id: "a", kind: "agent", ref: "x", label: "A", position: { x: 0, y: 0 }, config: {} }], edges: [] });
    assert.equal(v.ok, true);
  });

  it("rejects an open-kind node missing its ref", () => {
    const v = validateGraph({ nodes: [{ id: "a", kind: "agent", label: "A", position: { x: 0, y: 0 }, config: {} }], edges: [] });
    assert.equal(v.ok, false);
    assert.match(v.errors.join(" "), /needs a ref/);
  });

  it("still requires a valid category for tool nodes (the cage stays where it belongs)", () => {
    const v = validateGraph({ nodes: [{ id: "t", label: "T", position: { x: 0, y: 0 }, config: {} }], edges: [] });
    assert.equal(v.ok, false);
    assert.match(v.errors.join(" "), /invalid category/);
  });

  it("add_node creates a skill step via typed operations", () => {
    const base = { id: "g", name: "G", revision: 0, nodes: [], edges: [] };
    const { graph } = applyGraphOperations(base, [
      { type: "add_node", node: { id: "k", kind: "skill", ref: "positioning", label: "Position", position: { x: 0, y: 0 }, config: {} } },
    ]);
    assert.equal(graph.nodes[0].kind, "skill");
    assert.equal(graph.nodes[0].ref, "positioning");
  });

  it("add_node rejects an open-kind step with no ref", () => {
    const base = { id: "g", name: "G", revision: 0, nodes: [], edges: [] };
    assert.throws(
      () => applyGraphOperations(base, [{ type: "add_node", node: { id: "a", kind: "agent", label: "A", position: { x: 0, y: 0 }, config: {} } }]),
      /Node ref/,
    );
  });
});
