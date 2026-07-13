// Mutation-from-a-loser — the machine LEARNS from a dying bet and proposes a VARIANT FORWARD
// (EXPERIMENT-MACHINE-SPEC rail 2: "Only the founder kills an experiment. The machine may learn from a
// dying bet and propose a mutation, but never ends one itself.").
//
// This module NEVER auto-kills. It reads experiments the FOUNDER has already killed (verdict.decision
// === "kill", the founder-only stamp from belief-writeback.mjs), and derives a NEW open experiment
// mutated off the loser — one crew-judged dimension varied — as a PROPOSAL the founder
// greenlights. It writes ONLY a proposed experiment; it never touches, mutates, ends, re-verdicts, or
// re-runs the loser, and it never runs the variant. The variant is an OPEN unit (pass 1): a free-form
// open experiment, `origin: "proposed"`, `status: "proposed"`, no forced shape, no hypothesis ceremony.
//
// It is a PROJECTION + a single conservative write into the existing open-work authority — NOT a new
// schema, enum, or role taxonomy (anti-cage). The proposal becomes editable canvas material before it
// becomes executable. The founder greenlights it to run (rail 3) and every outward step still hits the
// wall (rail 1). Which dimension should change remains crew judgment; the host never hardcodes a four-item
// experiment taxonomy and pretends that is strategy.

import { loadProject } from "./project-store.mjs";
import {
  createWorkArtifact,
  getWorkArtifact,
  listWorkArtifacts,
  loadWorkArtifactStore,
} from "./work-artifact-store.mjs";
import { acceptExperimentProposal, rejectExperimentProposal } from "./trigger-proposal.mjs";

// A loser is an experiment the FOUNDER killed. An operationally failed run is a broken attempt, not market
// evidence against the bet, so it must be retried or repaired rather than silently mutated into strategy.
// We read a kill ONLY from `verdict.decision === "kill"` — the founder-only stamp.
export function isLoser(experiment) {
  if (!experiment || typeof experiment !== "object") return false;
  return experiment.verdict?.decision === "kill";
}

// Read the loser's own shape to name what it varied and what it held, so the variant can vary ONE new
// dimension while keeping the rest. Everything is a best-effort read of open fields — a loser that
// carried none still yields a variant that simply proposes a fresh approach on the same bet.
function describeLoser(experiment) {
  const variedLabel = String(experiment.variable ?? experiment.intent ?? experiment.hypothesis ?? "").trim();
  const held = String(experiment.heldConstant ?? "").trim();
  const learning = String(
    experiment.verdict?.reason
      ?? experiment.verdict?.learning
      ?? experiment.learning
      ?? experiment.result
      ?? "",
  ).trim();
  return { variedLabel, held, learning };
}

// Derive a single variant PROPOSAL off one loser. Returns an OPEN experiment (pass 1) with
// origin/status marking it as awaiting the founder's greenlight — or null if the input is not a loser.
// It NEVER references the loser as ended, and NEVER carries a verdict of its own (the founder verdicts
// the variant only after it has run and produced real signal). The `mutatedFrom` pointer is lineage
// only — a read-time link back to the bet it learned from, never a mutation of that bet.
export function deriveVariantFromLoser(experiment) {
  if (!isLoser(experiment)) return null;
  const loser = describeLoser(experiment);

  const loserName = loser.variedLabel || loser.held || experiment.id || "the last bet";
  // Plain-language intent: learn forward from the founder-killed bet. The crew chooses the smallest
  // meaningful change from the recorded learning when this is greenlit; the host never chooses a fixed
  // message/ICP/channel/product bucket on its behalf.
  const intent = `Shape the next variant after "${loserName}" fell short — keep the underlying bet and change one crew-judged dimension.`;

  const variant = {
    id: `exp-variant-${String(experiment.id ?? Date.now()).replace(/^exp-/, "")}`,
    intent,
    heldConstant: loser.held || undefined,
    learning: loser.learning || undefined,
    crewInstruction: "Read the recorded outcome and founder decision, then propose the smallest meaningful change. Do not re-run the same bet unchanged.",
    // OPEN unit: no arms forced, no hypothesis ceremony. It carries only the varied dimension and the
    // held constant, both open strings. The founder edits before greenlight if they want more.
    status: "proposed",
    origin: "proposed",
    // Lineage only — a read-time pointer back to the bet this learned from. NOT a write onto the loser.
    mutatedFrom: String(experiment.id ?? "") || undefined,
  };
  for (const key of Object.keys(variant)) {
    if (variant[key] === undefined) delete variant[key];
  }
  return variant;
}

