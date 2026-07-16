// The drive's narrow measurement seam: stable event identities, local tool elapsed time, one honest
// drive receipt, and the volatile current-stage pointer. It owns no execution or venture state.

import { appendEvent, completeEventReceipt } from "./work-loop-tools.mjs";
import { noteDriveBeat } from "./active-drives.mjs";
import { workflowStageIdForEvent } from "./workflow-projection.mjs";

export function createWorkLoopReceipts({
  ventureId,
  betId,
  activeDriveId,
  adapter,
  options,
  stepIndex,
  monotonicNow = () => performance.now(),
}) {
  const driveStartedAt = monotonicNow();
  const pendingTools = new Map();
  let didReportCost = false;
  let reportedCostUsd = 0;

  function record(event) {
    const stored = appendEvent(ventureId, betId, { ...event, stepIndex: stepIndex() }, options);
    if (stored) {
      noteDriveBeat(activeDriveId, {
        currentStageId: workflowStageIdForEvent(betId, stored),
        at: stored.at,
      });
    }
    return stored;
  }

  return {
    record,
    noteCost(usd) {
      const amount = Number(usd);
      if (adapter.costReporting !== "usd" || !Number.isFinite(amount) || amount < 0) return;
      didReportCost = true;
      reportedCostUsd += amount;
    },
    startTool(name) {
      const event = record({ type: "tool_started", detail: name });
      if (!event) return;
      const pending = pendingTools.get(name) ?? [];
      pending.push({ eventId: event.id, startedAt: monotonicNow() });
      pendingTools.set(name, pending);
    },
    takeTool(name) {
      const pending = pendingTools.get(name) ?? [];
      const receipt = pending.shift() ?? null;
      pendingTools.set(name, pending);
      return receipt;
    },
    completeTool(receipt) {
      if (!receipt) return;
      completeEventReceipt(
        ventureId,
        betId,
        receipt.eventId,
        { durationMs: Math.max(0, monotonicNow() - receipt.startedAt) },
        options,
      );
    },
    finishDrive() {
      appendEvent(ventureId, betId, {
        type: "drive_receipt",
        detail: adapter.label,
        stepIndex: stepIndex(),
        durationMs: Math.max(0, monotonicNow() - driveStartedAt),
        ...(didReportCost ? { costUsd: reportedCostUsd } : {}),
      }, options);
    },
  };
}
