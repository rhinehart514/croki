// AREA 2 — the always-on runtime (GTM-MACHINE.md). These tests pin the four extensions and the budget:
//   - workedContext: a thin projection over Area 1's touch ledger (not a parallel person fold).
//   - runDueInputRouting: the third heartbeat driver drains the inbox to the founder gate — proven in BOTH
//     the scorer-present branch (a wake reaches the gate) and the scorer-absent branch (byte-identical to
//     today: never wakes). An idle tick with an empty inbox makes ZERO model calls and ZERO probe calls.
//   - the per-tick budget: max scorer invocations per tick, a hard daily paid-probe-credit cap, per-motion
//     probe cadence — all respected under load, the daily cap durable across ticks.
//   - runMotionOnce: cycle-2's item set differs from cycle-1, derived from live touch-ledger state
//     (responders drop, non-responders advance) — and the wall holds on every re-stage.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createProject, saveProject } from "../src/project-store.mjs";
import { appendInput, listInputs } from "../src/inputs-store.mjs";
import { saveFlow } from "../src/flow-store.mjs";
import { createOperatorSession, getOperatorSession, saveOperatorSession } from "../src/operator-store.mjs";
import { launchOperatorSession } from "../src/operator-runtime.mjs";
import { recordObjectTouch, resultStore, repeatableMotionStore, runStore } from "../src/gtm-store.mjs";
import { saveReallocationTunables } from "../src/reallocation-tunables-store.mjs";
import { workedContext } from "../src/run-grounding.mjs";
import { computeCycleItems, runMotionOnce, promoteRun } from "../src/promote-motion.mjs";
import { gtmPathStore } from "../src/gtm-store.mjs";
import { createTickBudget, runDueInputRouting } from "../src/ambient-scheduler.mjs";
import { createAmbientWakeScorer, buildWakeScorerPrompt } from "../src/ambient-wake-scorer.mjs";

function freshRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-area2-"));
  return { root };
}

// ── workedContext — the thin projection over Area 1's ledger ────────────────────────────────────────
describe("Area 2 — workedContext (thin projection over the touch ledger)", () => {
  let parent;
  let options;
  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-worked-"));
    options = { root: parent };
  });
  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("is empty on a fresh project (nothing touched → no slice, never faked)", () => {
    assert.deepEqual(workedContext("nobody", options), { projectId: "nobody", objects: [] });
  });

  it("projects touch count + lastSeenAt, and reads last outcome kind off the Result ledger by object key", () => {
    const projectId = "proj-worked";
    // Two motions touch the same geo object; then an outcome joins back to it (by joinKey === objectKey).
    recordObjectTouch(projectId, { objectKey: "geo:buffalo", kind: "geo", label: "Buffalo, NY", motionId: "m1", runId: "r1", verb: "targeted", at: "2026-07-01T00:00:00.000Z" }, options);
    recordObjectTouch(projectId, { objectKey: "geo:buffalo", kind: "geo", motionId: "m2", runId: "r2", verb: "targeted", at: "2026-07-02T00:00:00.000Z" }, options);
    resultStore.create({ projectId, runId: "r2", pathId: "p", joinKey: "geo:buffalo", outcomeKind: "ranked", observedAt: "2026-07-03T00:00:00.000Z" }, { ...options, projectId });

    const wc = workedContext(projectId, options);
    assert.equal(wc.objects.length, 1);
    const obj = wc.objects[0];
    assert.equal(obj.objectKey, "geo:buffalo");
    assert.equal(obj.kind, "geo");
    assert.equal(obj.touchCount, 2, "both motion touches are counted");
    assert.equal(obj.lastSeenAt, "2026-07-02T00:00:00.000Z");
    assert.equal(obj.lastOutcomeKind, "ranked", "the joined outcome kind is read from the Result ledger");
  });

  it("carries null lastOutcomeKind when nothing joined back (honest blank)", () => {
    const projectId = "proj-nooutcome";
    recordObjectTouch(projectId, { objectKey: "page:/x", kind: "page", motionId: "m1", runId: "r1", verb: "minted" }, options);
    const wc = workedContext(projectId, options);
    assert.equal(wc.objects[0].lastOutcomeKind, null);
  });
});

