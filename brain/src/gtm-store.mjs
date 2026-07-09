// The Phase 0 spine: the durable GTM record model and its stores. Everything the rebuilt engine
// reasons over — product truth, the market picture, the portfolio of GTM paths, their measurement
// contracts, runs, results, promoted motions, and the learning capture — is a first-class,
// project-scoped, persisted record here, so nothing downstream is a pile of loose text.
//
// Design rules this file holds to (GTM-ENGINE-REBUILD §3–§4, Phase 0):
//   - Reuse the existing store spine: persistence() over (collection, key), safeId keys, atomic
//     write-behind. Same shape as idea-store.mjs / operator-store.mjs — a per-id store filtered to a
//     project on list. No new persistence mechanism.
//   - Open shapes only. Record `kind`, path bet fields, outcome kinds, solidity labels are OPEN
//     strings — never validated against a closed enum. The anti-cage tests guard this.
//   - Deterministic code. Every claim's effective solidity is computed by the shared Evidence
//     contract at the normalize boundary — a claim with no sourced evidence is demoted to
//     speculative here, in code, not by convention. No model call anywhere in this file.
//
// Evidence itself is NOT a store — it is the shared contract in evidence.mjs, embedded wherever a
// claim rests on sources (ProductTruth, MarketObject, and any GTMPath ranking signal).

import crypto from "node:crypto";
import { persistence } from "./persistence.mjs";
import { safeId, now } from "./store-fs.mjs";
import { effectiveSolidity, normalizeEvidenceList } from "./evidence.mjs";
import { objectKey as computeObjectKey } from "./object-identity.mjs";

const SCHEMA_VERSION = 1;

function genId(prefix) {
  const stamp = now().replace(/\D/g, "").slice(0, 14);
  return `${prefix}-${stamp}-${crypto.randomBytes(4).toString("hex")}`;
}

// The fields every record shares. createdAt and updatedAt are preserved across a save (the store
// bumps updatedAt before re-normalizing) so a round-trip never loses provenance of when it was made.
function base(input, prefix) {
  const createdAt = input.createdAt || now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: input.id || genId(prefix),
    projectId: input.projectId ?? null,
    createdAt,
    updatedAt: input.updatedAt || createdAt,
  };
}

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

// Normalize a list of open string labels (outcome kinds, contract sources, …): trimmed,
// de-duplicated, empties dropped. The VALUES are never checked against an enum — only shaped.
function normalizeLabels(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const label = String(raw ?? "").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

// A reference to another record: { type, id }. `type` is an open string (marketObject, productTruth,
// path, run, …) so a path can rest on anything without a closed ref-type enum.
function normalizeRefs(list) {
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw) => {
    if (!raw) return [];
    if (typeof raw === "string") return [{ type: null, id: raw }];
    const id = trimOrNull(raw.id);
    if (!id) return [];
    return [{ type: trimOrNull(raw.type), id }];
  });
}

function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

// Resolve a claim's declared vs. effective solidity. The computed `solidity` is what the claim may
// PRESENT as (demoted to speculative without sourced evidence); `declaredSolidity` is the intent it
// was created with. Keeping them separate matters on a round-trip: a save reads back the record,
// whose `solidity` is the prior COMPUTED value — so we must recompute from the stored
// `declaredSolidity` (present when re-saving), never from the stale effective value. On first create
// there is no declaredSolidity yet, so the input's `solidity` is taken as the declaration.
function resolveSolidity(input, evidence) {
  const declared = "declaredSolidity" in input ? input.declaredSolidity : input.solidity;
  const declaredSolidity = trimOrNull(declared);
  return { declaredSolidity, solidity: effectiveSolidity(declaredSolidity, evidence) };
}

// ── The generic per-id, project-scoped store ─────────────────────────────────────────────────────
// One factory over the persistence provider, identical in shape to idea-store: create / get / save /
// list (project-filtered, newest first) / delete. Each record type supplies only its normalizer.

