import { MarkerType, Position, type Edge, type Node } from "@xyflow/react";
import type { ReactNode } from "react";
import type { FirmSemanticModel, MarketMovementIndex } from "@/types";
import {
  attachedPoint,
  buildProductGtmLayout,
  productGtmRefId,
  productGtmTerritoryFor,
  workNodeId,
  type ProductGtmTerritory,
} from "./productGtmLayout";
import {
  layoutProductGtmWorkflow,
  parseProductGtmWorkflowNodeId,
  productGtmWorkflowGraph,
  productGtmWorkflowStepLabel,
  type ProductGtmWorkflowGraph,
  type ProductGtmWorkflowStepType,
} from "./productGtmWorkflow";

export type ProductGtmNodeKind = "truth" | "branch" | "work" | "action" | "evidence" | "workflow";
export type { ProductGtmTerritory } from "./productGtmLayout";
export type ProductGtmNodeRole = "direction" | "feature" | "product" | "path" | "market-signal" | "route" | "market-test" | "evidence-gap" | "provisional" | "work" | "branch" | "outward" | "gate" | "evidence" | "workflow-step";
export type ProductGtmNodeData = Record<string, unknown> & {
  kind: ProductGtmNodeKind;
  role: ProductGtmNodeRole;
  territory: ProductGtmTerritory;
  ref: string;
  name: string;
  detail: string;
  meta: string;
  provisional?: boolean;
  active?: boolean;
  waiting?: boolean;
  attention?: "active" | "decision" | "evidence" | "review";
  focus?: boolean;
  primary?: boolean;
  hiddenFeatureCount?: number;
  acceptsWork?: boolean;
  expanded?: boolean;
  expandedContent?: ReactNode;
  action?: MarketMovementIndex["actions"][number];
  workflowGraph?: ProductGtmWorkflowGraph;
  workflowStepType?: ProductGtmWorkflowStepType;
  workRef?: string;
  actionLabel?: string;
  onAction?: () => void;
  onCollapse?: () => void;
};
export type ProductGtmNode = Node<ProductGtmNodeData>;
export type ProductGtmEdgeData = Record<string, unknown> & {
  kind: "spine" | "support" | "shortcut" | "provisional" | "return";
  focused: boolean;
  crossTerritory: boolean;
  sourceTerritory: ProductGtmTerritory;
  targetTerritory: ProductGtmTerritory;
  route: "forward" | "vertical" | "return";
  bundleIndex?: number;
  bundleCount?: number;
};
export type ProductGtmProjection = {
  nodes: ProductGtmNode[];
  edges: Edge[];
  focusName: string;
  focusSummary: string;
  initialFocusIds: string[];
  chapterKind: "whole" | "selection" | "return" | "decision" | "review" | "active";
  chapterAnchorId: string | null;
};

export type ProductGtmProjectionContext = {
  wholeVenture?: boolean;
  unreadSubjectRefs?: string[];
  unreadThreadRefs?: string[];
};

const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const strings = (value: unknown): string[] => list(value).map(String);
const isTentative = (assertion: string | undefined) => assertion === "tentative";

function outwardActionName(action: MarketMovementIndex["actions"][number]) {
  const material = action.preparedMaterial && typeof action.preparedMaterial === "object" ? action.preparedMaterial : {};
  const nested = material.effect && typeof material.effect === "object" ? material.effect as Record<string, unknown> : material;
  const destination = String(nested.destination ?? nested.environment ?? "").trim();
  const kind = action.kind.replaceAll("-", " ");
  return destination ? `${kind} · ${destination}` : kind;
}

const DISPLAY_TYPE: Record<string, string> = {
  direction: "Current direction",
  "working-theory": "Provisional read",
  signal: "Market reality",
  campaign: "Market test",
  channel: "Route to market",
  pipeline: "Product / GTM path",
  open: "Evidence gap",
  capability: "Product capability",
  feature: "Product feature",
  experience: "Product experience",
  motion: "Motion",
  audience: "Audience",
  offer: "Offer",
  release: "Product release",
  evidence: "Evidence",
};