// ── The per-tick budget ─────────────────────────────────────────────────────────────────────────────
describe("Area 2 — the per-tick budget (scorer cap, daily probe cap, per-motion cadence)", () => {
  let parent;
  let options;
  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-budget-"));
    options = { root: parent };
  });
  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("caps scorer invocations per tick", () => {
    const budget = createTickBudget({ maxScorerPerTick: 2, options });
    assert.equal(budget.takeScorer(), true);
    assert.equal(budget.takeScorer(), true);
    assert.equal(budget.takeScorer(), false, "the third invocation is over the per-tick cap");
    assert.equal(budget.scorerRemaining, 0);
  });

  it("enforces the founder-tunable daily paid-probe cap, durable across ticks", () => {
    saveReallocationTunables({ dailyProbeCap: 3 }, { ...options, projectId: "default" });
    const nowMs = Date.parse("2026-07-08T09:00:00.000Z");
    const tick1 = createTickBudget({ nowMs, options: { ...options, projectId: "default" } });
    assert.equal(tick1.dailyProbeCap, 3);
    assert.equal(tick1.canProbe("m1", 2), true);
    tick1.chargeProbe("m1", 2); // 2 of 3 spent
    assert.equal(tick1.canProbe("m2", 2), false, "a 2-credit probe would exceed the daily cap of 3");
    assert.equal(tick1.canProbe("m2", 1), true, "a 1-credit probe still fits");

    // A LATER tick the same day reads the durable ledger — the cap holds across ticks.
    const tick2 = createTickBudget({ nowMs: nowMs + 60_000, options: { ...options, projectId: "default" } });
    assert.equal(tick2.probeSpent, 2, "the durable ledger carried the 2 credits already spent");
    assert.equal(tick2.canProbe("m3", 2), false, "only 1 credit remains today");

    // The next calendar day resets the cap (a fresh day bucket).
    const nextDay = createTickBudget({ nowMs: nowMs + 24 * 60 * 60 * 1000, options: { ...options, projectId: "default" } });
    assert.equal(nextDay.probeSpent, 0, "the daily cap resets on a new calendar day");
  });

  it("throttles per-motion probe cadence — a motion cannot probe twice within its cadence window", () => {
    const nowMs = Date.parse("2026-07-08T09:00:00.000Z");
    const budget = createTickBudget({ nowMs, motionProbeCadenceMs: 60 * 60 * 1000, options });
    assert.equal(budget.canProbe("m1"), true);
    budget.chargeProbe("m1");
    assert.equal(budget.canProbe("m1"), false, "the same motion is within its cadence window");
    assert.equal(budget.canProbe("m2"), true, "a different motion is unaffected");
  });
});

