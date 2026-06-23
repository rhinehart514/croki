import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditGraphContracts, auditInput, auditOutput } from "../src/contracts.mjs";
import { runGraph } from "../src/graph.mjs";
import { applyGraphOperations, validateGraph } from "../src/graph-operations.mjs";
import { pilotOutreachRecipe } from "../src/workflow-recipes.mjs";

function graphWith(items, draftContract = { accepts: ["personalFact"], emits: ["draft"], minItems: 1 }) {
  return {
    id: "contract-run",
    name: "Contract run",
    version: "1",
    nodes: [
      {
        id: "source",
        category: "source",
        connector: "manual",
        label: "Research",
        position: { x: 0, y: 0 },
        config: { items },
        contract: { emits: ["company"] },
      },
      {
        id: "draft",
        category: "generate",
        kind: "agent",
        ref: "test-drafter",
        label: "Draft outreach",
        position: { x: 300, y: 0 },
        config: {},
        contract: draftContract,
      },
    ],
    edges: [{ id: "source-draft", source: "source", target: "draft", edgeType: "data" }],
  };
}

describe("workflow data contracts", () => {
  it("blocks drafting before the agent runs when a personal fact is missing", async () => {
    let calls = 0;
    const result = await runGraph(graphWith([{ company: "Acme" }]), {
      stepRuntime: {
        async agent() {
          calls += 1;
          return { ok: true, items: [{ draft: "Hello" }] };
        },
      },
    });
    assert.equal(calls, 0);
    assert.equal(result.nodes.draft.blocked, true);
    assert.equal(result.nodes.draft.contractAudit.state, "blocked");
    assert.match(result.nodes.draft.error, /personalFact/);
  });

  it("fails a step that does not produce its promised output", async () => {
    const graph = graphWith(
      [{ company: "Acme", personalFact: "Won a local award" }],
      { accepts: ["company", "personalFact"], emits: ["draft"], minItems: 1 },
    );
    graph.nodes[0].contract = { emits: ["company", "personalFact"] };
    const result = await runGraph(graph, {
      stepRuntime: {
        async agent() {
          return { ok: true, items: [{ subject: "Hello" }] };
        },
      },
    });
    assert.equal(result.nodes.draft.ok, false);
    assert.equal(result.nodes.draft.contractAudit.state, "blocked");
    assert.match(result.nodes.draft.error, /promised draft/);
  });

  it("gives the draft step the exact missing personal-fact reason when research violates its promise", async () => {
    const graph = graphWith(
      [{ company: "Acme", personalFact: "seed" }],
      { accepts: ["company", "personalFact"], emits: ["draft"], minItems: 1 },
    );
    graph.nodes[0].contract = { emits: ["company", "personalFact"] };
    graph.nodes.splice(1, 0, {
      id: "research",
      category: "enrich",
      kind: "agent",
      ref: "test-researcher",
      label: "Research",
      position: { x: 150, y: 0 },
      config: {},
      contract: { accepts: ["company"], emits: ["company", "personalFact"], minItems: 1 },
    });
    graph.edges = [
      { id: "source-research", source: "source", target: "research", edgeType: "data" },
      { id: "research-draft", source: "research", target: "draft", edgeType: "data" },
    ];
    const result = await runGraph(graph, {
      stepRuntime: {
        async agent(node) {
          return node.id === "research"
            ? { ok: true, items: [{ company: "Acme" }] }
            : { ok: true, items: [{ draft: "Hello" }] };
        },
      },
    });
    assert.equal(result.nodes.draft.contractAudit.state, "blocked");
    assert.match(result.nodes.draft.error, /personalFact/);
  });

  it("marks measurement blind when upstream does not promise attribution source", () => {
    const graph = pilotOutreachRecipe();
    const audits = auditGraphContracts(graph);
    assert.equal(audits["measure-pilot"].state, "blind");
    assert.deepEqual(audits["measure-pilot"].missingFields, ["source"]);
  });

  it("distinguishes waiting, satisfied, and zero-result output states", () => {
    const node = { label: "Draft", category: "generate", contract: { accepts: ["personalFact"], emits: ["draft"], minItems: 1 } };
    assert.equal(auditInput(node, []).state, "waiting");
    assert.equal(auditInput(node, [{ personalFact: "Specific fact" }]).state, "satisfied");
    assert.equal(auditOutput({ ...node, contract: { emits: ["draft"] } }, []).state, "satisfied");
  });

  it("preserves contracts through validated typed operations", () => {
    const graph = pilotOutreachRecipe();
    const result = applyGraphOperations(graph, [{
      type: "update_node",
      nodeId: "draft-outreach",
      patch: { contract: { accepts: ["personalFact", "nowTrigger"], emits: ["draft"] } },
    }]);
    assert.deepEqual(result.graph.nodes.find((node) => node.id === "draft-outreach").contract, {
      accepts: ["personalFact", "nowTrigger"],
      emits: ["draft"],
    });
  });

  it("ships a valid, founder-gated pilot recipe", () => {
    const graph = pilotOutreachRecipe();
    assert.equal(validateGraph(graph).ok, true);
    const gateIndex = graph.nodes.findIndex((node) => node.category === "gate");
    const executeIndex = graph.nodes.findIndex((node) => node.category === "execute");
    assert.ok(gateIndex >= 0 && executeIndex > gateIndex);
  });
});
