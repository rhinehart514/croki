import type { WorkIndexOutline, WorkIndexOutlineObject, WorkIndexOutlineRelationship } from "@/api";

export type VentureMapView = "system" | "product" | "gtm";

export type VentureGraphLink = {
  id: string;
  source: string;
  target: string;
  label: string;
  assertion: "tentative" | "founder-asserted";
  sourceKind: "relationship" | "structure" | "evidence-return";
};

export type VentureGraphNode = {
  object: WorkIndexOutlineObject;
  position: { x: number; y: number };
  connectionCount: number;
};

export type VentureGraph = {
  nodes: VentureGraphNode[];
  links: VentureGraphLink[];
  motionCount: number;
  gapCount: number;
};

const COLUMN_ORDER = ["context", "product", "motions", "market-work", "evidence", "other"] as const;
const COLUMN_X = 330;
const ROW_Y = 148;
const MAX_ROWS_PER_COLUMN = 10;
const TYPE_LABELS: Record<string, string> = {
  "product-loop": "Product value loop",
  system: "Product system",
  capability: "Product capability",
  motion: "Repeatable path",
  campaign: "Market push",
  channel: "Channel",
  response: "Market response",
  revenue: "Revenue",
  telemetry: "Product evidence",
  return: "Returned evidence",
};

function normalizedType(object: WorkIndexOutlineObject) {
  return (object.type || object.architectureRole || "").trim().toLowerCase();
}

function objectId(ref: unknown) {
  return String(ref ?? "").replace(/^(?:object|architecture):/, "").split("#")[0];
}

function stringList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return typeof value === "string" && value ? [value] : [];
}

function detail(object: WorkIndexOutlineObject, key: string) {
  const direct = object.details?.[key];
  const fields = object.details?.architecture;
  const nested = fields && typeof fields === "object" && "fields" in fields
    ? (fields as { fields?: Record<string, unknown> }).fields?.[key]
    : undefined;
  return direct ?? nested;
}

function structuralLinks(objects: WorkIndexOutlineObject[]) {
  const links: VentureGraphLink[] = [];
  const add = (source: unknown, target: unknown, label: string) => {
    const sourceId = objectId(source);
    const targetId = objectId(target);
    if (!sourceId || !targetId || sourceId === targetId) return;
    links.push({
      id: `structure:${sourceId}:${targetId}:${label}`,
      source: sourceId,
      target: targetId,
      label,
      assertion: "founder-asserted",
      sourceKind: "structure",
    });
  };

  for (const object of objects) {
    const type = normalizedType(object);
    if (type === "system" || type === "capability") {
      for (const ref of stringList(detail(object, "supportsProductRefs"))) add(object.id, ref, "supports");
    }
    if (type === "motion") {
      for (const ref of stringList(detail(object, "systemIds"))) add(ref, object.id, "powers");
      for (const ref of stringList(detail(object, "productRefs"))) add(ref, object.id, "delivers value through");
      for (const ref of stringList(detail(object, "channelIds"))) add(object.id, ref, "runs through");
    }
    if (type === "campaign") {
      const motionRefs = new Set([
        ...stringList(detail(object, "primaryMotionId")),
        ...stringList(detail(object, "motionIds")),
      ]);
      for (const ref of motionRefs) add(ref, object.id, "activated by");
      for (const ref of stringList(detail(object, "releaseRefs"))) add(ref, object.id, "creates opportunity for");
    }
    if (type === "asset") {
      for (const ref of stringList(detail(object, "campaignRefs"))) add(ref, object.id, "produces");
      for (const ref of stringList(detail(object, "productRefs"))) add(ref, object.id, "substantiates");
    }
    if (type === "release") {
      for (const ref of stringList(detail(object, "campaignRefs"))) add(object.id, ref, "creates opportunity for");
    }
  }
  return links;
}

function canonicalLinks(relationships: WorkIndexOutlineRelationship[]): VentureGraphLink[] {
  return relationships.flatMap((relationship) => {
    const source = objectId(relationship.fromRef);
    const target = objectId(relationship.toRef);
    if (!source || !target || source === target) return [];
    return [{
      id: `relationship:${relationship.id}`,
      source,
      target,
      label: relationship.label || relationship.type || "connects to",
      assertion: relationship.assertion,
      sourceKind: relationship.type === "evidence-return" ? "evidence-return" as const : "relationship" as const,
    }];
  });
}

