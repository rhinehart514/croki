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

export type VenturePipeline = {
  id: string;
  name: string;
  summary: string;
  audience: string;
  trigger: string;
  value: string;
  repeatability: string;
  nodeIds: string[];
  position: { x: number; y: number };
  width: number;
  height: number;
  signalCount: number;
  campaignCount: number;
  releaseCount: number;
  outcomeCount: number;
};

export type VentureGraph = {
  nodes: VentureGraphNode[];
  links: VentureGraphLink[];
  pipelines: VenturePipeline[];
  pipelineCount: number;
  gapCount: number;
};

const COLUMN_ORDER = ["product", "context", "motions", "market-work", "release", "evidence", "other"] as const;
const COLUMN_X = 330;
const ROW_Y = 148;
const MAX_ROWS_PER_COLUMN = 10;
const PIPELINE_STAGE_X = 282;
const PIPELINE_STAGE_COUNT = 4;
const PIPELINE_TOP = 226;
const PIPELINE_ROW_GAP = 24;
const PIPELINE_CARD_Y = 124;
const PIPELINE_CARD_TOP = 98;
const TYPE_LABELS: Record<string, string> = {
  "product-loop": "Product value loop",
  system: "Product system",
  capability: "Product capability",
  motion: "GTM pipeline",
  pipeline: "GTM pipeline",
  campaign: "Campaign",
  channel: "Channel",
  signal: "Signal",
  response: "Outcome",
  revenue: "Outcome",
  telemetry: "Signal",
  return: "Outcome",
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
    if (type === "motion" || type === "pipeline") {
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
  if (["experience", "surface", "product-loop", "capability", "system", "implementation", "design-system", "component", "token"].includes(type)) return "product";
  if (["motion", "pipeline", "channel"].includes(type)) return "motions";
  if (["campaign", "asset"].includes(type)) return "market-work";
  if (type === "release") return "release";
  if (["response", "revenue", "telemetry", "insight", "return"].includes(type)) return "evidence";
  return "other";
}

function stageFor(object: WorkIndexOutlineObject) {
  const type = normalizedType(object);
  if (["signal", "event", "telemetry", "observation"].includes(type)) return 0;
  if (["motion", "pipeline"].includes(type)) return 1;
  if (["campaign", "release"].includes(type)) return 2;
  if (["response", "revenue", "insight", "return", "outcome"].includes(type)) return 3;
  return null;
}

function isMotion(object: WorkIndexOutlineObject | undefined) {
  return object ? ["motion", "pipeline"].includes(normalizedType(object)) : false;
}

function pathNodeIds(motionId: string, objects: WorkIndexOutlineObject[], links: VentureGraphLink[]) {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const ids = new Set([motionId]);

  // Direct inputs and exits are the path's exact canonical joins. Shared Product foundations can feed
  // several paths, but traversal never crosses through them into a different motion.
  for (const link of links) {
    if (link.target === motionId && !isMotion(byId.get(link.source))) ids.add(link.source);
    if (link.source === motionId && !isMotion(byId.get(link.target))) ids.add(link.target);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const link of links) {
      const source = byId.get(link.source);
      const target = byId.get(link.target);
      if (!source || !target || (isMotion(source) && source.id !== motionId) || (isMotion(target) && target.id !== motionId)) continue;
      const sourceColumn = columnFor(source);
      const targetColumn = columnFor(target);
      const sourceDownstream = ["market-work", "release", "evidence"].includes(sourceColumn);
      const targetDownstream = ["market-work", "release", "evidence"].includes(targetColumn);
      const sourceUpstream = ["product", "context"].includes(sourceColumn);
      const targetUpstream = ["product", "context"].includes(targetColumn);

      if (ids.has(link.source) && sourceDownstream && targetDownstream && !ids.has(link.target)) {
        ids.add(link.target); changed = true;
      }
      // Releases are canonically joined release → affected object/campaign, so accept the reverse edge
      // only inside the downstream half of an already-established path.
      if (ids.has(link.target) && targetDownstream && sourceDownstream && !ids.has(link.source)) {
        ids.add(link.source); changed = true;
      }
      if (ids.has(link.target) && targetUpstream && sourceUpstream && !ids.has(link.source)) {
        ids.add(link.source); changed = true;
      }
      if (link.sourceKind === "evidence-return" && (ids.has(link.source) || ids.has(link.target))) {
        if (!ids.has(link.source)) { ids.add(link.source); changed = true; }
        if (!ids.has(link.target)) { ids.add(link.target); changed = true; }
      }
    }
  }
  return ids;
}

function sortObjects(objects: WorkIndexOutlineObject[]) {
  return [...objects].sort((left, right) => (
    Number(right.assertion === "founder-asserted") - Number(left.assertion === "founder-asserted")
    || left.name.localeCompare(right.name)
    || left.id.localeCompare(right.id)
  ));
}

