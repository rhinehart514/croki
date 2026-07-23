// The drive's narrow measurement seam: stable event identities, local tool elapsed time, one honest
// drive receipt, and the volatile current-stage pointer. It owns no execution or venture state.

import { appendEvent, completeEventReceipt } from "./work-loop-tools.mjs";
import { noteDriveBeat } from "./active-drives.mjs";
import { workflowStageIdForEvent } from "./workflow-projection.mjs";

const TOOL_ACTIVITY = {
  read_truth: "Reading venture truth",
  search_repository: "Searching the repository",
  read_repository_excerpt: "Reading source evidence",
  get_firm_configuration: "Checking venture configuration",
  get_taste: "Checking venture taste",
  read_venture_architecture: "Reading the venture model",
  record_working_theory: "Updating venture understanding",
  propose_architecture_change: "Preparing a venture-model proposal",
  fork_bet: "Opening an approach",
  stage_artifact: "Preparing a visual artifact",
  stage_outward: "Preparing founder review",
  ask_founder: "Preparing a question",
  speak: "Preparing an update",
  involve_participant: "Involving another participant",
};

function activityFor(event) {
  if (event?.type === "tool_started") return TOOL_ACTIVITY[event.detail] ?? `Using ${String(event.detail ?? "a tool").replaceAll("_", " ")}`;
  if (event?.type === "tool_failed") return "A work step needs attention";
  if (event?.type === "text") return "Preparing the return";
  return "Working through the direction";
}

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
  let didReportUsage = false;
  const reportedUsage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };

  function record(event) {
    const stored = appendEvent(ventureId, betId, { ...event, stepIndex: stepIndex() }, options);
    noteDriveBeat(activeDriveId, {
      ...(stored ? { currentStageId: workflowStageIdForEvent(betId, stored) } : {}),
      activity: activityFor(event),
      at: stored?.at,
    });
    return stored;
  }

  return {
    record,
    beat(activity) {
      noteDriveBeat(activeDriveId, { activity });
    },
    noteCost(usd) {
      const amount = Number(usd);
      if (adapter.costReporting !== "usd" || !Number.isFinite(amount) || amount < 0) return;
      didReportCost = true;
      reportedCostUsd += amount;
    },
    // Token usage the adapter measured from its own result message. Only fields the SDK actually
    // reported accumulate; a drive that reports nothing leaves no usage on its receipt.
    noteUsage(usage) {
      if (!usage || typeof usage !== "object") return;
      for (const key of Object.keys(reportedUsage)) {
        const amount = Number(usage[key]);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        didReportUsage = true;
        reportedUsage[key] += amount;
      }
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
        ...(didReportUsage ? { usage: { ...reportedUsage } } : {}),
      }, options);
    },
  };
}
