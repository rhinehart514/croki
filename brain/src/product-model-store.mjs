// The ProductModel aggregate store — the durable, founder-editable interpretation of a product.
//
// This is NOT truth. The scan and product-understanding.mjs report only cited, reproducible code
// facts ("grounding does not shape"). The ProductModel sits ON TOP of that truth as an
// interpretation: the product's core objects (things), how they relate, the user goals, the key
// states. It holds `speculative` founder/model guesses, so it must never be folded into any
// truth-layer / engine-health derivation. It rides alongside the truth, separately labelled.
//
// Persistence mirrors program-store.mjs exactly: a pure builder stamps the lineage triplet, a
// normalizer owns ids/timestamps/provenance and demotes evidence-free "derived" elements to
// "speculative" (the same one-directional valve normalizeProposal applies), atomic temp-file
// writes, and syncProductModelStoreFromEvents diffs the snapshot against the projection so the
// event log stays authoritative (DDD.md:125-127).

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rebuildProjectState } from "./program-projection.mjs";

const SCHEMA_VERSION = 1;

// The bags the founder may edit on a ProductModel. pinnedSignals is NOT here: signals arrive only
// through RecordProductSignal (the founder edits the model; the world edits the signals).
//
// The model holds the FIVE understanding layers, each its own bag(s):
//   - conceptual model: things + relationships
//   - goals & jobs:     userGoals (actor → job → outcome)
//   - information arch:  ia (a parent-linked hierarchy)
//   - workflows:         workflows (named flows with ordered steps)
//   - interaction model: interactions (states/screens) + transitions (the edges between them)
const EDITABLE_BAGS = [
  "things", "relationships", "userGoals", "states",
  "ia", "workflows", "interactions", "transitions",
];

const PROVENANCE = new Set(["derived", "speculative"]);
const GENERATED_BY = new Set(["claude", "blank", "founder"]);

function now() {
  return new Date().toISOString();
}

function root(options = {}) {
  return options.root || process.env.GTM_IDE_HOME || path.join(os.homedir(), ".gtm-ide");
}

function safeId(value) {
  return String(value || "default").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "default";
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54);
}

function fileFor(projectId, options = {}) {
  return path.join(root(options), "product-models", `${safeId(projectId || "default")}.json`);
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function emptyStore(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, productModels: [] };
}

function evidenceArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      label: String(item.label || "").trim(),
      file: String(item.file || "").trim(),
      line: Number.isFinite(item.line) ? item.line : (Number.parseInt(item.line, 10) || 0),
      text: String(item.text || "").trim(),
    }))
    // A citation only counts as evidence if it actually names a file. An empty {} is not proof.
    .filter((item) => item.file);
}

// The pollution guard, element by element. Mirrors normalizeProposal (opportunity-engine.mjs:65):
// the host owns ids/provenance; the model owns content. A "derived" element with zero real
// citations is demoted to "speculative" so an interpretive guess can never launder itself back as
// cited fact. This is the AGENTS.md citation rule applied at the interpretive boundary.
function normalizeProvenance(rawProvenance, evidence) {
  let provenance = PROVENANCE.has(rawProvenance) ? rawProvenance : (evidence.length ? "derived" : "speculative");
  if (provenance === "derived" && evidence.length === 0) provenance = "speculative";
  return provenance;
}

function normalizeThing(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim();
  if (!name) return null;
  const evidence = evidenceArray(raw.evidence);
  return {
    id: raw.id ? `thing-${slug(raw.id)}` : `thing-${slug(name) || crypto.randomBytes(3).toString("hex")}-${index}`,
    name,
    kind: String(raw.kind || "").trim(),
    summary: String(raw.summary || "").trim(),
    evidence,
    provenance: normalizeProvenance(raw.provenance, evidence),
  };
}

function normalizeRelationship(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const from = String(raw.from || "").trim();
  const to = String(raw.to || "").trim();
  const label = String(raw.label || "").trim();
  if (!from || !to || !label) return null;
  const evidence = evidenceArray(raw.evidence);
  return {
    id: raw.id ? `rel-${slug(raw.id)}` : `rel-${slug(label) || crypto.randomBytes(3).toString("hex")}-${index}`,
    from,
    to,
    label,
    summary: String(raw.summary || "").trim(),
    provenance: normalizeProvenance(raw.provenance, evidence),
  };
}

