// relationship-interpreter.mjs — PURE relationship-kind interpretation for the interpretation preview
// (Experience Law 7: the founder authors truth; the machine only PROPOSES an interpretation and shows its
// reasoning). Given a canonical semantic model and two object ids, interpretRelationship returns RANKED
// open-string relationship-kind proposals, each with a short rationale.
//
// It is a DERIVATION, never a source of truth: it reads the model's objects/relationships (via the same
// canonical shapes semantic-model.mjs produces) and objectTerritory, and returns proposals. It NEVER writes
// truth, never mutates the model, and never persists — the UI interpretation chip calls this and the founder
// decides. The proposed kind is an OPEN STRING, never a closed enum: the venture's OWN existing connection
// labels (its real vocabulary) rank first, and only then general type-pair proposals fill in, so the
// interpretation speaks the founder's language before it speaks the system's.

import { objectTerritory } from "./venture-traceability.mjs";

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function objectIdFromRef(ref) {
  const value = text(ref);
  if (!value) return null;
  const rest = value.includes(":") ? value.slice(value.indexOf(":") + 1) : value;
  return text(rest.split("#")[0]);
}

function indexObjects(model) {
  const byId = new Map();
  for (const object of list(model?.objects)) if (text(object?.id)) byId.set(object.id, object);
  return byId;
}

// General type-pair proposals. These are the fallback vocabulary the interpreter reaches for when the
// venture has no existing label to lean on. Each is an OPEN STRING kind + a rationale template. The pairs
// mirror FIRM-SPEC traceability directions (offer designed for an audience; a positioning promised by a
// capability; a promise/claim fulfilled by product truth; a release opening a campaign). Order in this list
// is the tie-break order among general proposals; venture labels always outrank them.
const TYPE_PAIR_PROPOSALS = [
  { from: ["offer"], to: ["audience", "market"], kind: "designed for", rationale: "an offer is designed for the audience it targets" },
  { from: ["positioning"], to: ["capability", "experience", "release"], kind: "promised by", rationale: "a positioning is promised by the capability that makes it true" },
  { from: ["promise", "claim"], to: ["capability", "experience", "release", "system"], kind: "fulfilled by", rationale: "a promise is fulfilled by the product truth that delivers it" },
  { from: ["audience", "need"], to: ["experience", "capability"], kind: "served by", rationale: "an audience need is served by the experience built for it" },
  { from: ["release"], to: ["campaign"], kind: "opens", rationale: "a release opens the campaign opportunity that carries it to market" },
  { from: ["asset"], to: ["claim", "capability"], kind: "evidences", rationale: "a campaign asset evidences the product claim it rests on" },
  { from: ["capability", "experience", "release"], to: ["positioning", "promise", "claim", "offer"], kind: "expressed by", rationale: "built product value is expressed by the gtm claim that carries it outward" },
  { from: ["channel", "motion"], to: ["audience", "market"], kind: "reaches", rationale: "a channel reaches the audience it distributes to" },
];

function matchesPair(pair, fromType, toType) {
  return pair.from.includes(fromType) && pair.to.includes(toType);
}

// The venture's real vocabulary: every distinct, non-empty connection label already in the model, with the
// count of how often it appears. A label the founder has used before is the interpretation the founder is
// most likely to mean again, so frequency ranks it. This is what makes the proposals speak the founder's
// language first rather than the system's.
function ventureLabelVocabulary(model) {
  const counts = new Map();
  for (const relationship of list(model?.relationships)) {
    const label = text(relationship?.label);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

function territoryPhrase(fromObject, toObject) {
  const fromTerritory = objectTerritory(fromObject);
  const toTerritory = objectTerritory(toObject);
  if (fromTerritory && toTerritory && fromTerritory !== toTerritory) {
    return ` (a ${fromTerritory}→${toTerritory} crossing)`;
  }
  return "";
}

// interpretRelationship — PURE. Model + two object ids in, ranked open-string proposals out. Never writes.
//
// Ranking, most-trusted first:
//   1. The venture's EXISTING connection labels (real vocabulary), most-used first — the founder's own words.
//   2. General type-pair proposals for the from/to types (offer→audience = "designed for", etc.), in
//      TYPE_PAIR_PROPOSALS order.
//   3. A last-resort open "relates to" so the founder is never left without a starting point.
// A proposal already offered by an earlier tier is not repeated. Every proposal carries a `kind` (open
// string), a `rationale`, a `source` ("venture-label" | "type-pair" | "fallback"), and its rank.
//
// Returns { fromId, toId, proposals } — or throws only when an id does not name an object in the model
// (a caller error, not a truth write). It PROPOSES; it never establishes.
export function interpretRelationship(model, fromId, toId) {
  const from = text(fromId);
  const to = text(toId);
  if (!from || !to) {
    throw Object.assign(new Error("interpretRelationship needs a from and a to object id."), { code: "relationship_interpret_invalid", status: 400 });
  }
  const objectsById = indexObjects(model);
  const fromObject = objectsById.get(from);
  const toObject = objectsById.get(to);
  if (!fromObject || !toObject) {
    throw Object.assign(
      new Error(`interpretRelationship can only interpret objects this model holds; missing ${!fromObject ? from : to}.`),
      { code: "relationship_interpret_missing", status: 404 },
    );
  }

  const proposals = [];
  const seen = new Set();
  const push = (kind, rationale, source) => {
    const value = text(kind);
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    proposals.push({ kind: value, rationale, source, rank: proposals.length });
  };

  // Tier 1 — the venture's own vocabulary, most-used first. Ties break on the label string for determinism.
  const vocabulary = [...ventureLabelVocabulary(model).entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  for (const [label, count] of vocabulary) {
    push(label, `already used ${count === 1 ? "once" : `${count} times`} in this venture's connections`, "venture-label");
  }

  // Tier 2 — general type-pair proposals for these object types, with a territory crossing note when it
  // applies. These are proposals, not a closed set: the founder can always type their own.
  const fromType = text(fromObject.type);
  const toType = text(toObject.type);
  const crossing = territoryPhrase(fromObject, toObject);
  for (const pair of TYPE_PAIR_PROPOSALS) {
    if (matchesPair(pair, fromType, toType)) push(pair.kind, `${pair.rationale}${crossing}`, "type-pair");
  }

  // Tier 3 — never leave the founder without a starting point.
  push("relates to", "a neutral starting point when no stronger interpretation is known", "fallback");

  return { fromId: from, toId: to, proposals };
}
