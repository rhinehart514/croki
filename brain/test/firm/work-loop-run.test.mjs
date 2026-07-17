// work-loop-run.test.mjs — the durable Run lifecycle wired into a live founder-authorized drive.
//
// A founder (or agent-continued) drive mints a canonical run joined to the venture root Thread BEFORE
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
import { createVenture, setVentureDoc } from "../../src/firm/venture-store.mjs";
import { createBet } from "../../src/firm/bet.mjs";
import { getSemanticModel } from "../../src/firm/semantic-model-store.mjs";
import { ROOT_THREAD_ID } from "../../src/firm/thread.mjs";

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

function runsFor(ventureId, options) {
  return getSemanticModel(ventureId, options).runs;
}

describe("durable Run lifecycle on a founder-authorized drive", () => {
  it("a founder-initiated betless drive records a betless run joined to the root thread, completed at terminal", async () => {
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
    assert.equal(run.threadRef, `thread:${ROOT_THREAD_ID}`, "the run joins the venture root thread");
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
});
