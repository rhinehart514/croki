// Phase 6 — Promote (light). Proves a proven run becomes a repeatable motion with one light touch:
// carry-forward of what worked, deterministic cadence, rolling scorekeeping, and — the invariant that
// cannot bend — every re-run STOPS AT THE GATE (staged, pending), never sends, never re-composes.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  runStore,
  resultStore,
  repeatableMotionStore,
  learningStore,
  gtmPathStore,
} from "../src/gtm-store.mjs";
import {
  cadenceToMs,
  scoreForRun,
  promoteRun,
  motionDue,
  runMotionOnce,
  runDueMotions,
} from "../src/promote-motion.mjs";

function freshRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-promote-"));
  return { root };
}

// A wall-passing topology: source → gate → execute. The execute node is behind the gate on every path,
// so assertGateWall accepts it. This is what a proven run carries forward.
const GATED_STEPS = [
  { id: "src", category: "source", kind: "agent" },
  { id: "gate", category: "gate" },
  { id: "exec", category: "execute", connector: "stage-local" },
];
const GATED_EDGES = [
  { source: "src", target: "gate" },
  { source: "gate", target: "exec" },
];

// Stage a source run the way Phase 4 does: a path, a bound contract, gated steps, items with joinKeys.
// projectId is threaded through options (the store's scoping convention), so records and the scoped
// reads promoteRun/runDueMotions perform agree on the project.
function seedProvenRun(options, projectId = "strelva") {
  const scoped = { ...options, projectId };
  const p = gtmPathStore.create(
    { projectId, summary: "Cold outreach to dev-tool founders", bet: { offer: "free funnel teardown" } },
    scoped,
  );
  const run = runStore.create(
    {
      projectId,
      pathId: p.id,
      steps: GATED_STEPS,
      edges: GATED_EDGES,
      measurementContract: { outcomeKinds: ["reply", "meeting"], joinKey: "email", successCriteria: "a reply" },
      measurementContractId: "mc-1",
      items: [
        { joinKey: "k-1", channel: "email", buyer: "dana", draft: "Hi Dana" },
        { joinKey: "k-2", channel: "email", buyer: "sam", draft: "Hi Sam" },
      ],
      status: "staged",
      startedAt: "2026-06-01T00:00:00.000Z",
    },
    scoped,
  );
  // One real outcome joined back to item k-1, so the run has a score to carry forward.
  resultStore.create(
    { projectId, runId: run.id, pathId: p.id, joinKey: "k-1", channel: "email", outcomeKind: "reply" },
    scoped,
  );
  return { path: p, run, options: scoped };
}

describe("promote-motion — cadence parsing (open string, deterministic)", () => {
  it("maps named cadences and 'every N units'; unknown strings are manual (null)", () => {
    assert.equal(cadenceToMs("daily"), 24 * 60 * 60 * 1000);
    assert.equal(cadenceToMs("weekly"), 7 * 24 * 60 * 60 * 1000);
    assert.equal(cadenceToMs("every 3 days"), 3 * 24 * 60 * 60 * 1000);
    assert.equal(cadenceToMs("2 weeks"), 14 * 24 * 60 * 60 * 1000);
    assert.equal(cadenceToMs("48 hours"), 48 * 60 * 60 * 1000);
    // Open shape: an unrecognized cadence is never rejected — it is simply manual.
    assert.equal(cadenceToMs("whenever it feels right"), null);
    assert.equal(cadenceToMs(""), null);
    assert.equal(cadenceToMs(null), null);
  });
});

describe("promote-motion — scoreForRun (lookup, never judgment)", () => {
  it("folds real results into staged/measured/outcome counts", () => {
    const { run, options } = seedProvenRun(freshRoot());
    const score = scoreForRun(run, { projectId: "strelva", options });
    assert.equal(score.staged, 2);
    assert.equal(score.measured, 1);
    assert.deepEqual(score.outcomes, { reply: 1 });
  });
});

describe("promote-motion — promoteRun (the one light touch)", () => {
  it("wraps a proven run: carries the template forward, seeds score, arms the next run, logs the learning", () => {
    const { run, path: p, options } = seedProvenRun(freshRoot());
    const nowMs = Date.parse("2026-07-01T00:00:00.000Z");

    const { motion, learning } = promoteRun(run.id, { cadence: "weekly", nowMs }, options);

    // Light wrapper: source run + cadence + scorekeeping + next-run template — no composition authority.
    assert.equal(motion.sourceRunId, run.id);
    assert.equal(motion.cadence, "weekly");

    // Carry-forward of what worked: the template is the proven run's topology + bound contract + items,
    // with joinKeys stripped so re-runs mint fresh ones.
    assert.equal(motion.nextRunTemplate.pathId, p.id);
    assert.deepEqual(motion.nextRunTemplate.steps, GATED_STEPS);
    assert.equal(motion.nextRunTemplate.measurementContract.joinKey, "email");
    assert.equal(motion.nextRunTemplate.items.length, 2);
    assert.ok(!("joinKey" in motion.nextRunTemplate.items[0]), "template items drop the source joinKey");

    // Scorekeeping seeded with the source run's real score, flagged as the origin.
    assert.equal(motion.scorekeeping.runs.length, 1);
    assert.equal(motion.scorekeeping.runs[0].origin, true);
    assert.equal(motion.scorekeeping.runs[0].measured, 1);

    // The next re-run is armed one cadence out from now.
    assert.equal(motion.nextRunAt, new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString());

    // A Learning captured the promotion decision (§2.8).
    assert.equal(learning.structural.promotionDecision, "promoted");
    assert.equal(learning.identifying.pathId, p.id);
    const stored = learningStore.get(learning.id, options);
    assert.equal(stored.structural.runType, "repeatable-motion");
  });

  it("leaves a motion with an unparseable cadence MANUAL — it exists and keeps score but never arms", () => {
    const { run, options } = seedProvenRun(freshRoot());
    const { motion } = promoteRun(run.id, { cadence: "when I feel like it" }, options);
    assert.equal(motion.nextRunAt, null);
    assert.equal(motionDue(motion, Date.now() + 10 * 365 * 24 * 60 * 60 * 1000), false);
  });
});

