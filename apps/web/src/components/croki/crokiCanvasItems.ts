import type {
  CrokiContextFileReference,
  CrokiContextNode,
  CrokiContextReference,
  CrokiContextUrlReference,
} from "@t3tools/shared/crokiContext";

import type { ActivePlanState } from "~/session-logic";

export type CrokiCanvasItemRole =
  | CrokiContextNode["kind"]
  | "plan-step"
  | "file-reference"
  | "url-reference";

export interface CrokiCanvasSemanticItem {
  readonly kind: "semantic";
  readonly id: string;
  readonly node: CrokiContextNode;
  readonly role: CrokiContextNode["kind"];
  readonly title: string;
}

export interface CrokiCanvasPlanStepItem {
  readonly kind: "plan-step";
  readonly id: string;
  /** Stable identity for the plan even when its steps are reordered. */
  readonly planId: string;
  readonly role: "plan-step";
  readonly step: ActivePlanState["steps"][number];
  readonly stepIndex: number;
  readonly title: string;
  readonly turnId: ActivePlanState["turnId"];
}

interface CrokiCanvasReferenceItemBase {
  readonly kind: "reference";
  readonly id: string;
  readonly ownerNodeId: string;
  readonly title: string;
}

export interface CrokiCanvasFileReferenceItem extends CrokiCanvasReferenceItemBase {
  readonly reference: CrokiContextFileReference;
  readonly role: "file-reference";
}

export interface CrokiCanvasUrlReferenceItem extends CrokiCanvasReferenceItemBase {
  readonly reference: CrokiContextUrlReference;
  readonly role: "url-reference";
}

export type CrokiCanvasReferenceItem = CrokiCanvasFileReferenceItem | CrokiCanvasUrlReferenceItem;

export type CrokiCanvasItem =
  | CrokiCanvasSemanticItem
  | CrokiCanvasPlanStepItem
  | CrokiCanvasReferenceItem;

export interface CrokiCanvasItemSize {
  readonly width: number;
  readonly height: number;
}

export const CROKI_CANVAS_ITEM_SIZES: Readonly<Record<CrokiCanvasItemRole, CrokiCanvasItemSize>> = {
  intent: { width: 268, height: 108 },
  decision: { width: 360, height: 164 },
  evidence: { width: 300, height: 128 },
  work: { width: 292, height: 108 },
  "plan-step": { width: 292, height: 100 },
  "file-reference": { width: 300, height: 84 },
  "url-reference": { width: 300, height: 84 },
};

export function buildCrokiSemanticItems(
  nodes: readonly CrokiContextNode[],
): CrokiCanvasSemanticItem[] {
  return nodes.map((node) => ({
    kind: "semantic",
    id: node.id,
    node,
    role: node.kind,
    title: node.title,
  }));
}

export function buildCrokiPlanStepItems(plan: ActivePlanState): CrokiCanvasPlanStepItem[] {
  const planId = crokiCanvasPlanId(plan);
  const occurrences = new Map<string, number>();
  return plan.steps.map((step, stepIndex) => {
    const occurrence = occurrences.get(step.step) ?? 0;
    occurrences.set(step.step, occurrence + 1);
    return {
      kind: "plan-step",
      id: crokiCanvasPlanStepId(planId, step.step, occurrence),
      planId,
      role: "plan-step",
      step,
      stepIndex,
      title: step.step,
      turnId: plan.turnId,
    };
  });
}

export function buildCrokiReferenceItems(
  nodes: readonly CrokiContextNode[],
): CrokiCanvasReferenceItem[] {
  const items: CrokiCanvasReferenceItem[] = [];
  for (const node of nodes) {
    const occurrences = new Map<string, number>();
    for (const reference of node.references ?? []) {
      const referenceKey = crokiCanvasReferenceKey(reference);
      const occurrence = occurrences.get(referenceKey) ?? 0;
      occurrences.set(referenceKey, occurrence + 1);
      const id = crokiCanvasReferenceItemId(node.id, reference, occurrence);
      const base = {
        kind: "reference" as const,
        id,
        ownerNodeId: node.id,
        title: crokiCanvasReferenceTitle(reference),
      };
      items.push(
        reference.kind === "file"
          ? { ...base, reference, role: "file-reference" }
          : { ...base, reference, role: "url-reference" },
      );
    }
  }
  return items;
}

/** Keeps semantic IDs stable while deterministically disambiguating native artifact collisions. */
export function ensureCrokiCanvasItemIdsUnique(
  items: readonly CrokiCanvasItem[],
): CrokiCanvasItem[] {
  const used = new Set<string>();
  return items.map((item) => {
    if (!used.has(item.id)) {
      used.add(item.id);
      return item;
    }
    let occurrence = 1;
    let id = `${item.id}:artifact:${occurrence}`;
    while (used.has(id)) id = `${item.id}:artifact:${++occurrence}`;
    used.add(id);
    return { ...item, id };
  });
}

export function crokiCanvasItemId(item: CrokiCanvasItem): string {
  return item.id;
}

export function crokiCanvasItemTitle(item: CrokiCanvasItem): string {
  return item.title;
}

export function crokiCanvasItemRole(item: CrokiCanvasItem): CrokiCanvasItemRole {
  return item.role;
}

export function crokiCanvasItemSize(item: CrokiCanvasItem): CrokiCanvasItemSize {
  return CROKI_CANVAS_ITEM_SIZES[item.role];
}

export function isCrokiCanvasSemanticItem(item: CrokiCanvasItem): item is CrokiCanvasSemanticItem {
  return item.kind === "semantic";
}

export function isCrokiCanvasPlanStepItem(item: CrokiCanvasItem): item is CrokiCanvasPlanStepItem {
  return item.kind === "plan-step";
}

export function isCrokiCanvasReferenceItem(
  item: CrokiCanvasItem,
): item is CrokiCanvasReferenceItem {
  return item.kind === "reference";
}

export function crokiCanvasItemIsConnectable(item: CrokiCanvasItem): boolean {
  return item.kind === "semantic";
}

export function crokiCanvasPlanId(plan: ActivePlanState): string {
  return plan.turnId ? `turn:${plan.turnId}` : `created:${plan.createdAt}`;
}

export function crokiCanvasReferenceItemId(
  ownerNodeId: string,
  reference: CrokiContextReference,
  occurrence = 0,
): string {
  return `__reference:${encodeURIComponent(ownerNodeId)}:${encodeURIComponent(
    crokiCanvasReferenceKey(reference),
  )}:${occurrence}`;
}

function crokiCanvasReferenceKey(reference: CrokiContextReference): string {
  return reference.kind === "file"
    ? `file:${reference.path}:${reference.line ?? ""}`
    : `url:${reference.url}`;
}

function crokiCanvasPlanStepId(planId: string, title: string, occurrence: number): string {
  return `__thread-plan:${encodeURIComponent(planId)}:${stableTextHash(title)}:${occurrence}`;
}

function crokiCanvasReferenceTitle(reference: CrokiContextReference): string {
  if (reference.kind === "file") {
    return `${reference.path}${reference.line === undefined ? "" : `:${reference.line}`}`;
  }
  try {
    const url = new URL(reference.url);
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.hostname}${path}`;
  } catch {
    return reference.url;
  }
}

function stableTextHash(value: string): string {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}
