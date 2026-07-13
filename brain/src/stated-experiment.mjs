// Stated experiment — a founder/operator GROUPS existing motions into one experiment.
//
// This is the other hand on the experiment, alongside the run-deriver (experiment-derivation.mjs) and
// the founder verdict (belief-writeback.mjs). A derived experiment is what a single channel run already
// produced; a STATED experiment is the founder (or the operator, as a SUGGESTION the founder confirms)
// declaring that two motions are really two ARMS of one belief test — e.g. RodentRadar's PCO Outbound
// and Restaurant Outbound are two arms of one ICP experiment, the $49 pilot held constant.
//
// Grouping is post-hoc CONTEXT, never a precondition and never a gate: it records a relationship the
// founder sees, it does not block, trigger, or shape any run. It is never auto-inferred from
// channel-name similarity — the operator may SUGGEST it (the group_experiment MCP tool), but only the
// founder confirms it, and there is NO agent path to a verdict. The write NEVER sets `verdict`: the
// founder verdict is a separate, strictly-post-gate hand (belief-writeback.mjs), and a re-statement
// must never clobber it.

import { loadProject, updateSharedContext } from "./project-store.mjs";

function slug(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function upsertStatedExperiment({ projectId, experiment } = {}, options = {}) {
  if (!experiment || typeof experiment !== "object") {
    throw new Error("upsertStatedExperiment requires an experiment.");
  }

  // An experiment is an OPEN unit (EXPERIMENT-MACHINE-SPEC.md "The experiment"): any dimension, crew-
  // sized, no required fields, no hypothesis ceremony. It is creatable from just a free-form intent.
  // `targetLayer` (which strategic dimension it varies) and `arms` (the motions it groups) are OPTIONAL
  // context the founder may add, never a precondition. Forcing either re-created the killed
  // program/portfolio shape the harness exists to prevent. The only real requirement is SOMETHING to
  // name the bet — an intent, a hypothesis, a layer, or at least one arm.
  const targetLayer = String(experiment.targetLayer ?? "").trim();
  const intent = String(experiment.intent ?? experiment.hypothesis ?? "").trim();

  const rawArms = Array.isArray(experiment.arms) ? experiment.arms.filter((a) => a && (a.channelId || a.label)) : [];
  const arms = rawArms.map((arm, i) => ({
    id: String(arm.id ?? `arm-${slug(arm.label ?? arm.channelId ?? String(i))}`),
    label: String(arm.label ?? arm.channelId ?? `Arm ${i + 1}`),
    kind: String(arm.kind ?? "channel"),
    channelId: arm.channelId ?? null,
  }));

  // The one floor: an experiment cannot be an empty shell. Any single naming signal satisfies it.
  if (!targetLayer && !intent && arms.length < 1) {
    throw new Error("A stated experiment needs at least an intent, a hypothesis, a layer, or one arm.");
  }

  const idBasis = experiment.hypothesis || intent || arms.map((a) => a.label).join("-") || targetLayer;
  const id = String(
    experiment.id ?? `exp-stated-${[slug(targetLayer), slug(idBasis)].filter(Boolean).join("-") || Date.now()}`,
  ).trim();

  const stated = {
    id,
    // Blank targetLayer / empty arms stay OPEN — dropped below rather than persisted as forced defaults,
    // so the board surfaces a layerless experiment on the Learn band and the founder can add either later.
    targetLayer: targetLayer || undefined,
    arms: arms.length ? arms : undefined,
    intent: intent || undefined,
    hypothesis: experiment.hypothesis ? String(experiment.hypothesis).trim() : undefined,
    heldConstant: experiment.heldConstant ? String(experiment.heldConstant).trim() : undefined,
    status: experiment.status ? String(experiment.status) : "running",
    origin: "stated",
  };
  for (const key of Object.keys(stated)) {
    if (stated[key] === undefined) delete stated[key];
  }

  const opts = projectId ? { ...options, projectId } : options;
  const project = loadProject(opts);
  const current = Array.isArray(project.sharedContext?.experiments) ? project.sharedContext.experiments : [];
  // Upsert by id. CRITICAL: a re-statement merges the stated fields but PRESERVES any existing founder
  // `verdict` — the verdict is the founder's hand alone and must survive a regroup.
  const next = current.some((e) => e?.id === id)
    ? current.map((e) => (e?.id === id ? { ...e, ...stated, verdict: e.verdict } : e))
    : [...current, stated];

  const saved = updateSharedContext({ experiments: next }, opts);
  return {
    experiments: saved.sharedContext.experiments,
    experiment: saved.sharedContext.experiments.find((e) => e?.id === id) ?? null,
  };
}
