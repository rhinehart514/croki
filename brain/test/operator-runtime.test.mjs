import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { defaultGraphTemplate } from "../src/graph.mjs";
import { recordFlowRun, saveFlow } from "../src/flow-store.mjs";
import { createOperatorSession, getOperatorSession, getOperatorSessionFresh, saveOperatorSession } from "../src/operator-store.mjs";
import { jsonPersistence } from "../src/persistence.mjs";
import { operatorTools, resolveOperatorGate, resolveOperatorGateRefine, resolveOperatorProposal, runOperatorSession, operatorSessionStalled, steerOperatorSession } from "../src/operator-runtime.mjs";
import { loadFlow } from "../src/flow-store.mjs";
import { createProject, loadProject, saveProject } from "../src/project-store.mjs";
import { founderSafeValue, recallTaste } from "../src/operator-run-core.mjs";
import { run as gateRun, buildGateFraming } from "../src/connectors/gate/default.mjs";
import { itemReviewText } from "../src/memory.mjs";

function fakeClient(responses) {
  let index = 0;
  return {
    messages: {
      async create() {
        const response = responses[index];
        index += 1;
        if (!response) throw new Error("Unexpected extra model turn.");
        return response;
      },
    },
  };
}

describe("resident GTM operator runtime", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-runtime-"));
    // gateTranslator: null keeps every unit run keyless — the gate stages items without a live
    // plain-language translation call (which would otherwise spawn a subscription query).
    options = { root: parent, gateTranslator: null };
    saveFlow(defaultGraphTemplate(), options);
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("rejects direct agent graph patches and leaves the graph untouched", async () => {
    assert.ok(!operatorTools.some((tool) => tool.name === "patch_graph"), "patch_graph must not be exposed to the operator model");
    assert.ok(operatorTools.some((tool) => tool.name === "propose_graph_changes"), "proposal graph edits remain available");
    const graphId = defaultGraphTemplate().id;
    const baseNodeCount = loadFlow(graphId, null, options).graph.nodes.length;
    const session = createOperatorSession({
      goal: "Narrow the ICP to Western New York.",
      graphId,
    }, options);
    const client = fakeClient([
      {
        content: [{
          type: "tool_use",
          id: "tool-1",
          name: "patch_graph",
          input: {
            rationale: "The founder explicitly requested a regional ICP.",
            operations: [{
              type: "update_node",
              nodeId: "ctx-icp",
              patch: { config: { geography: "Western New York" } },
            }],
          },
        }],
      },
      {
        content: [{
          type: "tool_use",
          id: "tool-2",
          name: "propose_graph_changes",
          input: {
            rationale: "The founder should review the regional ICP change.",
            operations: [{
              type: "update_node",
              nodeId: "ctx-icp",
              patch: { config: { geography: "Western New York" } },
            }],
          },
        }],
      },
    ]);
    const paused = await runOperatorSession(session.id, { client, options });
    assert.equal(paused.status, "waiting_for_proposal");
    assert.equal(loadFlow(graphId, null, options).graph.nodes.length, baseNodeCount);
    assert.ok(paused.events.some((event) => event.type === "graph_patch_rejected"));
    assert.ok(paused.events.some((event) => event.type === "graph_proposed"));
  });

  it("fails honestly when no runtime is available, naming both options", async () => {
    const session = createOperatorSession({ goal: "Work the goal.", graphId: defaultGraphTemplate().id }, options);
    const priorKey = process.env.ANTHROPIC_API_KEY;
    const priorDisable = process.env.GTM_IDE_DISABLE_CLAUDE_CODE;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GTM_IDE_DISABLE_CLAUDE_CODE = "1";
    try {
      const failed = await runOperatorSession(session.id, { options });
      assert.equal(failed.status, "failed");
      assert.match(failed.error, /Claude Code/);
      assert.match(failed.error, /ANTHROPIC_API_KEY/);
      assert.ok(failed.events.some((event) => event.type === "session_failed"));
    } finally {
      if (priorKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = priorKey;
      if (priorDisable === undefined) delete process.env.GTM_IDE_DISABLE_CLAUDE_CODE;
      else process.env.GTM_IDE_DISABLE_CLAUDE_CODE = priorDisable;
    }
  });

  it("records which runtime drove the session", async () => {
    const session = createOperatorSession({ goal: "Note the runtime.", graphId: defaultGraphTemplate().id }, options);
    const completed = await runOperatorSession(session.id, {
      options,
      client: fakeClient([{
        content: [{ type: "tool_use", id: "t", name: "complete", input: { outcome: "achieved", summary: "done" } }],
      }]),
    });
    assert.equal(completed.runtime, "anthropic");
  });

  it("captures the runtime session id and threads it back on the next drive (chat memory)", async () => {
    const session = createOperatorSession({ goal: "Remember across drives.", graphId: defaultGraphTemplate().id }, options);

    // First drive: a runtime that establishes an SDK session and reports its id.
    const firstCtx = {};
    const establishing = {
      id: "fake-cc",
      label: "Fake Claude Code",
      isAvailable: () => ({ ok: true }),
      drive: async (ctx) => {
        firstCtx.runtimeSessionId = ctx.runtimeSessionId;
        ctx.onRuntimeSession("sdk-session-1");
        return { kind: "completed", summary: "established" };
      },
    };
    await runOperatorSession(session.id, { options, runtime: establishing });
    const afterFirst = getOperatorSession(session.id, options);
    assert.equal(firstCtx.runtimeSessionId, null, "the first drive has no prior session to resume");
    assert.equal(afterFirst.runtimeSessionId, "sdk-session-1", "the captured session id is persisted durably");

    // A real resume re-enters from a runnable status (e.g. after a founder gate); mirror that.
    saveOperatorSession({ ...getOperatorSession(session.id, options), status: "ready" }, options);

    // Second drive: the stored id is handed to the runtime so it can resume the conversation.
    const secondCtx = {};
    const resuming = {
      id: "fake-cc",
      label: "Fake Claude Code",
      isAvailable: () => ({ ok: true }),
      drive: async (ctx) => {
        secondCtx.runtimeSessionId = ctx.runtimeSessionId;
        return { kind: "completed", summary: "resumed" };
      },
    };
    await runOperatorSession(session.id, { options, runtime: resuming });
    assert.equal(secondCtx.runtimeSessionId, "sdk-session-1", "the next drive resumes the same conversation");
  });

  it("preserves a founder wall written by an out-of-process MCP tool", async () => {
    const session = createOperatorSession({ goal: "Choose a GTM direction." }, options);
    const externalBridge = {
      id: "external-bridge",
      label: "External bridge",
      isAvailable: () => ({ ok: true }),
      drive: async (ctx) => {
        const current = getOperatorSession(session.id, options);
        saveOperatorSession({
          ...current,
          status: "waiting_for_candidates",
          pendingCandidates: { id: "candidate-set", candidates: [{ id: "outbound", title: "Direct outreach" }] },
        }, options);
        // Codex emits its final narration after the MCP process has persisted the wall. This callback used
        // to write the host's stale `running` copy over pendingCandidates, then mark the session completed.
        ctx.onText("The approaches are ready for your pick.");
        return { kind: "completed", summary: "Codex finished the turn." };
      },
    };

    const paused = await runOperatorSession(session.id, { options, runtime: externalBridge });
    assert.equal(paused.status, "waiting_for_candidates");
    assert.equal(paused.pendingCandidates.id, "candidate-set");
    assert.ok(paused.events.some((event) => event.detail === "The approaches are ready for your pick."));
    assert.ok(!paused.events.some((event) => event.type === "session_completed"));
  });

  it("fresh operator reads see a separate process write past the document cache", () => {
    const jsonOptions = { ...options, backend: "json" };
    const session = createOperatorSession({ goal: "Choose a direction." }, jsonOptions);
    assert.equal(getOperatorSession(session.id, jsonOptions).status, "ready"); // warm the host cache

    // jsonPersistence bypasses the shared document cache, matching a separate MCP process writing disk.
    jsonPersistence(jsonOptions).set("operator-sessions", session.id, {
      ...session,
      status: "waiting_for_candidates",
      pendingCandidates: { id: "external-candidates", candidates: [] },
    });

    assert.equal(getOperatorSession(session.id, jsonOptions).status, "ready", "ordinary reads stay cached");
    const fresh = getOperatorSessionFresh(session.id, jsonOptions);
    assert.equal(fresh.status, "waiting_for_candidates");
    assert.equal(fresh.pendingCandidates.id, "external-candidates");
  });

  it("recalls prior sessions in the same project (cross-session memory)", async () => {
    // A first session that finishes with a summary becomes part of the operator's memory.
    const first = createOperatorSession({ goal: "Stand up the pest-control outbound channel.", projectId: "rodentradar" }, options);
    await runOperatorSession(first.id, {
      options,
      client: fakeClient([{ content: [{ type: "tool_use", id: "t", name: "complete", input: { outcome: "achieved", summary: "Composed the outbound channel and staged the first drafts." } }] }]),
    });

    // A second session in the SAME project should see the first in its system prompt.
    const second = createOperatorSession({ goal: "Now add a referral channel.", projectId: "rodentradar" }, options);
    let captured = "";
    await runOperatorSession(second.id, {
      options,
      runtime: {
        id: "capture", label: "Capture", isAvailable: () => ({ ok: true }),
        drive: async (ctx) => { captured = ctx.system; return { kind: "completed", summary: "noted" }; },
      },
    });
    assert.match(captured, /already done in this project/, "the system prompt carries a cross-session memory block");
    assert.match(captured, /Stand up the pest-control outbound channel/, "it recalls the prior session's goal");
    assert.match(captured, /staged the first drafts/, "it recalls the prior session's outcome summary");

    // A session in a DIFFERENT project must not see rodentradar's history.
    const other = createOperatorSession({ goal: "Unrelated product goal.", projectId: "other-product" }, options);
    let otherSystem = "";
    await runOperatorSession(other.id, {
      options,
      runtime: {
        id: "capture", label: "Capture", isAvailable: () => ({ ok: true }),
        drive: async (ctx) => { otherSystem = ctx.system; return { kind: "completed", summary: "noted" }; },
      },
    });
    assert.doesNotMatch(otherSystem, /pest-control outbound/, "memory is scoped to the project — no cross-product leak");
  });

  it("pauses at a founder gate and resumes the exact run after approval", async () => {
    const graph = {
      id: "gate-session",
      name: "Gate session",
      version: "1",
      nodes: [
        { id: "ctx", category: "context", connector: "product", label: "Prepared", position: { x: 0, y: 0 }, config: { name: "Exact artifact" } },
        { id: "gate", category: "gate", connector: "default", label: "Founder gate", position: { x: 200, y: 0 }, config: {} },
        { id: "measure", category: "measure", connector: "default", label: "Measure", position: { x: 400, y: 0 }, config: {} },
      ],
      edges: [
        { id: "a", source: "ctx", target: "gate", edgeType: "data" },
        { id: "b", source: "gate", target: "measure", edgeType: "data" },
      ],
    };
    saveFlow(graph, options);
    const session = createOperatorSession({ goal: "Run to the gate.", graphId: graph.id }, options);
    const paused = await runOperatorSession(session.id, {
      options,
      client: fakeClient([{
        content: [{ type: "tool_use", id: "tool-run", name: "run_loop", input: {} }],
      }]),
    });
    assert.equal(paused.status, "waiting_for_gate");
    assert.equal(paused.pendingGate.nodeIds[0], "gate");

    const resolved = await resolveOperatorGate(session.id, {
      approvals: { gate: true },
    }, {
      options,
      client: fakeClient([{
        content: [{
          type: "tool_use",
          id: "tool-done",
          name: "complete",
          input: { outcome: "achieved", summary: "The approved artifact continued through measure." },
        }],
      }]),
    });
    assert.equal(resolved.status, "ready");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const completed = getOperatorSession(session.id, options);
    assert.equal(completed.status, "completed");
    assert.ok(completed.events.some((event) => event.type === "gate_resolved"));
  });

  it("stages proposed graph changes for review without applying them, then commits on accept", async () => {
    const graphId = defaultGraphTemplate().id;
    const baseNodeCount = loadFlow(graphId, null, options).graph.nodes.length;
    const session = createOperatorSession({ goal: "Add a research step.", graphId }, options);
    const proposeOp = {
      type: "add_node",
      node: { id: "proposed-source", category: "source", connector: "manual", label: "Proposed source", position: { x: 0, y: 320 }, config: {} },
    };
    const paused = await runOperatorSession(session.id, {
      options,
      client: fakeClient([{
        content: [{
          type: "tool_use", id: "tool-propose", name: "propose_graph_changes",
          input: { rationale: "The founder should see this before it lands.", operations: [proposeOp] },
        }],
      }]),
    });

    // Paused for review; nothing applied yet.
    assert.equal(paused.status, "waiting_for_proposal");
    assert.equal(paused.pendingProposal.operations.length, 1);
    assert.ok(paused.pendingProposal.preview.nodes.some((node) => node.id === "proposed-source"), "preview carries the would-be node");
    assert.equal(loadFlow(graphId, null, options).graph.nodes.length, baseNodeCount, "the live graph is untouched while staged");
    assert.ok(paused.events.some((event) => event.type === "graph_proposed"));

    // Accept → the exact ops apply and the operator resumes.
    const resolved = await resolveOperatorProposal(session.id, { accept: true }, {
      options,
      client: fakeClient([{
        content: [{ type: "tool_use", id: "tool-done", name: "complete", input: { outcome: "achieved", summary: "Added the step the founder accepted." } }],
      }]),
    });
    assert.equal(resolved.status, "ready");
    assert.equal(resolved.pendingProposal, null);
    const committed = loadFlow(graphId, null, options).graph;
    assert.equal(committed.nodes.length, baseNodeCount + 1, "accept applied the staged op");
    assert.ok(committed.nodes.some((node) => node.id === "proposed-source"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(getOperatorSession(session.id, options).status, "completed");
  });

  it("discards proposed graph changes on reject, leaving the graph untouched", async () => {
    const graphId = defaultGraphTemplate().id;
    const baseNodeCount = loadFlow(graphId, null, options).graph.nodes.length;
    const session = createOperatorSession({ goal: "Maybe add a step.", graphId }, options);
    const paused = await runOperatorSession(session.id, {
      options,
      client: fakeClient([{
        content: [{
          type: "tool_use", id: "tool-propose", name: "propose_graph_changes",
          input: { rationale: "Optional extra source.", operations: [{ type: "add_node", node: { id: "maybe-source", category: "source", connector: "manual", label: "Maybe", position: { x: 0, y: 360 }, config: {} } }] },
        }],
      }]),
    });
    assert.equal(paused.status, "waiting_for_proposal");

    const resolved = await resolveOperatorProposal(session.id, { accept: false }, {
      options,
      client: fakeClient([{
        content: [{ type: "tool_use", id: "tool-done", name: "complete", input: { outcome: "achieved", summary: "Left the graph as it was." } }],
      }]),
    });
    assert.equal(resolved.status, "ready");
    assert.equal(resolved.pendingProposal, null);
    assert.equal(loadFlow(graphId, null, options).graph.nodes.length, baseNodeCount, "reject changed nothing");
    assert.ok(resolved.events.some((event) => event.type === "graph_proposal_discarded"));
  });

  // Craft a session paused at a gate with one hand-built staged item, so the refine resolver can be
  // tested in isolation from a live run. draftKey() keys on item.name before item.id (mirrored by the
  // UI's itemKey), so the first item's key is "Jane Doe" — the exact key the founder's browser sends.
  function seedGatedSession(fake) {
    const session = createOperatorSession({ goal: "Draft outreach.", graphId: defaultGraphTemplate().id }, options);
    const pendingGate = {
      runId: "run-x",
      nodeIds: ["gate"],
      runResult: {
        runId: "run-x",
        pendingGates: ["gate"],
        nodes: {
          gate: {
            category: "gate",
            items: [
              { id: "staged-1", name: "Jane Doe", subject: "Quick question", draft: "Hi Jane, the exact outbound body.", approvalStatus: "pending" },
              { id: "staged-2", name: "Sam Roe", draft: "Hey Sam, another draft.", approvalStatus: "pending" },
            ],
          },
        },
      },
    };
    saveOperatorSession({ ...getOperatorSession(session.id, options), status: "waiting_for_gate", pendingGate, lastRunId: "run-x" }, options);
    return session;
  }

  it("sends one gate item back to rework, re-drives, and releases nothing", async () => {
    let driven = null;
    const fake = {
      id: "cap", label: "Capture", isAvailable: () => ({ ok: true }),
      drive: async (ctx) => { driven = ctx; return { kind: "completed", summary: "reworked and re-staged" }; },
    };
    const session = seedGatedSession();

    const refined = await resolveOperatorGateRefine(session.id, {
      gateNodeId: "gate", itemKey: "Jane Doe", founderNote: "Make it warmer and shorter.",
    }, { options, runtime: fake });

    assert.equal(refined.status, "ready", "the session leaves the gate to rework");
    assert.equal(refined.pendingGate, null, "the gate pause is cleared for the re-drive");
    // The rework instruction is pushed as a user message carrying the item framing and the note.
    const msg = (refined.modelMessages ?? []).at(-1);
    assert.equal(msg.role, "user");
    assert.match(msg.content, /sent ONE item back for rework/i);
    assert.match(msg.content, /Jane Doe/);
    assert.match(msg.content, /Make it warmer and shorter\./);
    // Releases NOTHING: no gate_resolved event, no run/send fired — only the refine event.
    assert.ok(refined.events.some((e) => e.type === "gate_item_refined"));
    assert.ok(!refined.events.some((e) => e.type === "gate_resolved"), "refine must not resolve/release the gate");
    assert.equal(refined.lastRunId, "run-x", "no new run was executed (nothing sent)");

    // It re-drives through the same launch path.
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(driven, "the operator re-drove after the rework instruction");
    assert.equal(getOperatorSession(session.id, options).status, "completed");
  });

  it("mid-run steer redirects a GATED run, re-drives, and releases nothing (Wave 5)", async () => {
    let driven = null;
    const fake = {
      id: "cap", label: "Capture", isAvailable: () => ({ ok: true }),
      drive: async (ctx) => { driven = ctx; return { kind: "completed", summary: "re-steered" }; },
    };
    const session = seedGatedSession();

    const steered = steerOperatorSession(session.id, { note: "Focus on Buffalo operators only." }, { options, runtime: fake });

    assert.equal(steered.status, "ready", "leaves the gate to fold in the steer");
    assert.equal(steered.pendingGate, null, "the gate pause is cleared for the re-drive");
    const msg = (steered.modelMessages ?? []).at(-1);
    assert.equal(msg.role, "user");
    assert.match(msg.content, /steering the run mid-flight/i);
    assert.match(msg.content, /Focus on Buffalo operators only\./);
    // Releases nothing — no gate resolution, no new run id.
    assert.ok(steered.events.some((e) => e.type === "founder_steered_run"));
    assert.ok(!steered.events.some((e) => e.type === "gate_resolved"), "steer must not release the gate");
    assert.equal(steered.lastRunId, "run-x", "no send happened");
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(driven, "the operator re-drove with the steer folded in");
  });

  it("mid-run steer works on a READY (non-gated) session and rejects a terminal one", async () => {
    const fake = { id: "cap", label: "Capture", isAvailable: () => ({ ok: true }), drive: async () => ({ kind: "completed", summary: "ok" }) };
    const ready = createOperatorSession({ goal: "Working.", graphId: defaultGraphTemplate().id }, options);
    saveOperatorSession({ ...getOperatorSession(ready.id, options), status: "ready" }, options);
    const steered = steerOperatorSession(ready.id, { note: "Try a warmer opener." }, { options, runtime: fake });
    assert.equal(steered.status, "ready");
    assert.match((steered.modelMessages ?? []).at(-1).content, /Try a warmer opener\./);

    // A blank note is refused, and a terminal session cannot be steered.
    assert.throws(() => steerOperatorSession(ready.id, { note: "  " }, { options }), /steering note is required/i);
    const done = createOperatorSession({ goal: "Done.", graphId: defaultGraphTemplate().id }, options);
    saveOperatorSession({ ...getOperatorSession(done.id, options), status: "completed" }, options);
    assert.throws(() => steerOperatorSession(done.id, { note: "too late" }, { options }), /already completed/i);
  });

  it("rejects a refine for an unknown item or a non-waiting session", async () => {
    const session = seedGatedSession();
    await assert.rejects(
      () => resolveOperatorGateRefine(session.id, { gateNodeId: "gate", itemKey: "nope", founderNote: "x" }, { options }),
      /No staged item "nope"/,
    );
    // A note is required (the item resolves — "Jane Doe" is the real key — so it reaches the note check).
    await assert.rejects(
      () => resolveOperatorGateRefine(session.id, { gateNodeId: "gate", itemKey: "Jane Doe", founderNote: "  " }, { options }),
      /note is required/i,
    );
    // A session that is not paused at a gate is refused cleanly.
    const ready = createOperatorSession({ goal: "No gate.", graphId: defaultGraphTemplate().id }, options);
    saveOperatorSession({ ...getOperatorSession(ready.id, options), status: "ready" }, options);
    await assert.rejects(
      () => resolveOperatorGateRefine(ready.id, { gateNodeId: "gate", itemKey: "staged-1", founderNote: "x" }, { options }),
      /not waiting at a founder gate/,
    );
  });

  it("gate plain-language translation never alters the reviewable body", async () => {
    const item = { id: "i1", name: "Jane", subject: "Subj", draft: "THE EXACT OUTBOUND BODY" };
    const node = { id: "gate", category: "gate", connector: "default", config: {}, runtime: {} };

    // No translator wired: the gate stages the item untouched, with no plain-language fields.
    const plain = await gateRun(node, [structuredClone(item)], {});
    const bodyPlain = itemReviewText(plain.items[0]);
    assert.equal(plain.items[0].plainLanguageTitle, undefined, "no translator → no plain fields added");

    // A translator returning arbitrary strings must not change the item's reviewable/sendable body.
    const ctx = {
      __gateTranslate: async () => [{ plainLanguageTitle: "ARBITRARY HEADLINE", whatYourYesDoes: "does " + "x".repeat(400) }],
      __gateDownstream: { verb: "send", willSend: true },
    };
    const translated = await gateRun(node, [structuredClone(item)], ctx);
    const bodyTranslated = itemReviewText(translated.items[0]);
    assert.equal(bodyTranslated, bodyPlain, "the reviewable body is byte-identical with/without translation");
    assert.equal(bodyTranslated, "THE EXACT OUTBOUND BODY", "the body is exactly the original draft");
    assert.equal(translated.items[0].plainLanguageTitle, "ARBITRARY HEADLINE");

    // Structural safety: the framing handed to the translator can never contain the outbound body.
    const framing = buildGateFraming(item);
    assert.ok(!JSON.stringify(framing).includes("OUTBOUND BODY"), "the translation framing must never carry the body");
  });

});

describe("canonical operator response boundary", () => {
  it("removes raw prompts, souls, credentials, and model transcripts", () => {
    assert.deepEqual(founderSafeValue({
      name: "Researcher", systemPrompt: "raw", soul: { secret: true }, credentials: { token: "x" },
      modelMessages: [{ role: "user" }], answer: "The evidence is mixed.",
    }), { name: "Researcher", answer: "The evidence is mixed." });
  });
});

describe("operatorSessionStalled (hang watchdog)", () => {
  const T = 12 * 60 * 1000;
  const now = Date.parse("2026-07-06T01:00:00.000Z");
  it("flags a driving session silent past the window", () => {
    const s = { status: "running", updatedAt: "2026-07-06T00:40:00.000Z" }; // 20 min silent
    assert.equal(operatorSessionStalled(s, now, T), true);
  });
  it("leaves a recently-active driving session alone", () => {
    const s = { status: "running", updatedAt: "2026-07-06T00:56:00.000Z" }; // 4 min ago
    assert.equal(operatorSessionStalled(s, now, T), false);
  });
  it("never stalls a legitimate founder-wait pause", () => {
    const s = { status: "waiting_for_gate", updatedAt: "2026-07-05T12:00:00.000Z" }; // hours ago
    assert.equal(operatorSessionStalled(s, now, T), false);
  });
  it("is safe when the timestamp is missing", () => {
    assert.equal(operatorSessionStalled({ status: "running" }, now, T), false);
    assert.equal(operatorSessionStalled(null, now, T), false);
  });
});

describe("recallTaste", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-taste-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("degrades safely when there is no graph to read", () => {
    assert.equal(recallTaste({ projectId: "none", graphId: null }, options), null);
  });

  it("recalls approved gate decisions through the flow store", () => {
    const graph = defaultGraphTemplate();
    saveFlow(graph, options);
    const project = loadProject({ ...options, projectId: "default" });
    saveProject({ ...project, channels: [{ id: "default-pipeline", graphId: graph.id, name: "Default pipeline", objective: "Recall taste", kind: "custom", enabled: true }] }, options);
    const result = {
      runId: "r1",
      ok: true,
      targetNodeId: null,
      pendingGates: [],
      nodes: {
        gate: {
          category: "gate",
          items: [{ name: "A", email: "a@x.com", draft: "warm note to A", approvalStatus: "approved" }],
        },
      },
    };
    recordFlowRun(graph, result, options);
    const taste = recallTaste({ projectId: "default", graphId: graph.id }, options);
    assert.ok(taste, "recallTaste returns non-null after a seeded approved gate item");
    assert.ok(
      taste.rules.some((rule) => rule.includes("warm note to A")),
      "rules include the approved-voice exemplar",
    );
  });
});
