import { test } from "node:test";
import assert from "node:assert/strict";

import {
  wasConsulted,
  assertMoatConsulted,
  MOAT_TOOLS,
} from "../src/consult-guard.mjs";
import { runGraph } from "../src/graph.mjs";
import { makeStepRuntime } from "../src/step-runners.mjs";

// ─── wasConsulted — predicate ─────────────────────────────────────────────────

test("wasConsulted returns true when the tool appears in the call list", () => {
  assert.equal(wasConsulted(["get_product", "get_taste", "get_market"], "get_taste"), true);
});

test("wasConsulted returns false when the tool is absent", () => {
  assert.equal(wasConsulted(["get_product", "get_market"], "get_taste"), false);
});

test("wasConsulted returns false on an empty list", () => {
  assert.equal(wasConsulted([], "get_taste"), false);
});

test("wasConsulted returns false on non-array input", () => {
  assert.equal(wasConsulted(null, "get_taste"), false);
  assert.equal(wasConsulted(undefined, "get_taste"), false);
});

// ─── MOAT_TOOLS — canonical names match retrieval-tools surface ───────────────

test("MOAT_TOOLS names are the expected retrieval tool identifiers", () => {
  assert.equal(MOAT_TOOLS.TASTE, "get_taste");
  assert.equal(MOAT_TOOLS.DESIGN, "get_design");
});

// ─── assertMoatConsulted — main rule ─────────────────────────────────────────

test("draft without get_taste is NOT ok", () => {
  const result = assertMoatConsulted({
    toolCalls: ["get_product", "get_market"],
    producedDraft: true,
  });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes("get_taste"), "missing must name get_taste");
  assert.match(result.note, /get_taste/);
  assert.match(result.note, /draft/i);
});

