// Pure cross-boundary traceability and gap derivation over the canonical semantic model.
//
// This module is a DERIVATION, not a source of truth: it takes a canonical model (as produced by
// semantic-model.mjs) and returns structured trace links and gaps. It never mutates the model, never
// invents evidence, and never persists anything. Facts, evidence, and interpretation stay separate
// (Product Law 10): trace links are read from existing relationships/insights; gaps are computed from
// their absence. FIRM-SPEC section 7 requires these to remain visible, so they live here as pure output
// rather than as stored records.

// Territory is a FACET on an object, never a sixth architecture role. The facet is founder/earned and
// defaults to unset: an object without a territory signal returns null. Reading order, tolerant of
// absence:
//   1. explicit canonical facet   object.properties.territory === "product" | "gtm"
//   2. compatibility-owned derive  object.properties.architecture.role (campaign/motion => gtm;
//      product-loop/system => product; concept => indeterminate, i.e. null)
//   3. spec-vocabulary fallback    object.type matched to FIRM-SPEC section 6 territory vocabularies
// Anything unrecognized stays unset. Nothing here writes territory back onto a record.

export const TERRITORIES = Object.freeze(["product", "gtm"]);

const PRODUCT_TYPES = new Set([
  "experience", "surface", "capability", "system", "implementation", "release", "telemetry",
]);
const GTM_TYPES = new Set([
  "market", "audience", "positioning", "offer", "motion", "channel", "campaign", "asset", "response", "revenue",
  // Promise/claim/need are gtm-side claim objects in the traceability pairs: a positioning-derived
  // promise or asset claim originates in gtm and must chain onward to product truth.
  "promise", "claim", "need",
]);
// Types that legitimately belong to neither territory (insight is spec-declared territory-neutral).
const NEUTRAL_TYPES = new Set(["insight"]);

// Architecture roles carry an implicit territory for compatibility-owned objects, which cannot hold an
// explicit facet without being erased on the next architecture write. "concept" is deliberately
// indeterminate.
const ROLE_TERRITORY = new Map([
  ["campaign", "gtm"],
  ["motion", "gtm"],
  ["product-loop", "product"],
  ["system", "product"],
]);

// Claim-bearing gtm types whose statements assert something that must chain to product truth.
const CLAIM_TYPES = new Set(["positioning", "promise", "claim", "asset", "offer"]);
// Built-value product types that should be referenced by gtm truth; otherwise they are unexpressed.
const CAPABILITY_TYPES = new Set(["capability", "experience", "release"]);

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedTerritory(value) {
  const normalized = text(value);
  return normalized && TERRITORIES.includes(normalized) ? normalized : null;
}

// Read an object's territory facet, tolerant of absence. Returns "product", "gtm", or null (unset).
export function objectTerritory(object) {
  if (!object || typeof object !== "object") return null;
  const explicit = normalizedTerritory(object.properties?.territory);
  if (explicit) return explicit;
  const role = text(object.properties?.architecture?.role);
  if (role) return ROLE_TERRITORY.get(role) ?? null;
  const type = text(object.type);
  if (type) {
    if (PRODUCT_TYPES.has(type)) return "product";
    if (GTM_TYPES.has(type)) return "gtm";
  }
  return null;
}

function isNeutralType(object) {
  return NEUTRAL_TYPES.has(text(object?.type));
}

// ── Reference plumbing ──────────────────────────────────────────────────────────────────────────

function refKind(ref) {
  const value = text(ref);
  const splitAt = value?.indexOf(":") ?? -1;
  if (splitAt < 1) return null;
  return { kind: value.slice(0, splitAt), id: value.slice(splitAt + 1).split("#")[0], value };
}

function objectIdFromRef(ref) {
  const parsed = refKind(ref);
  if (!parsed) return null;
  // Both object: and architecture: refs address the objects family.
  return (parsed.kind === "object" || parsed.kind === "architecture") ? parsed.id : null;
}

function indexObjects(model) {
  return new Map(list(model?.objects).map((object) => [object.id, object]));
}

