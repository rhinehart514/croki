// Outside-trigger → proposed experiment — the FOURTH birth source (EXPERIMENT-MACHINE-SPEC "How
// experiments are born": "the crew proposing off real product grounding, the founder seeding an idea, a
// dead experiment's learning mutating into a new one, and an outside trigger").
//
// An external signal (a webhook, an inbound event, a star/fork/signup a scout captured) lands as an
// unrouted input today (inputs-store.mjs). The pull half exists — it sits in the inbox until the founder
// routes it. This module adds the birth half: an outside trigger SPAWNS A PROPOSED EXPERIMENT the founder
// greenlights, as a first-class surfaced move. It NEVER auto-runs, NEVER sends, NEVER routes the input to
// a live channel on its own — it produces an open experiment PROPOSAL (pass 1: free-form, no forced
// shape) and stamps the input as routed-to-proposal so it is not re-proposed. The founder greenlights it
// to run (rail 3); every outward step still hits the wall (rail 1).
//
// PROJECTION + one conservative write, NOT a new schema/enum/role taxonomy (anti-cage). A proposed
// experiment is the SAME open shape every experiment uses; only origin/status/bornFrom mark it as
// trigger-born and awaiting greenlight. The proposal is stored as ordinary editable canvas work, not in
// sharedContext.experiments: the open-canvas contract says model work is canvas material until it needs
// execution. Deterministic code — which inputs qualify is a plain read of their kind/source, not a model
// judgment.

import { loadProject } from "./project-store.mjs";
import { listUnroutedInputs, markRouted } from "./inputs-store.mjs";
import {
  createWorkArtifact,
  getWorkArtifact,
  listWorkArtifacts,
  loadWorkArtifactStore,
  reviseWorkArtifact,
} from "./work-artifact-store.mjs";
import { upsertStatedExperiment } from "./stated-experiment.mjs";
import { gtmPathStore, runStore } from "./gtm-store.mjs";
import { compileRunFromPath } from "./run-compile.mjs";

// Which inputs are OUTSIDE triggers worth proposing an experiment off. This is NOT a closed enum the
// engine branches on for correctness — it is a low, honest floor for "a real external event happened
// out there," read from the input's OPEN kind/source strings. A founder-entered note or an internal
// administrative record is not an outside trigger; a webhook / connector / scout signal is. Anything
// carrying a real external source passes; the ambiguous ones are left in the inbox for the founder to
// route by hand, never force-proposed.
function isOutsideTrigger(input) {
  if (!input || typeof input !== "object") return false;
  if (String(input.status ?? "unrouted") !== "unrouted") return false;
  const source = String(input.source ?? "").trim().toLowerCase();
  const provenanceSource = String(input.provenance?.source ?? "").trim().toLowerCase();
  // A founder-typed note is a SEED (birth source #2), not an outside trigger — exclude it so the two
  // birth sources stay distinct.
  if (source === "founder-entered" || provenanceSource === "founder-entered") return false;
  // A real external event carries a source at all — the inputs store already requires one. Every
  // captured world signal (webhook, connector, csv-drop, github scout) qualifies as a trigger the
  // founder may want to turn into an experiment. The floor is deliberately inclusive: the founder
  // greenlights or ignores, so over-surfacing a proposal is cheaper than dropping a real signal.
  return Boolean(source);
}

// A short, human name for what the trigger is, in the founder's register — never invented, read from
// the input's own kind + source. Used as the proposal's plain-language intent.
function describeTrigger(input) {
  const kind = String(input.kind ?? "signal").trim() || "signal";
  const source = String(input.source ?? "").trim();
  return source ? `${kind} from ${source}` : kind;
}

