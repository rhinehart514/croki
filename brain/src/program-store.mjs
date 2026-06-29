import crypto from "node:crypto";
import { rebuildProjectState } from "./program-projection.mjs";
import { persistence } from "./persistence.mjs";

const SCHEMA_VERSION = 2;
const COLLECTION = "programs";

// Lifecycle is the founder-controlled state of an outcome program. It is deliberately small and
// orthogonal to the run outcome: a program is a draft until it is composed/accepted, active while
// the founder runs it, and retired when the founder shelves it. The disposable run outcome lives in
// `lastRunStatus` (running / waiting_for_gate / learning / complete / blocked / null) and has NO
// state machine — the run path writes it directly.
export const PROGRAM_LIFECYCLES = ["draft", "active", "retired"];

const TRANSITIONS = new Map([
  ["draft", new Set(["active", "retired"])],
  // active → active is a no-op (handled by the equality short-circuit), so it is not listed here.
  ["active", new Set(["retired"])],
  ["retired", new Set([])],
]);

// Legacy single-`status` → split mapping. Used by both the on-disk migration (schemaVersion 1 → 2)
// and the event back-compat fold (a legacy ProgramStatusChanged carrying data.status). The lifecycle
// value is derived; the run value, when the legacy status was a run outcome, is preserved.
const LEGACY_STATUS_MAP = new Map([
  ["draft", { lifecycle: "draft", lastRunStatus: null }],
  ["ready", { lifecycle: "active", lastRunStatus: null }],
  ["active", { lifecycle: "active", lastRunStatus: null }],
  ["retired", { lifecycle: "retired", lastRunStatus: null }],
  ["running", { lifecycle: "active", lastRunStatus: "running" }],
  ["waiting_for_gate", { lifecycle: "active", lastRunStatus: "waiting_for_gate" }],
  ["learning", { lifecycle: "active", lastRunStatus: "learning" }],
  ["complete", { lifecycle: "active", lastRunStatus: "complete" }],
  ["blocked", { lifecycle: "active", lastRunStatus: "blocked" }],
  // "paused" was removed from the model; a paused program is simply active with no live run.
  ["paused", { lifecycle: "active", lastRunStatus: null }],
]);

function now() {
  return new Date().toISOString();
}

function safeId(value) {
  return String(value || "program").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "program";
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54);
}

function keyFor(projectId) {
  return safeId(projectId || "default");
}

function emptyStore(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, programs: [] };
}

// Map one persisted program record to the schemaVersion-2 shape: split the single legacy `status`
// into `lifecycle` + `lastRunStatus`, and backfill the lineage triplet. Idempotent — a record that
// already has a `lifecycle` and the triplet passes through with `status` stripped.
export function migrateProgram(record = {}) {
  if (!record || typeof record !== "object") return record;
  const { status, ...rest } = record;
  const migrated = { ...rest };
  if (migrated.lifecycle === undefined || migrated.lastRunStatus === undefined) {
    const mapped = LEGACY_STATUS_MAP.get(String(status ?? "draft")) ?? { lifecycle: "draft", lastRunStatus: null };
    if (migrated.lifecycle === undefined) migrated.lifecycle = mapped.lifecycle;
    if (migrated.lastRunStatus === undefined) migrated.lastRunStatus = mapped.lastRunStatus;
  }
  if (migrated.lineageId === undefined || migrated.lineageId === null) migrated.lineageId = migrated.id;
  if (migrated.previousProgramId === undefined) migrated.previousProgramId = null;
  if (migrated.version === undefined || migrated.version === null) migrated.version = 1;
  return migrated;
}

export function loadProgramStore(projectId = "default", options = {}) {
  const stored = persistence(options).get(COLLECTION, keyFor(projectId));
  if (!stored) return emptyStore(projectId);
  const programs = Array.isArray(stored?.programs) ? stored.programs : [];
  // Migrate every record when the on-disk schema predates the status split, mirroring
  // project-store.mjs's migrateProject pattern. migrateProgram is idempotent, so running it on an
  // already-current store is harmless.
  if (stored?.schemaVersion === SCHEMA_VERSION && Array.isArray(stored.programs)) {
    return { ...stored, programs: programs.map(migrateProgram) };
  }
  return {
    ...emptyStore(projectId),
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    programs: programs.map(migrateProgram),
  };
}

export function saveProgramStore(store, options = {}) {
  const durable = {
    ...store,
    schemaVersion: SCHEMA_VERSION,
    programs: Array.isArray(store.programs) ? store.programs : [],
  };
  persistence(options).set(COLLECTION, keyFor(durable.projectId), durable);
  return durable;
}

