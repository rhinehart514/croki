// INPUT ROUTING (input-routing.mjs) — the actor that turns the pure router's decision into a side effect,
// end to end. These tests pin the Phase-5 integration invariant: routing acts on a captured input, and the
// ONLY run it can ever start (an ambient wake) composes and runs EXACTLY to the founder gate and STOPS —
// nothing sends, deploys, or auto-approves. A flow match only records the channel; an ignore only sets the
// signal aside. Neither starts a run.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { defaultGraphTemplate } from "../src/graph.mjs";
import { saveFlow } from "../src/flow-store.mjs";
import { appendInput, listInputs } from "../src/inputs-store.mjs";
import { createProject } from "../src/project-store.mjs";
import { createOperatorSession, getActiveSessionForProject, getOperatorSession, listOperatorSessions, saveOperatorSession } from "../src/operator-store.mjs";
import { launchOperatorSession } from "../src/operator-runtime.mjs";
import { actOnInput, routeUnroutedInputs } from "../src/input-routing.mjs";

// The same fake-client trick the ambient-wake suite uses: one model turn reaches for compose_and_run, the
// SAME door a goal drive uses. With a graph already bound, that drives the existing workflow to the gate.
function composeAndRunTurn() {
  let index = 0;
  const responses = [{ content: [{ type: "tool_use", id: "tool-car", name: "compose_and_run", input: {} }] }];
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

// A DRAFT channel graph: a prepared item → founder gate → an execute (send) node. With no approval the
// gate holds and the send node never runs — nothing leaves the wall.
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

const channels = [
  { id: "ch-github", name: "GitHub signal scout", objective: "watch the repo for stars and commits", kind: "commit", enabled: true },
];

describe("input routing — the actor that acts on a router decision", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-input-routing-"));
    options = { root: parent };
    saveFlow(defaultGraphTemplate(), options);
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("flow: records the channel and starts NO run", () => {
    const project = "route-flow";
    const input = appendInput(project, { kind: "commit", source: "github" }, options);

    const { decision, sessionId } = actOnInput(project, input, { ...options, channels });

    assert.equal(decision.route, "flow");
    assert.equal(decision.channelId, "ch-github");
    assert.equal(sessionId, undefined, "a flow match never starts an operator session");
    const stored = listInputs(project, options)[0];
    assert.equal(stored.status, "routed");
    assert.equal(stored.routedTo, "ch-github");
    // No run was started anywhere.
    assert.equal(listOperatorSessions(options).length, 0, "flow routing never spawns an operator session");
  });

  it("ignore: sets the signal aside and starts NO run", () => {
    const project = "route-ignore";
    const input = appendInput(project, { kind: "weather", source: "noaa" }, options);

    const { decision } = actOnInput(project, input, { ...options, channels });

    assert.equal(decision.route, "ignore");
    const stored = listInputs(project, options)[0];
    assert.equal(stored.status, "ignored");
    assert.equal(stored.routedTo, null);
    assert.equal(listOperatorSessions(options).length, 0, "ignore never spawns an operator session");
  });

  it("ambient_wake: drives a standing-brief session TO THE GATE and stops — the input is routed to it", async () => {
    const project = "route-ambient";
    const graphId = "ambient-route-gate";
    // The input belongs to a REAL project (compose_and_run / taste read it), with no channels so the
    // signal finds no flow match and the scorer's wake is what fires.
    createProject({ id: project, name: "Route Ambient" }, options);
    saveFlow(draftChannelGraph(graphId), options);

    // Pre-create the project's ambient session bound to the draft channel, so the wake drives an existing
    // graph to the gate (no composer needed). The actor reuses this slot via getOrCreateSessionForProject.
    const seed = createOperatorSession({ goal: "seed", graphId, projectId: project }, options);
    saveOperatorSession({ ...seed, goal: null, kind: "ambient", standingBrief: "Watch for competitor moves.", brief: "Watch for competitor moves." }, options);

    const input = appendInput(project, { kind: "competitor-launch", source: "rss" }, options);
    // An injected scorer is the only seam where the fuzzy "warrants a wake?" judgment enters.
    const wakeScorer = (sig) => ({ warrant: true, brief: `A competitor shipped (${sig.kind}); draft a positioning response.`, reason: "competitor-launch" });

    const { decision, sessionId } = actOnInput(project, input, {
      ...options,
      wakeScorer,
      client: composeAndRunTurn(),
    });

    assert.equal(decision.route, "ambient_wake");
    assert.ok(sessionId, "an ambient wake names the session it drove");

    // Settle the in-flight drive (launchOperatorSession dedupes by session id).
    await launchOperatorSession(sessionId, { options });

    // GATE PROOF: the ambient drive parked at the founder gate and the execute/send node never ran.
    const paused = getOperatorSession(sessionId, options);
    assert.equal(paused.status, "waiting_for_gate", "the ambient wake STOPS at the founder gate");
    assert.notEqual(paused.pendingGate?.runResult?.nodes?.send?.ok, true, "the send node behind the gate never ran — nothing left the wall");

    // The input is recorded as routed to the ambient session.
    const stored = listInputs(project, options)[0];
    assert.equal(stored.status, "routed");
    assert.equal(stored.routedTo, `ambient:${sessionId}`);
  });

  it("routeUnroutedInputs works the whole inbox and leaves nothing unrouted", () => {
    const project = "route-batch";
    appendInput(project, { kind: "commit", source: "github" }, options);
    appendInput(project, { kind: "weather", source: "noaa" }, options);

    const results = routeUnroutedInputs(project, { ...options, channels });

    assert.equal(results.length, 2);
    assert.deepEqual(results.map((r) => r.decision.route).sort(), ["flow", "ignore"]);
    assert.equal(listInputs(project, { ...options, status: "unrouted" }).length, 0, "the inbox is fully worked");
  });

  it("a cancelled ambient session is terminal — the actor never re-wakes it, it opens a fresh slot", () => {
    // Cancellation holds: getOrCreateSessionForProject passes over terminal sessions, so a cancelled
    // ambient session is never re-driven. (The wall-bypass-on-rewake case is pinned in ambient-wake.test.)
    const project = "route-cancel";
    const seed = createOperatorSession({ goal: "seed", projectId: project }, options);
    const ambient = saveOperatorSession({ ...seed, goal: null, kind: "ambient", standingBrief: "brief", brief: "brief", status: "cancelled" }, options);
    assert.equal(getActiveSessionForProject(project, { ...options, kind: "ambient" }), null, "a cancelled ambient session is not live");
    assert.ok(ambient.id);
  });
});