// Derive a single proposed experiment off one outside-trigger input. Returns an OPEN experiment (pass 1)
// with origin/status marking it as awaiting greenlight, or null if the input is not an outside trigger.
// `bornFrom` is lineage only — a read-time pointer back to the input that triggered it; the input itself
// is not mutated by this derivation (the persist path stamps it separately). NO verdict, NO run.
export function deriveExperimentFromTrigger(input) {
  if (!isOutsideTrigger(input)) return null;
  const label = describeTrigger(input);
  const intent = `An outside trigger came in — ${label}. Propose an experiment off it?`;
  const experiment = {
    id: `exp-trigger-${String(input.id ?? Date.now()).replace(/^input-/, "")}`,
    intent,
    // OPEN unit: no forced arms, no layer, no hypothesis. The founder shapes it before greenlight. The
    // trigger's kind is a soft hint at what dimension to test, left as an open string.
    status: "proposed",
    origin: "proposed",
    // Lineage only — the input this was born from, for the surface to show context. Not a mutation.
    bornFrom: { type: "input", id: String(input.id ?? "") || undefined, kind: input.kind, source: input.source },
  };
  for (const key of Object.keys(experiment)) {
    if (experiment[key] === undefined) delete experiment[key];
  }
  return experiment;
}

function proposalArtifactId(inputId) {
  return `experiment-trigger-${String(inputId ?? "unknown").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 96)}`;
}

function proposalArtifact(projectId, input, experiment) {
  return {
    id: proposalArtifactId(input.id),
    projectId,
    kind: "experiment-proposal",
    title: describeTrigger(input),
    summary: "An outside event suggested a possible experiment. Shape it here, then greenlight it when it is worth running.",
    format: "json",
    contentType: "application/json",
    status: "proposed",
    content: experiment,
    refs: [{ type: "input", id: input.id }],
    provenance: "generated",
    createdBy: { type: "system", id: "experiment-machine", name: "Drover" },
    revisionAuthor: { type: "system", id: "experiment-machine", name: "Drover" },
  };
}

// Read every unrouted outside-trigger input for a project and PROJECT the experiment proposals it would
// spawn, WITHOUT writing anything. Pure read — the surface reads this to show "an outside trigger landed;
// propose an experiment?" without a persist. A trigger already turned into a proposal (its derived
// experiment id already present) is not re-projected.
export function projectTriggerProposals({ projectId = "default" } = {}, options = {}) {
  const opts = { ...options, projectId };
  let unrouted = [];
  let existingArtifactIds = new Set();
  try {
    unrouted = listUnroutedInputs(projectId, opts);
    loadProject(opts);
    existingArtifactIds = new Set(listWorkArtifacts(projectId, { ...opts, includeRetired: true }).map((item) => item.artifactId));
  } catch {
    return [];
  }
  const proposals = [];
  for (const input of unrouted) {
    const experiment = deriveExperimentFromTrigger(input);
    if (!experiment) continue;
    const artifactId = proposalArtifactId(input.id);
    if (existingArtifactIds.has(artifactId)) continue; // already materialized on the canvas
    proposals.push({ input, experiment, artifactId });
  }
  return proposals;
}

// PERSIST a trigger-born proposal as an editable work artifact on the canvas, then mark the input as
// routed-to-proposal so it leaves the raw inbox and is not re-proposed. It NEVER runs the experiment,
// sends, or routes the input into a live pipeline. Idempotent: the artifact id is derived from the input.
// Best-effort on the routing stamp — the canvas proposal is the truth that must not be lost.
export function proposeExperimentFromTrigger({ projectId = "default", inputId } = {}, options = {}) {
  if (!inputId) throw new Error("proposeExperimentFromTrigger requires an inputId (the outside trigger).");
  const opts = { ...options, projectId };
  const unrouted = listUnroutedInputs(projectId, opts);
  const input = unrouted.find((i) => i.id === inputId);
  if (!input) throw new Error(`Unrouted input not found: ${inputId}`);
  const experiment = deriveExperimentFromTrigger(input);
  if (!experiment) throw new Error(`Input ${inputId} is not an outside trigger; no experiment to propose.`);

  loadProject(opts);
  const artifactId = proposalArtifactId(input.id);
  let artifact;
  let created = false;
  try {
    artifact = getWorkArtifact(projectId, artifactId, { ...opts, includeRetired: true });
  } catch {
    const store = loadWorkArtifactStore(projectId, opts);
    artifact = createWorkArtifact(projectId, {
      ...proposalArtifact(projectId, input, experiment),
      expectedStoreRevision: store.revision,
      idempotencyKey: `experiment-trigger:${projectId}:${input.id}`,
    }, opts);
    created = true;
  }

  // Stamp the input as routed to its proposal so it leaves the raw signal inbox and can't be
  // re-proposed. This RECORDS a routing decision (markRouted) — it never runs or sends the pipeline it
  // names; the target is the proposal artifact, not a live pipeline. Best-effort: the proposal already
  // persisted above is what must not be lost.
  try {
    markRouted(projectId, inputId, `work-artifact:${artifact.artifactId}`, opts);
  } catch {
    /* the proposal is durable; a routing-stamp failure is non-fatal */
  }

  return { experiment, artifact, input, created };
}