export function ventureGraph(outline: WorkIndexOutline | null | undefined, view: VentureMapView = "system"): VentureGraph {
  if (!outline) return { nodes: [], links: [], pipelines: [], pipelineCount: 0, gapCount: 0 };
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
  const baseNodes = usedColumns.flatMap((column, columnIndex) => {
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

  const byId = new Map(objects.map((object) => [object.id, object]));
  const motionObjects = sortObjects(objects.filter((object) => isMotion(object)));
  let pipelineY = PIPELINE_TOP;
  const pipelines = motionObjects.map((motion) => {
    const nodeIds = pathNodeIds(motion.id, objects, visibleLinks);
    const members = [...nodeIds].map((id) => byId.get(id)).filter(Boolean) as WorkIndexOutlineObject[];
    const releases = members.filter((entry) => normalizedType(entry) === "release");
    const signals = members.filter((entry) => stageFor(entry) === 0);
    const outcomes = members.filter((entry) => stageFor(entry) === 3);
    const stageCounts = Array.from({ length: PIPELINE_STAGE_COUNT }, (_, stage) => members.filter((entry) => stageFor(entry) === stage).length);
    const height = Math.max(246, Math.max(...stageCounts) * PIPELINE_CARD_Y + PIPELINE_CARD_TOP + 18);
    const pipeline: VenturePipeline = {
      id: motion.id,
      name: motion.name,
      summary: objectMapSummary(motion),
      audience: String(detail(motion, "actor") ?? detail(motion, "audience") ?? ""),
      trigger: String(detail(motion, "entry") ?? detail(motion, "trigger") ?? ""),
      value: String(detail(motion, "value") ?? detail(motion, "intendedOutcome") ?? ""),
      repeatability: String(detail(motion, "repeatabilityClaim") ?? detail(motion, "evidenceToReturn") ?? ""),
      nodeIds: [...nodeIds],
      position: { x: 0, y: pipelineY },
      width: PIPELINE_STAGE_X * PIPELINE_STAGE_COUNT,
      height,
      signalCount: signals.length,
      campaignCount: members.filter((entry) => normalizedType(entry) === "campaign").length,
      releaseCount: releases.length,
      outcomeCount: outcomes.length,
    };
    pipelineY += height + PIPELINE_ROW_GAP;
    return pipeline;
  });
  const pipelineMembership = new Map<string, VenturePipeline[]>();
  for (const pipeline of pipelines) for (const id of pipeline.nodeIds) {
    if (!pipelineMembership.has(id)) pipelineMembership.set(id, []);
    pipelineMembership.get(id)!.push(pipeline);
  }
  const memberIndex = new Map<string, number>();
  let productIndex = 0;
  let unplacedIndex = 0;
  const nodes = baseNodes.map((node) => {
    const memberships = pipelineMembership.get(node.object.id) ?? [];
    const column = columnFor(node.object);
    const stage = stageFor(node.object);
    if (column === "product" || (memberships.length > 1 && stage !== 2)) {
      const index = productIndex++;
      return { ...node, position: { x: 18 + (index % PIPELINE_STAGE_COUNT) * PIPELINE_STAGE_X, y: 42 + Math.floor(index / PIPELINE_STAGE_COUNT) * ROW_Y } };
    }
    if (memberships.length !== 1 || stage == null) {
      const index = unplacedIndex++;
      return { ...node, position: { x: (index % PIPELINE_STAGE_COUNT) * PIPELINE_STAGE_X + 18, y: pipelineY + 48 + Math.floor(index / PIPELINE_STAGE_COUNT) * ROW_Y } };
    }
    const pipeline = memberships[0];
    const key = `${pipeline.id}:${stage}`;
    const index = memberIndex.get(key) ?? 0;
    memberIndex.set(key, index + 1);
    return { ...node, position: {
      x: pipeline.position.x + 18 + PIPELINE_STAGE_X * stage,
      y: pipeline.position.y + PIPELINE_CARD_TOP + index * PIPELINE_CARD_Y,
    } };
  });

  return {
    nodes,
    links: visibleLinks,
    pipelines,
    pipelineCount: objects.filter((object) => ["motion", "pipeline"].includes(normalizedType(object))).length,
    gapCount: nodes.filter((node) => node.connectionCount === 0).length,
  };
}

export function connectedIds(graph: VentureGraph, selectedId: string | null) {
  if (!selectedId) return new Set<string>();
  const paths = graph.pipelines.filter((pipeline) => pipeline.nodeIds.includes(selectedId));
  if (paths.length === 1) return new Set(paths[0].nodeIds);
  const ids = new Set([selectedId]);
  for (const link of graph.links) {
    if (link.source === selectedId) ids.add(link.target);
    if (link.target === selectedId) ids.add(link.source);
  }
  return ids;
}

export function objectMapSummary(object: WorkIndexOutlineObject) {
  const type = normalizedType(object);
  if (["motion", "pipeline"].includes(type)) {
    return String(detail(object, "repeatabilityClaim") ?? detail(object, "evidenceToReturn") ?? object.statement);
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
  if (["motion", "pipeline"].includes(type)) {
    add("Trigger", detail(object, "trigger") ? "trigger" : "entry");
    add("Intended outcome", detail(object, "intendedOutcome") ? "intendedOutcome" : "value");
    add("Audience", "actor");
    if (detail(object, "evidenceToReturn")) add("Evidence to return", "evidenceToReturn");
    else add("Why it compounds", "repeatabilityClaim");
    add("Founder authority", "authority");
  } else if (type === "campaign") {
    add("For", "audience");
    add("Changes", "objective");
  } else if (type === "system" || type === "capability") add("What it does", "does");
  return facts;
}
