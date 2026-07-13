import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { defaultGraphTemplate } from "../src/graph.mjs";
import { loadFlow, saveFlow } from "../src/flow-store.mjs";
import { loadClarity } from "../src/clarity-store.mjs";
import { loadFounderDecisions } from "../src/feedback-ledger.mjs";
import { createOperatorSession, getOperatorSession, saveOperatorSession } from "../src/operator-store.mjs";
import { createProject, saveProject } from "../src/project-store.mjs";
import {
  assertSafeTool,
  createDispatcher,
  createOperatorBridge,
  safeOperatorTools,
} from "../src/operator-mcp.mjs";
import { listGoals } from "../src/goal-store.mjs";
import { listWorkArtifacts } from "../src/work-artifact-store.mjs";

describe("operator MCP bridge — safety surface", () => {
  it("exposes no outbound or approval tool to the subprocess", () => {
    const forbidden = /approve|send|publish|deploy|charge/i;
    for (const tool of safeOperatorTools()) {
      assert.ok(!forbidden.test(tool.name), `operator tool "${tool.name}" must not be exposed`);
    }
  });

  it("refuses to expose an outbound-verb tool by name", () => {
    assert.throws(() => assertSafeTool("approve_gate"), /Refusing to expose/);
    assert.throws(() => assertSafeTool("send_email"), /Refusing to expose/);
  });

  it("exposes the product-picture tools and they pass the safe-tool gate", () => {
    const exposed = new Set(safeOperatorTools().map((tool) => tool.name));
    for (const name of ["derive_product_model", "revise_product_model", "record_product_signal"]) {
      // assertSafeTool throws on a forbidden verb; the three picture verbs are safe by construction.
      assert.doesNotThrow(() => assertSafeTool(name));
      assert.ok(exposed.has(name), `${name} must be exposed to the operator subprocess`);
    }
  });

  it("exposes the six canonical adapters without an approval or outbound verb", () => {
    const tools = safeOperatorTools();
    const exposed = new Set(tools.map((tool) => tool.name));
    for (const name of ["inspect", "focus", "ask", "propose", "record", "run"]) assert.ok(exposed.has(name));
    assert.deepEqual(tools.find((tool) => tool.name === "record").input_schema.properties.kind.enum, ["session_note", "model_artifact", "work_artifact", "canvas_proposal", "goal", "goal_relation", "work_relationship", "question_proposal"]);
  });

  it("requires a session id", () => {
    assert.throws(() => createOperatorBridge({}), /GTM_IDE_OPERATOR_SESSION/);
  });

  it("derives its public MCP inventory from the shared capability policy", () => {
    const bridge = createOperatorBridge({ sessionId: "inventory-only" });
    const listed = bridge.tools.map((tool) => tool.name).sort();
    const registered = bridge.capabilities.viewForActor("model", "publicMcp").map((item) => item.id).sort();
    assert.deepEqual(listed, registered);
    assert.equal(bridge.capabilities.get("inspect").lane, "read-only");
    assert.equal(bridge.capabilities.get("record").lane, "reversible-local");
    assert.equal(bridge.capabilities.has("patch_graph"), false, "retired dispatch-only verbs stay off MCP");
  });
});