function proposalPathId(artifactId) {
  return `path-${String(artifactId).replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 108)}`;
}

function proposalLineage(experiment, artifactId) {
  const refs = [{ type: "work-artifact", id: artifactId }];
  if (experiment?.bornFrom?.id) refs.push({ type: experiment.bornFrom.type ?? "input", id: experiment.bornFrom.id });
  if (experiment?.mutatedFrom) refs.push({ type: "experiment", id: experiment.mutatedFrom });
  return refs;
}

function acceptedAt(options = {}) {
  if (typeof options.now === "function") return String(options.now());
  if (options.now) return String(options.now);
  return new Date().toISOString();
}

// Founder-only lifecycle seam for an editable experiment proposal. The proposal remains ordinary pending
// canvas work until this call. Acceptance reuses the stated-experiment authority, creates one deterministic
// GTM path carrying the proposal's lineage, and delegates staging to the existing run compiler. A retry
// reuses the path's already-staged run, so a response lost after compile cannot mint a duplicate run.
export async function acceptExperimentProposal({
  projectId = "default",
  artifactId,
  experiment: founderEdit = null,
  path: pathEdit = null,
  runPlan = null,
  input = null,
  output = null,
  compose,
} = {}, options = {}) {
  if (!artifactId) throw new Error("acceptExperimentProposal requires an artifactId.");
  const opts = { ...options, projectId };
  let artifact = getWorkArtifact(projectId, artifactId, { ...opts, includeRetired: false });
  if (artifact.kind !== "experiment-proposal") throw new Error(`Work artifact ${artifactId} is not an experiment proposal.`);
  if (artifact.status === "rejected") throw new Error(`Experiment proposal ${artifactId} was rejected.`);

  if (artifact.status === "accepted" && artifact.content?.lifecycle?.runId) {
    const lifecycle = artifact.content.lifecycle;
    return {
      artifact,
      experiment: loadProject(opts).sharedContext?.experiments?.find((item) => item?.id === lifecycle.experimentId) ?? null,
      path: gtmPathStore.get(lifecycle.pathId, opts),
      run: runStore.get(lifecycle.runId, opts),
      created: false,
    };
  }
  if (artifact.status !== "proposed") throw new Error(`Experiment proposal ${artifactId} is not pending.`);

  const original = artifact.content && typeof artifact.content === "object" ? artifact.content : {};
  const edited = founderEdit && typeof founderEdit === "object"
    ? {
        ...original,
        ...founderEdit,
        ...(original.bornFrom ? { bornFrom: original.bornFrom } : {}),
        ...(original.mutatedFrom ? { mutatedFrom: original.mutatedFrom } : {}),
      }
    : original;
  if (!String(edited.intent ?? edited.hypothesis ?? "").trim()) {
    throw new Error("An accepted experiment proposal needs an intent or hypothesis.");
  }

  if (founderEdit) {
    artifact = reviseWorkArtifact(projectId, artifactId, {
      content: edited,
      expectedArtifactRevision: artifact.revision,
      revisionAuthor: { type: "founder", id: "founder" },
    }, opts);
  }

  const statedResult = upsertStatedExperiment({
    projectId,
    experiment: { ...edited, status: "staged" },
  }, opts);
  const experiment = statedResult.experiment;
  const pathId = proposalPathId(artifactId);
  const lineage = proposalLineage(edited, artifactId);
  const requestedPath = pathEdit && typeof pathEdit === "object" ? pathEdit : {};
  const pathRecord = {
    ...requestedPath,
    id: pathId,
    projectId,
    summary: String(requestedPath.summary ?? edited.path?.summary ?? edited.intent ?? edited.hypothesis).trim(),
    angle: requestedPath.angle ?? edited.path?.angle ?? edited.targetLayer ?? null,
    bet: requestedPath.bet ?? edited.path?.bet ?? edited.bet ?? {},
    restsOn: [...lineage, ...(requestedPath.restsOn ?? edited.path?.restsOn ?? edited.restsOn ?? [])],
    status: "selected",
  };
  let path;
  try {
    const current = gtmPathStore.get(pathId, opts);
    path = gtmPathStore.save({ ...current, ...pathRecord, createdAt: current.createdAt }, opts);
  } catch {
    path = gtmPathStore.create(pathRecord, opts);
  }

  let run = runStore.list(opts).find((candidate) => candidate?.pathId === path.id) ?? null;
  if (!run) {
    if (typeof compose !== "function") throw new Error("Accepting a proposal needs a composer to stage its run.");
    ({ run } = await compileRunFromPath({
      projectId,
      pathId: path.id,
      runPlan: runPlan ?? edited.runPlan ?? null,
      input: input ?? edited.input ?? null,
      output: output ?? edited.output ?? null,
      compose,
      options: opts,
    }));
  }

  const lifecycle = {
    decision: "accepted",
    acceptedAt: acceptedAt(options),
    experimentId: experiment.id,
    pathId: path.id,
    runId: run.id,
  };
  artifact = reviseWorkArtifact(projectId, artifactId, {
    status: "accepted",
    content: { ...edited, lifecycle },
    refs: [...artifact.refs, { type: "experiment", id: experiment.id }, { type: "path", id: path.id }, { type: "run", id: run.id }],
    expectedArtifactRevision: artifact.revision,
    revisionAuthor: { type: "founder", id: "founder" },
  }, opts);
  return { artifact, experiment, path, run, created: true };
}

