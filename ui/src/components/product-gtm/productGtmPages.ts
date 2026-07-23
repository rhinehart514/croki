import type { FirmSemanticModel } from "@/types";
import { productGtmRefId, productGtmTerritoryFor } from "./productGtmLayout";

// Product territory is the product itself, mapped as the pages a user walks through. A page carries an
// honest cited read of what it is now, the founder's prior direction, and the strategy that is about it.
// These attach to the page and surface inside its expansion rather than floating free in the map.
export type ProductGtmPageAttachment = {
  name: string;
  kind: string;
  statement: string;
  objectRef?: string;
  assertion?: "tentative" | "founder-asserted";
  type?: string;
};
export type ProductGtmPageData = {
  route: string;
  file: string;
  sourceRef: string;
  priorDirection: string[];
  attachments: ProductGtmPageAttachment[];
  entryPaths?: Array<{ ref: string; name: string; route: string }>;
  onwardPaths?: Array<{ ref: string; name: string; route: string }>;
};

const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const strings = (value: unknown): string[] => list(value).map(String);

// Types that describe strategy about a page (assumptions, proposals, decisions, evidence) attach to the
// page they concern and surface inside its expansion rather than floating free in Product territory.
export const PAGE_STRATEGY_TYPES = new Set([
  "assumption", "proposal", "decision", "evidence", "open", "hypothesis", "risk",
  "consequence", "product-consequence", "product-delta",
]);

// Gather what belongs to a page's expansion: the founder's prior direction (open Threads scoped to the
// page) and the strategy about it (page-scoped insights plus related strategy objects). These attach to
// the page rather than floating free, so the founder sees a page's whole story in one place.
export function pageAttachments(model: FirmSemanticModel, pageId: string, typeLabel: (type: string) => string) {
  const pageRef = `object:${pageId}`;
  const threads = list((model as { threads?: unknown }).threads) as Array<{ name?: unknown; subjectRefs?: unknown; deletedAt?: unknown }>;
  const priorDirection = threads
    .filter((thread) => !thread.deletedAt && strings(thread.subjectRefs).includes(pageRef))
    .map((thread) => String(thread.name ?? "").trim())
    .filter(Boolean);
  const insights = list((model as { insights?: unknown }).insights) as Array<{ statement?: unknown; subjectRefs?: unknown; type?: unknown; stance?: unknown }>;
  const attachments: ProductGtmPageAttachment[] = insights
    .filter((insight) => strings(insight.subjectRefs).includes(pageRef))
    .map((insight) => ({ name: String(insight.statement ?? "").trim().slice(0, 72), kind: typeLabel(String(insight.type ?? insight.stance ?? "note")), statement: String(insight.statement ?? "").trim() }));
  const related = new Set(model.relationships
    .filter((relationship) => productGtmRefId(relationship.fromRef) === pageId || productGtmRefId(relationship.toRef) === pageId)
    .map((relationship) => productGtmRefId(relationship.fromRef) === pageId ? productGtmRefId(relationship.toRef) : productGtmRefId(relationship.fromRef)));
  for (const object of model.objects) {
    if (!related.has(object.id) || !PAGE_STRATEGY_TYPES.has(object.type.toLowerCase())) continue;
    attachments.push({
      name: object.name,
      kind: typeLabel(object.type),
      statement: object.statement,
      objectRef: `object:${object.id}`,
      assertion: object.assertion,
      type: object.type,
    });
  }
  const pageById = new Map(model.objects
    .filter((object) => object.type.toLowerCase() === "page")
    .map((object) => [object.id, object]));
  const linkedPage = (id: string) => {
    const object = pageById.get(id);
    if (!object) return null;
    const page = (object.properties.page ?? {}) as Record<string, unknown>;
    return { ref: `object:${object.id}`, name: object.name, route: String(page.route ?? "") };
  };
  const provenLinks = model.relationships.filter((relationship) =>
    relationship.sourceRefs.some((ref) => ref.startsWith("repository:"))
    && pageById.has(productGtmRefId(relationship.fromRef))
    && pageById.has(productGtmRefId(relationship.toRef))
  );
  const entryPaths = provenLinks
    .filter((relationship) => productGtmRefId(relationship.toRef) === pageId)
    .map((relationship) => linkedPage(productGtmRefId(relationship.fromRef)))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const onwardPaths = provenLinks
    .filter((relationship) => productGtmRefId(relationship.fromRef) === pageId)
    .map((relationship) => linkedPage(productGtmRefId(relationship.toRef)))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  return { priorDirection, attachments, entryPaths, onwardPaths };
}

// Strategy objects attached to a page in Product territory fold into that page's expansion; they must not
// also render as their own pills in Product territory. Objects on the GTM or shared bands keep their own
// place — only the Product-territory duplication is what the map removes.
export function pageAttachedProductObjectIds(model: FirmSemanticModel) {
  const pageIds = new Set(model.objects.filter((object) => object.type.toLowerCase() === "page").map((object) => object.id));
  const suppressed = new Set<string>();
  if (!pageIds.size) return suppressed;
  for (const relationship of model.relationships) {
    const from = productGtmRefId(relationship.fromRef);
    const to = productGtmRefId(relationship.toRef);
    const [pageSide, other] = pageIds.has(from) ? [from, to] : pageIds.has(to) ? [to, from] : [null, null];
    if (!pageSide || !other) continue;
    const object = model.objects.find((entry) => entry.id === other);
    if (!object || !PAGE_STRATEGY_TYPES.has(object.type.toLowerCase())) continue;
    if (productGtmTerritoryFor(object.type, object.properties) === "product") suppressed.add(object.id);
  }
  return suppressed;
}
