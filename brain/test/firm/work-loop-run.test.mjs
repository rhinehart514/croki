// work-loop-run.test.mjs — the durable Run lifecycle wired into a live founder-authorized drive.
//
// A founder (or agent-continued) drive mints a canonical run joined to a child direction Thread BEFORE
// provider dispatch and completes it after a terminal outcome, so founder intent → run → returned evidence
// is inspectable history. The whole point of the seam is that it is FAIL-SAFE: a run-recording error must
// never abort or change a drive. These tests drive the real work loop through the fake-client injection
// convention work-loop.test.mjs uses, and read the run back through the atlas.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { driveTeammate } from "../../src/firm/work-loop.mjs";
import { beginDriveRun, finishDriveRun, findReceiptForRun } from "../../src/firm/work-loop-run.mjs";
import { createVenture, setVentureDoc, exportVenture, importVenture } from "../../src/firm/venture-store.mjs";
import { createBet } from "../../src/firm/bet.mjs";
import { getSemanticModel } from "../../src/firm/semantic-model-store.mjs";
import { projectExecutionTrail } from "../../src/firm/workflow-execution-receipt.mjs";
import { park, decide } from "../../src/firm/wall.mjs";
import { founderRequest } from "../helpers/founder-capability.mjs";
import { ROOT_THREAD_ID } from "../../src/firm/thread.mjs";
import { applyArchitectureMutations } from "../../src/firm/architecture.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-work-loop-run-")), seedFoundingCrew: false };
}

function completingRuntime(summary = "done") {
  return {
    id: "run-lifecycle-runtime",
    label: "Run lifecycle runtime",
    async drive() { return { kind: "completed", summary }; },
  };
}

function cancellingRuntime(summary = "Stopped by the founder.") {
  return {
    id: "cancelling-runtime",
    label: "Cancelling runtime",
    async drive() { return { kind: "cancelled", summary }; },
  };
}

function runsFor(ventureId, options) {
  return getSemanticModel(ventureId, options).runs;
}

function receiptFor(ventureId, runId, options) {
  // Join by receipt.runRef, never by storage key: the receipt is stored under its own content-addressed
  // .id, so a key lookup by runId would miss (and, post-transfer, always miss).
  return findReceiptForRun(ventureId, runId, options);
}