function normalizeUserGoal(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const goal = String(raw.goal || "").trim();
  if (!goal) return null;
  const evidence = evidenceArray(raw.evidence);
  return {
    id: raw.id ? `goal-${slug(raw.id)}` : `goal-${slug(goal) || crypto.randomBytes(3).toString("hex")}-${index}`,
    actor: String(raw.actor || "").trim(),
    goal,
    // The job-map needs the outcome the actor is after, not just the goal verb. Optional.
    outcome: String(raw.outcome || "").trim(),
    relatedThings: Array.isArray(raw.relatedThings) ? raw.relatedThings.map((t) => String(t).trim()).filter(Boolean) : [],
    provenance: normalizeProvenance(raw.provenance, evidence),
  };
}

// ─── IA layer — a parent-linked hierarchy (the sitemap/tree) ──────────────────
function normalizeIaNode(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim();
  if (!name) return null;
  const evidence = evidenceArray(raw.evidence);
  return {
    id: raw.id ? `ia-${slug(raw.id)}` : `ia-${slug(name) || crypto.randomBytes(3).toString("hex")}-${index}`,
    name,
    summary: String(raw.summary || "").trim(),
    // parentId references another ia node (by id or name); "" means a top-level area.
    parentId: String(raw.parentId || "").trim(),
    relatedThings: Array.isArray(raw.relatedThings) ? raw.relatedThings.map((t) => String(t).trim()).filter(Boolean) : [],
    evidence,
    provenance: normalizeProvenance(raw.provenance, evidence),
  };
}

// ─── Workflow layer — named flows of ordered steps ────────────────────────────
function normalizeStep(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const label = String(raw.label || "").trim();
  if (!label) return null;
  return {
    id: raw.id ? `step-${slug(raw.id)}` : `step-${slug(label) || crypto.randomBytes(2).toString("hex")}-${index}`,
    label,
    summary: String(raw.summary || "").trim(),
  };
}

function normalizeWorkflow(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim();
  if (!name) return null;
  const evidence = evidenceArray(raw.evidence);
  return {
    id: raw.id ? `flow-${slug(raw.id)}` : `flow-${slug(name) || crypto.randomBytes(3).toString("hex")}-${index}`,
    name,
    actor: String(raw.actor || "").trim(),
    summary: String(raw.summary || "").trim(),
    steps: (Array.isArray(raw.steps) ? raw.steps : []).map(normalizeStep).filter(Boolean),
    evidence,
    provenance: normalizeProvenance(raw.provenance, evidence),
  };
}

// ─── Interaction layer — states/screens (nodes) + transitions (edges) ─────────
function normalizeInteraction(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim();
  if (!name) return null;
  const evidence = evidenceArray(raw.evidence);
  return {
    id: raw.id ? `screen-${slug(raw.id)}` : `screen-${slug(name) || crypto.randomBytes(3).toString("hex")}-${index}`,
    name,
    kind: String(raw.kind || "").trim(),
    summary: String(raw.summary || "").trim(),
    evidence,
    provenance: normalizeProvenance(raw.provenance, evidence),
  };
}

function normalizeTransition(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const from = String(raw.from || "").trim();
  const to = String(raw.to || "").trim();
  const trigger = String(raw.trigger || "").trim();
  if (!from || !to || !trigger) return null;
  const evidence = evidenceArray(raw.evidence);
  return {
    id: raw.id ? `trans-${slug(raw.id)}` : `trans-${slug(trigger) || crypto.randomBytes(3).toString("hex")}-${index}`,
    from,
    to,
    trigger,
    summary: String(raw.summary || "").trim(),
    provenance: normalizeProvenance(raw.provenance, evidence),
  };
}

function normalizeState(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim();
  if (!name) return null;
  const evidence = evidenceArray(raw.evidence);
  return {
    id: raw.id ? `state-${slug(raw.id)}` : `state-${slug(name) || crypto.randomBytes(3).toString("hex")}-${index}`,
    thingId: String(raw.thingId || "").trim(),
    name,
    summary: String(raw.summary || "").trim(),
    provenance: normalizeProvenance(raw.provenance, evidence),
  };
}

