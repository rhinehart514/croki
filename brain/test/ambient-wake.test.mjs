import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { defaultGraphTemplate } from "../src/graph.mjs";
import { saveFlow } from "../src/flow-store.mjs";
import { createOperatorSession, getOperatorSession, saveOperatorSession } from "../src/operator-store.mjs";
import {
  cancelOperatorSession,
  launchOperatorSession,
  runDueAmbientTicks,
  wakeAmbientSession,
} from "../src/operator-runtime.mjs";

// A model turn that reaches for compose_and_run — the SAME door a goal drive uses. With a graph already
// bound, compose_and_run drives the existing workflow to the founder gate and stops there.
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

function composeAndRunTurn() {
  return fakeClient([{
    content: [{ type: "tool_use", id: "tool-car", name: "compose_and_run", input: {} }],
  }]);
}

// A DRAFT channel: a prepared item → founder gate → an execute (send) node. With no approval the gate
// holds every item and the execute node never runs — nothing leaves the wall.
function draftChannelGraph(id) {
  return {
    id,
    name: "Ambient draft channel",
    version: "1",
    nodes: [
      { id: "ctx", category: "context", connector: "product", label: "Prepared", position: { x: 0, y: 0 }, config: { name: "Prepared item" } },
      { id: "gate", category: "gate", connector: "default", label: "Founder gate", position: { x: 200, y: 0 }, config: {} },
      { id: "send", category: "execute", connector: "default", label: "Send", position: { x: 400, y: 0 }, config: {} },
    ],
    edges: [
      { id: "a", source: "ctx", target: "gate", edgeType: "data" },
      { id: "b", source: "gate", target: "send", edgeType: "data" },
    ],
  };
}

// Build a goal-LESS ambient session through the REAL store creation path — createOperatorSession with
// kind:'ambient' + a standing brief, exactly the shape production lands (standingBrief set, goal null,
// nextWakeAt armed from any cadence). `extra` overrides durable fields the test wants to pin: a
// wakeIntervalMs cadence, or a past nextWakeAt to simulate an armed wake whose time has arrived. Driving
// through the real creation path is what makes the operator-store<->wake-runtime seam actually covered,
// rather than a hand-assembled shape (with a stray `brief` field) that production never produces.
function ambientSession(graphId, brief, extra = {}, options) {
  const { wakeIntervalMs, ...overrides } = extra;
  const session = createOperatorSession(
    { kind: "ambient", standingBrief: brief, graphId, wakeIntervalMs },
    options,
  );
  if (Object.keys(overrides).length === 0) return session;
  return saveOperatorSession({ ...session, ...overrides }, options);
}