export function productGtmTypeLabel(type: string) {
  return DISPLAY_TYPE[type.toLowerCase()] ?? type.replaceAll("-", " ");
}

function relationshipLabel(label: string) {
  const concise: Record<string, string> = {
    "delivers value through": "delivers value",
    "must return evidence to": "returns evidence",
    "creates the opportunity for": "creates opportunity",
    "supplies the first builders for": "supplies builders",
  };
  return concise[label.toLowerCase()] ?? label;
}

function semanticRole(type: string, provisional: boolean): ProductGtmNodeRole {
  if (provisional) return "provisional";
  const normalized = type.toLowerCase();
  if (normalized === "direction") return "direction";
  if (normalized === "feature") return "feature";
  if (["capability", "experience", "product", "release"].includes(normalized)) return "product";
  if (["pipeline", "motion", "mechanism"].includes(normalized)) return "path";
  if (["signal", "audience"].includes(normalized)) return "market-signal";
  if (normalized === "channel") return "route";
  if (normalized === "campaign") return "market-test";
  if (normalized === "open") return "evidence-gap";
  if (normalized === "evidence") return "evidence";
  return "product";
}

export function productGtmTerritory(type: string, properties: Record<string, unknown> = {}): ProductGtmTerritory {
  return productGtmTerritoryFor(type, properties);
}

function edge(id: string, source: string, target: string, label: string | undefined, kind: ProductGtmEdgeData["kind"] = "support", focused = false, sourceTerritory: ProductGtmTerritory = "unset", targetTerritory: ProductGtmTerritory = "unset", route: ProductGtmEdgeData["route"] = "forward"): Edge<ProductGtmEdgeData> {
  const color = kind === "return" ? "#4b8b7f" : kind === "spine" ? "#748397" : kind === "provisional" ? "#60779b" : "#495666";
  return {
    id, source, target, ...(label ? { label } : {}), type: "productGtmEdge",
    data: { kind, focused, sourceTerritory, targetTerritory, route, crossTerritory: sourceTerritory !== targetTerritory && sourceTerritory !== "unset" && targetTerritory !== "unset" },
    animated: false,
    className: `product-gtm-edge is-${kind}${focused ? " is-focus" : ""}`,
    markerEnd: { type: MarkerType.ArrowClosed, width: kind === "spine" ? 14 : 11, height: kind === "spine" ? 14 : 11, color },
  };
}

function focusNeighborhood(selectedId: string | null, spine: string[], model: FirmSemanticModel, extraEdges: Array<[string, string]>) {
  if (!selectedId) return new Set(spine);
  const neighbors = new Map<string, Set<string>>();
  const join = (a: string, b: string) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    if (!neighbors.has(b)) neighbors.set(b, new Set());
    neighbors.get(a)?.add(b); neighbors.get(b)?.add(a);
  };
  for (const relationship of model.relationships) join(productGtmRefId(relationship.fromRef), productGtmRefId(relationship.toRef));
  for (const [source, target] of extraEdges) join(source, target);
  const focused = new Set([selectedId]);
  for (const first of neighbors.get(selectedId) ?? []) {
    focused.add(first);
    for (const second of neighbors.get(first) ?? []) focused.add(second);
  }
  return focused;
}

function bundleEdges(edges: Array<Edge<ProductGtmEdgeData>>) {
  const groups = new Map<string, Array<Edge<ProductGtmEdgeData>>>();
  for (const entry of edges) {
    const key = `${entry.source}:${entry.data?.route ?? "forward"}:${entry.data?.kind ?? "support"}`;
    const group = groups.get(key) ?? [];
    group.push(entry); groups.set(key, group);
  }
  return edges.map((entry) => {
    const key = `${entry.source}:${entry.data?.route ?? "forward"}:${entry.data?.kind ?? "support"}`;
    const group = groups.get(key) ?? [entry];
    return { ...entry, data: { ...entry.data!, bundleIndex: group.indexOf(entry), bundleCount: group.length } };
  });
}