export function syncProgramStoreFromEvents(projectId = "default", options = {}) {
  const existing = loadProgramStore(projectId, options).programs;
  const projected = rebuildProjectState(projectId, options).programs;
  const projectedIds = new Set(projected.map((program) => program.id));
  const programs = [
    ...existing.filter((program) => !projectedIds.has(program.id)),
    ...projected,
  ];
  saveProgramStore({ schemaVersion: SCHEMA_VERSION, projectId, programs }, options);
  return programs;
}

export function listOutcomePrograms(projectId = "default", options = {}) {
  return loadProgramStore(projectId, options).programs;
}

export function getOutcomeProgram(programId, projectId = "default", options = {}) {
  const program = loadProgramStore(projectId, options).programs.find((item) => item.id === programId);
  if (!program) throw new Error(`Outcome program not found: ${programId}`);
  return program;
}

export function buildOutcomeProgram(input = {}, options = {}) {
  const projectId = input.projectId || options.projectId || "default";
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Outcome program name is required.");
  const store = loadProgramStore(projectId, options);
  const existingIds = new Set(store.programs.map((program) => program.id));
  const base = slug(input.id || name);
  let id = `program-${base || crypto.randomBytes(4).toString("hex")}`;
  let i = 2;
  while (existingIds.has(id)) id = `program-${base}-${i++}`;
  const createdAt = now();
  const program = {
    id,
    lineageId: input.lineageId ?? id,
    previousProgramId: input.previousProgramId ?? null,
    version: 1,
    projectId,
    name,
    desiredOutcome: input.desiredOutcome ?? {
      type: String(input.outcomeType || "business_outcome"),
      target: input.target ?? null,
      description: String(input.objective || "").trim(),
    },
    buyerHypothesis: input.buyerHypothesis ?? {},
    channelHypothesis: input.channelHypothesis ?? {},
    measurementPlan: input.measurementPlan ?? {},
    lifecycle: normalizeLifecycle(input.lifecycle ?? "draft"),
    lastRunStatus: input.lastRunStatus ?? null,
    sourceOpportunityId: input.sourceOpportunityId ?? null,
    channelId: input.channelId ?? null,
    graphId: input.graphId ?? null,
    workflowGraph: input.workflowGraph ?? null,
    createdAt,
    updatedAt: createdAt,
  };
  return program;
}

export function createOutcomeProgram(input = {}, options = {}) {
  const projectId = input.projectId || options.projectId || "default";
  const store = loadProgramStore(projectId, options);
  const program = buildOutcomeProgram(input, options);
  saveProgramStore({ ...store, programs: [...store.programs, program] }, options);
  return program;
}

export function updateOutcomeProgram(programId, patch = {}, options = {}) {
  const projectId = options.projectId || patch.projectId || "default";
  const store = loadProgramStore(projectId, options);
  let found = false;
  const allowed = new Set([
    "name", "desiredOutcome", "buyerHypothesis", "channelHypothesis", "measurementPlan",
    "lifecycle", "lastRunStatus", "lineageId", "previousProgramId", "version",
    "channelId", "graphId", "workflowGraph",
  ]);
  const unknown = Object.keys(patch).filter((key) => key !== "projectId" && !allowed.has(key));
  if (unknown.length) throw new Error(`Unsupported outcome program fields: ${unknown.join(", ")}`);
  const programs = store.programs.map((program) => {
    if (program.id !== programId) return program;
    found = true;
    const nextPatch = structuredClone(patch);
    // Lifecycle is normalized (legacy "ready"/"active" coerce to "active"). lastRunStatus is a
    // disposable run value written directly by the run path with no validation.
    if (nextPatch.lifecycle !== undefined) nextPatch.lifecycle = normalizeLifecycle(nextPatch.lifecycle);
    return { ...program, ...nextPatch, projectId, updatedAt: now() };
  });
  if (!found) throw new Error(`Outcome program not found: ${programId}`);
  saveProgramStore({ ...store, programs }, options);
  return programs.find((program) => program.id === programId);
}

export function defineMeasurementPlan(programId, measurementPlan = {}, options = {}) {
  return updateOutcomeProgram(programId, { measurementPlan: normalizeMeasurementPlan(measurementPlan) }, options);
}

export function normalizeMeasurementPlan(measurementPlan = {}) {
  const plan = {
    outcomeEvent: String(measurementPlan.outcomeEvent || "").trim(),
    joinKey: String(measurementPlan.joinKey || "").trim(),
    attributionSource: measurementPlan.attributionSource ?? null,
    blindSpots: Array.isArray(measurementPlan.blindSpots) ? measurementPlan.blindSpots : [],
    createdAt: measurementPlan.createdAt ?? now(),
  };
  if (!plan.outcomeEvent) throw new Error("Measurement plan requires an outcome event.");
  if (!plan.joinKey) throw new Error("Measurement plan requires an attribution join key.");
  return plan;
}

