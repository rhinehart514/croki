// Canonical thread read projection. This joins existing messages, runs, bets, artifacts, decisions,
// outcomes, and live drives; it deliberately stores no UI transcript or second event log.

import { listActiveDrives } from "./active-drives.mjs";
import { getSemanticModel } from "./semantic-model-store.mjs";
import { createRootThread, ROOT_THREAD_ID } from "./thread.mjs";
import { listVentureDocs } from "./venture-store.mjs";
import { buildWorkIndex } from "./work-index.mjs";
import { getFirmConfiguration } from "./configuration.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const refId = (value, prefix) => String(value ?? "").replace(new RegExp(`^${prefix}:`), "");
const TOOL_ACTIVITY = {
  read_truth: "Read venture truth",
  search_repository: "Searched the repository",
  read_repository_excerpt: "Read source evidence",
  get_firm_configuration: "Checked venture configuration",
  get_taste: "Checked venture taste",
  read_venture_architecture: "Read the venture model",
  record_working_theory: "Updated venture understanding",
  propose_architecture_change: "Prepared a venture-model proposal",
  fork_bet: "Opened an approach",
  stage_artifact: "Prepared an artifact",
  stage_outward: "Prepared founder review",
  ask_founder: "Prepared a founder question",
  speak: "Shared a progress update",
  involve_participant: "Involved another participant",
};

function inspectableActivity(bet) {
  return list(bet?.events).flatMap((event) => {
    if (event?.type === "tool_started") {
      return [{ id: event.id, label: TOOL_ACTIVITY[event.detail] ?? "Used a venture capability", at: event.at ?? null, durationMs: Number.isFinite(event.durationMs) ? event.durationMs : null }];
    }
    if (event?.type === "tool_failed") return [{ id: event.id, label: "A work step needs attention", at: event.at ?? null, durationMs: null }];
    if (event?.type === "asked") return [{ id: event.id, label: "Prepared a founder question", at: event.at ?? null, durationMs: null }];
    if (event?.type === "speak") return [{ id: event.id, label: "Shared a progress update", at: event.at ?? null, durationMs: null }];
    return [];
  }).slice(-8);
}

function at(value, fallback = null) {
  return value?.updatedAt ?? value?.createdAt ?? value?.stagedAt ?? value?.at ?? fallback;
}

function visual(kind, ref, threadRef, title, relatedRefs = []) {
  return { kind, ref, threadRef, title, ...(relatedRefs.length ? { relatedRefs } : {}) };
}

function readableStatus(value) {
  return String(value ?? "unknown").replaceAll("-", " ");
}

function codingAttemptItems(workspace, participantLabel) {
  const verification = list(workspace.verification);
  const passed = verification.filter((receipt) => receipt.status === "passed").length;
  const failed = verification.filter((receipt) => receipt.status === "failed").length;
  const running = verification.filter((receipt) => receipt.status === "running").length;
  const verificationDetail = verification.length
    ? [passed ? `${passed} passed` : null, failed ? `${failed} failed` : null, running ? `${running} running` : null].filter(Boolean).join(" · ")
    : "No verification receipts";
  const participants = list(workspace.participantRefs).map(participantLabel).filter(Boolean);
  const providers = list(workspace.providerSessions).map((session) => session.provider).filter(Boolean);
  const owners = [...new Set([...participants, ...providers])];
  const changes = workspace.diffStat || (list(workspace.changedFiles).length
    ? `${list(workspace.changedFiles).length} changed ${list(workspace.changedFiles).length === 1 ? "file" : "files"}`
    : "No changed files reported");
  return [
    { label: "Status", detail: readableStatus(workspace.status) },
    { label: "Changes", detail: changes },
    { label: "Verification", detail: verificationDetail },
    ...(workspace.branch ? [{ label: "Branch", detail: workspace.branch }] : []),
    ...(owners.length ? [{ label: "Agent", detail: owners.join(", ") }] : []),
    ...(workspace.interruption?.recovery ? [{ label: "Recovery", detail: workspace.interruption.recovery }] : []),
  ];
}

function artifactKind(artifact) {
  const structured = artifact?.content?.kind;
  if (structured === "model-view") return "model-view";
  if (structured === "flow") return "flow";
  if (structured === "comparison") return "comparison";
  if (artifact?.content?.kind === "diff" || artifact?.type === "diff") return "diff";
  return "preview";
}

function agentState(drive) {
  if (drive.abortRequestedAt) return "stopping";
  if (drive.queuedAt && !drive.startedAt) return "queued";
  return "working";
}

