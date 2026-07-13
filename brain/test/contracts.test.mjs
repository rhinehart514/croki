import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditGraphContracts, auditInput, auditOutput } from "../src/contracts.mjs";
import { runGraph } from "../src/graph.mjs";
import { applyGraphOperations, validateGraph } from "../src/graph-operations.mjs";

// A generic founder-gated workflow fixture (no product-specific recipe): research → draft → gate →
// stage → measure. Used to exercise the contract auditor, typed operations, and gate/execute ordering.
// The stage step deliberately does NOT emit "source", so the measure step audits as blind on it.
function gatedWorkflowGraph() {
  return {
    id: "gated-workflow",
    name: "Gated workflow",
    version: "1.0",
    revision: 0,
    nodes: [
      { id: "input", category: "source", connector: "manual", label: "Targets", position: { x: 0, y: 0 }, config: { items: [] }, contract: { emits: ["target"] } },
      { id: "research", category: "enrich", kind: "agent", ref: "test-researcher", label: "Research", position: { x: 300, y: 0 }, config: {}, contract: { accepts: ["target"], emits: ["company", "personalFact"], minItems: 1 } },
      { id: "draft-outreach", category: "generate", kind: "agent", ref: "test-drafter", label: "Draft", position: { x: 600, y: 0 }, config: {}, contract: { accepts: ["company", "personalFact"], emits: ["draft"], minItems: 1 } },
      { id: "gate", category: "gate", connector: "default", label: "Founder review", position: { x: 900, y: 0 }, config: {}, contract: { accepts: ["draft"], emits: ["draft", "approved", "gtmActionId"], minItems: 1 } },
      { id: "stage", category: "execute", connector: "local", label: "Stage approved", position: { x: 1200, y: 0 }, config: {}, contract: { accepts: ["draft", "approved", "gtmActionId"], emits: ["draft", "gtmActionId", "executionStatus"] } },
      { id: "measure", category: "measure", connector: "default", label: "Measure", position: { x: 1500, y: 0 }, config: { joinKey: "gtmActionId" }, contract: { accepts: ["gtmActionId", "source"], emits: ["attribution"] } },
    ],
    edges: [
      { id: "input-research", source: "input", target: "research", edgeType: "data" },
      { id: "research-draft", source: "research", target: "draft-outreach", edgeType: "data" },
      { id: "draft-gate", source: "draft-outreach", target: "gate", edgeType: "data" },
      { id: "gate-stage", source: "gate", target: "stage", edgeType: "data" },
      { id: "stage-measure", source: "stage", target: "measure", edgeType: "data" },
    ],
  };
}

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
    const graph = gatedWorkflowGraph();
    const audits = auditGraphContracts(graph);
    assert.equal(audits["measure"].state, "blind");
    assert.deepEqual(audits["measure"].missingFields, ["source"]);
  });

  it("lets a persisted host-owned node receipt replace its speculative pre-run warning", () => {
    const graph = {
      id: "observed-context",
      nodes: [{
        id: "context",
        category: "context",
        connector: "product",
        label: "Product context",
        contract: { accepts: [], emits: ["productFact"], minItems: 1 },
      }],
      edges: [],
    };
    assert.equal(auditGraphContracts(graph).context.state, "waiting");
    const audits = auditGraphContracts(graph, {
      nodes: { context: { nodeId: "context", items: [{ productFact: "Proven" }] } },
    });
    assert.equal(audits.context.state, "satisfied");
    assert.equal(audits.context.itemCount, 1);
  });

  it("distinguishes waiting, satisfied, and zero-result output states", () => {
    const node = { label: "Draft", category: "generate", contract: { accepts: ["personalFact"], emits: ["draft"], minItems: 1 } };
    assert.equal(auditInput(node, []).state, "waiting");
    assert.equal(auditInput(node, [{ personalFact: "Specific fact" }]).state, "satisfied");
    assert.equal(auditOutput({ ...node, contract: { emits: ["draft"] } }, []).state, "satisfied");
  });

  it("preserves contracts through validated typed operations", () => {
    const graph = gatedWorkflowGraph();
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

  it("ships a valid, founder-gated workflow with the gate before execute", () => {
    const graph = gatedWorkflowGraph();
    assert.equal(validateGraph(graph).ok, true);
    const gateIndex = graph.nodes.findIndex((node) => node.category === "gate");
    const executeIndex = graph.nodes.findIndex((node) => node.category === "execute");
    assert.ok(gateIndex >= 0 && executeIndex > gateIndex);
  });
});