test("draft with get_taste is ok", () => {
  const result = assertMoatConsulted({
    toolCalls: ["get_taste", "get_market"],
    producedDraft: true,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.match(result.note, /taste/i);
});

test("draft with get_taste but missing get_design is ok (design only required for visual)", () => {
  const result = assertMoatConsulted({
    toolCalls: ["get_taste"],
    producedDraft: true,
    producedVisual: false,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test("visual artifact without get_taste and get_design is NOT ok — both are missing", () => {
  const result = assertMoatConsulted({
    toolCalls: ["get_product"],
    producedDraft: false,
    producedVisual: true,
  });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes("get_taste"), "get_taste must be in missing");
  assert.ok(result.missing.includes("get_design"), "get_design must be in missing");
});

test("visual artifact with get_taste but without get_design is NOT ok", () => {
  const result = assertMoatConsulted({
    toolCalls: ["get_taste", "get_market"],
    producedDraft: false,
    producedVisual: true,
  });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes("get_design"), "get_design must be in missing");
  assert.ok(!result.missing.includes("get_taste"), "get_taste must NOT be in missing");
});

test("visual artifact with get_taste AND get_design is ok", () => {
  const result = assertMoatConsulted({
    toolCalls: ["get_taste", "get_design", "get_product"],
    producedDraft: false,
    producedVisual: true,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.match(result.note, /taste.*design|design.*taste/i);
});

test("non-draft, non-visual work is always ok regardless of tool calls", () => {
  // Research, enrichment, discovery, planning — no moat requirement.
  const noTools = assertMoatConsulted({ toolCalls: [], producedDraft: false, producedVisual: false });
  assert.equal(noTools.ok, true);
  assert.deepEqual(noTools.missing, []);

  const someTools = assertMoatConsulted({
    toolCalls: ["get_product", "get_market"],
    producedDraft: false,
    producedVisual: false,
  });
  assert.equal(someTools.ok, true);
});

test("default call (no args) is treated as non-draft work — always ok", () => {
  const result = assertMoatConsulted();
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test("producedVisual implies draft-grade requirement — get_taste is still required", () => {
  // producedVisual: true, producedDraft: false — get_taste still required
  const missingTaste = assertMoatConsulted({
    toolCalls: ["get_design"],
    producedVisual: true,
  });
  assert.equal(missingTaste.ok, false);
  assert.ok(missingTaste.missing.includes("get_taste"));
});

test("both producedDraft and producedVisual true requires both moat tools", () => {
  const result = assertMoatConsulted({
    toolCalls: ["get_taste"],
    producedDraft: true,
    producedVisual: true,
  });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes("get_design"), "need get_design for visual even when draft is set");
});

// ─── INTEGRATION — the guard FIRES from a real run path at the gate ───────────
//
// These prove the wiring (agent-bridge → graph) the unit tests above could not: a drafting node
// whose agent step DID NOT call get_taste must surface a consult violation on the gate result; one
// that DID must pass clean. The violation is a blocking issue the founder sees, not a thrown crash.

// A draft channel: seed → agent draft (outputKind "message") → founder gate.
function draftToGateGraph() {
  return {
    id: "consult-channel",
    nodes: [
      { id: "s", category: "source", connector: "manual", label: "Seed", position: { x: 0, y: 0 }, config: { items: [{ id: "p1", name: "Operator" }] } },
      { id: "d", kind: "agent", ref: "gtm-discovery-outreach-drafting-agent", outputKind: "message", label: "Draft outreach", position: { x: 200, y: 0 }, config: {} },
      { id: "g", category: "gate", connector: "default", label: "Founder review", position: { x: 400, y: 0 }, config: {} },
    ],
    edges: [
      { id: "e1", source: "s", target: "d", edgeType: "data" },
      { id: "e2", source: "d", target: "g", edgeType: "data" },
    ],
  };
}

// Fake the agent step's observed tool calls — exactly what agent-bridge captures onto meta.toolCalls.
function draftRuntimeWithTools(toolCalls) {
  return makeStepRuntime({
    agent: async (node, upstream) => ({
      ok: true,
      items: (upstream ?? []).map((item) => ({ ...item, draft: "Hi — quick question about your setup." })),
      meta: { kind: "agent", ref: node.ref, toolCalls },
    }),
  });
}

test("run path: a drafting node that skipped get_taste surfaces a consult violation at the gate", async () => {
  const result = await runGraph(draftToGateGraph(), {
    stepRuntime: draftRuntimeWithTools(["get_product", "get_market"]),
  });

  const gate = result.nodes.g;
  assert.ok(gate, "gate node ran");
  assert.equal(gate.consultBlocked, true, "gate is flagged consultBlocked");
  assert.equal(gate.consultViolations.length, 1, "one drafting node violated");
  const v = gate.consultViolations[0];
  assert.equal(v.nodeId, "d");
  assert.equal(v.producedDraft, true);
  assert.ok(v.missing.includes("get_taste"), "violation names the missing get_taste");
  // The run as a whole must NOT read clean when a draft skipped the moat.
  assert.equal(result.ok, false, "run is not ok with an unconsulted draft");
});

test("run path: a drafting node that called get_taste passes clean — no violation", async () => {
  const result = await runGraph(draftToGateGraph(), {
    stepRuntime: draftRuntimeWithTools(["get_taste", "get_market"]),
  });

  const gate = result.nodes.g;
  assert.ok(gate, "gate node ran");
  assert.ok(!gate.consultBlocked, "gate is not consultBlocked when taste was consulted");
  assert.ok(!gate.consultViolations, "no consultViolations recorded");
});

test("run path: namespaced mcp tool name (mcp__gtm_context__get_taste) counts as consulting taste", async () => {
  // The live bridge (runClaudeQuery) records BOTH the namespaced name and its bare suffix, so the
  // in-process context tool — which arrives namespaced — still satisfies the bare-name rule. Mirror
  // that captured shape here, which is exactly what flows onto meta.toolCalls from a real run.
  const result = await runGraph(draftToGateGraph(), {
    stepRuntime: draftRuntimeWithTools(["mcp__gtm_context__get_taste", "get_taste"]),
  });
  const gate = result.nodes.g;
  assert.ok(!gate.consultBlocked, "namespaced get_taste satisfies the rule");
});

test("run path: a non-drafting node (research) feeding a gate has no moat requirement", async () => {
  // outputKind "signal" / "dataset" is research, not a founder-reviewed draft — no consult required.
  const graph = draftToGateGraph();
  graph.nodes[1].outputKind = "signal";
  graph.nodes[1].label = "Research signal";
  const result = await runGraph(graph, {
    stepRuntime: draftRuntimeWithTools([]), // no tools at all
  });
  const gate = result.nodes.g;
  assert.ok(!gate.consultBlocked, "research feeding a gate needs no moat consult");
});

test("run path: a UI-producing node needs BOTH get_taste and get_design", async () => {
  const graph = draftToGateGraph();
  graph.nodes[1].outputKind = "ui";
  graph.nodes[1].label = "Build landing component";
  // Calls taste but not design — design is still required for a visual artifact.
  const result = await runGraph(graph, {
    stepRuntime: draftRuntimeWithTools(["get_taste"]),
  });
  const gate = result.nodes.g;
  assert.equal(gate.consultBlocked, true, "UI node missing design is blocked");
  assert.ok(gate.consultViolations[0].missing.includes("get_design"), "names the missing get_design");
  assert.ok(gate.consultViolations[0].producedVisual, "classified as visual");
});