function defineStore(collection, prefix, normalize) {
  return {
    collection,
    create(input = {}, options = {}) {
      const record = normalize(input, prefix);
      persistence(options).set(collection, safeId(record.id), record);
      return record;
    },
    get(id, options = {}) {
      const record = persistence(options).get(collection, safeId(id));
      if (!record) throw new Error(`${collection} not found: ${id}`);
      return record;
    },
    save(record, options = {}) {
      const updated = normalize({ ...record, updatedAt: now() }, prefix);
      persistence(options).set(collection, safeId(updated.id), updated);
      return updated;
    },
    list(options = {}) {
      const projectFilter = options.projectId ?? null;
      return persistence(options)
        .list(collection)
        .flatMap((record) => {
          if (!record || !record.id) return [];
          if (projectFilter && (record.projectId ?? null) !== projectFilter) return [];
          return [record];
        })
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },
    delete(id, options = {}) {
      return persistence(options).delete(collection, safeId(id));
    },
  };
}

// ── ProductTruth — a cited product fact, wrapped into the Evidence contract ────────────────────────
// A statement about what the product ALREADY does, resting on evidence (scan file:line, or a note).
// Adapted FROM the existing scan (see productTruthsFromScan) — the scan is not rebuilt.

function normalizeProductTruth(input, prefix) {
  const statement = trimOrNull(input.statement);
  if (!statement) throw new Error("A ProductTruth statement is required.");
  const evidence = normalizeEvidenceList(input.evidence);
  const { declaredSolidity, solidity } = resolveSolidity(input, evidence);
  return {
    ...base(input, prefix),
    statement,
    evidence,
    // Effective solidity is computed, never taken on faith: no sourced evidence → speculative.
    declaredSolidity,
    solidity,
    source: trimOrNull(input.source),
    scanRef: input.scanRef ?? null,
    notes: trimOrNull(input.notes),
  };
}

export const productTruthStore = defineStore("gtm-product-truths", "truth", normalizeProductTruth);

