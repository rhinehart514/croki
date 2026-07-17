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
