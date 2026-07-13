import { loadFlow, summarizeRunResult } from "./flow-store.mjs";
import { resultStore } from "./gtm-store.mjs";
import { listFlowsNeedingFounder, getOperatorSession, listOperatorSessions } from "./operator-store.mjs";
import { getProjectChannels, loadProject, loadProjectCatalog } from "./project-store.mjs";

export const STUCK_STATUSES = new Set([
  "failed",
  "interrupted",
  "blocked",
  "waiting_for_input",
  "waiting_for_proposal",
  "waiting_for_ideas",
  "waiting_for_candidates",
]);

export const REASON_BY_STATUS = {
  failed: "hit an error and stopped",
  interrupted: "was interrupted and can be resumed",
  blocked: "is blocked on an earlier step",
  waiting_for_input: "is waiting for your answer",
  waiting_for_proposal: "has graph changes waiting for your review",
  waiting_for_ideas: "is waiting for you to pick ideas",
  waiting_for_candidates: "is waiting for you to pick candidates",
};

function pipelineLabel(session) {
  return session.goal || session.standingBrief || "Untitled pipeline";
}

export function composeBriefingSummary(briefing) {
  const { gatesWaiting, recentlyFinished, stuck, perPipeline, projectName } = briefing;
  const clauses = [];
  if (gatesWaiting.length) {
    const n = gatesWaiting.reduce((count, entry) => count + (entry.itemCount > 0 ? entry.itemCount : 1), 0);
    const gate = projectName ? `your ${projectName} gate` : "your gate";
    clauses.push(`${n} draft${n === 1 ? "" : "s"} waiting at ${gate}`);
  }
  if (recentlyFinished.length) {
    const top = recentlyFinished[0];
    const p = top.produced;
    clauses.push(`${top.label} finished with ${p} operator${p === 1 ? "" : "s"}`);
  }
  if (stuck.length) {
    const n = stuck.length;
    clauses.push(n === 1 ? "1 pipeline needs you" : `${n} pipelines need you`);
  }
  for (const p of perPipeline) {
    if (p.runCount === 0) clauses.push(`nothing moved on ${p.name}`);
  }
  if (!clauses.length) {
    return "Nothing is waiting at your gate, and no pipeline has run yet.";
  }
  return `${clauses.join("; ")}.`;
}

export function buildComposerBriefing(input = {}, options = {}) {
  const projectId = input.projectId ?? loadProjectCatalog(options).activeProjectId;

  let project = null;
  let channels = [];
  try {
    project = loadProject({ ...options, projectId });
    channels = getProjectChannels(project, options);
  } catch {
    project = null;
    channels = [];
  }
  const projectName = project?.name ?? null;

  const sessions = listOperatorSessions({ ...options, projectId });
  const gatesWaiting = listFlowsNeedingFounder({ ...options, projectId })
    .map((entry) => ({ ...entry, label: entry.label || "Untitled pipeline" }));

  const stuck = sessions
    .filter((session) => STUCK_STATUSES.has(session.status))
    .map((session) => ({
      sessionId: session.id,
      kind: session.kind,
      label: pipelineLabel(session),
      status: session.status,
      reason: REASON_BY_STATUS[session.status],
      error: session.error ?? null,
      updatedAt: session.updatedAt,
    }));

  const recentLimit = Number.isFinite(options.recentLimit) ? options.recentLimit : 5;
  const recentlyFinished = sessions
    .filter((session) => session.status === "completed")
    .slice(0, recentLimit)
    .map((session) => {
      let full = null;
      try {
        full = getOperatorSession(session.id, options);
      } catch {
        full = null;
      }

      const lastRunId = full?.lastRunId ?? null;
      const graphId = full?.graphId ?? session.graphId ?? null;
      let produced = 0;
      let byCategory = {};

      if (graphId && lastRunId) {
        let flow = null;
        try {
          flow = loadFlow(graphId, null, options);
        } catch {
          flow = null;
        }
        const run = (flow?.runs ?? []).find((item) => item.id === lastRunId) ?? null;
        if (run) {
          const summary = summarizeRunResult(run);
          produced = summary.produced;
          byCategory = summary.byCategory;
        }
      }

      let outcomes = [];
      if (lastRunId) {
        try {
          outcomes = resultStore.list({ ...options, projectId })
            .filter((result) => result.runId === lastRunId)
            .map((result) => ({
              outcomeKind: result.outcomeKind ?? null,
              value: result.value,
              observedAt: result.observedAt,
            }));
        } catch {
          outcomes = [];
        }
      }

      return {
        sessionId: session.id,
        kind: session.kind,
        label: pipelineLabel(session),
        summary: full?.summary ?? session.summary ?? null,
        finishedAt: full?.completedAt ?? session.updatedAt,
        produced,
        byCategory,
        outcomes,
      };
    });

  const perPipeline = channels.map((channel) => {
    let latestRun = null;
    try { latestRun = loadFlow(channel.graphId, null, options)?.runs?.at(-1) ?? null; } catch { latestRun = null; }
    const pendingNodeIds = Array.isArray(latestRun?.pendingGates) ? latestRun.pendingGates : [];
    const runNodes = latestRun?.result?.nodes ?? {};
    const stagedItems = pendingNodeIds.reduce((count, nodeId) => {
      const items = runNodes?.[nodeId]?.items;
      return count + (Array.isArray(items) ? items.length : 0);
    }, 0);
    return {
      id: channel.id,
      graphId: channel.graphId,
      name: channel.name,
      status: channel.status,
      lastRunAt: channel.lastRunAt ?? null,
      lastRunOk: channel.lastRunOk ?? null,
      // Founder-facing counts are artifacts, not gate-node topology. A six-item batch at one wall is six
      // decisions waiting, never "1" merely because the graph contains one gate node.
      pendingGates: stagedItems || (pendingNodeIds.length ? pendingNodeIds.length : 0),
      runCount: channel.runCount ?? 0,
      produced: channel.lastRunResult?.produced ?? 0,
    };
  });

  const briefing = {
    projectId: projectId ?? null,
    projectName,
    gatesWaiting,
    recentlyFinished,
    stuck,
    perPipeline,
    summary: "",
    generatedAt: new Date().toISOString(),
  };
  briefing.summary = composeBriefingSummary(briefing);
  return briefing;
}
