import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { beginActiveDrive, noteDriveBeat } from "../../src/firm/active-drives.mjs";
import { createBet } from "../../src/firm/bet.mjs";
import { buildLens } from "../../src/firm/lens.mjs";
import {
  machineryCountsForBet,
  projectBetWorkflow,
  workflowStageIdForEvent,
} from "../../src/firm/workflow-projection.mjs";
import { appendEvent, completeEventReceipt } from "../../src/firm/work-loop-tools.mjs";
import { driveTeammate } from "../../src/firm/work-loop.mjs";
import {
  createVenture,
  exportVenture,
  getVentureDoc,
  importVenture,
  setVentureDoc,
} from "../../src/firm/venture-store.mjs";

function root(prefix = "drover-workflow-") {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), prefix)) };
}

describe("derived bet workflow", () => {
  it("orders real records, keeps receipt absence honest, and never stores the projection", () => {
    const bet = {
      ...createBet({
        id: "bet-workflow",
        ventureId: "venture-workflow",
        intent: "Learn from a real release",
        teammateRef: "sable",
        createdAt: "2026-07-15T10:00:00.000Z",
      }),
      events: [
        { id: "event-tool", type: "tool_started", detail: "read_truth", at: "2026-07-15T10:01:00.000Z", stepIndex: 1, durationMs: 24 },
        { id: "event-text", type: "text", detail: "Repository truth found.", at: "2026-07-15T10:02:00.000Z", stepIndex: 1 },
        { id: "event-drive", type: "drive_receipt", detail: "Claude", at: "2026-07-15T10:03:00.000Z", stepIndex: 1, durationMs: 1800, costUsd: 0.08 },
      ],
      staged: [{ id: "work-one", title: "Founder note", ownerRefs: ["sable"], stagedAt: "2026-07-15T10:04:00.000Z" }],
    };
    const released = {
      id: "wall-released", betId: bet.id, workRef: "work-one", purpose: "release",
      parkedAt: "2026-07-15T10:05:00.000Z", decision: "release", decidedAt: "2026-07-15T10:06:00.000Z",
    };
    const pending = {
      id: "wall-pending", betId: bet.id, purpose: "answer",
      parkedAt: "2026-07-15T10:07:00.000Z", decision: null,
    };
    const outcome = {
      id: "outcome-one", betId: bet.id, body: "A real reply", observedAt: "2026-07-15T10:08:00.000Z",
    };

    const projection = projectBetWorkflow(bet, {
      wallItems: [released, pending],
      outcomes: [outcome],
      campaigns: [{ governingBetId: bet.id, measurement: { window: "14 days" } }],
    });

    assert.deepEqual(projection.stages.map((stage) => stage.kind), [
      "opened", "event", "event", "event", "staged", "gate", "gate", "outcome",
    ]);
    assert.equal(projection.stages.find((stage) => stage.id.endsWith("wall-released")).state, "done");
    assert.equal(projection.stages.find((stage) => stage.id.endsWith("wall-pending")).state, "gate");
    assert.equal(projection.stages.find((stage) => stage.eventId === "event-tool").durationMs, 24);
    const costSilentBeat = projection.stages.find((stage) => stage.eventId === "event-text");
    assert.equal("durationMs" in costSilentBeat, false);
    assert.equal("costUsd" in costSilentBeat, false);
    assert.equal(projection.stages.find((stage) => stage.eventId === "event-drive").costUsd, 0.08);
    assert.equal(projection.measurementWindow, "14 days");
    assert.deepEqual(projection.counts, machineryCountsForBet(bet, { wallItems: [released, pending], outcomes: [outcome] }));
    assert.equal("workflow" in bet, false);
    assert.equal("stage" in bet, false);
    assert.equal("status" in bet, false);
    assert.equal("kind" in bet, false);
  });

  it("mints stable event ids, completes only measured duration, and round-trips receipts", () => {
    const source = root();
    const venture = createVenture({ name: "Portable workflow" }, source);
    const bet = createBet({ ventureId: venture.id, intent: "Measure real work", teammateRef: "mika" });
    setVentureDoc(venture.id, "bets", bet.id, bet, source);

    const event = appendEvent(venture.id, bet.id, { type: "tool_started", detail: "read_truth", stepIndex: 2 }, source);
    assert.match(event.id, /^event-/);
    assert.equal(workflowStageIdForEvent(bet.id, event), workflowStageIdForEvent(bet.id, event));
    completeEventReceipt(venture.id, bet.id, event.id, { durationMs: 12.5, costUsd: 9 }, source);
    const stored = getVentureDoc(venture.id, "bets", bet.id, source).events[0];
    assert.equal(stored.durationMs, 12.5);
    assert.equal("costUsd" in stored, false, "tool receipt cannot claim cost its seam does not measure");

    const destination = root("drover-workflow-import-");
    importVenture(exportVenture(venture.id, source), destination);
    assert.deepEqual(getVentureDoc(venture.id, "bets", bet.id, destination).events, [stored]);
  });

  it("records local tool duration and only an adapter-reported attributable drive cost", async () => {
    const options = root();
    const venture = createVenture({ name: "Honest runtime receipts" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "Measure this drive", teammateRef: "sable" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);
    let tick = 0;
    const reportingRuntime = {
      id: "reporting-runtime",
      label: "Reporting runtime",
      supportsAbort: false,
      costReporting: "usd",
      async drive(ctx) {
        ctx.onTurn();
        ctx.onToolStart("get_firm_configuration");
        await ctx.runTool({ name: "get_firm_configuration", input: {} });
        ctx.onCost(0.17);
        return { kind: "completed", summary: "measured" };
      },
    };
    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "sable",
      betId: bet.id,
      goal: "Measure",
      options,
      deps: { runtime: reportingRuntime, monotonicNow: () => (tick += 5) },
    });
    const reportedEvents = getVentureDoc(venture.id, "bets", bet.id, options).events;
    const tool = reportedEvents.find((event) => event.type === "tool_started");
    const drive = reportedEvents.find((event) => event.type === "drive_receipt");
    assert.equal(tool.stepIndex, 1);
    assert.equal(tool.durationMs, 5);
    assert.equal(drive.costUsd, 0.17);
    assert.ok(drive.durationMs >= tool.durationMs);

    const silentOptions = root("drover-workflow-silent-");
    const silentVenture = createVenture({ name: "Cost silent runtime" }, silentOptions);
    const silentBet = createBet({ ventureId: silentVenture.id, intent: "Do not infer cost", teammateRef: "mika" });
    setVentureDoc(silentVenture.id, "bets", silentBet.id, silentBet, silentOptions);
    const silentRuntime = {
      id: "silent-runtime",
      label: "Silent runtime",
      supportsAbort: false,
      costReporting: null,
      async drive(ctx) {
        ctx.onTurn();
        ctx.onText("Done without a provider cost receipt.");
        return { kind: "completed", summary: "silent" };
      },
    };
    await driveTeammate({
      ventureId: silentVenture.id,
      teammateRef: "mika",
      betId: silentBet.id,
      goal: "Stay honest",
      options: silentOptions,
      deps: { runtime: silentRuntime },
    });
    const silentReceipt = getVentureDoc(silentVenture.id, "bets", silentBet.id, silentOptions)
      .events.find((event) => event.type === "drive_receipt");
    assert.equal("costUsd" in silentReceipt, false);
  });

  it("joins one live drive to the exact projected event stage and drops presence on finish", () => {
    const options = root();
    const venture = createVenture({ name: "Live workflow presence" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "Show exact live work", teammateRef: "sable" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);
    const event = appendEvent(venture.id, bet.id, { type: "text", detail: "Inspecting the offer", stepIndex: 1 }, options);
    const currentStageId = workflowStageIdForEvent(bet.id, event);
    const drive = beginActiveDrive({
      ventureId: venture.id,
      teammateRef: "sable",
      betId: bet.id,
      runtime: "test",
      abortSupported: false,
    });
    noteDriveBeat(drive.id, { currentStageId, at: "2026-07-15T12:00:00.000Z" });

    const liveStage = buildLens(venture.id, options).bets[0].workflow.find((stage) => stage.id === currentStageId);
    assert.equal(liveStage.state, "running");
    assert.equal(liveStage.runningTeammateRef, "sable");
    assert.equal(liveStage.since, "2026-07-15T12:00:00.000Z");

    drive.finish();
    const after = buildLens(venture.id, options).bets[0].workflow.find((stage) => stage.id === currentStageId);
    assert.equal(after.state, "done");
    assert.equal("runningTeammateRef" in after, false);
    assert.equal(getVentureDoc(venture.id, "bets", bet.id, options).currentStageId, undefined);
  });
});