// Founder-controlled lifecycle transition. The disposable run outcome (lastRunStatus) is written by
// the run path through updateOutcomeProgram and is NOT routed through here.
export function transitionOutcomeProgram(programId, lifecycle, options = {}) {
  const projectId = options.projectId || "default";
  const current = getOutcomeProgram(programId, projectId, options);
  const nextLifecycle = validateOutcomeProgramTransition(current.lifecycle, lifecycle);
  if (current.lifecycle === nextLifecycle) return current;
  return updateOutcomeProgram(programId, { lifecycle: nextLifecycle }, options);
}

export function validateOutcomeProgramTransition(currentLifecycle, nextLifecycle) {
  const current = normalizeLifecycle(currentLifecycle);
  const next = normalizeLifecycle(nextLifecycle);
  if (current === next) return next;
  const allowed = TRANSITIONS.get(current) ?? new Set();
  if (!allowed.has(next)) {
    throw new Error(`Invalid outcome program lifecycle transition: ${current} → ${next}`);
  }
  return next;
}

// Revise a program along its lineage, mirroring reviseAgentPolicyFromFeedback. The program keeps the
// same record id for continuity (per the contract) but becomes a new version: version is bumped,
// previousProgramId points at the prior id, and lineageId is preserved. The patch carries the
// changed bags (desiredOutcome, buyerHypothesis, channelHypothesis, measurementPlan, etc.).
// lastRunStatus resets to null because a revised program has not been re-run yet.
export function reviseOutcomeProgram(programId, patch = {}, options = {}) {
  const projectId = options.projectId || patch.projectId || "default";
  const store = loadProgramStore(projectId, options);
  const current = store.programs.find((program) => program.id === programId);
  if (!current) throw new Error(`Outcome program not found: ${programId}`);
  const allowed = new Set([
    "name", "desiredOutcome", "buyerHypothesis", "channelHypothesis", "measurementPlan",
    "channelId", "graphId", "workflowGraph", "revisionReason",
  ]);
  const unknown = Object.keys(patch).filter((key) => key !== "projectId" && !allowed.has(key));
  if (unknown.length) throw new Error(`Unsupported outcome program fields: ${unknown.join(", ")}`);
  const nextPatch = structuredClone(patch);
  delete nextPatch.projectId;
  const revised = {
    ...current,
    ...nextPatch,
    lineageId: current.lineageId ?? current.id,
    previousProgramId: current.id,
    version: (current.version ?? 1) + 1,
    lastRunStatus: null,
    projectId,
    updatedAt: now(),
  };
  const programs = store.programs.map((program) => (program.id === programId ? revised : program));
  saveProgramStore({ ...store, programs }, options);
  return revised;
}

export function ensureOutcomeProgramForChannel(project, channelOpportunity, options = {}) {
  const projectId = project?.id || options.projectId || "default";
  const store = loadProgramStore(projectId, options);
  const existing = store.programs.find((program) => program.sourceOpportunityId === channelOpportunity.id);
  if (existing) return existing;
  return createOutcomeProgram({
    projectId,
    name: channelOpportunity.title,
    objective: channelOpportunity.objective,
    sourceOpportunityId: channelOpportunity.id,
    lifecycle: channelOpportunity.status === "accepted" ? "active" : "draft",
    desiredOutcome: {
      type: channelOpportunity.output?.outcomeEvent || "program_outcome",
      target: channelOpportunity.target ?? null,
      description: channelOpportunity.objective,
    },
    buyerHypothesis: channelOpportunity.buyerHypothesis ?? {
      description: channelOpportunity.rationale || "",
      status: "hypothesis",
    },
    channelHypothesis: channelOpportunity.channelHypothesis ?? {
      motion: channelOpportunity.title,
      objective: channelOpportunity.objective,
      evidence: channelOpportunity.evidence ?? [],
      status: channelOpportunity.status === "accepted" ? "accepted" : "proposed",
    },
    measurementPlan: channelOpportunity.measurementPlan ?? {
      outcomeEvent: channelOpportunity.output?.outcomeEvent || "",
      joinKey: channelOpportunity.output?.joinKey || "gtmActionId",
      blindSpots: channelOpportunity.evidence?.length ? [] : ["No causal outcome link has been proven yet."],
    },
  }, options);
}

// Coerce a lifecycle value, mapping the legacy "ready" alias (and the legacy "active" run-era spelling)
// onto the canonical lifecycle set. Throws on anything outside draft/active/retired so a stray run
// value (e.g. "learning") can never be stored as a lifecycle.
export function normalizeLifecycle(lifecycle) {
  const next = String(lifecycle || "draft");
  if (next === "ready") return "active";
  if (!PROGRAM_LIFECYCLES.includes(next)) throw new Error(`Unsupported outcome program lifecycle: ${next}`);
  return next;
}

// Pass-through normalizer for the disposable run outcome. There is no state machine and the value is
// allowed to be null (no live run); the run path writes whatever the run produced.
export function normalizeLastRunStatus(lastRunStatus) {
  return lastRunStatus ?? null;
}
