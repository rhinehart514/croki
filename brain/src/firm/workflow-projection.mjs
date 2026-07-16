// workflow-projection.mjs — a read-only workflow view over records the firm already owns.
// It deliberately stores no lifecycle on a bet: stages are reconstructed from events, staged work,
// founder-wall decisions, outcomes, and the process-local active-drive registry on every read.

import crypto from "node:crypto";

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function finiteReceipt(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function legacyEventRef(event) {
  return `legacy-${crypto.createHash("sha256").update(JSON.stringify([
    event?.type ?? null,
    event?.detail ?? null,
    event?.at ?? null,
    event?.stepIndex ?? null,
  ])).digest("hex").slice(0, 16)}`;
}

export function workflowStageId(betId, source, ref) {
  return `${betId}:${source}:${ref}`;
}

export function workflowStageIdForEvent(betId, event) {
  return workflowStageId(betId, "event", trimOrNull(event?.id) ?? legacyEventRef(event));
}

function eventLabel(event) {
  const detail = trimOrNull(event?.detail);
  if (event?.type === "tool_started") return detail ? `Run ${detail}` : "Run tool";
  if (event?.type === "tool_failed") return detail ? `Tool stopped · ${detail}` : "Tool stopped";
  if (event?.type === "drive_receipt") return detail ?? "Drive receipt";
  return detail ?? String(event?.type ?? "Event").replaceAll("_", " ");
}

function artifactLabel(artifact, index) {
  return trimOrNull(artifact?.title)
    ?? trimOrNull(artifact?.summary)
    ?? trimOrNull(artifact?.path)
    ?? `Staged work ${index + 1}`;
}

function wallLabel(item) {
  return ({
    release: "Release",
    answer: "Answer",
    "review-outcome": "Review outcome",
    "end-bet": "End bet",
  })[item?.purpose] ?? "Founder decision";
}

function receiptFields(source) {
  const durationMs = finiteReceipt(source?.durationMs);
  const costUsd = finiteReceipt(source?.costUsd);
  return {
    ...(durationMs == null ? {} : { durationMs }),
    ...(costUsd == null ? {} : { costUsd }),
  };
}

function stageOrder(left, right) {
  const byTime = String(left.at ?? "\uffff").localeCompare(String(right.at ?? "\uffff"));
  return byTime || left.order - right.order;
}

export function machineryCountsForBet(bet, { wallItems = [], outcomes = [] } = {}) {
  return [
    { label: "events", count: (bet?.events ?? []).filter((event) => event.type !== "bet_forked").length },
    { label: "staged", count: (bet?.staged ?? []).length },
    { label: "at wall", count: wallItems.filter((item) => item.betId === bet?.id && !item.decision).length },
    { label: "outcomes", count: outcomes.filter((outcome) => outcome.betId === bet?.id).length },
  ].filter((item) => item.count > 0);
}

// currentStageId is produced by workflowStageIdForEvent at the write seam and matched here. The
// volatile join may disappear after a restart; every durable stage and receipt remains intact.
export function projectBetWorkflow(bet, {
  wallItems = [],
  outcomes = [],
  activeDrives = [],
  campaigns = [],
} = {}) {
  if (!bet?.id) throw new Error("projectBetWorkflow() needs a bet.");
  let order = 0;
  const stages = [{
    id: workflowStageId(bet.id, "opened", "opened"),
    label: "Opened",
    kind: "opened",
    state: "done",
    teammateRef: bet.teammateRef ?? null,
    at: bet.createdAt ?? null,
    order: order++,
  }];

  for (const event of bet.events ?? []) {
    if (event?.type === "bet_forked" || event?.type === "staged" || event?.type === "parked") continue;
    stages.push({
      id: workflowStageIdForEvent(bet.id, event),
      label: eventLabel(event),
      kind: "event",
      state: /queued|pending/.test(String(event?.type ?? "")) ? "queued" : "done",
      teammateRef: bet.teammateRef ?? null,
      at: event?.at ?? null,
      eventId: trimOrNull(event?.id),
      ...receiptFields(event),
      order: order++,
    });
  }

  const betWallItems = wallItems.filter((item) => item?.betId === bet.id);
  for (const [index, artifact] of (bet.staged ?? []).entries()) {
    const pending = betWallItems.find((item) => !item.decision && item.workRef === artifact?.id);
    stages.push({
      id: workflowStageId(bet.id, "staged", artifact?.id ?? index),
      label: artifactLabel(artifact, index),
      kind: "staged",
      state: pending ? "gate" : "done",
      teammateRef: artifact?.ownerRefs?.[0] ?? bet.teammateRef ?? null,
      at: artifact?.stagedAt ?? artifact?.updatedAt ?? null,
      workRef: artifact?.id ?? null,
      order: order++,
    });
  }

  for (const item of betWallItems) {
    stages.push({
      id: workflowStageId(bet.id, "wall", item.id),
      label: wallLabel(item),
      kind: "gate",
      state: item.decision ? "done" : "gate",
      teammateRef: bet.teammateRef ?? null,
      at: item.decidedAt ?? item.parkedAt ?? null,
      workRef: item.workRef ?? null,
      order: order++,
    });
  }

  for (const outcome of outcomes.filter((candidate) => candidate?.betId === bet.id)) {
    stages.push({
      id: workflowStageId(bet.id, "outcome", outcome.id),
      label: trimOrNull(outcome.body) ?? trimOrNull(outcome.outcomeKind) ?? "Outcome",
      kind: "outcome",
      state: "done",
      teammateRef: null,
      at: outcome.observedAt ?? null,
      workRef: outcome.workRef ?? null,
      order: order++,
    });
  }

  if (bet.endedAt && !outcomes.some((outcome) => outcome?.betId === bet.id)) {
    stages.push({
      id: workflowStageId(bet.id, "settled", "settled"),
      label: trimOrNull(bet.learning) ?? "Settled",
      kind: "settled",
      state: "done",
      teammateRef: bet.teammateRef ?? null,
      at: bet.endedAt,
      order: order++,
    });
  }

  const opened = stages.shift();
  stages.sort(stageOrder);
  stages.unshift(opened);
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  for (const drive of activeDrives) {
    if (drive?.betId !== bet.id || !drive.currentStageId) continue;
    const stage = stageById.get(drive.currentStageId);
    if (!stage) continue;
    stage.state = "running";
    stage.runningTeammateRef = drive.teammateRef ?? null;
    stage.since = drive.lastBeatAt ?? drive.startedAt ?? null;
  }

  const measurementWindow = campaigns
    .find((campaign) => campaign?.governingBetId === bet.id)?.measurement?.window ?? null;
  return {
    stages: stages.map(({ order: _order, ...stage }) => stage),
    counts: machineryCountsForBet(bet, { wallItems, outcomes }),
    measurementWindow: trimOrNull(measurementWindow),
  };
}
