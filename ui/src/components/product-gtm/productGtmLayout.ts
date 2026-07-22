import type { FirmSemanticModel, MarketMovementIndex } from "@/types";

export type ProductGtmTerritory = "product" | "shared" | "gtm" | "unset";
export type CanvasPoint = { x: number; y: number };

export type ProductGtmLayout = {
  spine: string[];
  positions: Map<string, CanvasPoint>;
  visibleObjectIds: Set<string>;
  hiddenFeatureCounts: Map<string, number>;
  initialFocusIds: Set<string>;
};

export type ProductGtmLayoutContext = {
  focusObjectId?: string | null;
  wholeVenture?: boolean;
};

const ORIGIN_X = 96;
const STEP_X = 332;
const TERRITORY_Y: Record<ProductGtmTerritory, number> = {
  product: 84,
  shared: 276,
  gtm: 468,
  unset: 276,
};
const NODE_WIDTH = 294;
const NODE_HEIGHT = 68;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const strings = (value: unknown): string[] => list(value).map(String);
export const productGtmRefId = (ref: string) => ref.replace(/^[^:]+:/, "");
const tentative = (assertion: string | undefined) => assertion === "tentative";

export function productGtmTerritoryFor(type: string, properties: Record<string, unknown> = {}): ProductGtmTerritory {
  const explicit = String(properties.territory ?? "").toLowerCase();
  if (explicit === "product" || explicit === "gtm") return explicit;
  if (explicit === "both" || explicit === "shared") return "shared";
  const normalized = type.toLowerCase();
  if (["feature", "capability", "experience", "product"].includes(normalized)) return "product";
  if (["signal", "audience", "channel", "campaign", "motion", "offer"].includes(normalized)) return "gtm";
  if (["direction", "working-theory", "pipeline", "mechanism", "open", "release", "evidence"].includes(normalized)) return "shared";
  return "unset";
}

function longestPath(start: string, adjacency: Map<string, string[]>, visited = new Set<string>()): string[] {
  if (visited.has(start)) return [];
  const nextVisited = new Set(visited).add(start);
  let best: string[] = [];
  for (const child of adjacency.get(start) ?? []) {
    const candidate = longestPath(child, adjacency, nextVisited);
    if (candidate.length > best.length) best = candidate;
  }
  return [start, ...best];
}

function longestPathInto(start: string, incoming: Map<string, string[]>, visited = new Set<string>()): string[] {
  if (visited.has(start)) return [];
  const nextVisited = new Set(visited).add(start);
  let best: string[] = [];
  for (const parent of incoming.get(start) ?? []) {
    const candidate = longestPathInto(parent, incoming, nextVisited);
    if (candidate.length > best.length) best = candidate;
  }
  return [...best, start];
}

function pathPriority(model: FirmSemanticModel, path: string[]) {
  const byId = new Map(model.objects.map((object) => [object.id, object]));
  const territory = path.map((id) => {
    const object = byId.get(id);
    return object ? productGtmTerritoryFor(object.type, object.properties) : "unset";
  });
  return path.reduce((score, id, index) => {
    const object = byId.get(id);
    if (!object) return score;
    const type = object.type.toLowerCase();
    const consequential = ["direction", "feature", "capability", "experience", "product", "release", "campaign", "open", "evidence"].includes(type) ? 4 : 0;
    const decisionOrReturn = ["open", "evidence"].includes(type) ? 5 : 0;
    const establishedWorkflow = object.properties.workflowGraph ? 3 : 0;
    const crossesTerritory = index > 0 && territory[index] !== "unset" && territory[index - 1] !== "unset" && territory[index] !== territory[index - 1] ? 2 : 0;
    return score + 1 + consequential + decisionOrReturn + establishedWorkflow + crossesTerritory;
  }, 0);
}

function consequencePath(start: string, adjacency: Map<string, string[]>, model: FirmSemanticModel, visited = new Set<string>()): string[] {
  if (visited.has(start)) return [];
  const nextVisited = new Set(visited).add(start);
  const candidates = (adjacency.get(start) ?? []).map((child) => consequencePath(child, adjacency, model, nextVisited));
  const best = candidates.sort((a, b) => pathPriority(model, b) - pathPriority(model, a) || b.length - a.length)[0] ?? [];
  return [start, ...best];
}

