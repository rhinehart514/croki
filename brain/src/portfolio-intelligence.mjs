import crypto from "node:crypto";
import { loadFlow } from "./flow-store.mjs";
import { getChannel, getProjectChannels, loadProject, updateSharedContext } from "./project-store.mjs";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function stable(value) {
  return JSON.stringify(canonical(value));
}

function nodeSnapshotMap(run) {
  return new Map((run?.graphSnapshot?.nodes ?? []).map((node) => [node.id, node]));
}

function resultMap(run) {
  return run?.result?.nodes ?? {};
}

export function compareChannelRuns(before, after) {
  if (!before || !after) throw new Error("Two persisted runs are required.");
  const beforeNodes = nodeSnapshotMap(before);
  const afterNodes = nodeSnapshotMap(after);
  const ids = new Set([...beforeNodes.keys(), ...afterNodes.keys()]);
  const graphChanges = [];
  for (const id of ids) {
    const left = beforeNodes.get(id);
    const right = afterNodes.get(id);
    if (!left) graphChanges.push({ type: "node_added", nodeId: id, after: right });
    else if (!right) graphChanges.push({ type: "node_removed", nodeId: id, before: left });
    else {
      if (left.connector !== right.connector) {
        graphChanges.push({ type: "connector_changed", nodeId: id, before: left.connector, after: right.connector });
      }
      if (stable(left.config) !== stable(right.config)) {
        graphChanges.push({ type: "config_changed", nodeId: id, before: left.config, after: right.config });
      }
      if (left.agentPrompt !== right.agentPrompt) {
        graphChanges.push({ type: "prompt_changed", nodeId: id });
      }
    }
  }
  const beforeResults = resultMap(before);
  const afterResults = resultMap(after);
  const resultIds = new Set([...Object.keys(beforeResults), ...Object.keys(afterResults)]);
  const resultChanges = [...resultIds].map((nodeId) => {
    const left = beforeResults[nodeId];
    const right = afterResults[nodeId];
    return {
      nodeId,
      before: left ? {
        ok: left.ok,
        itemCount: left.items?.length ?? 0,
        pendingReview: left.pendingReview ?? false,
        error: left.error ?? null,
      } : null,
      after: right ? {
        ok: right.ok,
        itemCount: right.items?.length ?? 0,
        pendingReview: right.pendingReview ?? false,
        error: right.error ?? null,
      } : null,
    };
  }).filter((change) => stable(change.before) !== stable(change.after));
  return {
    beforeRunId: before.id,
    afterRunId: after.id,
    beforeRevision: before.graphSnapshot?.revision ?? null,
    afterRevision: after.graphSnapshot?.revision ?? null,
    graphChanges,
    resultChanges,
    summary: `${graphChanges.length} graph change${graphChanges.length === 1 ? "" : "s"} · ${resultChanges.length} result change${resultChanges.length === 1 ? "" : "s"}`,
  };
}

function runStats(flow) {
  const last = flow.runs.at(-1) ?? null;
  const nodes = last?.result?.nodes ?? {};
  const counts = {};
  for (const node of Object.values(nodes)) {
    counts[node.category] = (counts[node.category] ?? 0) + (node.items?.length ?? 0);
  }
  return {
    runCount: flow.runs.length,
    lastRunId: last?.id ?? null,
    lastRunAt: last?.createdAt ?? null,
    ok: last?.ok ?? null,
    pendingGates: last?.pendingGates?.length ?? 0,
    counts,
  };
}

export function derivePortfolioBrief(options = {}) {
  const project = loadProject(options);
  const projectedChannels = getProjectChannels(project, options);
  const channels = projectedChannels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    kind: channel.kind,
    objective: channel.objective,
    ...runStats(loadFlow(channel.graphId, null, options)),
  }));
  const observedOutcomes = (project.sharedContext.outcomes ?? []).filter((outcome) => outcome.observation === "observed");
  const outcomeCounts = Object.fromEntries(projectedChannels.map((channel) => [
    channel.id,
    observedOutcomes.filter((outcome) => outcome.channelId === channel.id)
      .reduce((counts, outcome) => ({
        ...counts,
        [outcome.type]: (counts[outcome.type] ?? 0) + 1,
      }), {}),
  ]));
  const recommendations = [];
  const waiting = channels.filter((channel) => channel.pendingGates > 0);
  const neverRun = channels.filter((channel) => channel.runCount === 0);
  const failing = channels.filter((channel) => channel.ok === false && channel.pendingGates === 0);
  if (waiting.length) recommendations.push(`Review founder gates in: ${waiting.map((channel) => channel.name).join(", ")}.`);
  if (failing.length) recommendations.push(`Debug the most recent failures in: ${failing.map((channel) => channel.name).join(", ")}.`);
  if (neverRun.length) recommendations.push(`Activate an initial evidence-producing run for: ${neverRun.map((channel) => channel.name).join(", ")}.`);
  if (!observedOutcomes.length) recommendations.push("Record the first observed external outcome before making causal channel claims.");

  return {
    generatedAt: new Date().toISOString(),
    project: { id: project.id, name: project.name },
    sharedContextVersion: project.sharedContext.version,
    grounding: project.sharedContext.repository,
    positioning: project.sharedContext.positioning,
    icp: project.sharedContext.icp,
    channels,
    observedOutcomes,
    outcomeCounts,
    experiments: project.sharedContext.experiments ?? [],
    artifacts: project.sharedContext.artifacts ?? [],
    productFeedback: project.sharedContext.productFeedback ?? [],
    recommendations,
  };
}

