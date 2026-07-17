// Territory membership for canvas nodes — the UI-side mirror of the brain's `objectTerritory` facet
// (brain/src/firm/venture-traceability.mjs). Territory is a FACET derived once from an object's
// role/type, NEVER from its position on the canvas (DESIGN.md Product Law 6: Product and go-to-market
// are permanent territories over one model; a dragged node keeps its territory). The two large-type
// region kickers and the seam-crossing tick glyphs both read membership from here, so geography stays
// rendered from meaning rather than hoped for from layout.
//
// The atlas scene carries architecture roles on `node.data.element.role` and a visual `data.kind`; this
// classifier applies the same reading order the brain uses: explicit architecture role first, then the
// spec's territory type vocabularies. Anything genuinely indeterminate (the intent hub, a bare concept,
// crew, the wall) returns null and sits on the seam at the origin.
//
// DURABLE FIX (see KIND_TERRITORY below): this map re-derives territory from visual kind because the
// architecture projection does not yet surface the brain's `objectTerritory` facet. Surfacing that facet
// so the UI reads one authoritative value is the real fix; this mirror is the seam until then.

import type { Node } from "@xyflow/react";

export type Territory = "product" | "gtm";

// The minimal node shape this classifier reads — a scene node carrying a visual kind and, for
// architecture cards, the underlying element role. Tolerant of the base React Flow node type so both
// AtlasNode and a plain Node satisfy it.
type TerritoryNode = Pick<Node, "data">;

// Architecture roles carry an implicit territory (mirrors ROLE_TERRITORY in the brain). "concept" is
// deliberately absent — it is indeterminate until the founder promotes it.
const ROLE_TERRITORY: Partial<Record<string, Territory>> = {
  campaign: "gtm",
  motion: "gtm",
  "product-loop": "product",
  system: "product",
};

// Visual kinds that resolve to a territory without an architecture role (mirrors the brain's
// PRODUCT_TYPES / GTM_TYPES section-6 vocabularies, expressed over the atlas visual kinds this scene
// actually emits). A populated venture emits capability nodes that carry no architecture role, so they
// fell through to null and left the territories unrendered — capability is product-territory built value
// (brain objectTerritory: PRODUCT_TYPES includes "capability"), so it maps here.
//
// DURABLE FIX: the truly correct source is the brain's objectTerritory facet
// (brain/src/firm/venture-traceability.mjs) surfaced through the architecture projection, so the UI reads
// one facet instead of re-deriving territory from visual kind. Until that facet is projected, this map
// mirrors the brain vocabularies for the atlas kinds the scene actually emits, and stays conservative —
// only unambiguous kinds are classified. Kinds that legitimately belong to neither are omitted.
const KIND_TERRITORY: Partial<Record<string, Territory>> = {
  // gtm — audiences/offers/campaigns/channels/motions originate in go-to-market.
  campaign: "gtm",
  motion: "gtm",
  audience: "gtm",
  offer: "gtm",
  channel: "gtm",
  // product — capabilities/systems/releases/implementation are built product value.
  "product-loop": "product",
  system: "product",
  capability: "product",
  release: "product",
  implementation: "product",
};

export const TERRITORY_LABEL: Record<Territory, string> = {
  product: "Product",
  gtm: "Go-to-market",
};

// The horizontal side each territory seeds toward. Product-rooted objects bias one way, GTM the other,
// with the intent hub pinned on the seam at the origin (spec: "Product-rooted objects seed toward one
// side, GTM toward the other, intent hub at origin").
export const TERRITORY_SIDE: Record<Territory, -1 | 1> = {
  product: -1,
  gtm: 1,
};

// Read a scene node's territory facet, tolerant of absence. Returns "product", "gtm", or null.
export function nodeTerritory(node: TerritoryNode): Territory | null {
  const data = (node.data ?? {}) as { kind?: unknown; element?: { role?: unknown } };
  const role = typeof data.element?.role === "string" ? data.element.role : null;
  if (role && ROLE_TERRITORY[role]) return ROLE_TERRITORY[role]!;
  const kind = typeof data.kind === "string" ? data.kind : null;
  if (kind && KIND_TERRITORY[kind]) return KIND_TERRITORY[kind]!;
  return null;
}

// The ownership chain that carries territory to bet/work/outcome cards, which are territory-null on their
// own (a bets-only venture would pile every card on the seam under two empty kickers). The rule, mirroring
// the brain's objectTerritory intent:
//   • a staged product change (workKind "product-change") is built product value → PRODUCT;
//   • a draft (message/page/positioning) is go-to-market work → GTM;
//   • a bet inherits from its own records — any product change makes the direction product-territory, else
//     a bet carrying only drafts is gtm; a bet the projection already labels with a motion path is gtm;
//   • an outcome/work inherits its owning bet's territory.
// This is the seam until the brain's objectTerritory facet is surfaced through the projection; it keeps the
// two territories populated in a bets-only venture so the resting canvas reads as the Product+GTM machine.
type ChainNode = { id: string; data?: unknown };

function betRecordTerritory(node: ChainNode): Territory | null {
  const data = (node.data ?? {}) as { kind?: unknown; workKind?: unknown };
  if (data.kind !== "work") return null;
  return data.workKind === "product-change" ? "product" : "gtm";
}

function ownerBetId(node: ChainNode): string | null {
  const data = (node.data ?? {}) as { kind?: unknown; join?: { betId?: unknown }; outcome?: { betId?: unknown } };
  const betId = data.join?.betId ?? data.outcome?.betId;
  return typeof betId === "string" && betId ? betId : null;
}

// Resolve territory for the WHOLE node set, inheriting through the ownership chain. Returns a map keyed by
// node id. A node with its own facet keeps it; bet/work/outcome inherit as above.
export function resolveTerritories(nodes: ChainNode[]): Map<string, Territory | null> {
  const result = new Map<string, Territory | null>();

  // First pass: own facet, and collect each bet's record territories.
  const betTerritory = new Map<string, Territory>();
  for (const node of nodes) {
    const own = nodeTerritory(node as TerritoryNode);
    result.set(node.id, own);
    const betId = ownerBetId(node);
    const recordTerritory = betRecordTerritory(node);
    if (betId && recordTerritory) {
      // Any product change on a bet makes the whole direction product-territory (built value dominates).
      if (recordTerritory === "product" || !betTerritory.has(betId)) betTerritory.set(betId, recordTerritory);
    }
  }

  // A bet already labelled with a motion path reads as go-to-market even before records arrive.
  for (const node of nodes) {
    const data = (node.data ?? {}) as { kind?: unknown; bet?: { id?: unknown }; motionLabel?: unknown };
    if (data.kind !== "bet") continue;
    const betId = typeof data.bet?.id === "string" ? data.bet.id : node.id.replace(/^bet:/, "");
    if (data.motionLabel && !betTerritory.has(betId)) betTerritory.set(betId, "gtm");
  }

  // Second pass: fill bet/work/outcome territories from the inherited bet territory.
  for (const node of nodes) {
    if (result.get(node.id)) continue;
    const data = (node.data ?? {}) as { kind?: unknown; bet?: { id?: unknown } };
    if (data.kind === "bet") {
      const betId = typeof data.bet?.id === "string" ? data.bet.id : node.id.replace(/^bet:/, "");
      const inherited = betTerritory.get(betId) ?? null;
      result.set(node.id, inherited);
      continue;
    }
    const ownerId = ownerBetId(node);
    if (ownerId && betTerritory.has(ownerId)) result.set(node.id, betTerritory.get(ownerId)!);
  }

  return result;
}