// Only an explicitly SUPPORTING stance can discharge a claim gap. Interpretation ("interprets") is not
// evidence — Product Law 10 keeps facts/evidence and interpretation separate, so a tentative model reading
// never stands in for support. Negative and unrecognized stances ("challenges", "refutes", "observes", …)
// never support; the default for anything not on this allowlist is non-supporting.
const SUPPORTING_STANCES = new Set(["supports", "confirms"]);

// An insight is "supporting live evidence" for a subject only when it is current, carries a supporting
// stance, carries at least one source ref, AND at least one of those refs resolves to live evidence. A gap
// derivation must fail toward VISIBILITY (FIRM-SPEC section 7): without a resolver we cannot confirm the
// evidence is live, so the claim stays a visible gap rather than being optimistically cleared.
function insightSupports(insight, resolveEvidenceRef) {
  if (insight.status && insight.status !== "current") return false;
  if (!SUPPORTING_STANCES.has(text(insight.stance))) return false;
  const sourceRefs = list(insight.sourceRefs).map(text).filter(Boolean);
  if (!sourceRefs.length) return false;
  if (typeof resolveEvidenceRef !== "function") return false;
  return sourceRefs.some((ref) => {
    try {
      return resolveEvidenceRef(ref)?.state === "resolved";
    } catch {
      return false;
    }
  });
}

// ── Trace links ─────────────────────────────────────────────────────────────────────────────────

// The eight scout pairs, expressed as which endpoint territories a crossing carries. Relationship-based
// pairs cross object territories directly; insight-based pairs (response/revenue/telemetry) are joins
// over subject objects and evidence and are surfaced separately.
const RELATIONSHIP_PAIRS = [
  { key: "positioning->promise", from: ["positioning"], to: ["promise", "claim"] },
  { key: "promise->capability", from: ["promise", "claim"], to: ["capability"] },
  { key: "audience-need->experience", from: ["audience", "need"], to: ["experience"] },
  { key: "release->campaign-opportunity", from: ["release"], to: ["campaign"] },
  { key: "campaign-asset->product-claim", from: ["asset"], to: ["claim", "capability"] },
];

function classifyRelationshipPair(fromObject, toObject) {
  const fromType = text(fromObject?.type);
  const toType = text(toObject?.type);
  for (const pair of RELATIONSHIP_PAIRS) {
    if (pair.from.includes(fromType) && pair.to.includes(toType)) return pair.key;
  }
  return null;
}

function deriveRelationshipLinks(model, objectsById) {
  const links = [];
  for (const relationship of list(model?.relationships)) {
    const fromId = objectIdFromRef(relationship.fromRef);
    const toId = objectIdFromRef(relationship.toRef);
    if (!fromId || !toId) continue;
    const fromObject = objectsById.get(fromId);
    const toObject = objectsById.get(toId);
    if (!fromObject || !toObject) continue;
    const fromTerritory = objectTerritory(fromObject);
    const toTerritory = objectTerritory(toObject);
    const crossBoundary = Boolean(fromTerritory && toTerritory && fromTerritory !== toTerritory);
    const pair = classifyRelationshipPair(fromObject, toObject);
    if (!pair && !crossBoundary) continue;
    links.push({
      via: "relationship",
      pair,
      relationshipId: relationship.id,
      fromRef: `object:${fromId}`,
      toRef: `object:${toId}`,
      fromTerritory,
      toTerritory,
      crossBoundary,
      label: text(relationship.label),
      assertion: relationship.assertion,
      sourceRefs: list(relationship.sourceRefs).map(text).filter(Boolean),
    });
  }
  return links;
}

// Insight-based crossings: a response/revenue/telemetry insight joins external evidence to one or more
// subject objects. We classify the crossing by the territories of its subject objects.
function classifyInsightPair(insight, subjectObjects) {
  const type = text(insight.type);
  const territories = new Set(subjectObjects.map(objectTerritory).filter(Boolean));
  const spansBoth = territories.has("product") && territories.has("gtm");
  const stance = text(insight.stance);
  // Explicit typing wins; otherwise infer from the territory span + stance shape.
  if (["response", "revenue", "telemetry"].includes(type)) return type;
  if (spansBoth) return "revenue";
  if (territories.has("product") && stance === "supports") return "telemetry";
  if (territories.has("gtm")) return "response";
  return null;
}