export function createPortfolioArtifact(options = {}) {
  const project = loadProject(options);
  const brief = derivePortfolioBrief(options);
  const artifactContent = {
    ...brief,
    // Keep preserved briefs bounded: summarize prior artifacts instead of
    // recursively embedding every earlier brief inside the next one.
    artifacts: brief.artifacts.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      createdAt: item.createdAt,
      summary: item.summary,
    })),
  };
  const artifact = {
    id: `artifact-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    type: "portfolio-brief",
    title: `${project.name} GTM brief`,
    createdAt: brief.generatedAt,
    sharedContextVersion: brief.sharedContextVersion,
    observation: "derived",
    summary: `${brief.channels.length} channels · ${brief.observedOutcomes.length} observed outcomes · ${brief.recommendations.length} recommendations`,
    content: artifactContent,
  };
  const artifacts = [...(project.sharedContext.artifacts ?? []), artifact].slice(-100);
  const updated = updateSharedContext({ artifacts }, options);
  return { artifact, sharedContextVersion: updated.sharedContext.version };
}

export function recordObservedOutcome(input, options = {}) {
  const project = loadProject(options);
  const channel = getChannel(project, input.channelId, options);
  const type = String(input.type || "").trim();
  const gtmActionId = String(input.gtmActionId || "").trim();
  if (!type) throw new Error("Outcome type is required.");
  if (!gtmActionId) throw new Error("An originating gtmActionId is required for attribution.");
  const outcome = {
    id: input.id || `outcome-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    channelId: channel.id,
    graphId: channel.graphId,
    gtmActionId,
    type,
    value: input.value ?? null,
    contactId: input.contactId || null,
    detail: String(input.detail || "").trim() || null,
    productFeedback: String(input.productFeedback || "").trim() || null,
    observedAt: input.observedAt || new Date().toISOString(),
    observation: "observed",
    source: {
      connector: String(input.source?.connector || "manual"),
      pointer: String(input.source?.pointer || "").trim() || null,
    },
  };
  const outcomes = [...(project.sharedContext.outcomes ?? []), outcome].slice(-1000);
  const productFeedback = outcome.productFeedback
    ? [...(project.sharedContext.productFeedback ?? []), {
        id: `feedback-${outcome.id}`,
        outcomeId: outcome.id,
        channelId: channel.id,
        text: outcome.productFeedback,
        observedAt: outcome.observedAt,
        observation: "observed",
      }].slice(-500)
    : project.sharedContext.productFeedback ?? [];
  const updated = updateSharedContext({ outcomes, productFeedback }, options);
  return { outcome, sharedContextVersion: updated.sharedContext.version };
}

export function recordExperiment(input, options = {}) {
  const project = loadProject(options);
  const channel = getChannel(project, input.channelId, options);
  const hypothesis = String(input.hypothesis || "").trim();
  if (!hypothesis) throw new Error("An experiment hypothesis is required.");
  const experiment = {
    id: input.id || `experiment-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    channelId: channel.id,
    hypothesis,
    variable: String(input.variable || "").trim() || null,
    heldConstant: Array.isArray(input.heldConstant) ? input.heldConstant : [],
    successSignal: String(input.successSignal || "").trim() || null,
    status: input.status || "draft",
    createdAt: new Date().toISOString(),
    result: null,
  };
  const experiments = [...(project.sharedContext.experiments ?? []), experiment].slice(-500);
  const updated = updateSharedContext({ experiments }, options);
  return { experiment, sharedContextVersion: updated.sharedContext.version };
}
