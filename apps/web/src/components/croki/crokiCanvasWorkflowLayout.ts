import type { CrokiContext } from "@croki/shared/crokiContext";

import { type CrokiCanvasObject } from "./CrokiCanvasObjects";
import {
  CROKI_CANVAS_ITEM_SIZES,
  crokiCanvasItemIsConnectable,
  crokiCanvasItemSize,
  type CrokiCanvasItem,
  type CrokiCanvasItemRole,
} from "./crokiCanvasItems";

export type CrokiCanvasStoredPositions = Readonly<
  Record<string, { readonly x: number; readonly y: number }>
>;

export function buildCrokiCanvasObjects(input: {
  readonly edges: readonly CrokiContext["edges"][number][];
  readonly fieldWidth: number;
  readonly focusId: string | null;
  readonly items: readonly CrokiCanvasItem[];
  readonly onSelect: (id: string) => void;
  readonly selectedId: string | null;
  readonly storedPositions: CrokiCanvasStoredPositions;
}): CrokiCanvasObject[] {
  const horizontal = input.fieldWidth >= 1040;
  const activeId = input.selectedId ?? input.focusId;
  const activeConnections = new Set(activeId ? [activeId] : []);
  if (activeId) {
    for (const edge of input.edges) {
      if (edge.from === activeId) activeConnections.add(edge.to);
      if (edge.to === activeId) activeConnections.add(edge.from);
    }
  }
  const roleCounts: Record<CrokiCanvasItemRole, number> = {
    intent: 0,
    decision: 0,
    evidence: 0,
    work: 0,
    "plan-step": 0,
    "file-reference": 0,
    "url-reference": 0,
  };
  const positions = derivePositions(input.items, input.edges, input.fieldWidth, input.focusId);
  return input.items.map((item): CrokiCanvasObject => {
    const ordinal = ++roleCounts[item.role];
    const size = crokiCanvasItemSize(item);
    const connectable = crokiCanvasItemIsConnectable(item);
    const base = {
      id: item.id,
      position: input.storedPositions[item.id] ?? positions.get(item.id) ?? { x: 32, y: 32 },
      width: size.width,
      height: size.height,
      connectable,
      selected: item.id === input.selectedId,
    } as const;
    const data = {
      connectable,
      connected:
        !activeId ||
        activeConnections.has(item.id) ||
        (item.kind === "reference" && activeConnections.has(item.ownerNodeId)),
      focus: item.id === input.focusId,
      onSelect: input.onSelect,
      ordinal,
      orientation: horizontal ? "horizontal" : "vertical",
    } as const;
    if (item.kind === "semantic") {
      return { ...base, type: `${item.role}-object`, data: { ...data, item } };
    }
    if (item.kind === "plan-step") {
      return { ...base, type: "plan-step-object", data: { ...data, item } };
    }
    if (item.role === "file-reference") {
      return { ...base, type: "file-reference-object", data: { ...data, item } };
    }
    return { ...base, type: "url-reference-object", data: { ...data, item } };
  });
}