describe("durable Run lifecycle on a founder-authorized drive", () => {
  it("a founder-initiated betless drive records a betless run on its own direction thread, completed at terminal", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Betless run" }, options);

    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "founding-teammate",
      goal: "Explore the opening",
      initiatedBy: "founder",
      options,
      deps: { runtime: completingRuntime() },
    });

    const model = getSemanticModel(venture.id, options);
    assert.equal(model.threads.filter((t) => t.id === ROOT_THREAD_ID).length, 1, "the root thread formed exactly once");
    assert.equal(model.runs.length, 1, "one run was recorded");
    const run = model.runs[0];
    assert.notEqual(run.threadRef, `thread:${ROOT_THREAD_ID}`, "the root organizes work but never owns a direction run");
    const direction = model.threads.find((thread) => `thread:${thread.id}` === run.threadRef);
    assert.equal(direction.parentThreadRef, `thread:${ROOT_THREAD_ID}`);
    assert.equal(direction.name, "Explore the opening", "the durable identity keeps the founder's words");
    assert.deepEqual(run.betRefs, [], "a betless drive records a betless run");
    assert.ok(run.completedAt, "a terminal drive completes its run");
    assert.equal("status" in run, false, "a run never carries running state");
    // originMessageRef is the founder direction the loop recorded for this drive.
    assert.ok(String(run.originMessageRef ?? "").startsWith("conversation:"), "the run joins the initiating founder message");
  });

  it("a founder-initiated bet drive records a single-bet run", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Single-bet run" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "advance the bet", teammateRef: "founding-teammate" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);

    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "founding-teammate",
      goal: "Push this forward",
      betId: bet.id,
      initiatedBy: "founder",
      options,
      deps: { runtime: completingRuntime() },
    });

    const runs = runsFor(venture.id, options);
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0].betRefs, [`bet:${bet.id}`], "a bet drive records a single-bet run");
    assert.ok(runs[0].completedAt);
  });

  it("an architecture-scoped founder thought becomes a durable thread beneath that venture object", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Object-scoped thought" }, options);
    const architecture = applyArchitectureMutations({
      ventureId: venture.id,
      baseRevision: 0,
      operations: [{ op: "create-element", element: {
        id: "loop-onboarding", role: "product-loop", name: "Onboarding", actor: "Founder", entry: "First open",
        value: "Useful first result", intendedChange: "Founder trusts Croki", steps: [{ id: "first-direction", label: "Give a direction" }],
      } }],
      actor: { authority: "founder", id: "jacob" },
    }, options);

    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "founding-teammate",
      goal: "Remove every setup step that is not essential",
      initiatedBy: "founder",
      target: { architectureId: "loop-onboarding", architectureRevision: architecture.revision },
      options,
      deps: { runtime: completingRuntime() },
    });

    const model = getSemanticModel(venture.id, options);
    const direction = model.threads.find((thread) => thread.id !== ROOT_THREAD_ID);
    assert.ok(direction);
    assert.deepEqual(direction.subjectRefs, ["architecture:loop-onboarding"]);

    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "founding-teammate",
      goal: "Continue that exact onboarding thought",
      initiatedBy: "founder",
      target: {
        threadRef: `thread:${direction.id}`,
        architectureId: "loop-onboarding",
        architectureRevision: architecture.revision,
      },
      options,
      deps: { runtime: completingRuntime() },
    });
    const continued = getSemanticModel(venture.id, options);
    assert.equal(continued.threads.filter((thread) => thread.id !== ROOT_THREAD_ID).length, 1, "continuation does not mint a sibling thought");
    assert.equal(continued.runs.filter((run) => run.threadRef === `thread:${direction.id}`).length, 2);
  });

  it("later work on the same bet resumes its stable direction thread", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Stable direction" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "advance the bet", teammateRef: "founding-teammate" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);

    for (const goal of ["Make the first pass", "Continue from the result"]) {
      await driveTeammate({
        ventureId: venture.id,
        teammateRef: "founding-teammate",
        goal,
        betId: bet.id,
        initiatedBy: "founder",
        options,
        deps: { runtime: completingRuntime() },
      });
    }

    const model = getSemanticModel(venture.id, options);
    assert.equal(new Set(model.runs.map((run) => run.threadRef)).size, 1, "both runs resume one addressable work item");
    const childThreads = model.threads.filter((thread) => thread.id !== ROOT_THREAD_ID);
    assert.equal(childThreads.length, 1);
    assert.equal(childThreads[0].messageRefs.filter((ref) => ref.startsWith("conversation:")).length >= 2, true);
  });

  it("a run-recording failure NEVER aborts the drive — the drive still returns and the world is unchanged", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Fail-safe run recording" }, options);

    // A caller that says it already recorded the direction (recordInitiation:false) but hands an
    // originMessageRef that does not exist forces the atlas ref-existence check to fail closed inside
    // recordRun. The fail-safe must swallow that and let the drive complete untouched.
    const result = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "founding-teammate",
      goal: "Proceed despite a broken recorder",
      initiatedBy: "founder",
      recordInitiation: false,
      originMessageRef: "conversation:does-not-exist",
      options,
      deps: { runtime: completingRuntime("still done") },
    });

    assert.equal(result.outcome.kind, "completed", "the drive still returned its real terminal outcome");
    assert.equal(runsFor(venture.id, options).length, 0, "the failed run recording left no partial run");
  });

  it("an interrupted drive leaves its run historical-unknown — created but never falsely completed", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Interrupted run" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "interrupted work", teammateRef: "founding-teammate" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);

    const throwingRuntime = {
      id: "throwing-runtime",
      label: "Throwing runtime",
      async drive() { throw new Error("provider crashed mid-drive"); },
    };

    await assert.rejects(() => driveTeammate({
      ventureId: venture.id,
      teammateRef: "founding-teammate",
      goal: "This will crash",
      betId: bet.id,
      initiatedBy: "founder",
      options,
      deps: { runtime: throwingRuntime },
    }), /provider crashed mid-drive/);

    const runs = runsFor(venture.id, options);
    assert.equal(runs.length, 1, "the run was created before dispatch");
    assert.equal(runs[0].completedAt, null, "an interrupted drive never falsely completes its run");
    assert.equal("status" in runs[0], false, "still no running state — historical-unknown, never failed/done");
  });

  it("a legacy/ambient drive (not founder-authorized) is NOT backfilled — no run is recorded", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "No backfill" }, options);

    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "founding-teammate",
      goal: "An ambient drive with no founder lineage",
      // initiatedBy left null: Law 1 — only a founder-initiated drive records a run.
      options,
      deps: { runtime: completingRuntime() },
    });

    assert.equal(runsFor(venture.id, options).length, 0, "a non-founder drive records no run");
    assert.equal(getSemanticModel(venture.id, options).threads.length, 0, "and forms no root thread");
  });

  it("a completed bet drive persists a settlement receipt — the execution trail reports the REAL terminal, not 'unknown'", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Persisted receipt" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "settle this", teammateRef: "founding-teammate" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);

    const result = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "founding-teammate",
      goal: "Finish the bet",
      betId: bet.id,
      initiatedBy: "founder",
      options,
      deps: { runtime: completingRuntime() },
    });

    const run = runsFor(venture.id, options)[0];
    const receipt = receiptFor(venture.id, run.id, options);
    assert.ok(receipt, "the minted receipt was actually persisted, not discarded");
    assert.equal(receipt.runRef, `run:${run.id}`, "the receipt is keyed to its run");
    assert.equal(receipt.betRef, `bet:${bet.id}`, "the receipt joins the bet");

    const trail = projectExecutionTrail(run, receipt);
    assert.equal(trail.state, "completed", "the trail reports the real terminal, never a dead 'unknown'");
    assert.notEqual(trail.state, "unknown");
    // Sanity: the very same run with no persisted receipt would have degraded to unknown.
    assert.equal(projectExecutionTrail(run).state, "unknown");
    assert.equal(result.outcome.kind, "completed");
  });

  it("a founder-CANCELLED drive is durably distinguishable from a completed one — the terminal KIND is recorded", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Cancelled vs completed" }, options);

    const completedBet = createBet({ ventureId: venture.id, intent: "runs to completion", teammateRef: "founding-teammate" });
    setVentureDoc(venture.id, "bets", completedBet.id, completedBet, options);
    const cancelledBet = createBet({ ventureId: venture.id, intent: "founder stops it", teammateRef: "founding-teammate" });
    setVentureDoc(venture.id, "bets", cancelledBet.id, cancelledBet, options);

    await driveTeammate({
      ventureId: venture.id, teammateRef: "founding-teammate", goal: "Complete",
      betId: completedBet.id, initiatedBy: "founder", options,
      deps: { runtime: completingRuntime() },
    });
    await driveTeammate({
      ventureId: venture.id, teammateRef: "founding-teammate", goal: "Cancel",
      betId: cancelledBet.id, initiatedBy: "founder", options,
      deps: { runtime: cancellingRuntime() },
    });

    const runs = runsFor(venture.id, options);
    const completedRun = runs.find((r) => r.betRefs.includes(`bet:${completedBet.id}`));
    const cancelledRun = runs.find((r) => r.betRefs.includes(`bet:${cancelledBet.id}`));

    // Both runs carry a completedAt (both reached finishDriveRun): the run record alone cannot tell them
    // apart. The persisted receipt's terminal kind is what makes cancelled honest.
    assert.ok(completedRun.completedAt);
    assert.ok(cancelledRun.completedAt);

    const completedTrail = projectExecutionTrail(completedRun, receiptFor(venture.id, completedRun.id, options));
    const cancelledTrail = projectExecutionTrail(cancelledRun, receiptFor(venture.id, cancelledRun.id, options));
    assert.equal(completedTrail.state, "completed");
    assert.equal(cancelledTrail.state, "cancelled", "a founder-cancelled drive is NOT indistinguishable from a completion");
    assert.notEqual(cancelledTrail.state, completedTrail.state);
  });

  it("a BETLESS founder-cancelled drive is durably distinguishable from a betless completed drive", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Betless cancelled vs completed" }, options);

    // Two betless founder drives (exploration / working-theory), one completed and one founder-cancelled.
    await driveTeammate({
      ventureId: venture.id, teammateRef: "founding-teammate", goal: "Explore and finish",
      initiatedBy: "founder", options,
      deps: { runtime: completingRuntime() },
    });
    await driveTeammate({
      ventureId: venture.id, teammateRef: "founding-teammate", goal: "Explore then stop",
      initiatedBy: "founder", options,
      deps: { runtime: cancellingRuntime() },
    });

    const runs = runsFor(venture.id, options);
    assert.equal(runs.length, 2, "two betless runs were recorded");
    for (const run of runs) {
      assert.deepEqual(run.betRefs, [], "both runs are betless");
      assert.ok(run.completedAt, "both betless runs reached finishDriveRun");
    }

    // The run records alone cannot tell them apart (both completedAt-set, both betless). The persisted
    // terminal receipt's KIND is what keeps a betless cancelled honest against a betless completion.
    const receipts = runs.map((run) => receiptFor(venture.id, run.id, options));
    for (const receipt of receipts) {
      assert.ok(receipt, "a betless drive persists a terminal receipt too");
      assert.equal(receipt.betRef, null, "the betless receipt carries no bet ref");
    }
    const states = runs.map((run) => projectExecutionTrail(run, receiptFor(venture.id, run.id, options)).state).sort();
    assert.deepEqual(states, ["cancelled", "completed"], "betless cancelled != betless completed post-hoc");
  });

  it("a wall item DECIDED by the founder during the drive is joined to the run's decisionRefs", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Decided-during-drive join" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "drive with a live decision", teammateRef: "founding-teammate" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);

    // Park a pending item BEFORE the drive begins. It is undecided at the before-snapshot.
    const parked = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "send", message: "hi", recipients: ["a@x.com"] } }, options);

    // The founder decides it DURING the drive window (reject touches nothing outward, needs no executor or
    // presence). A pending-only diff would drop it from both snapshots; the full-collection diff catches it.
    const decidingRuntime = {
      id: "deciding-runtime",
      label: "Deciding runtime",
      async drive() {
        decide({ ventureId: venture.id, itemId: parked.id, decision: "reject" }, { req: founderRequest() }, {}, options);
        return { kind: "completed", summary: "done" };
      },
    };

    await driveTeammate({
      ventureId: venture.id, teammateRef: "founding-teammate", goal: "Decide mid-drive",
      betId: bet.id, initiatedBy: "founder", options,
      deps: { runtime: decidingRuntime },
    });

    const run = runsFor(venture.id, options)[0];
    assert.ok(run.decisionRefs.includes(`decision:${parked.id}`), "the item decided during the drive is joined to the run");
    const receipt = receiptFor(venture.id, run.id, options);
    assert.ok(receipt.decisionRefs.includes(`decision:${parked.id}`), "and the receipt carries the same decision join");
  });

  it("finishDriveRun is FAIL-SAFE — a finish/receipt-seam error degrades to null and persists no partial receipt", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Fail-safe finish seam" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "finish may fail", teammateRef: "founding-teammate" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);

    // A handle whose run was never recorded forces completeDriveRun (the first step of the finish seam, which
    // also guards the receipt mint + PERSIST that follows it in the same try/catch) to throw "No such run".
    // The fail-safe must swallow it: return null and leave no partial receipt — historical-unknown, never an
    // abort and never a half-written settlement.
    const handle = { ventureId: venture.id, runId: "run-never-recorded", betId: bet.id, options };
    let settled;
    assert.doesNotThrow(() => {
      settled = finishDriveRun(handle, { outcome: { kind: "completed" }, beforeWallItems: [], afterWallItems: [] });
    }, "a finish-seam error never propagates");
    assert.equal(settled, null, "the finish seam degraded honestly to null");
    assert.equal(receiptFor(venture.id, "run-never-recorded", options), null, "no partial receipt was persisted");

    // And when the seam is healthy, the same call DOES persist a receipt — proving the null above is the
    // failure path, not a dead no-op.
    const goodHandle = beginDriveRun({ ventureId: venture.id, runId: "run-healthy", initiatedBy: "founder", betId: bet.id, options });
    const ok = finishDriveRun(goodHandle, { outcome: { kind: "completed" }, beforeWallItems: [], afterWallItems: [] });
    assert.ok(ok?.receipt, "a healthy finish mints a receipt");
    assert.ok(receiptFor(venture.id, "run-healthy", options), "a healthy finish persists the receipt");
  });

  it("a transferred run's execution trail reports its real terminal, not 'unknown' — the receipt survives export/import", async () => {
    const options = freshRoot();
    const repository = fs.mkdtempSync(path.join(os.tmpdir(), "firm-run-transfer-repo-"));
    const venture = createVenture({ name: "Run transfer", repository }, options);
    const bet = createBet({ ventureId: venture.id, intent: "settle then transfer", teammateRef: "founding-teammate" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);

    // A real founder drive mints and persists the settlement receipt on the source machine.
    await driveTeammate({
      ventureId: venture.id, teammateRef: "founding-teammate", goal: "Finish the bet",
      betId: bet.id, initiatedBy: "founder", options,
      deps: { runtime: cancellingRuntime() },
    });
    const sourceRun = runsFor(venture.id, options)[0];
    assert.equal(projectExecutionTrail(sourceRun, receiptFor(venture.id, sourceRun.id, options)).state, "cancelled");

    // Move the whole venture to another machine (fresh product home) via the export/import bundle. The
    // receipt is re-keyed to its own .id on import — the drift that used to lose it when it was keyed by runId.
    const bundle = exportVenture(venture.id, options);
    const destination = { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-run-transfer-dest-")) };
    importVenture(bundle, { ...destination, repository });

    // The transferred run resolves its receipt by runRef and reports the REAL terminal, never a dead 'unknown'.
    const movedReceipt = receiptFor(venture.id, sourceRun.id, destination);
    assert.ok(movedReceipt, "the receipt survived the transfer and is still joinable by runRef");
    const movedTrail = projectExecutionTrail(sourceRun, movedReceipt);
    assert.equal(movedTrail.state, "cancelled", "the transferred trail reports the real terminal");
    assert.notEqual(movedTrail.state, "unknown");
  });
});
