// interpretRelationship — PURE, client-side relationship-kind interpretation for the canvas drop-onto
// interpretation preview (Experience Law 7: the founder authors truth; the machine only PROPOSES an
// interpretation and shows its reasoning). Given the venture's live architecture projection and two node
// refs, it returns RANKED open-string relationship-kind proposals, each with a short rationale.
//
// This is the client cousin of brain/src/firm/relationship-interpreter.mjs. It is deliberately SEPARATE:
// the chip must rank without a round-trip, from the SAME `projection.connections` + territory facet the
// canvas already holds, so the founder sees the interpretation the instant the dwell arms. It is a
// DERIVATION, never a source of truth — it reads, it never writes, never mutates, never persists.
//
// Two ranking laws, mirroring the brain interpreter so the two never speak a different language:
//   1. The venture's OWN existing connection labels (its real vocabulary) rank FIRST, most-used first —
//      the founder's own words before the system's. (composer literal-fallback: the founder's language wins.)
//   2. General territory-aware type-pair proposals fill in only after the venture's vocabulary.
// The proposed kind is ALWAYS an OPEN STRING, NEVER a closed enum, and NEVER a fixed triple: an empty
// venture with no labels and an unclassifiable pair degrades to the founder's literal starting point
// ("relates to"), never to a hard-coded three-way menu.

import type { FirmArchitectureConnection, FirmArchitectureProjection } from "@/types";

export type RelationshipProposalSource = "venture-label" | "type-pair" | "fallback";

export type RelationshipProposal = {
  // The open-string relationship kind. Never a closed enum member.
  kind: string;
  // Why Drover proposes it — shown as the chip's reasoning line.
  rationale: string;
  source: RelationshipProposalSource;
  rank: number;
};

export type RelationshipInterpretation = {
  fromRef: string;
  toRef: string;
  proposals: RelationshipProposal[];
};

type Territory = "product" | "gtm";

// The node shape the ranker reads: the ref it aligns connections/territory against, and the two facets a
// type-pair proposal keys on (the visual kind and the resolved territory the stage already stamped). Kept
// minimal so both an AtlasNode and a plain projected object satisfy it.
export type InterpretNode = {
  ref: string;
  kind?: string | null;
  territory?: Territory | null;
};

// General territory-aware type-pair proposals — the fallback vocabulary the interpreter reaches for when
// the venture has no existing label to lean on. Each is an OPEN STRING kind + a rationale, keyed on the
// atlas visual kinds the canvas scene actually emits (mirrors the brain TYPE_PAIR_PROPOSALS intent over
// the UI's kind vocabulary). List order is the tie-break among general proposals; venture labels always
// outrank them.
const TYPE_PAIR_PROPOSALS: Array<{ from: string[]; to: string[]; kind: string; rationale: string }> = [
  { from: ["offer"], to: ["audience"], kind: "designed for", rationale: "an offer is designed for the audience it targets" },
  { from: ["capability", "system", "release", "product-loop", "implementation"], to: ["offer", "channel", "campaign", "motion"], kind: "expressed by", rationale: "built product value is expressed by the go-to-market work that carries it outward" },
  { from: ["channel", "motion", "campaign"], to: ["audience"], kind: "reaches", rationale: "a channel reaches the audience it distributes to" },
  { from: ["audience"], to: ["capability", "system", "release", "product-loop"], kind: "served by", rationale: "an audience need is served by the product built for it" },
  { from: ["release"], to: ["campaign", "motion"], kind: "opens", rationale: "a release opens the go-to-market push that carries it outward" },
  { from: ["capability", "system"], to: ["capability", "system", "product-loop"], kind: "depends on", rationale: "one product piece depends on another it is built on" },
];

function text(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

// The venture's real vocabulary: every distinct, non-empty connection label already in the projection,
// with how often it appears. A label the founder has used before is the interpretation the founder is most
// likely to mean again, so frequency ranks it. This is what makes the proposals speak the founder's
// language first rather than the system's.
function ventureLabelVocabulary(connections: FirmArchitectureConnection[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const connection of connections) {
    const label = text(connection.label);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

function matchesPair(pair: (typeof TYPE_PAIR_PROPOSALS)[number], fromKind: string | null, toKind: string | null): boolean {
  return Boolean(fromKind && toKind && pair.from.includes(fromKind) && pair.to.includes(toKind));
}

// A greyscale-safe crossing note appended to a proposal's rationale when the two objects sit in different
// territories — the founder sees that this relationship crosses the Product / Go-to-market seam.
function territoryPhrase(from: InterpretNode, to: InterpretNode): string {
  if (from.territory && to.territory && from.territory !== to.territory) {
    return ` (a ${from.territory}→${to.territory} crossing)`;
  }
  return "";
}

// interpretRelationship — PURE. Projection + the two dragged nodes in, ranked open-string proposals out.
// Never writes. Ranking, most-trusted first:
//   1. The venture's EXISTING connection labels (real vocabulary), most-used first — the founder's own words.
//   2. General territory-aware type-pair proposals for the from/to kinds, in TYPE_PAIR_PROPOSALS order.
//   3. A last-resort open "relates to" so the founder is NEVER left without a starting point (the literal
//      fallback — never a fixed triple).
// A proposal already offered by an earlier tier is not repeated. When nothing ranks above the fallback the
// founder still gets exactly one honest starting point, which they can always overtype.
export function interpretRelationship(
  projection: FirmArchitectureProjection | null | undefined,
  from: InterpretNode,
  to: InterpretNode,
): RelationshipInterpretation {
  const fromRef = text(from.ref) ?? "";
  const toRef = text(to.ref) ?? "";

  const proposals: RelationshipProposal[] = [];
  const seen = new Set<string>();
  const push = (kind: string, rationale: string, source: RelationshipProposalSource) => {
    const value = text(kind);
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    proposals.push({ kind: value, rationale, source, rank: proposals.length });
  };

  // Tier 1 — the venture's own vocabulary, most-used first. Ties break on the label string for determinism.
  const connections = Array.isArray(projection?.connections) ? projection!.connections : [];
  const vocabulary = [...ventureLabelVocabulary(connections).entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  for (const [label, count] of vocabulary) {
    push(label, `already used ${count === 1 ? "once" : `${count} times`} in this venture's connections`, "venture-label");
  }

  // Tier 2 — general territory-aware type-pair proposals for these object kinds, with a seam-crossing note
  // when it applies. These are proposals, not a closed set: the founder can always type their own.
  const fromKind = text(from.kind);
  const toKind = text(to.kind);
  const crossing = territoryPhrase(from, to);
  for (const pair of TYPE_PAIR_PROPOSALS) {
    if (matchesPair(pair, fromKind, toKind)) push(pair.kind, `${pair.rationale}${crossing}`, "type-pair");
  }

  // Tier 3 — the literal fallback. Never leave the founder without a starting point, and never invent a
  // fixed triple: exactly one neutral open string they can overtype.
  push("relates to", "a neutral starting point when no stronger interpretation is known", "fallback");

  return { fromRef, toRef, proposals };
}
