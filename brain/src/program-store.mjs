import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rebuildProjectState } from "./program-projection.mjs";

const SCHEMA_VERSION = 1;
export const PROGRAM_STATUSES = [
  "draft",
  "ready",
  "running",
  "waiting_for_gate",
  "paused",
  "learning",
  "complete",
  "retired",
  "blocked",
];

const TRANSITIONS = new Map([
  ["draft", new Set(["ready", "blocked", "retired"])],
  ["ready", new Set(["running", "paused", "retired", "blocked"])],
  ["running", new Set(["waiting_for_gate", "learning", "complete", "paused", "blocked", "ready"])],
  ["waiting_for_gate", new Set(["running", "learning", "paused", "blocked", "complete"])],
  ["paused", new Set(["ready", "running", "retired", "blocked"])],
  ["learning", new Set(["ready", "running", "complete", "blocked", "retired"])],
  ["complete", new Set(["ready", "retired"])],
  ["blocked", new Set(["ready", "retired"])],
  ["retired", new Set([])],
]);

function now() {
  return new Date().toISOString();
}

function root(options = {}) {
  return options.root || process.env.GTM_IDE_HOME || path.join(os.homedir(), ".gtm-ide");
}

function safeId(value) {
  return String(value || "program").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "program";
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54);
}

function fileFor(projectId, options = {}) {
  return path.join(root(options), "programs", `${safeId(projectId || "default")}.json`);
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function emptyStore(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, programs: [] };
}

export function loadProgramStore(projectId = "default", options = {}) {
  const file = fileFor(projectId, options);
  if (!fs.existsSync(file)) return emptyStore(projectId);
  const stored = JSON.parse(fs.readFileSync(file, "utf8"));
  if (stored?.schemaVersion === SCHEMA_VERSION && Array.isArray(stored.programs)) return stored;
  return {
    ...emptyStore(projectId),
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    programs: Array.isArray(stored?.programs) ? stored.programs : [],
  };
}

export function saveProgramStore(store, options = {}) {
  const durable = {
    ...store,
    schemaVersion: SCHEMA_VERSION,
    programs: Array.isArray(store.programs) ? store.programs : [],
  };
  write(fileFor(durable.projectId, options), durable);
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
    status: normalizeProgramStatus(input.status || "draft"),
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
    "status", "channelId", "graphId", "workflowGraph",
  ]);
  const unknown = Object.keys(patch).filter((key) => key !== "projectId" && !allowed.has(key));
  if (unknown.length) throw new Error(`Unsupported outcome program fields: ${unknown.join(", ")}`);
  const programs = store.programs.map((program) => {
    if (program.id !== programId) return program;
    found = true;
    const nextPatch = structuredClone(patch);
    if (nextPatch.status) nextPatch.status = normalizeProgramStatus(nextPatch.status);
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

export function transitionOutcomeProgram(programId, status, options = {}) {
  const projectId = options.projectId || "default";
  const current = getOutcomeProgram(programId, projectId, options);
  const nextStatus = validateOutcomeProgramTransition(current.status, status);
  if (current.status === nextStatus) return current;
  return updateOutcomeProgram(programId, { status: nextStatus }, options);
}

export function validateOutcomeProgramTransition(currentStatus, nextStatus) {
  const current = normalizeProgramStatus(currentStatus);
  const next = normalizeProgramStatus(nextStatus);
  if (current === next) return next;
  const allowed = TRANSITIONS.get(current) ?? new Set();
  if (!allowed.has(next)) {
    throw new Error(`Invalid outcome program transition: ${current} → ${next}`);
  }
  return next;
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
    status: channelOpportunity.status === "accepted" ? "ready" : "draft",
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

function normalizeProgramStatus(status) {
  const next = String(status || "draft");
  if (next === "active") return "ready";
  if (!PROGRAM_STATUSES.includes(next)) throw new Error(`Unsupported outcome program status: ${next}`);
  return next;
}