function allLinks(outline: WorkIndexOutline) {
  const ids = new Set(outline.objects.map((object) => object.id));
  const seen = new Set<string>();
  return [...canonicalLinks(outline.relationships ?? []), ...structuralLinks(outline.objects)].filter((link) => {
    if (!ids.has(link.source) || !ids.has(link.target)) return false;
    const key = `${link.source}:${link.target}:${link.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function visibleIds(outline: WorkIndexOutline, links: VentureGraphLink[], view: VentureMapView) {
  const primary = new Set(outline.objects
    .filter((object) => view === "system" ? object.territory != null : object.territory === view)
    .map((object) => object.id));
  const visible = new Set(primary);

  // A territory view keeps the systems it actually depends on. The whole-system view also keeps neutral
  // concepts that have earned a real connection, while orphan notes stay in venture context rather than
  // flooding the operating graph.
  for (const link of links) {
    if (primary.has(link.source)) visible.add(link.target);
    if (primary.has(link.target)) visible.add(link.source);
  }
  return visible;
}

function columnFor(object: WorkIndexOutlineObject) {
  const type = normalizedType(object);
  if (["market", "audience", "need", "positioning", "promise", "claim", "offer", "concept"].includes(type)) return "context";
  if (["experience", "surface", "product-loop", "release", "capability", "system", "implementation", "design-system", "component", "token"].includes(type)) return "product";
  if (["motion", "channel"].includes(type)) return "motions";
  if (["campaign", "asset"].includes(type)) return "market-work";
  if (["response", "revenue", "telemetry", "insight", "return"].includes(type)) return "evidence";
  return "other";
}

function sortObjects(objects: WorkIndexOutlineObject[]) {
  return [...objects].sort((left, right) => (
    Number(right.assertion === "founder-asserted") - Number(left.assertion === "founder-asserted")
    || left.name.localeCompare(right.name)
    || left.id.localeCompare(right.id)
  ));
}

export function ventureGraph(outline: WorkIndexOutline | null | undefined, view: VentureMapView = "system"): VentureGraph {
  if (!outline) return { nodes: [], links: [], motionCount: 0, gapCount: 0 };
  const links = allLinks(outline);
  const visible = visibleIds(outline, links, view);
  const objects = outline.objects.filter((object) => visible.has(object.id));
  const visibleLinks = links.filter((link) => visible.has(link.source) && visible.has(link.target));
  const connectionCounts = new Map<string, number>();
  for (const link of visibleLinks) {
    connectionCounts.set(link.source, (connectionCounts.get(link.source) ?? 0) + 1);
    connectionCounts.set(link.target, (connectionCounts.get(link.target) ?? 0) + 1);
  }

  const usedColumns = COLUMN_ORDER.filter((column) => objects.some((object) => columnFor(object) === column));
  let columnCursor = 0;
  const nodes = usedColumns.flatMap((column, columnIndex) => {
    const columnObjects = sortObjects(objects.filter((object) => columnFor(object) === column));
    const columnStart = columnCursor;
    columnCursor += Math.ceil(columnObjects.length / MAX_ROWS_PER_COLUMN) * COLUMN_X;
    return columnObjects.map((object, index) => ({
      object,
      position: {
        x: columnStart + Math.floor(index / MAX_ROWS_PER_COLUMN) * COLUMN_X,
        y: (index % MAX_ROWS_PER_COLUMN) * ROW_Y + (columnIndex % 2 ? 34 : 0),
      },
      connectionCount: connectionCounts.get(object.id) ?? 0,
    }));
  });

  return {
    nodes,
    links: visibleLinks,
    motionCount: objects.filter((object) => normalizedType(object) === "motion").length,
    gapCount: nodes.filter((node) => node.connectionCount === 0).length,
  };
}

export function connectedIds(graph: VentureGraph, selectedId: string | null) {
  if (!selectedId) return new Set<string>();
  const ids = new Set([selectedId]);
  for (const link of graph.links) {
    if (link.source === selectedId) ids.add(link.target);
    if (link.target === selectedId) ids.add(link.source);
  }
  return ids;
}

export function objectMapSummary(object: WorkIndexOutlineObject) {
  const type = normalizedType(object);
  if (type === "motion") {
    const actor = String(detail(object, "actor") ?? "");
    const value = String(detail(object, "value") ?? "");
    return [actor, value].filter(Boolean).join(" → ") || object.statement;
  }
  if (type === "system" || type === "capability") return String(detail(object, "does") ?? object.statement);
  if (type === "campaign") return String(detail(object, "objective") ?? object.statement);
  return object.statement;
}

export function objectMapTypeLabel(object: WorkIndexOutlineObject) {
  const type = normalizedType(object);
  return TYPE_LABELS[type] ?? type.replaceAll("-", " ");
}

export function objectMapFacts(object: WorkIndexOutlineObject) {
  const type = normalizedType(object);
  const facts: Array<{ label: string; value: string }> = [];
  const add = (label: string, key: string) => {
    const value = detail(object, key);
    if (typeof value === "string" && value) facts.push({ label, value });
  };
  if (type === "motion") {
    add("Who", "actor");
    add("Enters with", "entry");
    add("Leaves with", "value");
    add("How it repeats", "repeatabilityClaim");
  } else if (type === "campaign") {
    add("For", "audience");
    add("Changes", "objective");
  } else if (type === "system" || type === "capability") add("What it does", "does");
  return facts;
}