function deriveSpine(model: FirmSemanticModel, context: ProductGtmLayoutContext = {}) {
  const currentIds = new Set(model.objects.filter((object) => !tentative(object.assertion)).map((object) => object.id));
  const contextualIds = context.focusObjectId && !context.wholeVenture
    ? new Set(model.objects.map((object) => object.id))
    : currentIds;
  const adjacency = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  const reverse = new Map<string, string[]>();
  for (const id of contextualIds) { adjacency.set(id, []); reverse.set(id, []); incoming.set(id, 0); }
  for (const relationship of model.relationships) {
    const source = productGtmRefId(relationship.fromRef);
    const target = productGtmRefId(relationship.toRef);
    if (!contextualIds.has(source) || !contextualIds.has(target)) continue;
    if (!context.focusObjectId && tentative(relationship.assertion)) continue;
    adjacency.get(source)?.push(target);
    reverse.get(target)?.push(source);
    incoming.set(target, (incoming.get(target) ?? 0) + 1);
  }

  if (context.focusObjectId && contextualIds.has(context.focusObjectId) && !context.wholeVenture) {
    const upstream = longestPathInto(context.focusObjectId, reverse);
    const downstream = longestPath(context.focusObjectId, adjacency);
    const chapter = [...upstream.slice(0, -1), ...downstream];
    const focalIndex = Math.max(0, chapter.indexOf(context.focusObjectId));
    return chapter.slice(Math.max(0, focalIndex - 3), focalIndex + 5);
  }

  const directions = model.objects
    .filter((object) => currentIds.has(object.id) && object.type.toLowerCase() === "direction")
    .map((object) => object.id);
  const roots = directions.length ? directions : [...currentIds].filter((id) => incoming.get(id) === 0);
  return (roots.length ? roots : [...currentIds])
    .map((id) => consequencePath(id, adjacency, model))
    .sort((a, b) => pathPriority(model, b) - pathPriority(model, a) || b.length - a.length || a.join("").localeCompare(b.join("")))[0] ?? [];
}

function featureVisibility(model: FirmSemanticModel, movement: MarketMovementIndex | null, spine: string[], selectedId: string | null) {
  const visible = new Set(model.objects.map((object) => object.id));
  const reasons = new Set([
    ...spine,
    ...(selectedId ? [selectedId] : []),
    ...(movement?.liveWork ?? []).flatMap((item) => strings(item.subjectRefs).map(productGtmRefId)),
    ...(movement?.actions ?? []).flatMap((action) => [...action.subjectRefs, ...action.outcomeRefs].map(productGtmRefId)),
    ...model.modelChanges.flatMap((change) => change.targetRef ? [productGtmRefId(change.targetRef)] : []),
  ]);
  const objectById = new Map(model.objects.map((object) => [object.id, object]));
  const hiddenFeatureCounts = new Map<string, number>();
  for (const feature of model.objects.filter((object) => object.type.toLowerCase() === "feature" && !reasons.has(object.id))) {
    const relationship = model.relationships.find((entry) => {
      const source = productGtmRefId(entry.fromRef);
      const target = productGtmRefId(entry.toRef);
      if (source !== feature.id && target !== feature.id) return false;
      const other = objectById.get(source === feature.id ? target : source);
      return other && ["capability", "experience", "product"].includes(other.type.toLowerCase());
    });
    if (!relationship) continue;
    const source = productGtmRefId(relationship.fromRef);
    const owner = source === feature.id ? productGtmRefId(relationship.toRef) : source;
    visible.delete(feature.id);
    hiddenFeatureCounts.set(owner, (hiddenFeatureCounts.get(owner) ?? 0) + 1);
  }
  return { visible, hiddenFeatureCounts };
}

function deriveRanks(model: FirmSemanticModel, visible: Set<string>, spine: string[]) {
  const ranks = new Map(spine.map((id, index) => [id, index]));
  const relationships = model.relationships.filter((entry) => {
    const source = productGtmRefId(entry.fromRef);
    const target = productGtmRefId(entry.toRef);
    return visible.has(source) && visible.has(target);
  });
  for (let pass = 0; pass < visible.size; pass += 1) {
    let changed = false;
    for (const relationship of relationships) {
      const source = productGtmRefId(relationship.fromRef);
      const target = productGtmRefId(relationship.toRef);
      const sourceRank = ranks.get(source);
      const targetRank = ranks.get(target);
      if (sourceRank !== undefined && targetRank === undefined) { ranks.set(target, sourceRank + 0.72); changed = true; }
      else if (targetRank !== undefined && sourceRank === undefined) { ranks.set(source, targetRank - 0.72); changed = true; }
    }
    if (!changed) break;
  }
  return ranks;
}

function overlaps(point: CanvasPoint, occupied: CanvasPoint[]) {
  return occupied.some((entry) => Math.abs(entry.x - point.x) < NODE_WIDTH && Math.abs(entry.y - point.y) < NODE_HEIGHT);
}