function deriveInsightLinks(model, objectsById) {
  const links = [];
  for (const insight of list(model?.insights)) {
    const subjectIds = list(insight.subjectRefs).map(objectIdFromRef).filter(Boolean);
    const subjectObjects = subjectIds.map((id) => objectsById.get(id)).filter(Boolean);
    if (!subjectObjects.length) continue;
    const sourceRefs = list(insight.sourceRefs).map(text).filter(Boolean);
    const pair = classifyInsightPair(insight, subjectObjects);
    const territories = [...new Set(subjectObjects.map(objectTerritory).filter(Boolean))];
    // An insight is only a cross-boundary trace when it actually touches a subject with a territory.
    if (!pair && !territories.length) continue;
    links.push({
      via: "insight",
      pair,
      insightId: insight.id,
      subjectRefs: subjectIds.map((id) => `object:${id}`),
      subjectTerritories: territories,
      stance: text(insight.stance),
      assertion: insight.assertion,
      status: insight.status ?? "current",
      sourceRefs,
    });
  }
  return links;
}

// ── Gaps ────────────────────────────────────────────────────────────────────────────────────────

// (1) Unsupported claim: a claim-bearing gtm object with no relationship reaching a product-territory
//     object AND no current supporting insight whose evidence resolves. A relationship with empty
//     sourceRefs and a tentative assertion is itself an unsupported link.
function deriveUnsupportedClaims(model, objectsById, relationshipLinks, insightLinks, resolveEvidenceRef) {
  const gaps = [];
  const insightsBySubject = new Map();
  for (const insight of list(model?.insights)) {
    for (const id of list(insight.subjectRefs).map(objectIdFromRef).filter(Boolean)) {
      if (!insightsBySubject.has(id)) insightsBySubject.set(id, []);
      insightsBySubject.get(id).push(insight);
    }
  }
  const productReachFrom = new Map();
  for (const link of relationshipLinks) {
    if (link.toTerritory === "product") {
      const fromId = objectIdFromRef(link.fromRef);
      if (fromId) productReachFrom.set(fromId, true);
    }
  }
  for (const object of list(model?.objects)) {
    const territory = objectTerritory(object);
    const type = text(object.type);
    const isClaim = CLAIM_TYPES.has(type) || (territory === "gtm" && object.assertion === "founder-asserted");
    if (!isClaim) continue;
    const reachesProduct = productReachFrom.has(object.id);
    const supported = list(insightsBySubject.get(object.id)).some((insight) => insightSupports(insight, resolveEvidenceRef));
    if (reachesProduct || supported) continue;
    gaps.push({
      kind: "unsupported-claim",
      objectRef: `object:${object.id}`,
      type,
      territory,
      statement: text(object.statement),
      reason: "no traceability relationship reaches product truth and no supporting evidence resolves",
    });
  }
  // Weak-form: a cross-boundary relationship asserted tentatively with no evidence is an unsupported link.
  for (const link of relationshipLinks) {
    if (!link.crossBoundary && !link.pair) continue;
    if (link.assertion === "tentative" && !link.sourceRefs.length) {
      gaps.push({
        kind: "unsupported-link",
        relationshipId: link.relationshipId,
        fromRef: link.fromRef,
        toRef: link.toRef,
        pair: link.pair,
        reason: "tentative cross-boundary link carries no evidence",
      });
    }
  }
  return gaps;
}

