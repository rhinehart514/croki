// Experiment derivation — a run actually PRODUCES a GtmExperiment.
//
// One live experiment per channel (mirrors the GtmExperiment shape in ui/src/types.ts): the drafted
// approach is the variable under test, the audience source is held constant. A derived experiment
// carries NO hypothesis — the variable names what is being tested in the pipeline's own words; the
// founder's typed goal is a goal, not a hypothesis, and echoing it back as one dressed the goal up as
// learning. Derived from real run state only — any field that can't be grounded is left undefined
// (honest blank), never fabricated.
//
// APPROVAL IS NOT AN OUTCOME (VISION.md:85, EXPERIMENT-MACHINE-SPEC.md). A derived experiment NEVER
// reads the founder's gate/approval decisions as its result or success signal. The founder's approval
// gates what goes outward; it is not a market result. An experiment's outcome and learning come ONLY
// from real market results (reply, meeting, purchase, signup, ignored, objection) joined back to the
// run via outcome-ingest.mjs, and are read by belief-writeback.mjs / suggestVerdictFromOutcomes when
// the founder renders a verdict. This module produces the experiment's identity and shape at run time;
// it leaves `result` and any market signal to that separate outcome-join path so approval can never be
// mistaken for a win. It is upserted into sharedContext.experiments on run completion and again on gate
// resolution (identity only), exactly where promoteEntrantsFromRun already promotes the run's people.

import { loadProject, updateSharedContext } from "./project-store.mjs";

// One deterministic evidence vocabulary shared by every experiment read. Outcome kinds stay open: known
// labels are normalized for comparison, while unfamiliar labels remain intact and honestly "unknown".
// A known negative can never count as success, even when a loose success target happens to share its text.
const OUTCOME_ALIASES = new Map(Object.entries({
  replies: "reply", response: "reply", responses: "reply", responded: "reply", replied: "reply",
  "email-response": "reply", "email-reply": "reply",
  meetings: "meeting", call: "meeting", calls: "meeting", booked: "meeting", "booked-call": "meeting", "booked-calls": "meeting",
  signups: "signup", "signed-up": "signup", registrations: "signup", registration: "signup",
  purchases: "purchase", paid: "purchase", payment: "purchase", payments: "purchase", orders: "purchase",
  conversions: "conversion", converted: "conversion", activations: "activation", retained: "retention",
  objections: "objection", ignored: "ignored", "no-response": "ignored", "no-reply": "ignored", silence: "ignored",
  bounces: "bounce", bounced: "bounce", unsubscribed: "unsubscribe", unsubscribes: "unsubscribe",
  declined: "decline", rejected: "rejection", cancelled: "cancellation", canceled: "cancellation",
}));

const POSITIVE_OUTCOMES = new Set(["reply", "meeting", "signup", "activation", "purchase", "conversion", "retention"]);
const NEGATIVE_OUTCOMES = new Set(["ignored", "objection", "bounce", "unsubscribe", "decline", "rejection", "churn", "cancellation", "no-show", "failure", "failed"]);
const NEUTRAL_OUTCOMES = new Set(["sent", "delivered", "open", "opened", "view", "impression"]);

export function normalizeOutcomeKind(value) {
  const raw = String(value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!raw) return "";
  const withoutGot = raw.replace(/^got-/, "");
  return OUTCOME_ALIASES.get(withoutGot) ?? withoutGot.replace(/ies$/, "y").replace(/s$/, "");
}

export function outcomePolarity(value) {
  const kind = normalizeOutcomeKind(value);
  if (!kind) return "unknown";
  if (POSITIVE_OUTCOMES.has(kind)) return "positive";
  if (NEGATIVE_OUTCOMES.has(kind)) return "negative";
  if (NEUTRAL_OUTCOMES.has(kind)) return "neutral";
  return "unknown";
}