describe("operator MCP bridge — tool routing against the durable session", () => {
  let parent;
  let options;
  let session;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-mcp-"));
    options = { root: parent };
    saveFlow(defaultGraphTemplate(), options);
    session = createOperatorSession({ goal: "Inspect the graph.", graphId: defaultGraphTemplate().id }, options);
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("routes a tool call through executeOperatorTool and persists to the session", async () => {
    const bridge = createOperatorBridge({ sessionId: session.id, options });
    const { result, pause } = await bridge.callTool("inspect_graph", {});
    assert.ok(result.graph, "expected the inspected graph back");
    assert.equal(pause, false);
    const persisted = getOperatorSession(session.id, options);
    assert.ok(persisted.events.some((event) => event.type === "inspection"));
  });

  it("lets either model runtime put open goals and durable work on the shared canvas", async () => {
    const bridge = createOperatorBridge({ sessionId: session.id, options });
    const goal = await bridge.callTool("record", {
      kind: "goal", idempotencyKey: "operator:goal",
      value: { id: "activation", statement: "Understand activation" },
    });
    const artifact = await bridge.callTool("record", {
      kind: "work_artifact", idempotencyKey: "operator:artifact",
      refs: [{ type: "goal", id: "activation" }],
      value: { id: "activation-map", kind: "activation-map", title: "Activation map", content: { openings: [] } },
    });
    const revisedGoal = await bridge.callTool("record", {
      kind: "goal", idempotencyKey: "operator:goal:revise",
      value: { id: "activation", expectedRevision: 0, statement: "Understand and improve activation" },
    });
    const revisedArtifact = await bridge.callTool("record", {
      kind: "work_artifact", idempotencyKey: "operator:artifact:revise",
      value: { id: "activation-map", expectedArtifactRevision: 1, content: { openings: ["invite"] } },
    });
    const canvasProposal = await bridge.callTool("record", {
      kind: "canvas_proposal", idempotencyKey: "operator:canvas-proposal",
      value: { id: "activation-region-proposal", title: "Group activation work", rationale: "Keep the goal and read together", operation: { type: "create-region", expectedStoreRevision: 0, title: "Activation", memberRefs: [{ type: "goal", id: "activation" }, { type: "work-artifact", id: "activation-map" }], position: { x: 40, y: 50 }, size: { width: 480, height: 300 } } },
    });
    const proseArtifact = await bridge.callTool("record", {
      kind: "work_artifact", idempotencyKey: "operator:artifact:prose",
      value: "# Strongest move\n\nStart with the evidence-backed founder outreach loop.",
    });
    assert.equal(goal.result.recorded.goal.id, "activation");
    assert.equal(artifact.result.recorded.artifact.kind, "activation-map");
    assert.equal(revisedGoal.result.recorded.goal.revision, 1);
    assert.equal(revisedArtifact.result.recorded.artifact.revision, 2);
    assert.equal(canvasProposal.result.recorded.artifact.kind, "canvas-change-proposal");
    assert.equal(canvasProposal.result.recorded.artifact.status, "proposed");
    assert.equal(proseArtifact.result.recorded.artifact.title, "Strongest move");
    assert.match(proseArtifact.result.recorded.artifact.content, /evidence-backed founder outreach/);
    assert.equal(listGoals(session.projectId ?? "default", options).length, 1);
    assert.equal(listWorkArtifacts(session.projectId ?? "default", options).length, 3);
    const inspected = await bridge.callTool("inspect", { ref: { type: "work-artifact", id: "activation-map" } });
    assert.equal(inspected.result.value.artifact.artifactId, "activation-map");
  });

  it("rejects an unknown tool", async () => {
    const bridge = createOperatorBridge({ sessionId: session.id, options });
    await assert.rejects(() => bridge.callTool("delete_everything", {}), /Unknown operator tool/);
  });

  it("keeps canonical inspect truly read-only", async () => {
    const before = structuredClone(getOperatorSession(session.id, options));
    const bridge = createOperatorBridge({ sessionId: session.id, options });
    const { result } = await bridge.callTool("inspect", { ref: { type: "graph", id: defaultGraphTemplate().id } });
    assert.equal(result.classification.access, "read");
    assert.deepEqual(getOperatorSession(session.id, options), before, "inspect must not append an event or update the session");
  });

  it("gives ask, propose, and run distinct non-semantic execution behavior", async () => {
    const graphId = defaultGraphTemplate().id;
    const runsBefore = loadFlow(graphId, null, options).runs.length;
    const asking = createOperatorBridge({
      sessionId: session.id,
      options: { ...options, askCrew: async ({ teammateRef }) => ({ ok: true, reasoning: `${teammateRef} answered.`, items: [] }) },
    });
    const asked = await asking.callTool("ask", { prompt: "Who is this for?", teammateRefs: ["researcher"] });
    assert.equal(asked.pause, false);
    assert.equal(loadFlow(graphId, null, options).runs.length, runsBefore, "ask does not launch a run");
    assert.ok(getOperatorSession(session.id, options).events.some((event) => event.type === "crew_asked"));

    const recorded = await asking.callTool("record", { kind: "session_note", value: "Founder wording stays local." });
    assert.equal(recorded.pause, false);
    assert.ok(getOperatorSession(session.id, options).events.some((event) => event.type === "session_note"));
    assert.equal(loadFlow(graphId, null, options).runs.length, runsBefore, "record writes only its explicit local receipt");

    const proposing = createOperatorBridge({ sessionId: session.id, options });
    const proposed = await proposing.callTool("propose", { rationale: "Rename for review", operations: [{ type: "set_graph_name", name: "Proposed name" }] });
    assert.equal(proposed.pause, true);
    assert.equal(proposed.status, "waiting_for_proposal");
    assert.notEqual(loadFlow(graphId, null, options).graph.name, "Proposed name", "proposal stays reversible and unapplied");

    const gateGraph = {
      id: "canonical-run-gate", name: "Canonical run gate", version: "1",
      nodes: [
        { id: "ctx", category: "context", connector: "product", label: "Prepared", position: { x: 0, y: 0 }, config: { name: "Draft" } },
        { id: "gate", category: "gate", connector: "default", label: "Founder gate", position: { x: 200, y: 0 }, config: {} },
        { id: "measure", category: "measure", connector: "default", label: "Measure", position: { x: 400, y: 0 }, config: {} },
      ],
      edges: [
        { id: "a", source: "ctx", target: "gate", edgeType: "data" },
        { id: "b", source: "gate", target: "measure", edgeType: "data" },
      ],
    };
    saveFlow(gateGraph, options);
    const runSession = createOperatorSession({ goal: "Run explicitly.", graphId: gateGraph.id }, options);
    const running = createOperatorBridge({ sessionId: runSession.id, options: { ...options, gateTranslator: null } });
    const ran = await running.callTool("run", { goal: "Run explicitly." });
    assert.equal(ran.pause, true);
    assert.equal(ran.status, "waiting_for_gate", "explicit run drives the existing compose/run path to the gate");
  });

  it("focuses the existing durable session through an open stable reference", async () => {
    const bridge = createOperatorBridge({ sessionId: session.id, options });
    const { result } = await bridge.callTool("focus", { ref: { type: "question", id: "q-1" } });
    assert.equal(result.classification.access, "write");
    const persisted = getOperatorSession(session.id, options);
    assert.equal(persisted.questionId, "q-1");
    assert.deepEqual(persisted.focusRef, { type: "question", id: "q-1" });
  });

  it("keeps terrain read and hypothesis ids as projection-only context across all canonical verbs", async () => {
    const project = createProject({ id: "terrain-parity", name: "Terrain Parity" }, options).project;
    const graph = {
      id: "terrain-parity-graph", name: "Terrain parity graph", version: "1",
      nodes: [
        { id: "ctx", category: "context", connector: "product", label: "Prepared", position: { x: 0, y: 0 }, config: { name: "Draft" } },
        { id: "gate", category: "gate", connector: "default", label: "Founder gate", position: { x: 200, y: 0 }, config: {} },
        { id: "measure", category: "measure", connector: "default", label: "Measure", position: { x: 400, y: 0 }, config: {} },
      ],
      edges: [
        { id: "a", source: "ctx", target: "gate", edgeType: "data" },
        { id: "b", source: "gate", target: "measure", edgeType: "data" },
      ],
    };
    saveFlow(graph, options);
    saveProject({ ...project, channels: [{ id: "terrain-pipeline", graphId: graph.id, name: "Terrain", objective: "Test parity", kind: "custom", enabled: true }] }, options);
    const scoped = createOperatorSession({ goal: "Use the terrain context.", projectId: project.id, graphId: graph.id }, options);
    const readRef = { type: "terrain-read", id: "terrain-read-stable", projectId: project.id };
    const hypothesisRef = { type: "terrain-hypothesis", id: "terrain-hypothesis-stable", projectId: project.id };
    const bridge = createOperatorBridge({
      sessionId: scoped.id,
      options: { ...options, gateTranslator: null, askCrew: async () => ({ ok: true, reasoning: "Answer grounded in the supplied projection refs.", items: [] }) },
    });

    const beforeInspect = structuredClone(getOperatorSession(scoped.id, options));
    const inspected = await bridge.callTool("inspect", { ref: hypothesisRef, refs: [readRef] });
    assert.deepEqual(inspected.result.ref, { type: "terrain-hypothesis", id: hypothesisRef.id });
    assert.deepEqual(inspected.result.value.projectionRef, { type: "terrain-hypothesis", id: hypothesisRef.id });
    assert.equal(inspected.result.value.durable, false);
    assert.equal(inspected.result.value.authority, false);
    assert.deepEqual(getOperatorSession(scoped.id, options), beforeInspect, "terrain inspection remains read-only");

    const focused = await bridge.callTool("focus", { ref: hypothesisRef, refs: [readRef] });
    assert.deepEqual(focused.result.focusRef, { type: "terrain-hypothesis", id: hypothesisRef.id });
    assert.ok(focused.result.contextRefs.some((ref) => ref.type === "terrain-read" && ref.id === readRef.id));

    const asked = await bridge.callTool("ask", { prompt: "What would change this read?", ref: hypothesisRef, refs: [readRef], teammateRefs: ["researcher"] });
    assert.ok(asked.result.refs.some((ref) => ref.type === "terrain-hypothesis" && ref.id === hypothesisRef.id));
    assert.ok(asked.result.refs.some((ref) => ref.type === "terrain-read" && ref.id === readRef.id));

    const recorded = await bridge.callTool("record", { kind: "session_note", value: "Keep the model read provisional.", ref: hypothesisRef, refs: [readRef] });
    assert.ok(recorded.result.recorded.refs.some((ref) => ref.type === "terrain-hypothesis" && ref.id === hypothesisRef.id));

    const proposed = await bridge.callTool("propose", {
      rationale: "Stage a reversible label change.", ref: hypothesisRef, refs: [readRef],
      operations: [{ type: "set_graph_name", name: "Terrain-context proposal" }],
    });
    assert.equal(proposed.pause, true);
    assert.ok(proposed.result.refs.some((ref) => ref.type === "terrain-read" && ref.id === readRef.id));
    assert.notEqual(loadFlow(graph.id, null, options).graph.name, "Terrain-context proposal", "terrain context cannot apply a proposal");

    const runSession = createOperatorSession({ goal: "Run with terrain context.", projectId: project.id, graphId: graph.id }, options);
    const runBridge = createOperatorBridge({ sessionId: runSession.id, options: { ...options, gateTranslator: null } });
    const ran = await runBridge.callTool("run", { goal: "Run with terrain context.", ref: hypothesisRef, refs: [readRef] });
    assert.equal(ran.pause, true);
    assert.equal(ran.status, "waiting_for_gate");
    assert.ok(ran.result.refs.some((ref) => ref.type === "terrain-hypothesis" && ref.id === hypothesisRef.id));
    const runPersisted = getOperatorSession(runSession.id, options);
    assert.ok(runPersisted.contextRefs.some((ref) => ref.type === "terrain-read" && ref.id === readRef.id));
    assert.deepEqual(loadFounderDecisions(project.id, options), [], "canonical terrain verbs cannot forge a founder decision or clear the gate");
  });

  it("rejects explicitly foreign terrain refs across every canonical verb", async () => {
    const projectA = createProject({ id: "terrain-a", name: "Terrain A" }, options).project;
    createProject({ id: "terrain-b", name: "Terrain B" }, options);
    const scoped = createOperatorSession({ goal: "Stay in terrain A.", projectId: projectA.id }, options);
    const bridge = createOperatorBridge({ sessionId: scoped.id, options });
    const foreign = { type: "terrain-hypothesis", id: "foreign-hypothesis", projectId: "terrain-b" };
    const calls = [
      ["inspect", { ref: foreign }],
      ["focus", { ref: foreign }],
      ["ask", { prompt: "Inspect this.", ref: foreign, teammateRefs: ["researcher"] }],
      ["propose", { ref: foreign, operations: [{ type: "set_graph_name", name: "Foreign" }] }],
      ["record", { kind: "session_note", value: "Foreign", ref: foreign }],
      ["run", { goal: "Run foreign context.", ref: foreign }],
    ];
    for (const [name, input] of calls) {
      await assert.rejects(() => bridge.callTool(name, input), /belongs to project terrain-b, not terrain-a/);
    }
    assert.deepEqual(getOperatorSession(scoped.id, options).contextRefs, []);
    assert.deepEqual(loadFounderDecisions(projectA.id, options), []);
  });

  it("rejects graph refs owned by another project before focus, inspection, or execution", async () => {
    const projectA = createProject({ id: "project-a", name: "Project A" }, options).project;
    const projectB = createProject({ id: "project-b", name: "Project B" }, options).project;
    const graphB = { ...defaultGraphTemplate(), id: "graph-b", name: "Project B graph" };
    saveFlow(graphB, options);
    saveProject({ ...projectA, channels: [] }, options);
    saveProject({ ...projectB, channels: [{ id: "pipeline-b", graphId: graphB.id, name: "B pipeline", objective: "B", kind: "custom", enabled: true }] }, options);
    const scoped = createOperatorSession({ goal: "Stay in A.", projectId: projectA.id }, options);
    const bridge = createOperatorBridge({ sessionId: scoped.id, options });
    for (const name of ["focus", "inspect", "run"]) {
      await assert.rejects(
        () => bridge.callTool(name, { ref: { type: "graph", id: graphB.id }, ...(name === "run" ? { goal: "Run it." } : {}) }),
        /does not belong to project project-a/,
      );
    }
    assert.equal(getOperatorSession(scoped.id, options).graphId, null);
  });

  it("rejects cross-project graphs before legacy graph execution", async () => {
    const projectA = createProject({ id: "legacy-a", name: "Legacy A" }, options).project;
    const projectB = createProject({ id: "legacy-b", name: "Legacy B" }, options).project;
    const graphA = { ...defaultGraphTemplate(), id: "legacy-graph-a", name: "A graph" };
    const graphB = { ...defaultGraphTemplate(), id: "legacy-graph-b", name: "B graph" };
    saveFlow(graphA, options);
    saveFlow(graphB, options);
    saveProject({ ...projectA, channels: [{ id: "legacy-pipeline-a", graphId: graphA.id, name: "A", objective: "A", kind: "custom", enabled: true }] }, options);
    saveProject({ ...projectB, channels: [{ id: "legacy-pipeline-b", graphId: graphB.id, name: "B", objective: "B", kind: "custom", enabled: true }] }, options);
    const owned = createOperatorSession({ goal: "Run A.", projectId: projectA.id, graphId: graphA.id }, options);
    saveOperatorSession({ ...owned, graphId: graphB.id }, options); // simulate a pre-guard legacy record
    const bridge = createOperatorBridge({ sessionId: owned.id, options });
    const before = loadFlow(graphB.id, null, options).runs.length;
    const eventCount = getOperatorSession(owned.id, options).events.length;

    await assert.rejects(() => bridge.callTool("run_loop", {}), /does not belong to project legacy-a/);
    await assert.rejects(() => bridge.callTool("compose_and_run", { goal: "Drive the foreign graph." }), /does not belong to project legacy-a/);
    assert.equal(loadFlow(graphB.id, null, options).runs.length, before, "legacy execution never starts the foreign graph");
    assert.equal(getOperatorSession(owned.id, options).events.length, eventCount, "legacy compose is rejected before recording execution progress");
  });

  it("refuses model-forged founder decisions and durable clarity pins", async () => {
    const project = createProject({ id: "record-scope", name: "Record Scope" }, options).project;
    const scoped = createOperatorSession({ goal: "Record model work only.", projectId: project.id }, options);
    const bridge = createOperatorBridge({ sessionId: scoped.id, options });

    await assert.rejects(
      () => bridge.callTool("record", { kind: "founder_decision", value: { kind: "gate.approved", value: "approve" } }),
      /declared values/,
    );
    await assert.rejects(
      () => bridge.callTool("record", { kind: "question", value: { text: "Pin this permanently" } }),
      /declared values/,
    );
    assert.deepEqual(loadFounderDecisions(project.id, options), []);
    assert.deepEqual(loadClarity(project.id, options), []);

    const proposed = await bridge.callTool("record", { kind: "question_proposal", value: { text: "Should we test this buyer?" } });
    assert.equal(proposed.result.recorded.transient, true);
    assert.deepEqual(loadClarity(project.id, options), [], "a model question proposal is session-local, never a durable pin");
    assert.ok(getOperatorSession(scoped.id, options).events.some((event) => event.type === "question_proposed"));
  });

  it("serves tools/list and tools/call over JSON-RPC", async () => {
    const bridge = createOperatorBridge({ sessionId: session.id, options });
    const written = [];
    const dispatch = createDispatcher(bridge, (text) => written.push(JSON.parse(text)));

    await dispatch({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    assert.ok(written[0].result.tools.length > 0);
    assert.ok(written[0].result.tools.every((tool) => tool.inputSchema));

    await dispatch({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "inspect_product", arguments: {} } });
    const callResponse = written[1].result;
    assert.ok(callResponse.content[0].text.length > 0);
  });
});
