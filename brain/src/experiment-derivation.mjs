// Experiment derivation — a run actually PRODUCES a GtmExperiment.
//
// One live experiment per channel (mirrors the GtmExperiment shape in ui/src/types.ts): the drafted
// approach is the variable under test, the audience source is held constant, and the founder's gate
// decisions are the result. A derived experiment carries NO hypothesis — the variable names what is
// being tested in the pipeline's own words; the founder's typed goal is a goal, not a hypothesis, and
// echoing it back as one dressed the goal up as learning. Derived from real run state only — any
// field that can't be grounded is left undefined (honest blank), never fabricated. It is upserted into
// the existing sharedContext.experiments on run completion and again on gate resolution, exactly where
// promoteEntrantsFromRun already promotes the run's people, so the experiment-matrix lens fills with
// real data and "watch it run experiments" becomes literally true.

import { loadProject, updateSharedContext } from "./project-store.mjs";

export function deriveExperimentFromRun({ graph, result, sharedContext } = {}) {
  const channelId = graph?.id ?? result?.graphId ?? null;
  if (!channelId) return null;
  const graphNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const resultNodes = result?.nodes ?? {};

  // Founder gate decisions are the run's real outcome signal.
  let staged = 0, approved = 0, rejected = 0, hasGate = false;
  for (const nodeResult of Object.values(resultNodes)) {
    if (nodeResult?.category !== "gate") continue;
    hasGate = true;
    for (const item of nodeResult.items ?? []) {
      staged += 1;
      if (item.approvalStatus === "approved") approved += 1;
      else if (item.approvalStatus === "rejected") rejected += 1;
    }
  }

  const pending = Array.isArray(result?.pendingGates) && result.pendingGates.length > 0;
  const status = pending ? "running" : "complete";

  // A short, real outcome string from the gate decisions (e.g. "5 staged · 3 approved · 2 rejected").
  let resultStr;
  if (hasGate && staged > 0) {
    const parts = [`${staged} staged`];
    if (approved) parts.push(`${approved} approved`);
    if (rejected) parts.push(`${rejected} rejected`);
    if (pending && !approved && !rejected) parts.push("awaiting review");
    resultStr = parts.join(" · ");
  }

  // The graph's own shape names what's being tested vs held constant.
  const sourceNode = graphNodes.find((n) => n.category === "source");
  const measureNode = graphNodes.find((n) => n.category === "measure");
  const gateNode = graphNodes.find((n) => n.category === "gate");
  const draftNode = [...graphNodes].reverse().find((n) => n.kind === "agent" || n.category === "generate");

  const icpLabel = typeof sharedContext?.icp?.label === "string" ? sharedContext.icp.label
    : typeof sharedContext?.icp?.name === "string" ? sharedContext.icp.name
    : undefined;
  const claimId = graphNodes.map((n) => n.config?.claimId).find((id) => typeof id === "string") || undefined;

  const experiment = {
    id: `exp-${channelId}`,
    channelId,
    // No hypothesis: a derived experiment never stores the founder's typed goal as its hypothesis.
    // `variable` (the drafting step's own label) names the real thing under test; readers fall back to
    // it. A hypothesis is the founder's to state, or nobody's.
    variable: draftNode?.label || undefined,
    heldConstant: sourceNode?.label || undefined,
    successSignal: measureNode?.label || (gateNode ? `Founder approval at "${gateNode.label}"` : undefined),
    status,
    result: resultStr ?? null,
    claimId,
    icp: icpLabel,
    // No targetLayer: a run does not know which strategic layer it tests, and force-filing every
    // derived experiment under "channels" misfiled all of them. targetLayer stays an OPEN string the
    // founder (or a stated grouping) sets; the board surfaces layerless experiments on the Learn band
    // so they never vanish.
    // The arm under test. A channel is one arm KIND, so a single-channel run carries one channel arm.
    arms: [{
      id: `arm-${channelId}`,
      label: draftNode?.label || graph?.name || channelId,
      kind: "channel",
      channelId,
    }],
    // This experiment was DERIVED from a run, not stated by the founder.
    origin: "derived",
  };
  // CRITICAL: `verdict` and `updates` are NEVER part of a derived patch. A re-run upserts via
  // `{ ...existing, ...experiment }`; omitting these two keys here means a founder's verdict (the only
  // hand that may set it) can never be clobbered by a later derivation. This is the founder-decision wall.
  // Keep the persisted object honestly blank, not littered with undefined keys.
  for (const key of Object.keys(experiment)) {
    if (experiment[key] === undefined) delete experiment[key];
  }
  return experiment;
}

// Read-time shim: an experiment persisted before arms/origin existed is back-filled so every reader
// (the board, the matrix) sees the full shape without a migration write. Idempotent and
// non-destructive — it never overwrites a real targetLayer, arms, verdict, or origin already present,
// and it never INVENTS a targetLayer: an experiment without one stays layerless (open on read; the
// board surfaces it on the Learn band) instead of being force-filed under "channels".
export function normalizeExperiment(exp) {
  if (!exp || typeof exp !== "object") return exp;
  const arms = Array.isArray(exp.arms) && exp.arms.length
    ? exp.arms
    : [{
        id: `arm-${exp.channelId ?? exp.id}`,
        label: exp.variable || exp.hypothesis || exp.channelId || exp.id,
        kind: "channel",
        channelId: exp.channelId ?? null,
      }];
  const origin = exp.origin === "stated" ? "stated" : "derived";
  return { ...exp, arms, origin };
}

// Upsert the derived experiment into sharedContext.experiments (one per channel, keyed by id). A
// re-run UPDATES the same experiment rather than piling up duplicates, so the matrix shows one live
// hypothesis per channel evolving. Best-effort: a derivation or write failure never breaks the run.
export function recordExperimentFromRun({ projectId = "default", graph, result } = {}, options = {}) {
  try {
    const opts = { ...options, projectId };
    const project = loadProject(opts);
    const experiment = deriveExperimentFromRun({ graph, result, sharedContext: project.sharedContext });
    if (!experiment) return null;
    const current = Array.isArray(project.sharedContext?.experiments) ? project.sharedContext.experiments : [];
    const next = current.some((e) => e?.id === experiment.id)
      ? current.map((e) => (e?.id === experiment.id ? { ...e, ...experiment } : e))
      : [...current, experiment];
    updateSharedContext({ experiments: next }, opts);
    return experiment;
  } catch {
    return null;
  }
}