function objectFocusFor(
  selectedId: string | null,
  model: FirmSemanticModel,
  movement: MarketMovementIndex | null,
) {
  if (!selectedId) return null;
  if (model.objects.some((object) => object.id === selectedId)) return selectedId;
  if (selectedId.startsWith("branch:")) {
    const branchRef = `model-branch:${selectedId.slice("branch:".length)}`;
    return model.modelChanges
      .filter((change) => change.branchRef === branchRef)
      .map((change) => productGtmRefId(change.targetRef ?? ""))
      .find((id) => model.objects.some((object) => object.id === id)) ?? null;
  }
  if (selectedId.startsWith("action:")) {
    return movement?.actions.find((action) => `action:${action.id}` === selectedId)?.subjectRefs
      .map(productGtmRefId).find((id) => model.objects.some((object) => object.id === id)) ?? null;
  }
  const work = (movement?.liveWork ?? []).find((item, index) => workNodeId(item, index) === selectedId);
  return strings(work?.subjectRefs).map(productGtmRefId)
    .find((id) => model.objects.some((object) => object.id === id)) ?? null;
}

function automaticChapter(movement: MarketMovementIndex | null, context: ProductGtmProjectionContext) {
  if (context.wholeVenture) return null;
  const unreadSubjects = new Set((context.unreadSubjectRefs ?? []).map(productGtmRefId));
  const unreadThreads = new Set(context.unreadThreadRefs ?? []);
  const actions = movement?.actions ?? [];
  const decision = actions.find((action) => action.state === "needs-founder");
  if (decision) return { id: `action:${decision.id}`, kind: "decision" as const };
  const returned = actions.find((action) => action.state === "returned" && (
    context.unreadSubjectRefs === undefined
    || action.subjectRefs.some((ref) => unreadSubjects.has(productGtmRefId(ref)))
    || action.workRefs.some((ref) => unreadThreads.has(ref))
  ));
  if (returned) return { id: `action:${returned.id}`, kind: "return" as const };
  const reviewIndex = (movement?.liveWork ?? []).findIndex((item) => {
    const attention = String(item.attention ?? "").toLowerCase();
    return ["decision", "failure", "review"].includes(attention) && item.unread !== false;
  });
  if (reviewIndex >= 0) return { id: workNodeId(movement!.liveWork[reviewIndex], reviewIndex), kind: "review" as const };
  const staleBranch = movement?.modelBranches?.find((branch) => !branch.closedAt && branch.baseModelRevision < movement.revision);
  if (staleBranch) return { id: `branch:${staleBranch.id}`, kind: "review" as const };
  const activeIndex = (movement?.liveWork ?? []).findIndex((item) => item.activity === "running");
  if (activeIndex >= 0) return { id: workNodeId(movement!.liveWork[activeIndex], activeIndex), kind: "active" as const };
  return null;
}