function reserve(point: CanvasPoint, occupied: CanvasPoint[], territory: ProductGtmTerritory) {
  const direction = territory === "gtm" ? 1 : territory === "product" ? -1 : 1;
  const offsets = [0, 82 * direction, -82 * direction, 164 * direction, -164 * direction, 246 * direction];
  const candidate = offsets.map((offset) => ({ x: point.x, y: Math.max(8, point.y + offset) })).find((entry) => !overlaps(entry, occupied))
    ?? { x: point.x + 44, y: Math.max(8, point.y + 246) };
  occupied.push(candidate);
  return candidate;
}

export function buildProductGtmLayout(model: FirmSemanticModel, movement: MarketMovementIndex | null, selectedId: string | null, context: ProductGtmLayoutContext = {}): ProductGtmLayout {
  const spine = deriveSpine(model, context);
  const spineSet = new Set(spine);
  const { visible, hiddenFeatureCounts } = featureVisibility(model, movement, spine, context.focusObjectId ?? selectedId);
  const ranks = deriveRanks(model, visible, spine);
  const territoryById = new Map(model.objects.map((object) => [object.id, productGtmTerritoryFor(object.type, object.properties)]));
  const positions = new Map<string, CanvasPoint>();
  const occupied: CanvasPoint[] = [];

  for (const [index, id] of spine.entries()) {
    if (!visible.has(id)) continue;
    const point = { x: ORIGIN_X + index * STEP_X, y: TERRITORY_Y[territoryById.get(id) ?? "unset"] };
    positions.set(id, point);
    occupied.push(point);
  }

  const detached = model.objects.filter((object) => visible.has(object.id) && !spineSet.has(object.id) && ranks.get(object.id) === undefined);
  const connected = model.objects.filter((object) => visible.has(object.id) && !spineSet.has(object.id) && ranks.get(object.id) !== undefined);
  connected.sort((a, b) => (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0) || a.id.localeCompare(b.id));
  for (const object of connected) {
    const territory = territoryById.get(object.id) ?? "unset";
    const rank = ranks.get(object.id) ?? 0;
    const provisionalOffset = tentative(object.assertion) ? 82 : 0;
    const point = reserve({ x: ORIGIN_X + rank * STEP_X, y: TERRITORY_Y[territory] + provisionalOffset }, occupied, territory);
    positions.set(object.id, point);
  }
  detached.forEach((object, index) => {
    const territory = territoryById.get(object.id) ?? "unset";
    const column = index % Math.max(1, Math.min(spine.length, 4));
    const row = Math.floor(index / Math.max(1, Math.min(spine.length, 4)));
    positions.set(object.id, reserve({ x: ORIGIN_X + column * STEP_X, y: TERRITORY_Y[territory] + 118 + row * 82 }, occupied, territory));
  });

  const focusIndex = context.focusObjectId ? spine.indexOf(context.focusObjectId) : -1;
  const initialFocusIds = new Set(focusIndex >= 0 && !context.wholeVenture
    ? spine.slice(Math.max(0, focusIndex - 1), focusIndex + 4)
    : spine.slice(0, 5));
  return { spine, positions, visibleObjectIds: visible, hiddenFeatureCounts, initialFocusIds };
}

export function workNodeId(item: Record<string, unknown>, index: number) {
  const threadRef = String(item.threadRef ?? `thread-${index}`);
  return `work:${productGtmRefId(String(item.id ?? threadRef))}:${index}`;
}

export function attachedPoint(anchor: CanvasPoint, slot: number, kind: "work" | "branch" | "action") {
  if (kind === "work") return { x: anchor.x, y: anchor.y + 118 + slot * 82 };
  if (kind === "branch") return { x: anchor.x + 240, y: anchor.y + 94 + slot * 82 };
  return { x: anchor.x + 312, y: Math.max(TERRITORY_Y.gtm, anchor.y + 84 + slot * 82) };
}

export function reflowExpandedNeighborhood<T extends { id: string; position: CanvasPoint }>(nodes: T[], selectedId: string | null): T[] {
  if (!selectedId) return nodes;
  const selected = nodes.find((node) => node.id === selectedId);
  if (!selected) return nodes;
  const verticalShift = selectedId.startsWith("branch:") ? 430 : 230;
  return nodes.map((node) => {
    if (node.id === selectedId) return node;
    const deltaX = node.position.x - selected.position.x;
    const deltaY = node.position.y - selected.position.y;
    if (deltaY > 42 && deltaY < verticalShift && Math.abs(deltaX) < 310) {
      return { ...node, position: { ...node.position, y: node.position.y + verticalShift } };
    }
    if (deltaX > 118 && Math.abs(deltaY) < 224) {
      return { ...node, position: { ...node.position, x: node.position.x + 176 } };
    }
    return node;
  });
}
