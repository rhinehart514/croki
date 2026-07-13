// The rented product-market terrain overlay.
//
// A terrain read is an addressable projection over one model response. It is never stored here and
// has no mutation, composition, execution, approval, or gate authority. The model owns the claims;
// the host only normalizes shape, resolves provenance, and fingerprints the supplied authorities.

import crypto from "node:crypto";
import { normalizeStableRef } from "./operator-tools.mjs";
import { runStructuredTask } from "./structured-task-runtime.mjs";

const STANCES = new Set(["opening", "tension", "hypothesis"]);
const PROVENANCE = new Set(["inferred", "speculative"]);

export const TERRAIN_READ_PROMPT = `Read ONE product's living product-market terrain. Return credible OPENINGS and TENSIONS, not a ranked strategy plan. The product facts and records below are the only evidence authorities. Your claims are model-owned hypotheses, never product truth.

For each hypothesis:
- preserve disagreement, counterevidence, uncertainty, and a concrete falsifier;
- use provenance "inferred" only when the claim is supported by resolvable evidenceRefs or marketRefs supplied below; otherwise use "speculative";
- never invent a reference, repository file, line, buyer signal, outcome, or demand claim;
- when market evidence is absent, say that the market side is unknown rather than implying demand;
- a suggestedMove is optional. Do not force one, and do not restrict moves to a fixed list of kinds;
- prior founder decisions are taste and correction context only. They are never permission or authorization;
- an approval, release, or gate event alone is not a market outcome.

Return ONLY a JSON array. Each item has:
{
  "stance": "opening" | "tension" | "hypothesis",
  "title": "short plain-language title",
  "claim": "the actual hypothesis",
  "whyItMatters": "why this deserves attention",
  "provenance": "inferred" | "speculative",
  "evidenceRefs": [{ "type": "evidence", "id": "an exact supplied id" }],
  "productRefs": [{ "type": "an exact supplied product type", "id": "an exact supplied id" }],
  "marketRefs": [{ "type": "market-evidence", "id": "an exact supplied id" }],
  "counterEvidenceRefs": [{ "type": "evidence", "id": "an exact supplied id" }],
  "unknown": "what remains unknown, or null",
  "falsifier": "what evidence would change this read, or null",
  "suggestedMove": { "title": "...", "intendedEffect": "...", "measurementIntent": "... or null" } | null,
  "crewRefs": [{ "type": "teammate", "id": "an exact supplied id" }]
}`;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function hash(value, length = 24) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex").slice(0, length);
}

function trimmed(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || null;
}

function newest(records, fields = ["updatedAt", "createdAt", "recordedAt", "at"]) {
  let latest = null;
  for (const record of Array.isArray(records) ? records : []) {
    for (const field of fields) {
      const value = trimmed(record?.[field]);
      if (value && (!latest || value > latest)) latest = value;
    }
  }
  return latest;
}

function joinedOutcomes(input) {
  const source = Array.isArray(input.joinedOutcomes) ? input.joinedOutcomes : (Array.isArray(input.outcomes) ? input.outcomes : []);
  return source.filter((item) => {
    const kind = String(item?.kind ?? item?.type ?? item?.status ?? "").toLowerCase();
    if (/approval|approved|release|released|gate/.test(kind)) return false;
    return Array.isArray(input.joinedOutcomes) || item?.joined === true || !!(item?.joinKey || item?.pipelineId || item?.moveId || item?.channelId);
  });
}

export function terrainInputFingerprint(input = {}) {
  const marketRecords = Array.isArray(input.marketRecords) ? input.marketRecords : [];
  const decisions = Array.isArray(input.founderDecisions) ? input.founderDecisions : [];
  const outcomes = joinedOutcomes(input);
  const implications = Array.isArray(input.implications) ? input.implications : [];
  const capabilities = input.capabilities ?? null;
  const identity = {
    projectId: trimmed(input.projectId) ?? "default",
    scannedAt: trimmed(input.scannedAt ?? input.scan?.scannedAt ?? input.grounding?.scannedAt),
    productModelVersion: input.productModelVersion ?? input.productModel?.version ?? input.productModel?.updatedAt ?? null,
    marketRevision: input.marketRevision ?? newest(marketRecords) ?? (marketRecords.length ? hash(marketRecords) : null),
    latestFounderTerrainDecisionAt: input.latestFounderTerrainDecisionAt ?? newest(decisions),
    latestJoinedOutcomeAt: input.latestJoinedOutcomeAt ?? newest(outcomes),
    latestImplicationAt: input.latestImplicationAt ?? newest(implications),
    capabilityInventoryIdentity: input.capabilityInventoryIdentity ?? (capabilities ? hash(capabilities) : null),
    tasteRevision: input.tasteRevision ?? input.taste?.revision ?? input.taste?.updatedAt ?? (input.taste ? hash(input.taste) : null),
  };
  return `terrain-${hash(identity, 32)}`;
}