export function loadCrokiCanvasPositions(key: string): CrokiCanvasStoredPositions {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`croki-canvas-layout:v2:${key}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([id, value]) => {
        if (
          typeof value === "object" &&
          value !== null &&
          "x" in value &&
          "y" in value &&
          typeof value.x === "number" &&
          typeof value.y === "number"
        ) {
          return [[id, { x: value.x, y: value.y }]];
        }
        return [];
      }),
    );
  } catch {
    return {};
  }
}

export function persistCrokiCanvasPositions(
  key: string,
  positions: CrokiCanvasStoredPositions,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`croki-canvas-layout:v2:${key}`, JSON.stringify(positions));
}

function derivePositions(
  items: readonly CrokiCanvasItem[],
  edges: readonly CrokiContext["edges"][number][],
  fieldWidth: number,
  focusId: string | null,
): ReadonlyMap<string, { readonly x: number; readonly y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const layers = deriveCanvasLayers(items, edges, focusId);
  if (fieldWidth < 640) {
    let y = 44;
    for (const layer of layers) {
      for (const item of layer) {
        const size = crokiCanvasItemSize(item);
        positions.set(item.id, { x: Math.max(16, (fieldWidth - size.width) / 2), y });
        y += size.height + 28;
      }
      y += 24;
    }
    return positions;
  }
  if (fieldWidth < 1040) {
    let y = 44;
    for (const layer of layers) y = placeCenteredRows(positions, layer, fieldWidth, y);
    return positions;
  }
  const layerGap = 84;
  const layerHeights = layers.map(
    (layer) =>
      layer.reduce((height, item) => height + crokiCanvasItemSize(item).height, 0) +
      Math.max(0, layer.length - 1) * 44,
  );
  const maxLayerHeight = Math.max(...layerHeights, 0);
  let x = 36;
  layers.forEach((layer, layerIndex) => {
    let y = 42 + (maxLayerHeight - layerHeights[layerIndex]!) / 2;
    let layerWidth = 0;
    for (const item of layer) {
      const size = crokiCanvasItemSize(item);
      positions.set(item.id, { x, y });
      y += size.height + 44;
      layerWidth = Math.max(layerWidth, size.width);
    }
    x += layerWidth + layerGap;
  });
  return positions;
}

function deriveCanvasLayers(
  items: readonly CrokiCanvasItem[],
  edges: readonly CrokiContext["edges"][number][],
  focusId: string | null,
): readonly (readonly CrokiCanvasItem[])[] {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const outgoing = new Map(items.map((item) => [item.id, new Set<string>()]));
  const neighbors = new Set<string>();
  for (const edge of edges) {
    if (!itemById.has(edge.from) || !itemById.has(edge.to) || edge.from === edge.to) continue;
    outgoing.get(edge.from)?.add(edge.to);
    if (edge.from === focusId) neighbors.add(edge.to);
    if (edge.to === focusId) neighbors.add(edge.from);
  }
  const components = stronglyConnectedComponents(
    items.map((item) => item.id),
    outgoing,
  );
  const componentById = new Map<string, number>();
  components.forEach((component, index) => {
    for (const id of component) componentById.set(id, index);
  });
  const componentOutgoing = components.map(() => new Set<number>());
  const componentIndegree = components.map(() => 0);
  for (const [from, targets] of outgoing) {
    const fromComponent = componentById.get(from)!;
    for (const target of targets) {
      const targetComponent = componentById.get(target)!;
      if (
        fromComponent === targetComponent ||
        componentOutgoing[fromComponent]!.has(targetComponent)
      ) {
        continue;
      }
      componentOutgoing[fromComponent]!.add(targetComponent);
      componentIndegree[targetComponent]! += 1;
    }
  }
  const componentLayers = components.map(() => 0);
  const queue = components.flatMap((_, index) => (componentIndegree[index] === 0 ? [index] : []));
  for (let index = 0; index < queue.length; index += 1) {
    const component = queue[index]!;
    for (const target of componentOutgoing[component]!) {
      componentLayers[target] = Math.max(componentLayers[target]!, componentLayers[component]! + 1);
      componentIndegree[target]! -= 1;
      if (componentIndegree[target] === 0) queue.push(target);
    }
  }
  const orderedLevels = [...new Set(componentLayers)].sort((left, right) => left - right);
  return orderedLevels.map((level) =>
    items
      .filter((item) => componentLayers[componentById.get(item.id)!] === level)
      .sort((left, right) => Number(neighbors.has(right.id)) - Number(neighbors.has(left.id))),
  );
}

function stronglyConnectedComponents(
  ids: readonly string[],
  outgoing: ReadonlyMap<string, ReadonlySet<string>>,
): readonly (readonly string[])[] {
  const indexById = new Map<string, number>();
  const lowLinkById = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let index = 0;
  const visit = (id: string) => {
    indexById.set(id, index);
    lowLinkById.set(id, index);
    index += 1;
    stack.push(id);
    onStack.add(id);
    for (const target of outgoing.get(id) ?? []) {
      if (!indexById.has(target)) {
        visit(target);
        lowLinkById.set(id, Math.min(lowLinkById.get(id)!, lowLinkById.get(target)!));
      } else if (onStack.has(target)) {
        lowLinkById.set(id, Math.min(lowLinkById.get(id)!, indexById.get(target)!));
      }
    }
    if (lowLinkById.get(id) !== indexById.get(id)) return;
    const component: string[] = [];
    let member: string;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
    } while (member !== id);
    components.push(component);
  };
  for (const id of ids) if (!indexById.has(id)) visit(id);
  return components;
}

function placeCenteredRows(
  positions: Map<string, { x: number; y: number }>,
  items: readonly CrokiCanvasItem[],
  fieldWidth: number,
  startY: number,
): number {
  const horizontalPadding = 16;
  const gap = 16;
  const rowGap = 64;
  const availableWidth = Math.max(1024, fieldWidth - horizontalPadding * 2);
  let row: CrokiCanvasItem[] = [];
  let rowWidth = 0;
  let y = startY;
  const flush = () => {
    if (row.length === 0) return;
    const totalWidth = rowWidth + gap * (row.length - 1);
    let x = (fieldWidth - totalWidth) / 2;
    let rowHeight = 0;
    for (const item of row) {
      const size = crokiCanvasItemSize(item);
      positions.set(item.id, { x, y });
      x += size.width + gap;
      rowHeight = Math.max(rowHeight, size.height);
    }
    y += rowHeight + rowGap;
    row = [];
    rowWidth = 0;
  };
  for (const item of items) {
    const width = crokiCanvasItemSize(item).width;
    if (row.length > 0 && rowWidth + gap * row.length + width > availableWidth) flush();
    row.push(item);
    rowWidth += width;
  }
  flush();
  return y;
}