// Adapt an existing scan report into ProductTruth-shaped records (NOT persisted here — the caller
// decides). Each cited scan claim becomes a truth whose evidence is the file:line the scan already
// produced, so a path can rest on real product facts. This adapts the scan's output; it does not
// re-scan. Returns [] for a report with no citations rather than inventing a truth.
export function productTruthsFromScan(report, options = {}) {
  if (!report || typeof report !== "object") return [];
  const projectId = options.projectId ?? null;
  const truths = [];
  const seen = new Set();
  const pushFromCitations = (citations, fallbackStatement) => {
    for (const cite of citations || []) {
      if (!cite || !cite.file) continue;
      const source = `${cite.file}:${cite.line}`;
      const statement = trimOrNull(cite.label) || fallbackStatement;
      if (!statement) continue;
      const dedupeKey = `${statement}::${source}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      truths.push(
        normalizeProductTruth(
          {
            projectId,
            statement,
            source: "product-scan",
            scanRef: { repo: report.repo ?? null, scannedAt: report.scannedAt ?? null },
            // A scan citation is a directly-observed fact: the file:line IS the source.
            evidence: [{ claim: statement, source, solidity: "observed", notes: cite.text || null }],
            solidity: "observed",
          },
          "truth",
        ),
      );
    }
  };
  pushFromCitations(report.winEvent?.citations, report.winEvent?.name ? `Win event: ${report.winEvent.name}` : null);
  pushFromCitations(report.attribution?.citations, "Attribution captured");
  pushFromCitations(report.analytics?.citations, "Analytics wired");
  for (const gap of report.gaps || []) pushFromCitations(gap.citations, gap.title || gap.summary || null);
  return truths;
}

// A stable identity for a product truth, so a re-scan doesn't pile up duplicates: the statement plus
// the file:line its first evidence cites (or its source label when there is no cited evidence).
function productTruthKey(truth) {
  const src =
    (Array.isArray(truth.evidence) && truth.evidence[0]?.source) || truth.source || "";
  return `${String(truth.statement ?? "").trim()}::${src}`;
}

// PERSIST the product scan into the ProductTruth store (GTM-ENGINE-REBUILD Phase 2 wiring). Without
// this the map rests on ZERO product facts — the scan's cited truths never reach the store the path
// portfolio grounds on. Adapts the scan report into ProductTruth records and writes any that are not
// already stored for this project (deduped by statement + citation), so the founder's research/generate
// ritual grounds paths on product truth + market objects. Idempotent: a second call adds nothing new.
export function persistProductTruthsFromScan(report, { projectId = "default", options = {} } = {}) {
  const truths = productTruthsFromScan(report, { projectId });
  if (!truths.length) return { created: [], skipped: 0 };
  const existing = productTruthStore.list({ ...options, projectId });
  const seen = new Set(existing.map(productTruthKey));
  const created = [];
  let skipped = 0;
  for (const truth of truths) {
    const key = productTruthKey(truth);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    created.push(productTruthStore.create(truth, options));
  }
  return { created, skipped };
}

// ── MarketObject — an open buyer-side record ───────────────────────────────────────────────────────
// kind is an OPEN string (buyer / pain / job / trigger / workaround / valueProp / offer / channel /
// message / proof / conversionPath / anything). statement + evidence + computed solidity + confidence.

function normalizeMarketObject(input, prefix) {
  const kind = trimOrNull(input.kind);
  if (!kind) throw new Error("A MarketObject kind is required (open string).");
  const statement = trimOrNull(input.statement);
  if (!statement) throw new Error("A MarketObject statement is required.");
  const evidence = normalizeEvidenceList(input.evidence);
  const { declaredSolidity, solidity } = resolveSolidity(input, evidence);
  return {
    ...base(input, prefix),
    kind,
    statement,
    evidence,
    declaredSolidity,
    solidity,
    confidence: clampConfidence(input.confidence),
    source: trimOrNull(input.source),
    openQuestions: normalizeLabels(input.openQuestions),
  };
}

export const marketObjectStore = defineStore("gtm-market-objects", "mkt", normalizeMarketObject);

// ── GTMPath — one strategic bet (many per project = the portfolio) ─────────────────────────────────
// The bet is OPEN fields (buyer → pain → trigger → offer → channel → message → proof →
// conversionPath), any of which may be absent. rankingSignals are stored as DATA (computed by code in
// a later phase, never a model guessing a number here). status is an open label (default proposed).

function normalizeBet(input) {
  const bet = input && typeof input === "object" ? input : {};
  const out = {};
  for (const [key, value] of Object.entries(bet)) {
    const text = trimOrNull(value);
    if (text) out[key] = text;
  }
  return out;
}

function normalizeRankingSignals(input) {
  if (!input || typeof input !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    const n = Number(value);
    out[key] = Number.isFinite(n) ? n : null;
  }
  return out;
}

function normalizeGtmPath(input, prefix) {
  const summary = trimOrNull(input.summary);
  if (!summary) throw new Error("A GTMPath summary is required.");
  return {
    ...base(input, prefix),
    summary,
    // The go-to-market angle this bet takes — a free-text label so the portfolio's spread is visible
    // and inspectable, never a closed enum (§2.2 open shapes).
    angle: trimOrNull(input.angle),
    restsOn: normalizeRefs(input.restsOn),
    bet: normalizeBet(input.bet),
    risk: trimOrNull(input.risk),
    confidence: clampConfidence(input.confidence),
    rankingSignals: normalizeRankingSignals(input.rankingSignals),
    measurementContractId: trimOrNull(input.measurementContractId),
    status: trimOrNull(input.status) || "proposed",
  };
}

export const gtmPathStore = defineStore("gtm-paths", "path", normalizeGtmPath);

// ── MeasurementContract — set BEFORE a run ─────────────────────────────────────────────────────────
// outcomeKinds and sources are OPEN lists. joinKey is the durable key results join back on.

function normalizeMeasurementContract(input, prefix) {
  return {
    ...base(input, prefix),
    pathId: trimOrNull(input.pathId),
    outcomeKinds: normalizeLabels(input.outcomeKinds),
    sources: normalizeLabels(input.sources),
    joinKey: trimOrNull(input.joinKey),
    successCriteria: trimOrNull(input.successCriteria),
    notes: trimOrNull(input.notes),
  };
}

export const measurementContractStore = defineStore(
  "gtm-measurement-contracts",
  "mc",
  normalizeMeasurementContract,
);

// ── Run — one execution of a path ──────────────────────────────────────────────────────────────────
// Carries the compiled-steps snapshot, the gate/approval state, the measurement contract it runs
// under, and the staged items — each with a durable joinKey so a later result can find its origin.

function normalizeRunItems(list) {
  if (!Array.isArray(list)) return [];
  return list.map((raw) => {
    const item = raw && typeof raw === "object" ? raw : {};
    return {
      ...item,
      // A joinKey is minted per item if none was supplied, so every staged item is joinable.
      joinKey: trimOrNull(item.joinKey) || genId("join"),
    };
  });
}

function normalizeRun(input, prefix) {
  const pathId = trimOrNull(input.pathId);
  if (!pathId) throw new Error("A Run must reference a pathId.");
  const b = base(input, prefix);
  return {
    ...b,
    pathId,
    steps: Array.isArray(input.steps) ? input.steps : [],
    // The compiled topology snapshot: nodes live in `steps`, their wiring in `edges`, so a staged run
    // round-trips as a full graph a later phase can re-run or promote. Additive; empty when unset.
    edges: Array.isArray(input.edges) ? input.edges : [],
    gateState: input.gateState && typeof input.gateState === "object" ? input.gateState : { status: "pending" },
    gateBindings: Array.isArray(input.gateBindings) ? input.gateBindings : [],
    measurementContract: input.measurementContract ?? null,
    measurementContractId: trimOrNull(input.measurementContractId),
    measurementWeakness: input.measurementWeakness && typeof input.measurementWeakness === "object" ? input.measurementWeakness : null,
    runPlan: input.runPlan && typeof input.runPlan === "object" ? input.runPlan : null,
    items: normalizeRunItems(input.items),
    status: trimOrNull(input.status) || "staged",
    startedAt: input.startedAt || b.createdAt,
  };
}

export const runStore = defineStore("gtm-runs", "run", normalizeRun);

// ── Result — an outcome joined back to what was sent ───────────────────────────────────────────────
// outcomeKind is an OPEN label (reply / meeting / signup / activation / purchase / retention / manual /
// anything). Ties to run/path/asset/message/channel/buyer/offer via refs + the joinKey.
//
// motionKind + motionRef (GTM-MACHINE.md Area 7) are the SINGLE keying dimension the whole operation
// aggregates on. Both are OPEN strings — motionKind is the shape-derived name of the motion that earned
// the outcome (e.g. "Outbound loop", "Content loop", or a composer-given pipeline name), motionRef the
// stable ref to that motion (its pathId). They are NOT typed by the founder: outcome-ingest derives them
// at ingest from the joined run's own graph shape (reusing engine.deriveMotionKind); an explicit stamp
// on the outcome overrides; an out-of-band outcome that joined to no run carries null — honestly
// unattributed, never forced into a bucket. No closed enum: a novel motionKind persists verbatim.
function normalizeResult(input, prefix) {
  const joinKey = trimOrNull(input.joinKey);
  if (!joinKey) throw new Error("A Result must carry a joinKey to join back to its run.");
  return {
    ...base(input, prefix),
    runId: trimOrNull(input.runId),
    pathId: trimOrNull(input.pathId),
    assetId: trimOrNull(input.assetId),
    messageId: trimOrNull(input.messageId),
    channel: trimOrNull(input.channel),
    buyerRef: trimOrNull(input.buyerRef),
    offerRef: trimOrNull(input.offerRef),
    // The single motion-keying dimension — open strings, null when unattributed.
    motionKind: trimOrNull(input.motionKind),
    motionRef: trimOrNull(input.motionRef),
    outcomeKind: trimOrNull(input.outcomeKind),
    value: input.value ?? null,
    observedAt: input.observedAt || now(),
    source: trimOrNull(input.source),
    joinKey,
  };
}

export const resultStore = defineStore("gtm-results", "result", normalizeResult);

// ── RepeatableMotion — a promoted run (LIGHT wrapper, no composition authority) ────────────────────
// Just: which run it came from, a cadence, rolling scorekeeping, and a next-run template. It does NOT
// compose anything itself — that would re-grow the program cage (§2.6).

function normalizeRepeatableMotion(input, prefix) {
  const sourceRunId = trimOrNull(input.sourceRunId);
  if (!sourceRunId) throw new Error("A RepeatableMotion must reference the sourceRunId it was promoted from.");
  return {
    ...base(input, prefix),
    sourceRunId,
    cadence: trimOrNull(input.cadence),
    scorekeeping: input.scorekeeping && typeof input.scorekeeping === "object" ? input.scorekeeping : { runs: [] },
    nextRunTemplate: input.nextRunTemplate ?? null,
    // The scheduler's memory — plain timestamps the due check reads. Preserved on every round-trip so a
    // motion remembers when it last staged a re-run and when the next one is due. Null on a motion whose
    // cadence is manual (unparseable/absent): it exists and keeps score, but never fires on its own.
    lastRunAt: trimOrNull(input.lastRunAt),
    nextRunAt: trimOrNull(input.nextRunAt),
  };
}

export const repeatableMotionStore = defineStore("gtm-repeatable-motions", "motion", normalizeRepeatableMotion);

// ── Learning — future-compatible normalized capture ────────────────────────────────────────────────
// Written on each run / result / promotion. The whole point (§3, §2.8): the STRUCTURAL signal is kept
// physically separate from the IDENTIFYING text, so a later cross-company pool can strip PII at the
// write boundary by dropping the `identifying` half. No aggregation or recommendation is built now —
// this only captures, locally.

function normalizeLearning(input, prefix) {
  // Accept either the split shape ({ structural, identifying }) or a flat one, and split it here so
  // the boundary is enforced regardless of how the caller passed the fields.
  const structuralIn = input.structural && typeof input.structural === "object" ? input.structural : {};
  const identifyingIn = input.identifying && typeof input.identifying === "object" ? input.identifying : {};
  const pick = (key) => (input[key] !== undefined ? input[key] : undefined);
  return {
    ...base(input, prefix),
    capturedAt: input.capturedAt || now(),
    // Structural: non-identifying signal safe to pool across companies later. Shapes/labels, no
    // free customer text, no company-specific ids.
    structural: {
      productShape: trimOrNull(structuralIn.productShape ?? pick("productShape")),
      runType: trimOrNull(structuralIn.runType ?? pick("runType")),
      channel: trimOrNull(structuralIn.channel ?? pick("channel")),
      result: structuralIn.result ?? pick("result") ?? null,
      promotionDecision: trimOrNull(structuralIn.promotionDecision ?? pick("promotionDecision")),
    },
    // Identifying: refs and free text specific to THIS company — stripped at the pooling boundary.
    identifying: {
      pathId: trimOrNull(identifyingIn.pathId ?? pick("pathId")),
      marketObjectRefs: normalizeRefs(identifyingIn.marketObjectRefs ?? pick("marketObjectRefs")),
      offer: trimOrNull(identifyingIn.offer ?? pick("offer")),
      message: trimOrNull(identifyingIn.message ?? pick("message")),
    },
  };
}

export const learningStore = defineStore("gtm-learnings", "learning", normalizeLearning);

// The future cross-company projection: the structural half ONLY, with every identifying field
// dropped. Built now so the separation is real from day one; NO aggregation or recommendation is
// performed — this just proves PII can be stripped at the write boundary (§2.8).
export function structuralProjection(learning) {
  if (!learning || typeof learning !== "object") return null;
  return {
    schemaVersion: learning.schemaVersion ?? SCHEMA_VERSION,
    capturedAt: learning.capturedAt ?? null,
    ...(learning.structural && typeof learning.structural === "object" ? learning.structural : {}),
  };
}

// ── ObjectTouch — the durable touch ledger (Area 1, the single new host noun in the whole spec) ────
// One record per distinct object (person / geo / keyword / page / partner / change / any open kind) that
// any motion has touched, keyed on the deterministic objectKey so the SAME object collapses to one record
// across every motion — exactly as a Person already does, generalized to everything. It is a LEDGER, not
// a state machine: it stores WHAT touched an object and WHEN, and NOTHING else. There is DELIBERATELY no
// stored `state`/`stage` field and no transition table (GTM-MACHINE.md §"Staying out of the cage" #1) —
// "in-flight", "handled", "suppressed", and every funnel bucket are DERIVED at read time from these
// touches + outcome joins (see deriveFunnel / the worked-suppression wire), never stored here.
//
//   { objectKey, kind, label, touches: [{ motionId, runId, verb, at, reason?, until? }],
//     firstSeenAt, lastSeenAt }
//
// `kind` and `verb` are OPEN strings (guarded by anti-cage). A founder set-aside is recorded as one more
// touch (verb:"set-aside", carrying reason/until), so derived suppression reads it like any other touch —
// there is no separate suppression flag to keep in sync.

const MAX_TOUCHES = 500;

function normalizeTouch(raw) {
  const touch = raw && typeof raw === "object" ? raw : {};
  const out = {
    motionId: trimOrNull(touch.motionId),
    runId: trimOrNull(touch.runId),
    verb: trimOrNull(touch.verb),
    at: touch.at || now(),
  };
  // A set-aside touch carries the founder's reason and an optional until — kept only when present so a
  // plain touch stays lean. These are DATA on the touch, never a stored state field on the object.
  const reason = trimOrNull(touch.reason);
  if (reason) out.reason = reason;
  const until = trimOrNull(touch.until);
  if (until) out.until = until;
  return out;
}

function normalizeObjectTouch(input, prefix) {
  const key = trimOrNull(input.objectKey);
  if (!key) throw new Error("An ObjectTouch record requires an objectKey.");
  const touches = (Array.isArray(input.touches) ? input.touches : [])
    .map(normalizeTouch)
    .slice(-MAX_TOUCHES);
  const times = touches.map((t) => t.at).filter(Boolean).sort();
  return {
    ...base(input, prefix),
    objectKey: key,
    // `kind` is an open string — never validated against an enum (anti-cage). Empty is allowed for an
    // object whose kind was never stated.
    kind: trimOrNull(input.kind),
    label: trimOrNull(input.label),
    touches,
    firstSeenAt: input.firstSeenAt || times[0] || now(),
    lastSeenAt: input.lastSeenAt || times[times.length - 1] || now(),
  };
}

export const objectTouchStore = defineStore("gtm-object-touches", "obj", normalizeObjectTouch);

// The record id is derived deterministically from projectId + objectKey so an upsert always addresses the
// same document (no create-new-each-time). safeId is applied by the store on write; we pre-hash the key so
// two objectKeys that safeId would collapse can never share a record.
function touchRecordId(projectId, key) {
  const scope = String(projectId ?? "default");
  const hash = crypto.createHash("sha1").update(`${scope}::${key}`).digest("hex").slice(0, 16);
  return `obj-${hash}`;
}

// Read one object's ledger record by its key, scoped to a project. Returns null when the object has never
// been touched (honest blank — never a seeded record).
export function getObjectTouch(projectId = "default", key, options = {}) {
  const trimmed = String(key ?? "").trim();
  if (!trimmed) return null;
  try {
    return objectTouchStore.get(touchRecordId(projectId, trimmed), options);
  } catch {
    return null;
  }
}

export function listObjectTouches(projectId = "default", options = {}) {
  return objectTouchStore.list({ ...options, projectId });
}

// Deterministic upsert + append: record that a motion touched an object. Resolves the object's identity
// from (kind, fields) via objectKey unless an explicit objectKey is passed, then appends one touch to the
// object's ledger (creating the record on first touch). Pure bookkeeping — it NEVER sends, runs, or gates.
// Dedups an identical (motionId, runId, verb) touch so the same run re-recording is idempotent.
//
//   recordObjectTouch("proj", { kind: "person", fields: item, motionId, runId, verb: "worked" })
//   recordObjectTouch("proj", { objectKey: "geo:buffalo", kind: "geo", label: "Buffalo, NY", verb: "targeted", runId })
export function recordObjectTouch(
  projectId = "default",
  { objectKey: explicitKey, kind = null, fields = {}, label = null, motionId = null, runId = null, verb = null, reason = null, until = null, at = null } = {},
  options = {},
) {
  const key = trimOrNull(explicitKey) || computeObjectKey(kind, fields);
  if (!key) return null;
  const touch = normalizeTouch({ motionId, runId, verb, at, reason, until });
  const existing = getObjectTouch(projectId, key, options);
  const derivedLabel = trimOrNull(label) || (existing?.label ?? null) || labelFor(kind, fields);

  if (existing) {
    const already = existing.touches.some(
      (t) => t.motionId === touch.motionId && t.runId === touch.runId && t.verb === touch.verb,
    );
    const touches = already ? existing.touches : [...existing.touches, touch];
    return objectTouchStore.save(
      {
        ...existing,
        kind: existing.kind || trimOrNull(kind),
        label: derivedLabel,
        touches,
        lastSeenAt: touch.at > (existing.lastSeenAt ?? "") ? touch.at : existing.lastSeenAt,
      },
      options,
    );
  }

  return objectTouchStore.create(
    {
      id: touchRecordId(projectId, key),
      projectId,
      objectKey: key,
      kind: trimOrNull(kind),
      label: derivedLabel,
      touches: [touch],
      firstSeenAt: touch.at,
      lastSeenAt: touch.at,
    },
    options,
  );
}

// A plain-words label for an object, best-effort from its fields — a person's name/org, a geo's locality,
// a keyword's query, a page's route. Never invented: falls back to null when nothing readable is present.
function labelFor(kind, fields = {}) {
  const f = fields && typeof fields === "object" ? fields : {};
  const pick = (...keys) => {
    for (const k of keys) {
      const v = trimOrNull(f[k]);
      if (v) return v;
    }
    return null;
  };
  return (
    pick("label", "name", "decisionMaker", "contact", "fullName") ||
    pick("locality", "geo", "city", "region") ||
    pick("query", "keyword", "term") ||
    pick("path", "route", "page", "url") ||
    pick("partner", "domain", "org", "company") ||
    null
  );
}

// Record a founder set-aside as an explicit touch (verb:"set-aside"), carrying the reason and an optional
// "until". Derived suppression reads this touch — there is no separate stored suppression flag to keep in
// sync (that would be the stage-machine cage this design cut). A founder act, so it is a real touch.
export function setObjectSetAside(
  projectId = "default",
  { objectKey: explicitKey, kind = null, fields = {}, reason = null, until = null, motionId = null, runId = null } = {},
  options = {},
) {
  return recordObjectTouch(
    projectId,
    { objectKey: explicitKey, kind, fields, motionId, runId, verb: "set-aside", reason, until },
    options,
  );
}