function refFrom(raw, defaultKind, projectId) {
  try {
    if (typeof raw === "string") return normalizeStableRef(raw, { projectId, defaultKind });
    return normalizeStableRef(raw, { projectId, defaultKind });
  } catch {
    return null;
  }
}

function refKey(ref) {
  return ref ? `${ref.type}:${ref.id}` : null;
}

function addCatalogRef(catalog, raw, defaultKind, projectId) {
  const ref = refFrom(raw, defaultKind, projectId);
  if (!ref) return null;
  catalog.set(refKey(ref), ref);
  // Models sometimes preserve an id but choose the generic type named in the prompt. Permit that
  // only inside the authority-specific catalog, never across evidence/product/market boundaries.
  catalog.set(ref.id, ref);
  return ref;
}

function collectEvidence(value, projectId, catalog, parentId = null, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectEvidence(item, projectId, catalog, parentId, seen);
    return;
  }
  const owner = trimmed(value.projectId ?? value.project);
  const file = trimmed(value.file ?? value.path);
  const line = Number.parseInt(value.line, 10);
  const ownId = trimmed(value.id ?? value.ref) ?? parentId;
  if ((!owner || owner === projectId) && file && Number.isInteger(line) && line > 0) {
    addCatalogRef(catalog, { type: "evidence", id: ownId ?? `code:${file}:${line}` }, "evidence", projectId);
  }
  const nextParent = ownId ?? parentId;
  for (const child of Object.values(value)) collectEvidence(child, projectId, catalog, nextParent, seen);
}

function collectProductRefs(productModel, projectId, catalog) {
  if (!productModel || typeof productModel !== "object") return;
  if (productModel.id) addCatalogRef(catalog, { type: "product-model", id: productModel.id }, "product-model", projectId);
  for (const [bag, values] of Object.entries(productModel)) {
    if (!Array.isArray(values)) continue;
    for (const item of values) {
      if (item?.id) addCatalogRef(catalog, { type: String(item.type ?? (bag.replace(/s$/, "") || "product")), id: item.id }, "product", projectId);
    }
  }
}

function resolveRefs(values, defaultKind, projectId, catalog) {
  const refs = [];
  const unsupported = [];
  const seen = new Set();
  for (const raw of Array.isArray(values) ? values : []) {
    const asked = refFrom(raw, defaultKind, projectId);
    const resolved = asked && (catalog.get(refKey(asked)) ?? catalog.get(asked.id));
    if (!resolved) {
      if (asked || raw) unsupported.push(asked ?? raw);
      continue;
    }
    const key = refKey(resolved);
    if (!seen.has(key)) { seen.add(key); refs.push(resolved); }
  }
  return { refs, unsupported };
}

function suggestedMove(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = trimmed(raw.title);
  const intendedEffect = trimmed(raw.intendedEffect ?? raw.objective);
  if (!title || !intendedEffect) return null;
  return { title, intendedEffect, measurementIntent: trimmed(raw.measurementIntent) };
}

function normalizeHypothesis(raw, context) {
  if (!raw || typeof raw !== "object") return null;
  const title = trimmed(raw.title ?? raw.name);
  const claim = trimmed(raw.claim);
  if (!title || !claim) return null;
  const evidence = resolveRefs(raw.evidenceRefs, "evidence", context.projectId, context.evidence);
  const product = resolveRefs(raw.productRefs, "product", context.projectId, context.product);
  const market = resolveRefs(raw.marketRefs, "market-evidence", context.projectId, context.market);
  const counter = resolveRefs(raw.counterEvidenceRefs, "evidence", context.projectId, context.counter);
  const crew = resolveRefs(raw.crewRefs, "teammate", context.projectId, context.crew);
  // Unsupported crew attribution is dropped, but it is not evidence and therefore cannot demote an
  // otherwise supported claim. Unsupported product/market/code references can.
  const unsupported = [...evidence.unsupported, ...product.unsupported, ...market.unsupported, ...counter.unsupported];
  const supportedEvidence = evidence.refs.length + market.refs.length > 0;
  let provenance = PROVENANCE.has(raw.provenance) ? raw.provenance : (supportedEvidence ? "inferred" : "speculative");
  if (provenance === "inferred" && (!supportedEvidence || unsupported.length)) provenance = "speculative";
  const sourceRefs = [...evidence.refs, ...product.refs, ...market.refs, ...counter.refs]
    .map(refKey).sort();
  return {
    id: `terrain-hypothesis-${hash({ fingerprint: context.fingerprint, claim: claim.toLowerCase(), sourceRefs }, 20)}`,
    stance: STANCES.has(raw.stance) ? raw.stance : "hypothesis",
    title,
    claim,
    whyItMatters: trimmed(raw.whyItMatters) ?? "",
    provenance,
    evidenceRefs: evidence.refs,
    productRefs: product.refs,
    marketRefs: market.refs,
    counterEvidenceRefs: counter.refs,
    unknown: trimmed(raw.unknown),
    falsifier: trimmed(raw.falsifier),
    suggestedMove: suggestedMove(raw.suggestedMove),
    crewRefs: crew.refs,
  };
}