export function projectProductGtm(
  model: FirmSemanticModel,
  movement: MarketMovementIndex | null,
  selectedId: string | null = null,
  context: ProductGtmProjectionContext = {},
): ProductGtmProjection {
  const nodes: ProductGtmNode[] = [];
  const edges: Array<Edge<ProductGtmEdgeData>> = [];
  const automatic = selectedId ? null : automaticChapter(movement, context);
  const chapterAnchorId = context.wholeVenture ? null : selectedId ?? automatic?.id ?? null;
  const workflowSelection = parseProductGtmWorkflowNodeId(chapterAnchorId);
  const focusObjectId = workflowSelection?.ownerId ?? objectFocusFor(chapterAnchorId, model, movement);
  const layout = buildProductGtmLayout(model, movement, chapterAnchorId, { focusObjectId, wholeVenture: context.wholeVenture });
  const truthIds = layout.visibleObjectIds;
  const territoryById = new Map(model.objects.filter((object) => truthIds.has(object.id)).map((object) => [object.id, productGtmTerritory(object.type, object.properties)]));
  const workSubjectIds = new Set((movement?.liveWork ?? []).map((item) => strings(item.subjectRefs).map(productGtmRefId).find((id) => truthIds.has(id))).filter((id): id is string => Boolean(id)));
  const spine = layout.spine;
  const spineIndex = new Map(spine.map((id, index) => [id, index]));
  const positions = new Map(layout.positions);
  const occupied = [...positions.values()];
  const slots = new Map<string, number>();
  const nextSlot = (key: string) => { const value = slots.get(key) ?? 0; slots.set(key, value + 1); return value; };
  const reserveSynthetic = (candidate: { x: number; y: number }) => {
    const point = { ...candidate };
    while (occupied.some((entry) => Math.abs(entry.x - point.x) < 286 && Math.abs(entry.y - point.y) < 72)) point.y += 82;
    occupied.push(point); return point;
  };

  const extraEdges: Array<[string, string]> = [];
  const openBranches = model.modelBranches.filter((branch) => !branch.closedAt);
  const branchPositions = new Map<string, { x: number; y: number }>();
  openBranches.forEach((branch) => {
    const changes = model.modelChanges.filter((change) => change.branchRef === `model-branch:${branch.id}`);
    const target = changes.map((change) => productGtmRefId(change.targetRef ?? "")).find((id) => positions.has(id));
    const anchor = target ? positions.get(target)! : positions.get(spine[0]) ?? { x: 96, y: 276 };
    branchPositions.set(branch.id, reserveSynthetic(attachedPoint(anchor, nextSlot(`branch:${target ?? "root"}`), "branch")));
    if (target) extraEdges.push([target, `branch:${branch.id}`]);
  });
  const actionPositions = new Map<string, { x: number; y: number }>();
  (movement?.actions ?? []).forEach((action) => {
    const subject = action.subjectRefs.map(productGtmRefId).find((id) => positions.has(id));
    const anchor = subject ? positions.get(subject)! : positions.get(spine.at(-1) ?? "") ?? { x: 96, y: 276 };
    actionPositions.set(action.id, reserveSynthetic(attachedPoint(anchor, nextSlot(`action:${subject ?? "root"}`), "action")));
    if (subject) extraEdges.push([subject, `action:${action.id}`]);
  });
  const workPositions = new Map<string, { x: number; y: number }>();
  (movement?.liveWork ?? []).forEach((item, index) => {
    const id = workNodeId(item, index);
    const subject = strings(item.subjectRefs).map(productGtmRefId).find((ref) => positions.has(ref));
    const anchor = subject ? positions.get(subject)! : positions.get(spine[0]) ?? { x: 96, y: 276 };
    workPositions.set(id, reserveSynthetic(attachedPoint(anchor, nextSlot(`work:${subject ?? "root"}`), "work")));
    if (subject) extraEdges.push([id, subject]);
  });
  const workflowOwnerId = workflowSelection?.ownerId ?? chapterAnchorId;
  const workflowOwner = workflowOwnerId ? model.objects.find((object) => object.id === workflowOwnerId) ?? null : null;
  const workflowGraph = workflowOwner ? productGtmWorkflowGraph(workflowOwner.properties) : null;
  const workflowLayout = workflowOwner && workflowGraph
    ? layoutProductGtmWorkflow(workflowOwner.id, workflowGraph, positions.get(workflowOwner.id) ?? { x: 96, y: 468 })
    : null;
  if (workflowOwner && workflowGraph && workflowLayout) {
    for (const root of workflowLayout.roots) extraEdges.push([workflowOwner.id, workflowLayout.nodeId(root)]);
    for (const workflowEdge of workflowGraph.edges) extraEdges.push([workflowLayout.nodeId(workflowEdge.from), workflowLayout.nodeId(workflowEdge.to)]);
  }
  const focus = focusNeighborhood(chapterAnchorId, spine, model, extraEdges);
  if (workflowOwner && workflowGraph && workflowLayout) {
    focus.add(workflowOwner.id);
    for (const step of workflowGraph.steps) focus.add(workflowLayout.nodeId(step.id));
  }
  const initialFocusIds = workflowOwner && workflowGraph && workflowLayout
    ? new Set([workflowOwner.id, ...workflowGraph.steps.map((step) => workflowLayout.nodeId(step.id))])
    : new Set(layout.initialFocusIds);

  for (const object of model.objects.filter((entry) => truthIds.has(entry.id))) {
    const position = positions.get(object.id) ?? { x: 100, y: 500 };
    const primaryIndex = spineIndex.get(object.id);
    const primary = primaryIndex !== undefined;
    const provisional = isTentative(object.assertion);
    const territory = territoryById.get(object.id) ?? "unset";
    const featureCount = layout.hiddenFeatureCounts.get(object.id) ?? 0;
    const role = semanticRole(object.type, provisional);
    const objectWorkflow = productGtmWorkflowGraph(object.properties);
    nodes.push({
      id: object.id, type: "productGtm", position,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: { kind: "truth", role, territory, ref: `object:${object.id}`, name: object.name, detail: object.statement, meta: `${objectWorkflow ? "GTM workflow" : productGtmTypeLabel(object.type)}${featureCount ? ` · ${featureCount} ${featureCount === 1 ? "feature" : "features"}` : ""}`, provisional, primary, hiddenFeatureCount: featureCount, acceptsWork: workSubjectIds.has(object.id), focus: focus.has(object.id), attention: role === "evidence" ? "evidence" : primaryIndex === spine.length - 1 && role === "evidence-gap" ? "decision" : undefined, workflowGraph: objectWorkflow ?? undefined },
    });
  }
  for (const relationship of model.relationships) {
    const source = productGtmRefId(relationship.fromRef); const target = productGtmRefId(relationship.toRef);
    if (!truthIds.has(source) || !truthIds.has(target)) continue;
    const spineEdge = spineIndex.get(target) === (spineIndex.get(source) ?? -2) + 1;
    const provisional = isTentative(relationship.assertion) || model.objects.some((object) => (object.id === source || object.id === target) && isTentative(object.assertion));
    const bothOnSpine = spineIndex.has(source) && spineIndex.has(target);
    if (bothOnSpine && !spineEdge && !provisional) continue;
    const kind = provisional ? "provisional" : spineEdge ? "spine" : bothOnSpine ? "shortcut" : "support";
    const sourceTerritory = territoryById.get(source) ?? "unset";
    const targetTerritory = territoryById.get(target) ?? "unset";
    const crosses = sourceTerritory !== targetTerritory && sourceTerritory !== "unset" && targetTerritory !== "unset";
    const focusedEdge = focus.has(source) && focus.has(target);
    const label = spineEdge || (provisional && focusedEdge) || (crosses && focusedEdge) ? relationshipLabel(relationship.label) : undefined;
    edges.push(edge(relationship.id, source, target, label, kind, focusedEdge, sourceTerritory, targetTerritory));
  }

  if (workflowOwner && workflowGraph && workflowLayout) {
    for (const step of workflowGraph.steps) {
      const nodeId = workflowLayout.nodeId(step.id);
      nodes.push({
        id: nodeId, type: "productGtm", position: workflowLayout.positions.get(step.id) ?? { x: 410, y: 468 },
        sourcePosition: Position.Right, targetPosition: Position.Left, draggable: false,
        data: {
          kind: "workflow", role: "workflow-step", territory: "gtm", ref: nodeId, workRef: `object:${workflowOwner.id}`,
          name: step.label, detail: step.detail ?? "", meta: productGtmWorkflowStepLabel(step.type),
          primary: true, focus: true, workflowStepType: step.type,
        },
      });
    }
    for (const root of workflowLayout.roots) edges.push(edge(
      `workflow-root:${workflowOwner.id}:${root}`, workflowOwner.id, workflowLayout.nodeId(root), "begins",
      "spine", true, productGtmTerritory(workflowOwner.type, workflowOwner.properties), "gtm",
    ));
    for (const [index, workflowEdge] of workflowGraph.edges.entries()) {
      const returns = workflowLayout.isReturn(workflowEdge);
      edges.push(edge(
        `workflow-edge:${workflowOwner.id}:${workflowEdge.from}:${workflowEdge.to}:${index}`,
        workflowLayout.nodeId(workflowEdge.from), workflowLayout.nodeId(workflowEdge.to), workflowEdge.label ?? (returns ? "returns" : undefined),
        returns ? "return" : "spine", true, "gtm", "gtm", returns ? "return" : "forward",
      ));
    }
  }

  for (const branch of openBranches) {
    const changes = model.modelChanges.filter((change) => change.branchRef === `model-branch:${branch.id}`);
    const nodeId = `branch:${branch.id}`;
    const target = changes.map((change) => productGtmRefId(change.targetRef ?? "")).find((id) => truthIds.has(id));
    const territory = target ? territoryById.get(target) ?? "shared" : "shared";
    nodes.push({ id: nodeId, type: "productGtm", position: branchPositions.get(branch.id) ?? { x: 96, y: 276 }, sourcePosition: Position.Right, targetPosition: Position.Left, data: { kind: "branch", role: "branch", territory, ref: `model-branch:${branch.id}`, name: branch.name, detail: branch.question, meta: `${changes.length} proposed ${changes.length === 1 ? "change" : "changes"}`, provisional: true, focus: focus.has(nodeId) } });
    if (target) edges.push(edge(`branch-edge:${branch.id}:${target}`, target, nodeId, undefined, "provisional", focus.has(target) && focus.has(nodeId), territoryById.get(target), territory));
    if (target && layout.initialFocusIds.has(target)) initialFocusIds.add(nodeId);
  }

  for (const action of movement?.actions ?? []) {
    const actionId = `action:${action.id}`;
    const subject = action.subjectRefs.map(productGtmRefId).find((id) => truthIds.has(id));
    const territory: ProductGtmTerritory = "gtm";
    const returned = action.state === "returned" || action.state === "silent";
    const needsFounder = action.state === "needs-founder" || action.state === "execution-failed" || action.state === "execution-unknown";
    const failed = action.state === "execution-failed" || action.state === "execution-unknown" || action.state === "observation-failed";
    const detail = action.state === "needs-founder" ? "Exact outward act is waiting for you."
      : action.state === "execution-failed" ? "The exact outward act failed and remains retryable."
        : action.state === "execution-unknown" ? "Execution began before Drover was interrupted; verify the destination."
        : action.state === "observation-failed" ? "The authorized return source could not be read."
          : action.state === "silent" ? "The exact source returned without the expected condition."
            : action.state === "returned" ? "Reality returned to this exact act." : "Moving in the world.";
    nodes.push({ id: actionId, type: "productGtm", position: actionPositions.get(action.id) ?? { x: 96, y: 468 }, sourcePosition: Position.Right, targetPosition: Position.Left, data: { kind: returned ? "evidence" : "action", role: returned ? "evidence" : needsFounder ? "gate" : "outward", territory, ref: `outward-action:${action.id}`, name: outwardActionName(action), detail, meta: action.state === "needs-founder" ? "Needs your decision" : action.state.replaceAll("-", " "), waiting: needsFounder, attention: needsFounder ? "decision" : returned ? "evidence" : failed ? "review" : undefined, focus: focus.has(actionId), action } });
    if (subject) edges.push(edge(`action-edge:${action.id}:${subject}`, subject, actionId, needsFounder ? "your decision" : "into the world", "support", focus.has(subject) && focus.has(actionId), territoryById.get(subject), territory));
    if (action.outcomeRefs.length && subject) edges.push(edge(`return-edge:${action.id}:${subject}`, actionId, subject, "reality returned", "return", focus.has(subject) && focus.has(actionId), territory, territoryById.get(subject), "return"));
    if (needsFounder || returned || failed) initialFocusIds.add(actionId);
  }

  for (const [index, item] of (movement?.liveWork ?? []).entries()) {
    const threadRef = String(item.threadRef ?? item.id ?? `work-${index}`);
    const id = workNodeId(item, index);
    const subject = strings(item.subjectRefs).map(productGtmRefId).find((ref) => truthIds.has(ref));
    const state = String(item.attention ?? item.activity ?? "").toLowerCase();
    const meta = item.activity === "running" ? "Working now" : state && state !== "none" && state !== "idle" ? state.replaceAll("-", " ") : "Waiting";
    const workPosition = workPositions.get(id) ?? { x: 96, y: 394 };
    const territory = subject ? territoryById.get(subject) ?? "shared" : "shared";
    const workAttention = state === "decision" ? "decision" : ["failure", "review"].includes(state) ? "review" : item.activity === "running" ? "active" : undefined;
    nodes.push({ id, type: "productGtm", position: workPosition, sourcePosition: Position.Top, targetPosition: Position.Left, data: { kind: "work", role: "work", territory, ref: threadRef, name: String(item.founderIntent ?? item.name ?? "Live work"), detail: String((item.latestMeaningfulEvent as Record<string, unknown> | undefined)?.summary ?? "Agent work is attached to what it is changing."), meta, active: item.activity === "running", attention: workAttention, focus: focus.has(id) } });
    if (subject) {
      const workEdge = edge(`work-edge:${id}:${subject}`, id, subject, undefined, "support", focus.has(id) && focus.has(subject), territory, territoryById.get(subject), "vertical");
      workEdge.sourceHandle = "work-source";
      workEdge.targetHandle = "work-target";
      edges.push(workEdge);
    }
    if (item.activity === "running" || id === chapterAnchorId) initialFocusIds.add(id);
  }

  const focal = model.objects.find((object) => object.id === spine[0]);
  const supportingCount = model.objects.filter((object) => truthIds.has(object.id) && !isTentative(object.assertion) && !spineIndex.has(object.id)).length;
  const tentativeCount = model.objects.filter((object) => truthIds.has(object.id) && isTentative(object.assertion)).length;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const chapterKind = context.wholeVenture
    ? "whole" as const
    : selectedId
      ? "selection" as const
      : automatic?.kind ?? "whole" as const;
  const chapterNode = chapterAnchorId ? nodes.find((node) => node.id === chapterAnchorId) : null;
  const focusName = chapterNode?.data.name ?? focal?.name ?? "Current Product truth and every path to market";
  const selectedWorkflowStep = workflowSelection && workflowGraph
    ? workflowGraph.steps.find((step) => step.id === workflowSelection.stepId) ?? null
    : null;
  const focusSummary = selectedWorkflowStep
    ? selectedWorkflowStep.detail || `${productGtmWorkflowStepLabel(selectedWorkflowStep.type)} inside the complete workflow.`
    : workflowGraph
    ? "Following its established trigger, work, conditions, founder gates, outward action, and return path."
    : chapterKind === "decision"
    ? "An exact outward action is waiting for your decision."
    : chapterKind === "return"
      ? "Reality returned to the Product or GTM claim it may change."
      : chapterKind === "review"
        ? chapterAnchorId?.startsWith("branch:")
          ? "Product truth changed since this alternative began. Review it before merge."
          : "Exact work returned for review on the claim it may change."
      : chapterKind === "active"
        ? "Live work is attached to what it may change."
        : chapterKind === "selection"
          ? "Following the exact consequences around this context."
          : `${Math.max(spine.length - 1, 0)} connected ${spine.length === 2 ? "move" : "moves"}${supportingCount ? ` · ${supportingCount} supporting ${supportingCount === 1 ? "input" : "inputs"}` : ""}${tentativeCount ? ` · ${tentativeCount} provisional ${tentativeCount === 1 ? "read" : "reads"}` : ""}`;
  return {
    nodes, edges: bundleEdges(edges),
    focusName,
    focusSummary,
    initialFocusIds: [...initialFocusIds].filter((id) => nodeIds.has(id)),
    chapterKind,
    chapterAnchorId,
  };
}