describe("ambient wake runtime", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-ambient-wake-"));
    options = { root: parent };
    saveFlow(defaultGraphTemplate(), options);
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("drives a goal-less ambient session to the founder gate and STOPS — never sending", async () => {
    const graphId = "ambient-gate";
    saveFlow(draftChannelGraph(graphId), options);
    const session = ambientSession(graphId, "When a new commit lands, draft a launch note.", {}, options);
    assert.equal(session.goal, null, "an ambient session carries no goal — the standing brief drives it");

    wakeAmbientSession(session.id, { brief: session.standingBrief, trigger: "ambient_wake" }, { client: composeAndRunTurn(), options });
    // Await the same in-flight drive (launchOperatorSession dedupes by session id).
    await launchOperatorSession(session.id, { options });

    // GATE PROOF: the ambient drive parked at the founder gate and the execute (send) node never ran.
    const paused = getOperatorSession(session.id, options);
    assert.equal(paused.status, "waiting_for_gate", "an ambient drive STOPS at the founder gate");
    assert.ok(paused.pendingGate, "the gate pause is durable");
    assert.ok(paused.pendingGate.nodeIds.includes("gate"), "it is the founder gate that is holding");
    const runNodes = paused.pendingGate.runResult.nodes ?? {};
    assert.notEqual(runNodes.send?.ok, true, "the execute/send node behind the gate NEVER ran — nothing left the wall");
    assert.ok(paused.events.some((event) => event.type === "ambient_wake"), "the wake was recorded");
  });

  it("allows a goal-less ambient session (the standing brief replaces the goal as the objective)", async () => {
    const graphId = "ambient-goalless";
    saveFlow(draftChannelGraph(graphId), options);
    const session = ambientSession(graphId, "Watch for replies and draft a follow-up.", {}, options);

    // No goal, only a brief — the wake is allowed and drives to the gate.
    assert.doesNotThrow(() => wakeAmbientSession(session.id, {}, { client: composeAndRunTurn(), options }));
    await launchOperatorSession(session.id, { options });
    const paused = getOperatorSession(session.id, options);
    assert.equal(paused.status, "waiting_for_gate", "a brief-only ambient session still drives to the gate");
  });

  it("a draft channel still holds every item at the gate during an ambient wake", async () => {
    const graphId = "ambient-draft";
    saveFlow(draftChannelGraph(graphId), options);
    const session = ambientSession(graphId, "Standing brief: keep prospects warm.", {}, options);

    wakeAmbientSession(session.id, {}, { client: composeAndRunTurn(), options });
    await launchOperatorSession(session.id, { options });

    const paused = getOperatorSession(session.id, options);
    assert.equal(paused.status, "waiting_for_gate", "a draft channel holds at the gate, even on an ambient wake");
    // The gate is HOLDING (pending founder review) and the send node behind it never ran — autonomy is
    // never set by an ambient wake; the founder still releases every item.
    const nodes = paused.pendingGate.runResult.nodes ?? {};
    assert.equal(nodes.gate?.pendingReview, true, "the gate is holding the item for founder review, not auto-clearing");
    assert.notEqual(nodes.send?.ok, true, "the send node behind the gate never ran — every item is held");
  });

  it("never bypasses a pending founder gate on a re-wake (the wall holds)", async () => {
    const graphId = "ambient-rewake";
    saveFlow(draftChannelGraph(graphId), options);
    const session = ambientSession(graphId, "Standing brief.", {}, options);
    wakeAmbientSession(session.id, {}, { client: composeAndRunTurn(), options });
    await launchOperatorSession(session.id, { options });
    assert.equal(getOperatorSession(session.id, options).status, "waiting_for_gate");

    // A second wake must NOT jump the founder's pending gate decision.
    assert.throws(
      () => wakeAmbientSession(session.id, {}, { client: composeAndRunTurn(), options }),
      /paused at waiting_for_gate/,
    );
  });

  it("refuses to wake a cancelled ambient session (cancellation holds)", () => {
    const graphId = "ambient-cancelled";
    saveFlow(draftChannelGraph(graphId), options);
    const session = ambientSession(graphId, "Standing brief.", {}, options);
    cancelOperatorSession(session.id, options);
    assert.throws(
      () => wakeAmbientSession(session.id, {}, { client: composeAndRunTurn(), options }),
      /already cancelled/,
    );
  });

  it("runDueAmbientTicks wakes a DUE recurring brief, drives it to the gate, and RE-ARMS the next wake", async () => {
    const graphId = "ambient-tick-due";
    saveFlow(draftChannelGraph(graphId), options);
    // A real recurring brief: an hourly cadence whose armed wake time has already arrived (the store
    // armed nextWakeAt from the cadence; we pin it into the past to simulate the hour having elapsed).
    const hourly = 3_600_000;
    const past = new Date(Date.now() - 60_000).toISOString();
    const session = ambientSession(graphId, "Hourly: scan for new signups.", { wakeIntervalMs: hourly, nextWakeAt: past }, options);

    const before = Date.now();
    const woken = runDueAmbientTicks({ client: composeAndRunTurn(), options });
    assert.deepEqual(woken, [session.id], "the due standing brief was woken by the tick");
    await launchOperatorSession(session.id, { options });

    const driven = getOperatorSession(session.id, options);
    assert.equal(driven.status, "waiting_for_gate", "the tick drove it to the gate");
    // THE RE-ARM IS REAL: the wake consumed the due time and the store armed the NEXT fire ~one cadence
    // out, so the standing brief keeps standing instead of firing once and going silent.
    const next = new Date(driven.nextWakeAt).getTime();
    assert.ok(Number.isFinite(next) && next >= before + hourly - 5_000, "the next wake is re-armed about a cadence into the future");
  });

  it("runDueAmbientTicks skips ambient sessions that are not yet due", () => {
    const graphId = "ambient-tick-notdue";
    saveFlow(draftChannelGraph(graphId), options);
    // No nextWakeAt → not on a schedule; an event would wake it, but the tick leaves it alone.
    ambientSession(graphId, "Standing brief, no schedule.", {}, options);
    // A future schedule is also not due.
    const future = new Date(Date.now() + 3_600_000).toISOString();
    ambientSession(graphId, "Standing brief, future schedule.", { nextWakeAt: future }, options);

    assert.deepEqual(runDueAmbientTicks({ client: composeAndRunTurn(), options }), [], "nothing due, nothing woken");
  });
});