function buildCatalogs(input, projectId) {
  const evidence = new Map();
  collectEvidence(input.scan ?? input.grounding ?? {}, projectId, evidence);
  collectEvidence(input.evidenceRecords ?? [], projectId, evidence);
  const product = new Map();
  collectProductRefs(input.productModel, projectId, product);
  for (const record of Array.isArray(input.productRecords) ? input.productRecords : []) {
    if (record?.id) addCatalogRef(product, { type: record.type ?? "product", id: record.id, projectId: record.projectId }, "product", projectId);
  }
  const market = new Map();
  for (const record of Array.isArray(input.marketRecords) ? input.marketRecords : []) {
    if (record?.id) addCatalogRef(market, { type: record.type ?? "market-evidence", id: record.id, projectId: record.projectId }, "market-evidence", projectId);
  }
  const crew = new Map();
  for (const record of Array.isArray(input.crew) ? input.crew : []) {
    const id = typeof record === "string" ? record : record?.id ?? record?.ref;
    if (id) addCatalogRef(crew, { type: "teammate", id, projectId: record?.projectId }, "teammate", projectId);
  }
  const counter = new Map([...evidence, ...market, ...product]);
  return { evidence, product, market, crew, counter };
}

export function normalizeTerrainRead(items, input = {}, runtime = {}, { now = () => new Date().toISOString() } = {}) {
  const projectId = trimmed(input.projectId) ?? "default";
  const fingerprint = terrainInputFingerprint({ ...input, projectId });
  const catalogs = buildCatalogs(input, projectId);
  const hypotheses = (Array.isArray(items) ? items : [])
    .map((raw) => normalizeHypothesis(raw, { projectId, fingerprint, ...catalogs }))
    .filter(Boolean);
  return {
    schemaVersion: 1,
    id: `terrain-read-${hash({ projectId, fingerprint }, 20)}`,
    projectId,
    generatedAt: now(),
    inputFingerprint: fingerprint,
    runtime: { id: trimmed(runtime.id) ?? "blank", model: trimmed(runtime.model) },
    hypotheses,
  };
}

function promptContext(input) {
  const outcomes = joinedOutcomes(input);
  const marketRecords = Array.isArray(input.marketRecords) ? input.marketRecords : [];
  return [
    TERRAIN_READ_PROMPT,
    `Project-scoped authorities:\n${JSON.stringify({
      projectId: input.projectId ?? "default",
      scan: input.scan ?? input.grounding ?? null,
      productModel: input.productModel ?? null,
      marketEvidenceState: marketRecords.length ? "records supplied below" : "NO MARKET EVIDENCE IS AVAILABLE; market demand is unknown",
      marketRecords,
      crew: input.crew ?? [],
      capabilities: input.capabilities ?? null,
      founderTaste: input.taste ?? null,
      founderTerrainDecisions: input.founderDecisions ?? [],
      joinedOutcomes: outcomes,
      proposedImplications: input.implications ?? [],
    }, null, 2)}`,
  ].join("\n\n");
}

export function createTerrainReader({ runTask = runStructuredTask, cwd = process.cwd(), model, runtime, maxTurns = 24, onText, now } = {}) {
  return async function readTerrain(input = {}) {
    const result = await runTask({
      task: "terrain-read",
      prompt: promptContext(input),
      cwd: input.cwd ?? cwd,
      model: input.model ?? model,
      runtime: input.runtime ?? runtime,
      output: "items",
      readOnly: true,
      maxTurns: input.maxTurns ?? maxTurns,
      onText: input.onText ?? onText,
    });
    const terrainRead = normalizeTerrainRead(result.ok ? result.value : [], input, {
      id: result.runtime ?? "blank",
      model: result.model ?? input.model ?? model ?? null,
    }, { ...(now ? { now } : {}) });
    return {
      ok: result.ok,
      terrainRead,
      ...(result.error ? { error: result.error } : {}),
      meta: { provider: result.runtime === "codex" ? "codex" : result.runtime === "claude-code" ? "claude" : "blank" },
    };
  };
}