function legacyFamily(allBets, rootId) {
  const byId = new Map(allBets.map((bet) => [bet.id, bet]));
  const belongs = (bet) => {
    let current = bet;
    const seen = new Set();
    while (current?.forkedFrom && byId.has(current.forkedFrom) && !seen.has(current.forkedFrom)) {
      seen.add(current.id);
      current = byId.get(current.forkedFrom);
    }
    return current?.id === rootId;
  };
  return allBets.filter(belongs);
}

export function buildThreadTimeline(ventureId, threadId, options = {}) {
  const configuration = getFirmConfiguration(ventureId, options);
  const participantNames = new Map(list(configuration.agents).map((agent) => [agent.ref, agent.name ?? agent.label ?? agent.ref]));
  const participantLabel = (ref) => participantNames.get(ref) ?? ref ?? null;
  const model = getSemanticModel(ventureId, options);
  const allBets = listVentureDocs(ventureId, "bets", options);
  let thread = list(model.threads).find((entry) => entry.id === threadId);
  if (!thread && threadId === ROOT_THREAD_ID) thread = createRootThread(ventureId);
  if (!thread && threadId.startsWith("legacy-")) {
    const rootId = threadId.slice("legacy-".length);
    const family = legacyFamily(allBets, rootId);
    const root = family.find((bet) => bet.id === rootId);
    if (root) thread = { id: threadId, name: root.intent ?? "Founder direction", subjectRefs: family.map((bet) => `bet:${bet.id}`), messageRefs: [], participantRefs: [], lifecycle: family.every((bet) => bet.endedAt) ? "closed" : "open", properties: { compatibility: "legacy-bet-family" }, createdAt: root.createdAt ?? null, updatedAt: root.updatedAt ?? root.createdAt ?? null };
  }
  if (!thread) throw Object.assign(new Error(`No such thread: ${threadId}`), { code: "semantic_model_missing_ref", status: 404 });
  if (thread.deletedAt) throw Object.assign(new Error(`No such thread: ${threadId}`), { code: "semantic_model_missing_ref", status: 404 });
  const threadRef = `thread:${thread.id}`;
  const runs = list(model.runs).filter((run) => run.threadRef === threadRef);
  const betIds = new Set([
    ...list(thread.subjectRefs).filter((ref) => String(ref).startsWith("bet:")).map((ref) => refId(ref, "bet")),
    ...runs.flatMap((run) => list(run.betRefs)).map((ref) => refId(ref, "bet")),
  ]);
  const messageRefs = new Set(list(thread.messageRefs));
  const decisions = listVentureDocs(ventureId, "decisions", options);
  const outcomes = listVentureDocs(ventureId, "outcomes", options);
  const codeWorkspaces = listVentureDocs(ventureId, "codeWorkspaces", options)
    .filter((workspace) => workspace.threadRef === threadRef || list(workspace.runRefs).some((ref) => runs.some((run) => ref === `run:${run.id}`)));
  const bets = allBets.filter((bet) => betIds.has(bet.id));
  const active = listActiveDrives(ventureId).filter((drive) => betIds.has(drive.betId) || runs.some((run) => run.id === drive.id));
  const isRoot = thread.id === ROOT_THREAD_ID;
  const deletedMessageRefs = new Set(list(model.threads).filter((entry) => entry.deletedAt).flatMap((entry) => list(entry.messageRefs)));
  const visibleMessageRefs = new Set(list(model.threads).filter((entry) => !entry.deletedAt).flatMap((entry) => list(entry.messageRefs)));
  const messages = listVentureDocs(ventureId, "conversation", options).filter((message) => {
    if (messageRefs.has(`conversation:${message.id}`)) return true;
    if (message.betId && betIds.has(message.betId)) return true;
    const ref = `conversation:${message.id}`;
    return isRoot && !message.betId && (!deletedMessageRefs.has(ref) || visibleMessageRefs.has(ref));
  });
  const items = [];
  const visuals = [];

  for (const message of messages) {
    items.push({
      kind: "message",
      id: `message:${message.id}`,
      ref: `conversation:${message.id}`,
      ventureId,
      at: message.createdAt,
      role: message.role,
      participantRef: message.teammateRef ?? null,
      participantLabel: participantLabel(message.teammateRef),
      content: message.content,
      messageKind: message.kind,
      changes: message.changes ?? null,
      runtime: message.runtime ?? null,
      target: message.target ?? null,
      attachments: message.attachments ?? [],
    });
  }

  for (const drive of active) {
    const state = agentState(drive);
    const activitySteps = inspectableActivity(bets.find((bet) => bet.id === drive.betId));
    items.push({
      kind: "agent-status",
      id: `agent:${drive.id}:${state}`,
      ref: `run:${drive.id}`,
      at: drive.abortRequestedAt ?? drive.startedAt,
      participantRef: drive.teammateRef,
      participantLabel: participantLabel(drive.teammateRef),
      state,
      summary: state === "stopping" ? "Stop requested" : state === "queued" ? "Queued" : drive.activity ?? "Working in this thread",
      startedAt: drive.startedAt,
      updatedAt: drive.lastBeatAt ?? drive.startedAt,
      betRef: drive.betId ? `bet:${drive.betId}` : null,
      activitySteps,
    });
    // The assistant's reply as it forms — projected as a normal streaming teammate turn so the founder
    // watches it stream in the transcript, not as a status chip. It carries `at: lastBeatAt` so it sorts
    // to the live edge, and vanishes when the drive settles and its durable message takes over.
    const liveText = String(drive.liveText ?? "").trim();
    if (state === "working" && liveText) {
      items.push({
        kind: "message",
        id: `live:${drive.id}`,
        ref: `run:${drive.id}`,
        ventureId,
        at: drive.lastBeatAt ?? drive.startedAt,
        role: "teammate",
        participantRef: drive.teammateRef,
        participantLabel: participantLabel(drive.teammateRef),
        content: drive.liveText,
        streaming: true,
      });
    }
  }

  for (const bet of bets) {
    for (const artifact of list(bet.staged)) {
      const kind = artifactKind(artifact);
      const artifactRef = `work:${artifact.id}`;
      const title = artifact.title ?? bet.intent ?? "Visual work";
      const visualRef = visual(kind, artifactRef, threadRef, title, [`bet:${bet.id}`]);
      visuals.push(visualRef);
      items.push({
        kind: kind === "flow" ? "artifact" : kind === "comparison" ? "comparison" : "artifact",
        id: `artifact:${artifact.id}`,
        ref: artifactRef,
        at: at(artifact, at(bet)),
        title,
        artifact,
        ownerLabels: list(artifact.ownerRefs).map(participantLabel).filter(Boolean),
        contributorLabels: list(artifact.contributorRefs).map(participantLabel).filter(Boolean),
        betRef: `bet:${bet.id}`,
        visual: visualRef,
      });
    }
    if (list(bet.evidence).length) {
      const evidenceRef = `bet:${bet.id}#evidence`;
      const evidenceVisual = visual("evidence", evidenceRef, threadRef, `Evidence for ${bet.intent ?? "this direction"}`, [`bet:${bet.id}`]);
      visuals.push(evidenceVisual);
      items.push({ kind: "evidence", id: `evidence:${bet.id}`, ref: evidenceRef, at: at(bet), title: "Evidence returned", evidence: list(bet.evidence), visual: evidenceVisual });
    }
    if (list(bet.events).length) {
      items.push({
        kind: "activity-summary",
        id: `activity:${bet.id}`,
        ref: `bet:${bet.id}#activity`,
        at: at(list(bet.events).at(-1), at(bet)),
        summary: `${list(bet.events).length} material ${list(bet.events).length === 1 ? "activity" : "activities"} recorded.`,
        count: list(bet.events).length,
        betRef: `bet:${bet.id}`,
      });
    }
  }

  for (const workspace of codeWorkspaces) {
    const artifactRef = `work:${workspace.id}`;
    const title = workspace.goal ?? "Native coding attempt";
    const visualRef = visual("diff", artifactRef, threadRef, title, list(workspace.runRefs));
    visuals.push(visualRef);
    items.push({
      kind: "artifact",
      id: `artifact:${workspace.id}`,
      ref: artifactRef,
      at: at(workspace),
      title,
      artifact: {
        ...workspace,
        content: { kind: "diff", diff: workspace.diff ?? "" },
        verifiedAt: workspace.status === "reviewable" ? workspace.updatedAt : null,
      },
      ownerLabels: list(workspace.participantRefs).map(participantLabel).filter(Boolean),
      contributorLabels: [],
      betRef: workspace.betId ? `bet:${workspace.betId}` : null,
      visual: visualRef,
    });
    if (workspace.status === "interrupted") {
      items.push({
        kind: "agent-status", id: `agent:${workspace.id}:failed`, ref: artifactRef,
        at: workspace.interruption?.at ?? at(workspace), participantRef: workspace.participantRefs?.at(-1) ?? null,
        participantLabel: participantLabel(workspace.participantRefs?.at(-1)), state: "failed",
        summary: workspace.interruption?.message ?? "Provider work was interrupted; the isolated workspace was retained.",
        updatedAt: workspace.updatedAt, recovery: workspace.interruption?.recovery ?? null,
      });
    }
  }

  if (codeWorkspaces.length > 1) {
    const comparisonRef = `${threadRef}#code-attempts`;
    const comparisonVisual = visual("comparison", comparisonRef, threadRef, "Implementation attempts", codeWorkspaces.map((workspace) => `work:${workspace.id}`));
    visuals.push(comparisonVisual);
    items.push({
      kind: "comparison", id: `comparison:${thread.id}:code`, ref: comparisonRef,
      at: at(codeWorkspaces.at(-1), at(thread)), title: "Implementation attempts", variant: "alternatives",
      alternatives: codeWorkspaces.map((workspace) => ({ id: workspace.id, title: workspace.goal, items: codingAttemptItems(workspace, participantLabel), artifactRefs: [`work:${workspace.id}`] })),
      visual: comparisonVisual,
    });
  }

  const siblingGroups = new Map();
  for (const bet of bets.filter((entry) => entry.forkedFrom)) {
    if (!siblingGroups.has(bet.forkedFrom)) siblingGroups.set(bet.forkedFrom, []);
    siblingGroups.get(bet.forkedFrom).push(bet);
  }
  const independentAlternatives = [...siblingGroups.values()].find((siblings) => siblings.length > 1) ?? bets;
  if (independentAlternatives.length > 1) {
    const relatedRefs = independentAlternatives.map((bet) => `bet:${bet.id}`);
    const comparisonRef = `${threadRef}#alternatives`;
    const comparisonVisual = visual("comparison", comparisonRef, threadRef, "Approaches", relatedRefs);
    visuals.push(comparisonVisual);
    items.push({ kind: "comparison", id: `comparison:${thread.id}`, ref: comparisonRef, at: at(independentAlternatives.at(-1), at(thread)), title: "Approaches", variant: "alternatives", alternatives: independentAlternatives.map((bet) => ({ id: bet.id, title: bet.intent, artifactRefs: list(bet.staged).map((artifact) => `work:${artifact.id}`) })), visual: comparisonVisual });
  }

  const decisionIds = new Set(runs.flatMap((run) => list(run.decisionRefs)).map((ref) => refId(ref, "decision")));
  for (const decision of decisions.filter((entry) => decisionIds.has(entry.id) || betIds.has(entry.betId))) {
    const consequenceRef = `decision:${decision.id}`;
    const consequenceVisual = visual("consequence", consequenceRef, threadRef, decision.summary ?? "Consequence review", decision.betId ? [`bet:${decision.betId}`] : []);
    visuals.push(consequenceVisual);
    items.push({ kind: "consequence", id: `consequence:${decision.id}`, ref: consequenceRef, at: at(decision), title: decision.summary ?? "Ready for founder review", decision, visual: consequenceVisual });
  }

  const outcomeIds = new Set(runs.flatMap((run) => list(run.outcomeRefs)).map((ref) => refId(ref, "outcome")));
  for (const outcome of outcomes.filter((entry) => outcomeIds.has(entry.id) || betIds.has(entry.betId))) {
    const evidenceRef = `outcome:${outcome.id}`;
    const evidenceVisual = visual("evidence", evidenceRef, threadRef, outcome.summary ?? "Returned evidence", outcome.betId ? [`bet:${outcome.betId}`] : []);
    visuals.push(evidenceVisual);
    items.push({ kind: "evidence", id: `outcome:${outcome.id}`, ref: evidenceRef, at: at(outcome), title: outcome.summary ?? "Returned evidence", evidence: [outcome], visual: evidenceVisual });
  }

  if (isRoot) {
    const index = buildWorkIndex(ventureId, options);
    items.push({
      kind: "return-summary",
      id: `return:${model.revision}`,
      ref: `${threadRef}#return-${model.revision}`,
      at: at(thread),
      counts: index.counts,
      actions: index.items.filter((item) => item.attention !== "none" || item.activity !== "idle").slice(0, 3).map((item) => ({ threadRef: item.threadRef, label: item.founderIntent, attention: item.attention })),
    });
  }

  const mapVisual = visual("map", `${threadRef}#venture-map`, threadRef, "Venture map");
  visuals.push(mapVisual);
  items.sort((left, right) => String(left.at ?? "").localeCompare(String(right.at ?? "")) || left.id.localeCompare(right.id));
  const indexItem = buildWorkIndex(ventureId, options).items.find((item) => item.threadRef === threadRef) ?? null;
  return {
    ventureId,
    revision: model.revision,
    thread: indexItem ?? { threadRef, founderIntent: thread.name, lifecycle: thread.lifecycle, participantRefs: thread.participantRefs, activeParticipantRefs: [] },
    items,
    agents: active.map((drive) => ({ participantRef: drive.teammateRef, participantLabel: participantLabel(drive.teammateRef), state: agentState(drive), runRef: `run:${drive.id}`, betRef: drive.betId ? `bet:${drive.betId}` : null, activity: drive.activity ?? null, startedAt: drive.startedAt, updatedAt: drive.abortRequestedAt ?? drive.lastBeatAt ?? drive.startedAt })),
    visuals,
  };
}
