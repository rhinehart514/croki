// Integration tests for the four self-observing failure CAPTURE PATHS — the run path actually filing a
// failure into the queue — plus the dedup, the classification split reaching the founder surface, the
// never-throws guarantee in the run path, and the anti-cage guarantee.
//
// Each test isolates BOTH the operator store root (options.root) AND the dogfood queue (options.queueDir),
// and pins options.gitSha so no test shells out to git or touches the real repo queue. The hook sites thread
// the SAME options object they receive into safeLogFailure, so setting options.queueDir routes every
// auto-logged failure into the test's tmp queue.
//
// The wiring under test (already built):
//   (a) RUN CRASH  — operator-runtime.mjs session try/catch → safeLogFailure({ category: "run-crash" }).
//   (b) RUN STALL  — operator-runtime.mjs watchdog          → safeLogFailure({ category: "run-stall" }).
//   (c) NODE ERROR — graph.mjs runGraph onFailure aggregate → operator-tool-exec injects it →
//                    safeLogFailure({ category: "node-error" }).
//   (d) BAD OUTPUT — the same onFailure, tagged "bad-output" when result.meta.errorKind is
//                    unparseable_output / empty_output.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { defaultGraphTemplate, runGraph } from "../src/graph.mjs";
import { saveFlow } from "../src/flow-store.mjs";
import { createOperatorSession, getOperatorSession, saveOperatorSession } from "../src/operator-store.mjs";
import { runOperatorSession, operatorSessionStalled, resolveOperatorGate } from "../src/operator-runtime.mjs";
import { safeLogFailure } from "../src/failure-log.mjs";
import { listFrictionQueue, reportFriction } from "../src/friction.mjs";
import { buildFailureLogView } from "../src/routes/system.mjs";
import { compileRunFromPath, approveCompiledRun, stableActionId } from "../src/run-compile.mjs";
import { gtmPathStore } from "../src/gtm-store.mjs";

// The self-observed failures the queue has captured, keyed on the signature/category the frontmatter
// carries. Manual friction (no signature) is not one of these.
function failures(queueDir) {
  return listFrictionQueue({ queueDir }).reports.filter((r) => r.signature);
}

// A runtime adapter the operator drive loop uses. `drive` is provided per test — throwing it exercises
// the run-crash hook; returning completed is the no-failure baseline.
function adapter(drive) {
  return { id: "cap", label: "Capture", isAvailable: () => ({ ok: true }), drive };
}