// (2) Unexpressed capability: a product-territory built-value object with zero cross-territory
//     relationships in either direction. Built value that no positioning, asset, or campaign references.
function deriveUnexpressedCapabilities(model, objectsById, relationshipLinks) {
  const crossTouched = new Set();
  for (const link of relationshipLinks) {
    if (!link.crossBoundary) continue;
    const fromId = objectIdFromRef(link.fromRef);
    const toId = objectIdFromRef(link.toRef);
    if (fromId) crossTouched.add(fromId);
    if (toId) crossTouched.add(toId);
  }
  const gaps = [];
  for (const object of list(model?.objects)) {
    if (objectTerritory(object) !== "product") continue;
    if (!CAPABILITY_TYPES.has(text(object.type))) continue;
    if (crossTouched.has(object.id)) continue;
    gaps.push({
      kind: "unexpressed-capability",
      objectRef: `object:${object.id}`,
      type: text(object.type),
      statement: text(object.statement),
      reason: "product value with no cross-territory relationship; no gtm record references it",
    });
  }
  return gaps;
}

// (3) Disconnected evidence: an external evidence record enumerable from venture truth whose ref appears
//     in no insight.sourceRefs and no relationship.sourceRefs. Stale/unresolved refs are the weak form.
function deriveDisconnectedEvidence(model, enumerateEvidenceRefs, resolveEvidenceRef) {
  const referenced = new Set();
  for (const insight of list(model?.insights)) {
    for (const ref of list(insight.sourceRefs).map(text).filter(Boolean)) referenced.add(ref.split("#")[0]);
  }
  for (const relationship of list(model?.relationships)) {
    for (const ref of list(relationship.sourceRefs).map(text).filter(Boolean)) referenced.add(ref.split("#")[0]);
  }
  const gaps = [];
  const enumerated = typeof enumerateEvidenceRefs === "function" ? list(enumerateEvidenceRefs()) : [];
  for (const raw of enumerated) {
    const ref = text(raw);
    if (!ref) continue;
    if (!referenced.has(ref.split("#")[0])) {
      gaps.push({
        kind: "disconnected-evidence",
        evidenceRef: ref,
        reason: "external evidence referenced by no insight or relationship",
      });
    }
  }
  // Weak form: referenced evidence that no longer resolves is disconnected from live truth.
  if (typeof resolveEvidenceRef === "function") {
    for (const ref of referenced) {
      let resolution = null;
      try {
        resolution = resolveEvidenceRef(ref);
      } catch {
        resolution = null;
      }
      if (resolution && resolution.state !== "resolved") {
        gaps.push({
          kind: "disconnected-evidence",
          evidenceRef: ref,
          state: resolution.state,
          reason: `referenced evidence is ${resolution.state}`,
        });
      }
    }
  }
  return gaps;
}

// Derive all cross-boundary trace links and gaps from a canonical model. Pure: the model is never
// mutated and no evidence is fabricated.
//
// options:
//   resolveEvidenceRef(ref) -> { state } | null  optional; when absent, a supporting insight cannot be
//                                                confirmed live, so its claim stays a visible gap (fail
//                                                toward visibility), and resolution gaps are skipped.
//   enumerateEvidenceRefs() -> string[]          optional; the venture's known external evidence refs,
//                                                used to detect disconnected evidence.
export function deriveVentureTraceability(model, { resolveEvidenceRef = null, enumerateEvidenceRefs = null } = {}) {
  const objectsById = indexObjects(model);
  const relationshipLinks = deriveRelationshipLinks(model, objectsById);
  const insightLinks = deriveInsightLinks(model, objectsById);
  const traceLinks = [...relationshipLinks, ...insightLinks];
  const gaps = [
    ...deriveUnsupportedClaims(model, objectsById, relationshipLinks, insightLinks, resolveEvidenceRef),
    ...deriveUnexpressedCapabilities(model, objectsById, relationshipLinks),
    ...deriveDisconnectedEvidence(model, enumerateEvidenceRefs, resolveEvidenceRef),
  ];
  return {
    traceLinks,
    relationshipLinks,
    insightLinks,
    gaps,
    gapsByKind: {
      unsupportedClaims: gaps.filter((gap) => gap.kind === "unsupported-claim" || gap.kind === "unsupported-link"),
      unexpressedCapabilities: gaps.filter((gap) => gap.kind === "unexpressed-capability"),
      disconnectedEvidence: gaps.filter((gap) => gap.kind === "disconnected-evidence"),
    },
  };
}