// ── The third driver: drain to the gate + idle cost ─────────────────────────────────────────────────
describe("Area 2 — runDueInputRouting (the inbox drains itself, the wall holds)", () => {
  let parent;
  let options;
  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-drain-"));
    options = { root: parent };
  });
  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  // A DRAFT channel graph: prepared item → founder gate → send. With no approval the gate holds.
  function draftGraph(id) {
    return {
      id,
      name: "Ambient draft",
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

  function composeAndRunTurn() {
    let index = 0;
    const responses = [{ content: [{ type: "tool_use", id: "t", name: "compose_and_run", input: {} }] }];
    return {
      messages: {
        async create() {
          const r = responses[index];
          index += 1;
          if (!r) throw new Error("Unexpected extra model turn.");
          return r;
        },
      },
    };
  }

  it("idle tick with an empty inbox: ZERO scorer calls, ZERO probe calls", () => {
    createProject({ id: "idle", name: "Idle" }, options);
    let scorerCalls = 0;
    const scorer = () => { scorerCalls += 1; return { warrant: false }; };
    const results = runDueInputRouting({ ...options, scorer });
    // No captured inputs → the router never reaches the scorer seam.
    assert.equal(scorerCalls, 0, "an empty inbox never invokes the scorer");
    const idle = results.find((r) => r.projectId === "idle");
    assert.deepEqual(idle?.routed ?? [], [], "nothing to route");
  });

  it("scorer-absent branch is byte-identical to today — a no-channel signal is set aside, never woken", () => {
    createProject({ id: "noscorer", name: "No Scorer" }, options);
    appendInput("noscorer", { kind: "competitor-launch", source: "rss" }, options);
    // scorer:null → the driver passes NO scorer, so routeInput uses its blank default (never wakes).
    const results = runDueInputRouting({ ...options, scorer: null });
    const mine = results.find((r) => r.projectId === "noscorer");
    assert.equal(mine.routed.length, 1);
    assert.equal(mine.routed[0].decision.route, "ignore", "no scorer → the signal is set aside, exactly as today");
    assert.equal(listInputs("noscorer", options)[0].status, "ignored");
  });

  it("scorer-present branch: a warranted signal drives a standing brief TO THE GATE and stops", async () => {
    const projectId = "wake-drain";
    const graphId = "drain-gate";
    const project = createProject({ id: projectId, name: "Wake Drain" }, options).project;
    const graph = draftGraph(graphId);
    saveFlow(graph, options);
    saveProject({
      ...project,
      // Owned and executable by the standing-brief session, but disabled as normal intake so the
      // scorer-present branch remains the authority that warrants this ambient wake.
      channels: [{ id: "drain-pipeline", graphId: graph.id, name: graph.name, objective: "Drain warranted ambient signals", kind: "custom", enabled: false }],
    }, options);
    const seed = createOperatorSession({ goal: "seed", graphId, projectId }, options);
    saveOperatorSession({ ...seed, goal: null, kind: "ambient", standingBrief: "Watch for competitor moves.", brief: "Watch for competitor moves." }, options);

    appendInput(projectId, { kind: "competitor-launch", source: "rss" }, options);
    const scorer = (sig) => ({ warrant: true, brief: `A competitor shipped (${sig.kind}); draft a response.`, reason: "competitor-launch" });

    const results = runDueInputRouting({ ...options, scorer, client: composeAndRunTurn() });
    const mine = results.find((r) => r.projectId === projectId);
    const wake = mine.routed.find((r) => r.decision.route === "ambient_wake");
    assert.ok(wake?.sessionId, "the warranted signal woke a standing-brief session");

    await launchOperatorSession(wake.sessionId, { options });
    const paused = getOperatorSession(wake.sessionId, options);
    assert.equal(paused.status, "waiting_for_gate", "the wake STOPS at the founder gate");
    assert.notEqual(paused.pendingGate?.runResult?.nodes?.send?.ok, true, "the send node behind the gate never ran — nothing left the wall");
  });

  it("the budget bounds scorer calls under a deep inbox — once the tick cap is hit, the rest never wake", () => {
    const projectId = "deep-inbox";
    createProject({ id: projectId, name: "Deep" }, options);
    // Five no-channel signals; a scorer cap of 2 means at most 2 reach the model this tick.
    for (let i = 0; i < 5; i += 1) appendInput(projectId, { kind: `sig-${i}`, source: "rss" }, options);
    let scorerCalls = 0;
    const scorer = () => { scorerCalls += 1; return { warrant: false }; }; // never wakes, just counts
    runDueInputRouting({ ...options, scorer, maxScorerPerTick: 2 });
    assert.equal(scorerCalls, 2, "the per-tick scorer cap bounds the model spend even on a deep inbox");
  });
});