export function outcomeMatchesTarget(outcomeKind, targetKind) {
  const outcome = normalizeOutcomeKind(outcomeKind);
  const target = normalizeOutcomeKind(targetKind);
  return Boolean(outcome && target && outcome === target);
}

export function outcomeCountsAsSuccess(outcomeKind, targetKinds = []) {
  if (outcomePolarity(outcomeKind) === "negative") return false;
  const targets = (Array.isArray(targetKinds) ? targetKinds : [targetKinds]).map(normalizeOutcomeKind).filter(Boolean);
  return targets.length > 0
    ? targets.some((target) => outcomeMatchesTarget(outcomeKind, target))
    : outcomePolarity(outcomeKind) === "positive";
}

// The canonical founder-facing statement for an experiment. This is also the exact statement promoted to
// a durable claim when the founder accepts it, so intent-only experiments do not lose their belief.
export function experimentStatement(experiment) {
  for (const value of [experiment?.hypothesis, experiment?.intent, experiment?.variable]) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

export function deriveExperimentFromRun({ graph, result, sharedContext } = {}) {
  const channelId = graph?.id ?? result?.graphId ?? null;
  if (!channelId) return null;
  const graphNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];

  // A pending gate means the run is paused for founder review; otherwise it has run to completion.
  // This is run LIFECYCLE, not an outcome — no approval count is read here.
  const pending = Array.isArray(result?.pendingGates) && result.pendingGates.length > 0;
  // A graph failure is evidence that the experiment did not complete. Keep the experiment visible as failed
  // rather than laundering a broken run into a completed test.
  const status = result?.ok === false ? "failed" : pending ? "running" : "complete";

  // The experiment's `result` is deliberately left blank here. It is NOT the gate's staged/approved/
  // rejected tally — approval is not a market outcome. Real results arrive later through outcome-ingest
  // and are read from the result ledger, never synthesized from the founder's approval click.
  const resultStr = undefined;

  // The graph's own shape names what's being tested vs held constant.
  const sourceNode = graphNodes.find((n) => n.category === "source");
  const measureNode = graphNodes.find((n) => n.category === "measure");
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
    // The success signal is a market signal, named by the measure step when the pipeline has one — never
    // "founder approval at the gate". Approval gates the send; it is not what proves the bet worked. When
    // no measure step names it, the signal stays blank and the real answer comes from joined outcomes.
    successSignal: measureNode?.label || undefined,
    status,
    // Blank until a real market outcome joins back — never a gate tally. See the header note.
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

// Read-time shim: a channel-bound experiment persisted before arms/origin existed is back-filled so
// every reader (the board, the matrix) sees the full shape without a migration write. Idempotent and
// non-destructive — it never overwrites a real targetLayer, arms, verdict, or origin already present,
// and it never INVENTS a targetLayer: an experiment without one stays layerless (open on read; the
// board surfaces it on the Learn band) instead of being force-filed under "channels".
//
// It also never INVENTS an arm. An experiment IS an open unit (EXPERIMENT-MACHINE-SPEC.md): a stated
// experiment created from a free-form intent may vary a dimension that is not a channel and may group
// no motions at all. Only a channel-bound experiment gets a single back-filled channel arm; an armless
// open experiment stays armless (`arms: []`) rather than being forced into a phantom "channel" arm.
export function normalizeExperiment(exp) {
  if (!exp || typeof exp !== "object") return exp;
  const arms = Array.isArray(exp.arms) && exp.arms.length
    ? exp.arms
    : exp.channelId
      ? [{
          id: `arm-${exp.channelId}`,
          label: exp.variable || exp.hypothesis || exp.intent || exp.channelId,
          kind: "channel",
          channelId: exp.channelId,
        }]
      : [];
  // Origin is open provenance. Preserve an explicit "proposed" (or future origin) instead of collapsing
  // everything non-stated into derived; only legacy records with no origin receive the derived fallback.
  const origin = String(exp.origin ?? "").trim() || "derived";
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