// Rejection is a durable proposal decision, not deletion: lineage and the founder-edited content remain
// inspectable, while the proposal leaves the pending inbox and creates no experiment, path, or run.
export function rejectExperimentProposal({ projectId = "default", artifactId, reason = null } = {}, options = {}) {
  if (!artifactId) throw new Error("rejectExperimentProposal requires an artifactId.");
  const opts = { ...options, projectId };
  const artifact = getWorkArtifact(projectId, artifactId, { ...opts, includeRetired: false });
  if (artifact.kind !== "experiment-proposal") throw new Error(`Work artifact ${artifactId} is not an experiment proposal.`);
  if (artifact.status === "accepted") throw new Error(`Experiment proposal ${artifactId} was already accepted.`);
  if (artifact.status === "rejected") return { artifact, created: false };
  if (artifact.status !== "proposed") throw new Error(`Experiment proposal ${artifactId} is not pending.`);
  const lifecycle = { decision: "rejected", rejectedAt: acceptedAt(options), ...(reason ? { reason: String(reason) } : {}) };
  const rejected = reviseWorkArtifact(projectId, artifactId, {
    status: "rejected",
    content: { ...(artifact.content ?? {}), lifecycle },
    expectedArtifactRevision: artifact.revision,
    revisionAuthor: { type: "founder", id: "founder" },
  }, opts);
  return { artifact: rejected, created: true };
}