// ── runMotionOnce: cycle-2 differs from cycle-1, wall held ───────────────────────────────────────────
describe("Area 2 — runMotionOnce computes a live cycle set (responders drop, non-responders advance)", () => {
  let parent;
  let options;
  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-cycle-"));
    options = { root: parent };
  });
  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  // A wall-passing multi-touch topology carrying a fixed population of people (keyed by email).
  const STEPS = [
    { id: "src", category: "source", kind: "code" },
    { id: "gate", category: "gate" },
    { id: "exec", category: "execute", connector: "stage-local" },
  ];
  const EDGES = [
    { source: "src", target: "gate" },
    { source: "gate", target: "exec" },
  ];

  function seedMotion(projectId) {
    const scoped = { ...options, projectId };
    const p = gtmPathStore.create({ projectId, summary: "Multi-touch nurture", bet: { offer: "demo" } }, scoped);
    const run = runStore.create(
      {
        projectId,
        pathId: p.id,
        steps: STEPS,
        edges: EDGES,
        items: [
          { joinKey: "j1", email: "dana@acme.com", draft: "Hi Dana" },
          { joinKey: "j2", email: "sam@beta.com", draft: "Hi Sam" },
        ],
        status: "staged",
        startedAt: "2026-06-01T00:00:00.000Z",
      },
      scoped,
    );
    const { motion } = promoteRun(run.id, { cadence: "weekly", nowMs: Date.parse("2026-07-01T00:00:00.000Z") }, scoped);
    return { motion, scoped, projectId };
  }

  it("cycle-1 works the whole population; cycle-2's set drops the responder (a joined outcome)", () => {
    const { motion, scoped, projectId } = seedMotion("cycle-proj");

    // CYCLE 1: nothing has come back yet — both people advance (today's behavior, identity on a fresh ledger).
    const cycle1 = computeCycleItems(motion.nextRunTemplate, projectId, scoped);
    assert.equal(cycle1.length, 2, "cycle-1 works the whole carried population");

    // A responder converts: record a touch on dana's object AND a joined outcome, so the ledger marks her
    // handled. (deriveSuppression reads the touch ledger + the converted-key set off the Result ledger.)
    recordObjectTouch(projectId, { objectKey: "email:dana@acme.com", kind: "person", motionId: "m", runId: "r", verb: "worked" }, scoped);
    resultStore.create({ projectId, runId: "r", pathId: "p", joinKey: "email:dana@acme.com", buyerRef: "email:dana@acme.com", outcomeKind: "reply" }, scoped);

    // CYCLE 2: dana responded → she drops; sam did not → he advances. The set genuinely differs.
    const cycle2 = computeCycleItems(motion.nextRunTemplate, projectId, scoped);
    assert.equal(cycle2.length, 1, "the responder drops from cycle-2");
    assert.equal(cycle2[0].email, "sam@beta.com", "the non-responder advances");
    assert.notDeepEqual(cycle2, cycle1, "cycle-2's item set is not a replay of cycle-1");
  });

  it("runMotionOnce re-stages the live cycle set at the gate — the wall holds, joinKeys are fresh", () => {
    const { motion, scoped, projectId } = seedMotion("cycle-stage");
    // Mark dana handled so cycle-2 drops her.
    recordObjectTouch(projectId, { objectKey: "email:dana@acme.com", kind: "person", motionId: "m", runId: "r", verb: "worked" }, scoped);
    resultStore.create({ projectId, runId: "r", pathId: "p", joinKey: "email:dana@acme.com", buyerRef: "email:dana@acme.com", outcomeKind: "reply" }, scoped);

    const { run, gate } = runMotionOnce(motion, { nowMs: Date.parse("2026-07-08T00:00:00.000Z") }, scoped);
    assert.equal(run.status, "staged");
    assert.equal(run.gateState.status, "pending", "the re-run parks at the founder gate — the wall holds");
    assert.equal(run.items.length, 1, "only the non-responder is staged this cycle");
    assert.equal(run.items[0].email, "sam@beta.com");
    assert.ok(run.items[0].joinKey && run.items[0].joinKey !== "j2", "a fresh joinKey is minted, never the source run's");
    assert.ok(gate, "a gate review is returned");
  });
});

// ── The rented wake scorer (behind an open step) ────────────────────────────────────────────────────
describe("Area 2 — the rented wake scorer (model behind an open step, honest refusal)", () => {
  it("builds a wall-safe prompt carrying only the signal framing + channel names", () => {
    const prompt = buildWakeScorerPrompt(
      { kind: "reply", source: "gmail", payload: { from: "a@b.com" } },
      { channels: [{ name: "Cold outreach" }] },
    );
    assert.match(prompt, /Signal kind: reply/);
    assert.match(prompt, /Cold outreach/);
    assert.match(prompt, /JSON object/);
  });

  it("parses a clean model verdict; refuses (no wake) on garbage or a warrant with no brief", () => {
    const warrant = createAmbientWakeScorer({ runSync: () => '```json\n{ "warrant": true, "brief": "Answer the reply", "reason": "real reply" }\n```' });
    assert.deepEqual(warrant({ kind: "reply", source: "gmail" }, {}), { warrant: true, brief: "Answer the reply", reason: "real reply" });

    const garbage = createAmbientWakeScorer({ runSync: () => "the model said something unparseable" });
    assert.deepEqual(garbage({ kind: "x", source: "y" }, {}), { warrant: false });

    const noBrief = createAmbientWakeScorer({ runSync: () => '{ "warrant": true, "reason": "vague" }' });
    assert.equal(noBrief({ kind: "x", source: "y" }, {}).warrant, false, "a warrant with no brief refuses, never wakes blind");

    const nullReply = createAmbientWakeScorer({ runSync: () => null });
    assert.deepEqual(nullReply({ kind: "x", source: "y" }, {}), { warrant: false }, "a failed model call refuses, never throws");
  });
});
