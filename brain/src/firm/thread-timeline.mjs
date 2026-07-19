// Canonical thread read projection. This joins existing messages, runs, bets, artifacts, decisions,
// outcomes, and live drives; it deliberately stores no UI transcript or second event log.

import { listActiveDrives } from "./active-drives.mjs";
import { getSemanticModel } from "./semantic-model-store.mjs";
import { ROOT_THREAD_ID } from "./thread.mjs";
import { listVentureDocs } from "./venture-store.mjs";
import { buildWorkIndex } from "./work-index.mjs";
import { getFirmConfiguration } from "./configuration.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const refId = (value, prefix) => String(value ?? "").replace(new RegExp(`^${prefix}:`), "");

function at(value, fallback = null) {
  return value?.updatedAt ?? value?.createdAt ?? value?.stagedAt ?? value?.at ?? fallback;
}

function visual(kind, ref, threadRef, title, relatedRefs = []) {
  return { kind, ref, threadRef, title, ...(relatedRefs.length ? { relatedRefs } : {}) };
}

function artifactKind(artifact) {
  const structured = artifact?.content?.kind;
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
  if (!thread && threadId.startsWith("legacy-")) {
    const rootId = threadId.slice("legacy-".length);
    const family = legacyFamily(allBets, rootId);
    const root = family.find((bet) => bet.id === rootId);
    if (root) thread = { id: threadId, name: root.intent ?? "Founder direction", subjectRefs: family.map((bet) => `bet:${bet.id}`), messageRefs: [], participantRefs: [], lifecycle: family.every((bet) => bet.endedAt) ? "closed" : "open", properties: { compatibility: "legacy-bet-family" }, createdAt: root.createdAt ?? null, updatedAt: root.updatedAt ?? root.createdAt ?? null };
  }
  if (!thread) throw Object.assign(new Error(`No such thread: ${threadId}`), { code: "semantic_model_missing_ref", status: 404 });
  const threadRef = `thread:${thread.id}`;
  const runs = list(model.runs).filter((run) => run.threadRef === threadRef);
  const betIds = new Set([
    ...list(thread.subjectRefs).filter((ref) => String(ref).startsWith("bet:")).map((ref) => refId(ref, "bet")),
    ...runs.flatMap((run) => list(run.betRefs)).map((ref) => refId(ref, "bet")),
  ]);
  const messageRefs = new Set(list(thread.messageRefs));
  const decisions = listVentureDocs(ventureId, "decisions", options);
  const outcomes = listVentureDocs(ventureId, "outcomes", options);
  const bets = allBets.filter((bet) => betIds.has(bet.id));
  const active = listActiveDrives(ventureId).filter((drive) => betIds.has(drive.betId) || runs.some((run) => run.id === drive.id));
  const isRoot = thread.id === ROOT_THREAD_ID;
  const messages = listVentureDocs(ventureId, "conversation", options).filter((message) => {
    if (messageRefs.has(`conversation:${message.id}`)) return true;
    if (message.betId && betIds.has(message.betId)) return true;
    return isRoot && !message.betId;
  });
  const items = [];
  const visuals = [];

  for (const message of messages) {
    items.push({
      kind: "message",
      id: `message:${message.id}`,
      ref: `conversation:${message.id}`,
      at: message.createdAt,
      role: message.role,
      participantRef: message.teammateRef ?? null,
      participantLabel: participantLabel(message.teammateRef),
      content: message.content,
      messageKind: message.kind,
      runtime: message.runtime ?? null,
      target: message.target ?? null,
    });
  }

  for (const drive of active) {
    const state = agentState(drive);
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
    });
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