describe("self-observing failure capture — the four paths, dedup, split, never-throws, anti-cage", () => {
  let parent;
  let queueDir;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "failure-log-hooks-store-"));
    queueDir = fs.mkdtempSync(path.join(os.tmpdir(), "failure-log-hooks-queue-"));
    // gateTranslator: null keeps unit runs keyless. queueDir + gitSha route + isolate every auto-log.
    options = { root: parent, gateTranslator: null, queueDir, gitSha: "sha-hooks" };
    saveFlow(defaultGraphTemplate(), options);
  });

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true });
    fs.rmSync(queueDir, { recursive: true, force: true });
  });

  // ── (a) RUN CRASH ─────────────────────────────────────────────────────────────
  it("(a) run-crash: a drive-loop throw files exactly one run-crash entry, self_inflicted, and the failed status is unchanged", async () => {
    const session = createOperatorSession({ goal: "Work the goal.", graphId: defaultGraphTemplate().id }, options);
    const failed = await runOperatorSession(session.id, {
      options,
      runtime: adapter(async () => { throw new Error("the drive loop blew up mid-turn"); }),
    });

    // The session still fails honestly — logging did not alter the run's own outcome.
    assert.equal(failed.status, "failed");
    assert.match(failed.error, /blew up mid-turn/);

    const logged = failures(queueDir);
    assert.equal(logged.length, 1, "exactly one run-crash entry lands");
    assert.equal(logged[0].category, "run-crash");
    assert.equal(logged[0].failureClass, "self_inflicted", "a code throw mid-drive is a real bug");
    assert.match(logged[0].errorSnippet, /blew up mid-turn/);
  });

  // ── (b) RUN STALL ─────────────────────────────────────────────────────────────
  it("(b) run-stall: the watchdog's capture files a run-stall entry, tagged transient", () => {
    // operatorSessionStalled is the pure watchdog predicate; a running session silent past the window
    // trips it and the watchdog then fires this exact safeLogFailure call (operator-runtime.mjs ~277).
    const stalled = { status: "running", updatedAt: "2026-07-06T00:40:00.000Z" };
    const now = Date.parse("2026-07-06T01:00:00.000Z");
    assert.equal(operatorSessionStalled(stalled, now), true, "a silent-past-window run is stalled");

    // The watchdog's capture, exercised with the same shape it uses.
    safeLogFailure(
      { category: "run-stall", session: stalled, error: "The run stalled and was ended by the watchdog." },
      options,
    );

    const logged = failures(queueDir);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].category, "run-stall");
    assert.equal(logged[0].failureClass, "transient", "a stalled run is always transient — retry the goal");
  });

  // ── (c) NODE ERROR ────────────────────────────────────────────────────────────
  // Drive a real graph with a failing agent step through runGraph's onFailure aggregate — the exact
  // callback operator-tool-exec injects, so this is the production node-error path end to end.
  function nodeErrorGraph() {
    return {
      id: "g-node-error",
      name: "Node error pipeline",
      nodes: [
        { id: "draft", kind: "agent", ref: "drafter", category: "generate", label: "Draft outreach", position: { x: 0, y: 0 }, config: {} },
      ],
      edges: [],
    };
  }

  // The onFailure the host injects, mirroring makeFailureSink's routing: a result whose model output was
  // unusable (meta.badOutput OR a directly-supplied unparseable/empty errorKind) is "bad-output"; every
  // other genuine failure is "node-error". Then hand to safeLogFailure with the run's options.
  function hostOnFailure(graphLabel = "Outbound pipeline") {
    return (node, result, graphId) => {
      const badOutput = result?.meta?.badOutput ?? null;
      const errorKind = result?.meta?.errorKind ?? null;
      const category = (badOutput === "unparseable_output" || badOutput === "empty_output"
        || errorKind === "unparseable_output" || errorKind === "empty_output")
        ? "bad-output" : "node-error";
      safeLogFailure({ category, node, result, graphId, graphLabel, session: { id: "sess-hooks" } }, options);
    };
  }

  it("(c) node-error: a genuinely failing step files one node-error entry with pipeline+step context, self_inflicted", async () => {
    const graph = nodeErrorGraph();
    // A stepRuntime.agent that returns a genuine node failure (a code throw, no structured errorKind).
    const stepRuntime = {
      agent: async () => ({ ok: false, items: [], error: "the drafter threw: cannot read properties of undefined" }),
    };
    await runGraph(graph, { stepRuntime, onFailure: hostOnFailure("Outbound to WNY operators") });

    const logged = failures(queueDir);
    assert.equal(logged.length, 1, "one node-error entry lands");
    assert.equal(logged[0].category, "node-error");
    assert.equal(logged[0].failureClass, "self_inflicted");
    assert.match(logged[0].errorSnippet, /cannot read properties/);

    // Rich context: the pipeline label + step id/label/kind are in the Context JSON body.
    const text = fs.readFileSync(path.join(queueDir, logged[0].file), "utf8");
    assert.match(text, /Outbound to WNY operators/, "the pipeline label rides the context");
    assert.match(text, /"id": "draft"/, "the step id is in the context");
    assert.match(text, /"kind": "agent"/, "the step kind is in the context");
  });

  it("(c) node-error: a BLOCKED / pendingReview / blind result does NOT log — only genuine failures are observed", async () => {
    // A gate that pends (pendingReview) and a blocked downstream must never reach onFailure. Build a
    // graph whose only failing-looking results are a pending gate and its blocked downstream.
    const graph = {
      id: "g-gate",
      name: "Gate pipeline",
      nodes: [
        { id: "ctx", category: "context", connector: "product", label: "Prepared", position: { x: 0, y: 0 }, config: { name: "Artifact" } },
        { id: "gate", category: "gate", connector: "default", label: "Founder gate", position: { x: 200, y: 0 }, config: {} },
        { id: "measure", category: "measure", connector: "default", label: "Measure", position: { x: 400, y: 0 }, config: {} },
      ],
      edges: [
        { id: "a", source: "ctx", target: "gate", edgeType: "data" },
        { id: "b", source: "gate", target: "measure", edgeType: "data" },
      ],
    };
    let onFailureCalls = 0;
    const onFailure = (...args) => { onFailureCalls += 1; hostOnFailure()(...args); };
    const result = await runGraph(graph, { onFailure });

    assert.ok(result.pendingGates.includes("gate"), "the run paused at the gate (pendingReview)");
    assert.equal(onFailureCalls, 0, "a pending gate + its blocked downstream are not failures — onFailure never fired");
    assert.equal(failures(queueDir).length, 0, "nothing was logged for a legitimate gate pause");
  });

  // ── (d) BAD OUTPUT ────────────────────────────────────────────────────────────
  it("(d) bad-output: a result.meta.errorKind of unparseable_output is tagged bad-output and self_inflicted, DISTINCT from a code throw", async () => {
    const graph = nodeErrorGraph();
    // The agent bridge's bad-output shape: ok:false with a structured errorKind for garbage model output.
    const stepRuntime = {
      agent: async () => ({ ok: false, items: [], error: "model returned text but no parseable items", meta: { errorKind: "unparseable_output" } }),
    };
    await runGraph(graph, { stepRuntime, onFailure: hostOnFailure() });

    const logged = failures(queueDir);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].category, "bad-output", "an unparseable-output failure is tagged bad-output, not node-error");
    assert.equal(logged[0].failureClass, "self_inflicted", "the model gave garbage — a real bug to fix");
  });

  it("(d) bad-output: an empty_output errorKind is also tagged bad-output", async () => {
    const graph = nodeErrorGraph();
    const stepRuntime = {
      agent: async () => ({ ok: false, items: [], error: "model returned an empty result", meta: { errorKind: "empty_output" } }),
    };
    await runGraph(graph, { stepRuntime, onFailure: hostOnFailure() });
    const logged = failures(queueDir);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].category, "bad-output");
  });

  // ── DEDUP across the run path (HARD REQ #1) ─────────────────────────────────────
  it("dedup: the same step failing the same way twice bumps ONE file's occurrences, never two files", async () => {
    const graph = nodeErrorGraph();
    const stepRuntime = { agent: async () => ({ ok: false, items: [], error: "the drafter threw the same way" }) };
    await runGraph(graph, { stepRuntime, onFailure: hostOnFailure() });
    await runGraph(graph, { stepRuntime, onFailure: hostOnFailure() });

    const logged = failures(queueDir);
    assert.equal(logged.length, 1, "two identical run-path failures collapse to one entry");
    assert.equal(logged[0].occurrences, 2, "occurrences bumped to 2 across the run path");
  });

  // ── CLASSIFICATION split reaches the surface (HARD REQ #2) ──────────────────────
  it("classification split: a transient node failure and a self-inflicted one land in the right surface counts", async () => {
    // A self-inflicted failure (a code throw).
    await runGraph(
      { ...nodeErrorGraph(), id: "g-self" },
      { stepRuntime: { agent: async () => ({ ok: false, items: [], error: "cannot read properties of undefined" }) }, onFailure: hostOnFailure("Self-inflicted pipeline") },
    );
    // A transient failure (a timeout — the node result carries timedOut, which the classifier maps to timeout).
    await runGraph(
      { ...nodeErrorGraph(), id: "g-transient" },
      { stepRuntime: { agent: async () => ({ ok: false, items: [], error: "the step exceeded its wall clock", timedOut: true }) }, onFailure: hostOnFailure("Transient pipeline") },
    );

    const view = buildFailureLogView(listFrictionQueue({ queueDir }));
    assert.equal(view.groups.length, 2, "two distinct failures → two groups on the surface");
    assert.equal(view.selfInflictedCount, 1, "the code-throw failure counts self-inflicted");
    assert.equal(view.transientCount, 1, "the timed-out failure counts transient");
    // The surface separates the two classes distinctly.
    const classes = view.groups.map((g) => g.failureClass).sort();
    assert.deepEqual(classes, ["self_inflicted", "transient"]);
  });

  it("the surface groups by signature, newest lastSeen first, and excludes manual friction", async () => {
    // A manual friction report (no signature) must never appear as a failure group.
    reportFriction({ report: "The gate card hid the citation", kind: "bug", source: "founder" }, options);
    // Two real self-observed failures.
    await runGraph(
      { ...nodeErrorGraph(), id: "g-older" },
      { stepRuntime: { agent: async () => ({ ok: false, items: [], error: "older failure" }) }, onFailure: (n, r, g) => safeLogFailure({ category: "node-error", node: n, result: r, graphId: g, graphLabel: "Older", session: { id: "s" } }, { ...options, now: "2026-07-09T10:00:00.000Z" }) },
    );
    await runGraph(
      { ...nodeErrorGraph(), id: "g-newer" },
      { stepRuntime: { agent: async () => ({ ok: false, items: [], error: "newer failure" }) }, onFailure: (n, r, g) => safeLogFailure({ category: "node-error", node: n, result: r, graphId: g, graphLabel: "Newer", session: { id: "s" } }, { ...options, now: "2026-07-09T20:00:00.000Z" }) },
    );

    const view = buildFailureLogView(listFrictionQueue({ queueDir }));
    assert.equal(view.groups.length, 2, "the manual friction report is excluded — only self-observed failures group");
    // Newest lastSeen first.
    assert.equal(view.groups[0].lastSeen, "2026-07-09T20:00:00.000Z");
    assert.equal(view.groups[1].lastSeen, "2026-07-09T10:00:00.000Z");
  });

  // ── NEVER-THROWS in the run path (HARD REQ #4) ──────────────────────────────────
  it("never-throws: a poisoned queue makes logging fail internally, yet the run completes with an identical result", async () => {
    const graph = nodeErrorGraph();
    const stepRuntime = { agent: async () => ({ ok: false, items: [], error: "the drafter threw" }) };

    // Baseline: the run's own result with a working logger.
    const clean = await runGraph(graph, { stepRuntime, onFailure: hostOnFailure() });

    // Poison the queue dir so every safeLogFailure inside onFailure throws internally.
    const blocker = path.join(parent, "poison-blocker");
    fs.writeFileSync(blocker, "x");
    const poisonedQueueDir = path.join(blocker, "queue");
    const poisonedOnFailure = (node, result, graphId) => {
      safeLogFailure(
        { category: "node-error", node, result, graphId, graphLabel: "Poisoned", session: { id: "s" } },
        { ...options, queueDir: poisonedQueueDir },
      );
    };

    let threw = false;
    let poisoned;
    try {
      poisoned = await runGraph(graph, { stepRuntime, onFailure: poisonedOnFailure });
    } catch {
      threw = true;
    }
    assert.equal(threw, false, "the run never throws even when logging throws internally");
    // The run's own node result is identical whether logging worked or failed.
    assert.equal(poisoned.nodes.draft.ok, clean.nodes.draft.ok);
    assert.equal(poisoned.nodes.draft.error, clean.nodes.draft.error);
    // And the poisoned queue was never created — logging left no side effect.
    assert.equal(fs.existsSync(poisonedQueueDir), false, "a failed log leaves no queue behind");
  });

  it("never-throws: a run-crash whose logging is poisoned still fails the session honestly", async () => {
    // Point the session options' queue at a poisoned path so the crash hook's safeLogFailure throws
    // internally; the session must still land at status:failed with the real error.
    const blocker = path.join(parent, "crash-poison-blocker");
    fs.writeFileSync(blocker, "x");
    const poisonedOptions = { ...options, queueDir: path.join(blocker, "queue") };
    saveFlow(defaultGraphTemplate(), poisonedOptions);
    const session = createOperatorSession({ goal: "Crash then poison the log.", graphId: defaultGraphTemplate().id }, poisonedOptions);

    const failed = await runOperatorSession(session.id, {
      options: poisonedOptions,
      runtime: adapter(async () => { throw new Error("crash while the log is poisoned"); }),
    });
    assert.equal(failed.status, "failed", "the session still fails honestly");
    assert.match(failed.error, /crash while the log is poisoned/);
  });

  // ── (c/d) GATE-RESUME run — the most consequential leg logs failures too (finding #1) ───────────
  // The post-approval continuation (resolveOperatorGate) runs downstream execute/send/deploy nodes and
  // re-drafted descendants. Before the fix it omitted onFailure and silently dropped every node-error and
  // bad-output failure on this leg. This drives a real gate-resume with a failing downstream node and
  // asserts the failure reaches the queue.
  it("(c) gate-resume: a downstream node that fails AFTER approval files a node-error entry (was silently dropped)", async () => {
    // A graph that pends at a gate, then runs a downstream agent step that fails on the resume run.
    const graph = {
      id: "g-gate-resume",
      name: "Gate resume pipeline",
      version: "1",
      nodes: [
        { id: "ctx", category: "context", connector: "product", label: "Prepared", position: { x: 0, y: 0 }, config: { name: "Artifact" } },
        { id: "gate", category: "gate", connector: "default", label: "Founder gate", position: { x: 200, y: 0 }, config: {} },
        { id: "downstream", kind: "agent", ref: "drafter", category: "generate", label: "Re-draft downstream", position: { x: 400, y: 0 }, config: {} },
      ],
      edges: [
        { id: "a", source: "ctx", target: "gate", edgeType: "data" },
        { id: "b", source: "gate", target: "downstream", edgeType: "data" },
      ],
    };
    saveFlow(graph, options);

    // Seed a session paused at the gate with a real runResult carrying an approved item, so the resume run
    // continues past the gate into the downstream node.
    const session = createOperatorSession({ goal: "Ship the approved artifact.", graphId: graph.id }, options);
    const pendingGate = {
      runId: "run-resume",
      nodeIds: ["gate"],
      runResult: {
        runId: "run-resume",
        pendingGates: ["gate"],
        nodes: {
          gate: {
            category: "gate",
            items: [{ id: "staged-1", name: "Jane Doe", subject: "Quick question", approvalStatus: "pending" }],
          },
        },
      },
    };
    saveOperatorSession({ ...getOperatorSession(session.id, options), status: "waiting_for_gate", pendingGate, lastRunId: "run-resume" }, options);

    // Inject a stepRuntime whose downstream agent fails — a re-drafted descendant throwing on the resume run.
    // A benign runtime keeps the post-resume drive from erroring (it launches only if no gate pends).
    const stepRuntime = {
      agent: async () => ({ ok: false, items: [], error: "the downstream re-draft threw on resume: cannot read properties of undefined" }),
    };
    const benignRuntime = { id: "cap", label: "Capture", isAvailable: () => ({ ok: true }), drive: async () => ({ kind: "completed", summary: "done" }) };

    await resolveOperatorGate(session.id, { approvals: { gate: true } }, {
      options: { ...options, stepRuntime },
      runtime: benignRuntime,
    });
    // Let any async follow-up settle.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const logged = failures(queueDir);
    assert.equal(logged.length, 1, "the gate-resume run's downstream failure IS filed — the hole is closed");
    assert.equal(logged[0].category, "node-error");
    assert.match(logged[0].errorSnippet, /downstream re-draft threw on resume/);
  });

  // ── (c) COMPILED-RUN gate approval — the parallel HTTP leg logs failures too (Round 2 finding #1) ──
  // approveCompiledRun (reached from routes/runs.mjs POST /api/projects/:id/runs/:id/approve) crosses the
  // wall: post-approval it threads authorizeRelease so approved items flow into execute/send/deploy and
  // upstream steps re-run live. Before the fix it called runGraph WITHOUT onFailure, so a downstream step
  // failing on THIS leg was silently dropped — the same hole the operator gate-resume leg had closed. This
  // drives a real compile → approve with a failing downstream node and asserts the failure reaches the queue.
  it("(c) compiled-run approve: a downstream node that fails AFTER approval files a node-error entry (was silently dropped)", async () => {
    const projectId = "compiled-leg";
    const gtmPath = gtmPathStore.create(
      {
        projectId,
        summary: "Reach a hand-picked founder with a launch nudge",
        bet: { buyer: "solo founders", channel: "email", offer: "launch checklist", message: "Here's a launch checklist." },
        status: "selected",
      },
      options,
    );
    // A composer whose topology fails downstream of the gate on the release run: source → gate →
    // execute(local, stages the approved item) → agent(re-draft that throws). The failing agent sits after
    // the gate, so it only runs on the approve/release leg — exactly the wall-crossing path under test.
    const composer = async () => ({
      ok: true,
      nodes: [
        { id: "src", category: "source", connector: "manual", label: "Input" },
        { id: "gate", category: "gate", connector: "default", label: "Founder review" },
        { id: "out", category: "execute", connector: "local", label: "Stage output" },
        { id: "post", kind: "agent", ref: "drafter", category: "generate", label: "Re-draft downstream" },
      ],
      edges: [
        { source: "src", target: "gate", edgeType: "data" },
        { source: "gate", target: "out", edgeType: "data" },
        { source: "out", target: "post", edgeType: "data" },
      ],
    });
    const { run } = await compileRunFromPath({
      projectId,
      pathId: gtmPath.id,
      compose: composer,
      input: { items: [{ handle: "@alice", draft: "Hi Alice — launch checklist inside." }] },
      options,
    });
    assert.equal(run.status, "staged");

    // Approve the item, then release through approveCompiledRun with a stepRuntime whose downstream agent
    // fails. options carries queueDir + gitSha, so the sink routes into this test's isolated queue.
    const [alice] = run.items;
    const stepRuntime = {
      agent: async () => ({ ok: false, items: [], error: "the downstream re-draft threw on release: cannot read properties of undefined" }),
    };
    await approveCompiledRun({
      projectId,
      runId: run.id,
      decisions: { [stableActionId(run, alice)]: { decision: "approve" } },
      stepRuntime,
      options,
    });

    const logged = failures(queueDir);
    assert.equal(logged.length, 1, "the compiled-run approval leg's downstream failure IS filed — the parallel hole is closed");
    assert.equal(logged[0].category, "node-error");
    assert.equal(logged[0].failureClass, "self_inflicted");
    assert.match(logged[0].errorSnippet, /downstream re-draft threw on release/);
  });

  // ── (d) BAD OUTPUT as PURE OBSERVATION — ok:true carries meta.badOutput (finding #5) ───────────
  // The invoker keeps ok:true/items:[] for an unusable-empty result so the branch is never halted; the sink
  // still observes it via result.meta.badOutput. This drives runGraph with such a result and asserts BOTH:
  // the run behaves as a success (ok:true) AND a bad-output entry is filed.
  it("(d) bad-output observation: an ok:true result carrying meta.badOutput is observed WITHOUT halting the run", async () => {
    const graph = nodeErrorGraph();
    // The invoker's pure-observation shape: ok:true, empty items, a meta.badOutput signal.
    const stepRuntime = {
      agent: async () => ({ ok: true, items: [], meta: { badOutput: "unparseable_output" } }),
    };
    const result = await runGraph(graph, { stepRuntime, onFailure: hostOnFailure("Bad output pipeline") });

    // Run behavior is UNCHANGED — the node stayed ok:true, the branch never halted.
    assert.equal(result.nodes.draft.ok, true, "an unusable-empty result stays ok:true — pure observation never halts the run");

    // But it WAS observed as bad output.
    const logged = failures(queueDir);
    assert.equal(logged.length, 1, "the bad-output signal is filed even though the node stayed ok:true");
    assert.equal(logged[0].category, "bad-output");
    assert.equal(logged[0].failureClass, "self_inflicted", "unusable model output is a real bug to fix");
  });

  // ── ANTI-CAGE holds (HARD REQ #5) ───────────────────────────────────────────────
  it("anti-cage: a run that produces NO failure writes NOTHING and behaves identically", async () => {
    // A clean graph with a succeeding step must add no required contract and log nothing.
    const graph = {
      id: "g-clean",
      name: "Clean pipeline",
      nodes: [
        { id: "src", kind: "agent", ref: "drafter", category: "generate", label: "Draft", position: { x: 0, y: 0 }, config: {} },
      ],
      edges: [],
    };
    const stepRuntime = { agent: async () => ({ ok: true, items: [{ name: "A", draft: "a note" }] }) };
    const result = await runGraph(graph, { stepRuntime, onFailure: hostOnFailure() });

    assert.equal(result.nodes.src.ok, true, "the clean run succeeds");
    assert.equal(failures(queueDir).length, 0, "a run with no failure writes nothing — pure observation, no cage");
  });

  it("anti-cage: the failure logger never gates a run — a succeeding session completes normally with logging wired", async () => {
    const session = createOperatorSession({ goal: "Complete cleanly.", graphId: defaultGraphTemplate().id }, options);
    const completed = await runOperatorSession(session.id, {
      options,
      runtime: adapter(async () => ({ kind: "completed", summary: "done, nothing failed" })),
    });
    assert.equal(completed.status, "completed", "logging adds no pre-run object, no blocking gate");
    assert.equal(failures(queueDir).length, 0, "a clean session logs nothing");
  });
});