// Owns the shape: whitelist the editable bags, normalize each element, and apply the demotion
// valve. Pure: no ids/timestamps stamped here (the builder owns those) — only the bag content and
// provenance are normalized, mirroring how normalizeProposal cleans one proposal at a time.
export function normalizeProductModel(model = {}) {
  return {
    things: (Array.isArray(model.things) ? model.things : []).map(normalizeThing).filter(Boolean),
    relationships: (Array.isArray(model.relationships) ? model.relationships : []).map(normalizeRelationship).filter(Boolean),
    userGoals: (Array.isArray(model.userGoals) ? model.userGoals : []).map(normalizeUserGoal).filter(Boolean),
    states: (Array.isArray(model.states) ? model.states : []).map(normalizeState).filter(Boolean),
    ia: (Array.isArray(model.ia) ? model.ia : []).map(normalizeIaNode).filter(Boolean),
    workflows: (Array.isArray(model.workflows) ? model.workflows : []).map(normalizeWorkflow).filter(Boolean),
    interactions: (Array.isArray(model.interactions) ? model.interactions : []).map(normalizeInteraction).filter(Boolean),
    transitions: (Array.isArray(model.transitions) ? model.transitions : []).map(normalizeTransition).filter(Boolean),
  };
}

function normalizeGroundingRef(raw = {}) {
  if (!raw || typeof raw !== "object") return { evidenceState: null, citationCount: 0, scannedAt: null };
  return {
    evidenceState: raw.evidenceState ?? null,
    citationCount: Number.isFinite(raw.citationCount) ? raw.citationCount : (Number.parseInt(raw.citationCount, 10) || 0),
    scannedAt: raw.scannedAt ?? null,
  };
}

function normalizeGeneratedBy(value) {
  const next = String(value || "blank");
  return GENERATED_BY.has(next) ? next : "blank";
}

// Pure builder. Stamps the stable id + lineage triplet, projectId, timestamps, the grounding
// snapshot, and the normalized bags. Mirrors buildOutcomeProgram (program-store.mjs:140-176): id is
// stable across revisions (lineage continuity), lineageId === id at birth.
export function buildProductModel(input = {}, options = {}) {
  const projectId = input.projectId || options.projectId || "default";
  const store = loadProductModelStore(projectId, options);
  const existingIds = new Set(store.productModels.map((model) => model.id));
  const base = slug(input.id || `model-${projectId}`);
  let id = `product-model-${base || crypto.randomBytes(4).toString("hex")}`;
  let i = 2;
  while (existingIds.has(id)) id = `product-model-${base}-${i++}`;
  const createdAt = now();
  const bags = normalizeProductModel(input);
  return {
    id,
    lineageId: input.lineageId ?? id,
    previousModelId: input.previousModelId ?? null,
    version: 1,
    projectId,
    generatedBy: normalizeGeneratedBy(input.generatedBy),
    groundingRef: normalizeGroundingRef(input.groundingRef),
    things: bags.things,
    relationships: bags.relationships,
    userGoals: bags.userGoals,
    states: bags.states,
    ia: bags.ia,
    workflows: bags.workflows,
    interactions: bags.interactions,
    transitions: bags.transitions,
    pinnedSignals: Array.isArray(input.pinnedSignals) ? input.pinnedSignals : [],
    createdAt,
    updatedAt: createdAt,
  };
}

export function loadProductModelStore(projectId = "default", options = {}) {
  const file = fileFor(projectId, options);
  if (!fs.existsSync(file)) return emptyStore(projectId);
  const stored = JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    ...emptyStore(projectId),
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    productModels: Array.isArray(stored?.productModels) ? stored.productModels : [],
  };
}

export function saveProductModelStore(store, options = {}) {
  const durable = {
    ...store,
    schemaVersion: SCHEMA_VERSION,
    productModels: Array.isArray(store.productModels) ? store.productModels : [],
  };
  write(fileFor(durable.projectId, options), durable);
  return durable;
}