function proposalArtifactId(experimentId) {
  return `experiment-variant-${String(experimentId ?? "unknown").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 96)}`;
}

function proposalArtifact(projectId, loser, variant) {
  return {
    id: proposalArtifactId(loser.id),
    projectId,
    kind: "experiment-proposal",
    title: `Variant after ${String(loser.variable ?? loser.intent ?? loser.hypothesis ?? "a bet").trim() || "a bet"}`,
    summary: "The founder ended the prior bet. Shape the next variant here; Drover will not kill or rerun anything on its own.",
    format: "json",
    contentType: "application/json",
    status: "proposed",
    content: variant,
    refs: [{ type: "experiment", id: loser.id }],
    provenance: "generated",
    createdBy: { type: "system", id: "experiment-machine", name: "Drover" },
    revisionAuthor: { type: "system", id: "experiment-machine", name: "Drover" },
  };
}

// Read every loser in a project and PROJECT the variant proposals it would spawn, WITHOUT writing
// anything. Pure read — the surface (pending inbox) reads this to show "the machine learned from a dying
// bet; greenlight the variant?" without a persist. A variant already proposed (its id already present)
// is not re-projected, so the list is the set of losers that have NOT yet had a variant surfaced.
export function projectLoserMutations({ projectId = "default" } = {}, options = {}) {
  const opts = { ...options, projectId };
  let experiments = [];
  let existingArtifactIds = new Set();
  try {
    const project = loadProject(opts);
    experiments = Array.isArray(project.sharedContext?.experiments) ? project.sharedContext.experiments : [];
    existingArtifactIds = new Set(listWorkArtifacts(projectId, { ...opts, includeRetired: true }).map((item) => item.artifactId));
  } catch {
    return [];
  }
  const proposals = [];
  for (const experiment of experiments) {
    const variant = deriveVariantFromLoser(experiment);
    if (!variant) continue;
    const artifactId = proposalArtifactId(experiment.id);
    if (existingArtifactIds.has(artifactId)) continue; // already materialized on the canvas
    proposals.push({ loser: experiment, variant, artifactId });
  }
  return proposals;
}

// PERSIST a variant proposal as editable canvas work. CONSERVATIVE by construction: it creates only the
// proposal artifact and leaves the loser exactly as it was — the loser is read, never rewritten.
// Idempotent: the artifact id is derived from the loser. It NEVER sets a verdict, runs, or ends anything.
export function proposeVariantFromLoser({ projectId = "default", experimentId } = {}, options = {}) {
  if (!experimentId) throw new Error("proposeVariantFromLoser requires an experimentId (the loser).");
  const opts = { ...options, projectId };
  const project = loadProject(opts);
  const experiments = Array.isArray(project.sharedContext?.experiments) ? project.sharedContext.experiments : [];
  const loser = experiments.find((e) => e?.id === experimentId);
  if (!loser) throw new Error(`Experiment not found: ${experimentId}`);
  const variant = deriveVariantFromLoser(loser);
  if (!variant) throw new Error(`Experiment ${experimentId} is not founder-killed; no variant to propose.`);

  const artifactId = proposalArtifactId(loser.id);
  try {
    const artifact = getWorkArtifact(projectId, artifactId, { ...opts, includeRetired: true });
    return { artifact, experiment: variant, variant, created: false };
  } catch {
    // Continue into the single create below.
  }
  const store = loadWorkArtifactStore(projectId, opts);
  const artifact = createWorkArtifact(projectId, {
    ...proposalArtifact(projectId, loser, variant),
    expectedStoreRevision: store.revision,
    idempotencyKey: `experiment-variant:${projectId}:${loser.id}`,
  }, opts);
  return {
    artifact,
    experiment: variant,
    variant,
    created: true,
  };
}

// Named wrappers keep the loser lifecycle leg explicit while sharing the single proposal acceptance
// authority. `acceptExperimentProposal` preserves `mutatedFrom` on the path and accepted artifact.
export function acceptVariantProposal(input = {}, options = {}) {
  return acceptExperimentProposal(input, options);
}

export function rejectVariantProposal(input = {}, options = {}) {
  return rejectExperimentProposal(input, options);
}