describe("promote-motion — motionDue (deterministic scheduler check)", () => {
  it("is due only once the armed nextRunAt has arrived", () => {
    const { run, options } = seedProvenRun(freshRoot());
    const promoteAt = Date.parse("2026-07-01T00:00:00.000Z");
    const { motion } = promoteRun(run.id, { cadence: "weekly", nowMs: promoteAt }, options);

    assert.equal(motionDue(motion, promoteAt + 1000), false, "not due before the cadence elapses");
    assert.equal(motionDue(motion, promoteAt + 8 * 24 * 60 * 60 * 1000), true, "due after a week");
  });
});

describe("promote-motion — runMotionOnce (re-stage, THE WALL held)", () => {
  it("stages a fresh run at the founder gate, never sends, mints fresh joinKeys, and keeps score", () => {
    const { run: source, path: p, options } = seedProvenRun(freshRoot());
    const promoteAt = Date.parse("2026-07-01T00:00:00.000Z");
    const { motion } = promoteRun(source.id, { cadence: "weekly", nowMs: promoteAt }, options);

    const reAt = promoteAt + 8 * 24 * 60 * 60 * 1000;
    const { run: rerun, motion: updated, gate } = runMotionOnce(motion, { nowMs: reAt }, options);

    // THE WALL: the re-run STAGES at the gate — it never sends.
    assert.equal(rerun.status, "staged");
    assert.equal(rerun.gateState.status, "pending");
    assert.notEqual(rerun.id, source.id, "a re-run is a distinct run");
    assert.equal(rerun.pathId, p.id);

    // Fresh joinKeys, so the re-run's results never collide with the source run's.
    const sourceKeys = new Set(source.items.map((i) => i.joinKey));
    for (const item of rerun.items) {
      assert.ok(item.joinKey, "every re-run item is joinable");
      assert.ok(!sourceKeys.has(item.joinKey), "re-run joinKeys are fresh, not the source's");
    }

    // The gate review renders the staged items — the founder still decides.
    assert.equal(gate.status, "pending");
    assert.equal(gate.awaitingReview, 2);

    // Scorekeeping grew by one, and the next cadence is re-armed from now.
    assert.equal(updated.scorekeeping.runs.length, 2);
    assert.equal(updated.scorekeeping.runs[1].origin, false);
    assert.equal(updated.nextRunAt, new Date(reAt + 7 * 24 * 60 * 60 * 1000).toISOString());
  });
});

describe("promote-motion — runDueMotions (the scheduler seam wired to a real caller)", () => {
  it("re-stages only the due motions and leaves the source runs alone", () => {
    const root = freshRoot();
    const { run: r1, options } = seedProvenRun(root, "strelva");
    const { run: r2 } = seedProvenRun(root, "strelva");
    const promoteAt = Date.parse("2026-07-01T00:00:00.000Z");
    promoteRun(r1.id, { cadence: "weekly", nowMs: promoteAt }, options);
    promoteRun(r2.id, { cadence: "manual-only-string", nowMs: promoteAt }, options); // manual: never fires

    const runsBefore = runStore.list(options).length;
    const staged = runDueMotions({ ...options, nowMs: promoteAt + 8 * 24 * 60 * 60 * 1000 });

    assert.equal(staged.length, 1, "only the weekly motion is due; the manual one never fires");
    const runsAfter = runStore.list(options);
    assert.equal(runsAfter.length, runsBefore + 1, "exactly one fresh run staged");
    // The staged run is pending at the gate — the wall holds through the scheduler.
    const fresh = runStore.get(staged[0].runId, options);
    assert.equal(fresh.status, "staged");
    assert.equal(fresh.gateState.status, "pending");
  });

  it("skips a motion whose carried-forward topology would fail the wall — never stages an ungated send", () => {
    const { run, options } = seedProvenRun(freshRoot());
    const promoteAt = Date.parse("2026-07-01T00:00:00.000Z");
    const { motion } = promoteRun(run.id, { cadence: "weekly", nowMs: promoteAt }, options);

    // Corrupt the template to an ungated execute node (an execute with no gate upstream), then persist.
    const broken = repeatableMotionStore.save(
      {
        ...motion,
        nextRunTemplate: {
          ...motion.nextRunTemplate,
          steps: [{ id: "exec", category: "execute", connector: "gmail" }],
          edges: [],
        },
      },
      options,
    );
    assert.equal(broken.nextRunTemplate.steps.length, 1);

    const before = runStore.list(options).length;
    const staged = runDueMotions({ ...options, nowMs: promoteAt + 8 * 24 * 60 * 60 * 1000 });
    assert.equal(staged.length, 0, "a wall-failing motion is skipped, not staged");
    assert.equal(runStore.list(options).length, before, "no run was staged");

    // Direct call surfaces the wall refusal loudly.
    assert.throws(() => runMotionOnce(broken, { nowMs: promoteAt }, options), /gate/i);
  });
});