// Diff the snapshot ids against the projected ids and overwrite with the projection, mirroring
// syncProgramStoreFromEvents (program-store.mjs:118-128). The projection is authoritative; this
// just materializes it back onto disk for fast reads.
export function syncProductModelStoreFromEvents(projectId = "default", options = {}) {
  const existing = loadProductModelStore(projectId, options).productModels;
  const projected = rebuildProjectState(projectId, options).productModels;
  const projectedIds = new Set(projected.map((model) => model.id));
  const productModels = [
    ...existing.filter((model) => !projectedIds.has(model.id)),
    ...projected,
  ];
  saveProductModelStore({ schemaVersion: SCHEMA_VERSION, projectId, productModels }, options);
  return productModels;
}

export function listProductModels(projectId = "default", options = {}) {
  return loadProductModelStore(projectId, options).productModels;
}

// One model per project (keyed by projectId). The store holds the single current record per
// lineage; the event log retains every version. Returns null when none exists (honest blank).
export function getProductModel(projectId = "default", options = {}) {
  const models = loadProductModelStore(projectId, options).productModels;
  return models.length ? models[models.length - 1] : null;
}

// Revise along the lineage, mirroring reviseOutcomeProgram (program-store.mjs:254-280). The record
// keeps the same id for continuity; version is bumped, previousModelId points at the prior id,
// lineageId is preserved. Whitelist the editable bags + generatedBy; re-run the pollution guard so
// an edited element claiming "derived" without evidence is demoted, exactly as on derive.
// pinnedSignals is NOT editable here — signals arrive only via RecordProductSignal.
export function reviseProductModel(modelId, patch = {}, options = {}) {
  const projectId = options.projectId || patch.projectId || "default";
  const store = loadProductModelStore(projectId, options);
  const current = store.productModels.find((model) => model.id === modelId);
  if (!current) throw new Error(`Product model not found: ${modelId}`);
  const allowed = new Set([...EDITABLE_BAGS, "generatedBy", "groundingRef"]);
  const unknown = Object.keys(patch).filter((key) => key !== "projectId" && !allowed.has(key));
  if (unknown.length) throw new Error(`Unsupported product model fields: ${unknown.join(", ")}`);
  // Normalize only the bags the patch actually touches; preserve the rest from current.
  const mergedBags = normalizeProductModel({
    things: patch.things !== undefined ? patch.things : current.things,
    relationships: patch.relationships !== undefined ? patch.relationships : current.relationships,
    userGoals: patch.userGoals !== undefined ? patch.userGoals : current.userGoals,
    states: patch.states !== undefined ? patch.states : current.states,
    ia: patch.ia !== undefined ? patch.ia : current.ia,
    workflows: patch.workflows !== undefined ? patch.workflows : current.workflows,
    interactions: patch.interactions !== undefined ? patch.interactions : current.interactions,
    transitions: patch.transitions !== undefined ? patch.transitions : current.transitions,
  });
  const revised = {
    ...current,
    ...mergedBags,
    generatedBy: patch.generatedBy !== undefined ? normalizeGeneratedBy(patch.generatedBy) : current.generatedBy,
    groundingRef: patch.groundingRef !== undefined ? normalizeGroundingRef(patch.groundingRef) : current.groundingRef,
    lineageId: current.lineageId ?? current.id,
    previousModelId: current.id,
    version: (current.version ?? 1) + 1,
    projectId,
    updatedAt: now(),
  };
  const productModels = store.productModels.map((model) => (model.id === modelId ? revised : model));
  saveProductModelStore({ ...store, productModels }, options);
  return revised;
}

// Build a PinnedSignal from a FeedbackSignal + target. The signal body is NOT copied — only its
// signalId, target, type, summary, and timestamp — so feedback-ledger.mjs stays the authoritative
// store of the signal and the picture holds only the pin.
const PIN_TARGET_KINDS = new Set(["thing", "relationship", "goal", "state", "model"]);

export function buildPinnedSignal(input = {}) {
  const signalId = String(input.signalId || input.signal?.id || "").trim();
  if (!signalId) throw new Error("A pinned signal requires a signalId.");
  const rawKind = String(input.target?.kind || "model");
  const kind = PIN_TARGET_KINDS.has(rawKind) ? rawKind : "model";
  return {
    id: input.id || `pin-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    signalId,
    target: { kind, id: input.target?.id ? String(input.target.id) : null },
    type: String(input.type || input.signal?.type || "").trim() || "ObservedOutcome",
    summary: String(input.summary || input.signal?.summary || "").trim(),
    observedAt: input.observedAt || input.signal?.observedAt || now(),
  };
}
