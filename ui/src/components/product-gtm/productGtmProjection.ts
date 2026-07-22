import { MarkerType, Position, type Edge, type Node } from "@xyflow/react";
import type { ReactNode } from "react";
import type { FirmSemanticModel, MarketMovementIndex } from "@/types";
import {
  attachedPoint,
  buildProductGtmLayout,
  pageWalkOrder,
  productGtmRefId,
  productGtmTerritoryFor,
  workNodeId,
  type ProductGtmTerritory,
} from "./productGtmLayout";
import {
  deriveWorkflowRegisters,
  layoutProductGtmWorkflow,
  parseProductGtmWorkflowNodeId,
  playRunStates,
  productGtmWorkflowGraph,
  productGtmWorkflowStepLabel,
  workflowStepCounts,
  type ProductGtmWorkflowGraph,
  type ProductGtmWorkflowRegister,
  type ProductGtmWorkflowStepType,
} from "./productGtmWorkflow";
import {
  pageAttachments,
  pageAttachedProductObjectIds,
  type ProductGtmPageAttachment,
  type ProductGtmPageData,
} from "./productGtmPages";
import { productGtmTypeLabel, relationshipLabel, semanticRole } from "./productGtmLabels";
import { automaticChapter, focusNeighborhood, objectFocusFor, readSourceFiles } from "./productGtmChapter";

export { productGtmTypeLabel } from "./productGtmLabels";

export type ProductGtmNodeKind = "truth" | "branch" | "work" | "action" | "evidence" | "workflow";
export type { ProductGtmTerritory } from "./productGtmLayout";
export type ProductGtmNodeRole = "direction" | "feature" | "product" | "page" | "path" | "market-signal" | "route" | "market-test" | "evidence-gap" | "provisional" | "work" | "branch" | "outward" | "gate" | "evidence" | "workflow-step";
export type { ProductGtmPageAttachment, ProductGtmPageData };
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
  workflowRegister?: ProductGtmWorkflowRegister;
  workflowPosition?: number;
  workflowStepCount?: number;
  runningCountLabel?: string;
  runningItemRefs?: string[];
  page?: ProductGtmPageData;
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

// At rest the map wants clean noun-phrase labels, not a founder's full sentence. A node authored with a
// sentence-length name (a signal, a branch question, a founder intent) clamps mid-word in the pill and reads
// as noise. When a name reads as a sentence, shorten the DISPLAYED label to a clean phrase on a word boundary
// — never an ellipsis, always a genuine label — and carry the untouched sentence into the node's detail so
// selection loses nothing. Names that are already short page names, direction names, or step labels pass
// through untouched.
const NAME_LABEL_MAX = 40;
const TRAILING_CONNECTIVE = /\s+(?:the|a|an|to|of|in|into|for|and|or|with|is|are|that|this|its|their|your|our|on|at|by|as|from)$/i;
function restingLabel(rawName: string, rawDetail: string): { name: string; detail: string } {
  const full = rawName.trim();
  if (full.length <= NAME_LABEL_MAX) return { name: full || rawName, detail: rawDetail };
  // A multi-sentence name resolves to its clean opening sentence when that alone is a usable label.
  const firstSentence = full.split(/(?<=[.?!])\s+/)[0]?.trim() ?? full;
  let label = firstSentence.length >= 12 && firstSentence.length <= NAME_LABEL_MAX ? firstSentence : full;
  if (label.length > NAME_LABEL_MAX) {
    let clamped = "";
    for (const word of label.split(/\s+/)) {
      const next = clamped ? `${clamped} ${word}` : word;
      if (next.length > NAME_LABEL_MAX) break;
      clamped = next;
    }
    label = clamped || label.slice(0, NAME_LABEL_MAX);
  }
  label = label.replace(/[\s.,;:–—-]+$/, "");
  while (TRAILING_CONNECTIVE.test(label)) label = label.replace(TRAILING_CONNECTIVE, "");
  label = label.trim();
  if (!label || label.length >= full.length) return { name: full, detail: rawDetail };
  // Nothing is lost: the untouched sentence lives in detail, deduped against detail it may already echo.
  const extra = rawDetail?.trim();
  const detail = !extra ? full : extra.includes(full) ? rawDetail : `${full} — ${rawDetail}`;
  return { name: label, detail };
}

function outwardActionName(action: MarketMovementIndex["actions"][number]) {
  const material = action.preparedMaterial && typeof action.preparedMaterial === "object" ? action.preparedMaterial : {};
  const nested = material.effect && typeof material.effect === "object" ? material.effect as Record<string, unknown> : material;
  const destination = String(nested.destination ?? nested.environment ?? "").trim();
  const kind = action.kind.replaceAll("-", " ");
  return destination ? `${kind} · ${destination}` : kind;
}

export function productGtmTerritory(type: string, properties: Record<string, unknown> = {}): ProductGtmTerritory {
  return productGtmTerritoryFor(type, properties);
}

function edge(id: string, source: string, target: string, label: string | undefined, kind: ProductGtmEdgeData["kind"] = "support", focused = false, sourceTerritory: ProductGtmTerritory = "unset", targetTerritory: ProductGtmTerritory = "unset", route: ProductGtmEdgeData["route"] = "forward"): Edge<ProductGtmEdgeData> {
  const color = kind === "return" ? "#54c79a" : kind === "spine" ? "#8a99ae" : kind === "provisional" ? "#6d84a8" : "#5d6b80";
  return {
    id, source, target, ...(label ? { label } : {}), type: "productGtmEdge",
    data: { kind, focused, sourceTerritory, targetTerritory, route, crossTerritory: sourceTerritory !== targetTerritory && sourceTerritory !== "unset" && targetTerritory !== "unset" },
    animated: false,
    className: `product-gtm-edge is-${kind}${focused ? " is-focus" : ""}`,
    markerEnd: { type: MarkerType.ArrowClosed, width: kind === "spine" ? 14 : 11, height: kind === "spine" ? 14 : 11, color },
  };
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
  // Register is derived from physics, never from the play's own blob: established only when canonical and
  // actually run. Run states carry the exact items behind each derived step count.
  const workflowRegisters = deriveWorkflowRegisters(model, movement);
  const workflowRuns = playRunStates(movement);
  const workflowOwnerId = workflowSelection?.ownerId ?? chapterAnchorId;
  const workflowOwner = workflowOwnerId ? model.objects.find((object) => object.id === workflowOwnerId) ?? null : null;
  const workflowGraph = workflowOwner ? productGtmWorkflowGraph(workflowOwner.properties) : null;
  const workflowRegister: ProductGtmWorkflowRegister | null = workflowOwner ? workflowRegisters.get(workflowOwner.id) ?? "drafted" : null;
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

  const suppressed = pageAttachedProductObjectIds(model);
  for (const object of model.objects.filter((entry) => truthIds.has(entry.id) && !suppressed.has(entry.id))) {
    const position = positions.get(object.id) ?? { x: 100, y: 500 };
    const primaryIndex = spineIndex.get(object.id);
    const primary = primaryIndex !== undefined;
    const isPage = object.type.toLowerCase() === "page";
    // A page reads cleanly at rest — page name and kind only, no provisional texture. The model keeps it
    // tentative and source-bearing; the correctable framing lives in its expansion.
    const provisional = isPage ? false : isTentative(object.assertion);
    const territory = territoryById.get(object.id) ?? "unset";
    const featureCount = layout.hiddenFeatureCounts.get(object.id) ?? 0;
    const role = semanticRole(object.type, isTentative(object.assertion));
    const objectWorkflow = isPage ? null : productGtmWorkflowGraph(object.properties);
    const objectRegister = objectWorkflow ? workflowRegisters.get(object.id) ?? "drafted" : null;
    const pageData = isPage ? ((object.properties.page ?? {}) as Record<string, unknown>) : null;
    const page: ProductGtmPageData | undefined = pageData ? {
      route: String(pageData.route ?? ""), file: String(pageData.file ?? ""), sourceRef: String(pageData.sourceRef ?? ""),
      ...pageAttachments(model, object.id, productGtmTypeLabel),
    } : undefined;
    // A page name is already a clean page name; other truth names may be sentence-length statements that must
    // shorten to a resting label while their full statement survives in the expansion.
    const restingTruth = isPage
      ? { name: object.name, detail: object.statement }
      : restingLabel(object.name, objectWorkflow?.objective || object.statement);
    nodes.push({
      id: object.id, type: "productGtm", position,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: { kind: "truth", role, territory, ref: `object:${object.id}`, name: restingTruth.name, detail: restingTruth.detail, meta: isPage ? "Page" : `${objectWorkflow ? `${objectRegister === "drafted" ? "Drafted" : "Established"} play · ${objectWorkflow.steps.length} ${objectWorkflow.steps.length === 1 ? "step" : "steps"}` : productGtmTypeLabel(object.type)}${featureCount ? ` · ${featureCount} ${featureCount === 1 ? "feature" : "features"}` : ""}`, provisional: objectRegister === "drafted" || provisional, primary, hiddenFeatureCount: featureCount, acceptsWork: workSubjectIds.has(object.id), focus: focus.has(object.id), attention: role === "evidence" ? "evidence" : primaryIndex === spine.length - 1 && role === "evidence-gap" ? "decision" : undefined, workflowGraph: objectWorkflow ?? undefined, workflowRegister: objectRegister ?? undefined, page },
    });
  }
  const pageIds = new Set(model.objects.filter((object) => object.type.toLowerCase() === "page").map((object) => object.id));
  const pageWalkIndex = new Map(pageWalkOrder(model).map((id, index) => [id, index]));
  for (const relationship of model.relationships) {
    const source = productGtmRefId(relationship.fromRef); const target = productGtmRefId(relationship.toRef);
    if (!truthIds.has(source) || !truthIds.has(target) || suppressed.has(source) || suppressed.has(target)) continue;
    // A proven page-to-page link is a clean forward walk connector — solid and readable even though both
    // page reads stay model-tentative, mirroring the clean-at-rest page pills. It is drawn only when the
    // target sits to the right in walk order; a backward or same-column link is not a walk step.
    if (pageIds.has(source) && pageIds.has(target)) {
      const sourceWalk = pageWalkIndex.get(source); const targetWalk = pageWalkIndex.get(target);
      if (sourceWalk === undefined || targetWalk === undefined || targetWalk <= sourceWalk) continue;
      edges.push(edge(relationship.id, source, target, undefined, "spine", focus.has(source) && focus.has(target), territoryById.get(source) ?? "unset", territoryById.get(target) ?? "unset"));
      continue;
    }
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
    // Counts belong to a play that has actually run; a drafted play has no real state to count.
    const stepCounts = workflowRegister === "established"
      ? workflowStepCounts(workflowGraph, workflowRuns.get(workflowOwner.id))
      : new Map();
    for (const [stepIndex, step] of workflowGraph.steps.entries()) {
      const nodeId = workflowLayout.nodeId(step.id);
      const count = stepCounts.get(step.id);
      nodes.push({
        id: nodeId, type: "productGtm", position: workflowLayout.positions.get(step.id) ?? { x: 410, y: 468 },
        sourcePosition: Position.Right, targetPosition: Position.Left, draggable: false,
        data: {
          kind: "workflow", role: "workflow-step", territory: "gtm", ref: nodeId, workRef: `object:${workflowOwner.id}`,
          name: step.label, detail: step.detail ?? "", meta: productGtmWorkflowStepLabel(step.type),
          primary: true, focus: true, workflowStepType: step.type, workflowRegister: workflowRegister ?? undefined,
          workflowPosition: stepIndex + 1, workflowStepCount: workflowGraph.steps.length,
          runningCountLabel: count?.label, runningItemRefs: count?.itemRefs,
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
    const restingBranch = restingLabel(branch.name, branch.question);
    nodes.push({ id: nodeId, type: "productGtm", position: branchPositions.get(branch.id) ?? { x: 96, y: 276 }, sourcePosition: Position.Right, targetPosition: Position.Left, data: { kind: "branch", role: "branch", territory, ref: `model-branch:${branch.id}`, name: restingBranch.name, detail: restingBranch.detail, meta: `${changes.length} proposed ${changes.length === 1 ? "change" : "changes"}`, provisional: true, focus: focus.has(nodeId) } });
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
    // Founder intent is often a full directing sentence; it becomes a resting label with the sentence carried
    // into detail alongside the latest meaningful progress event.
    const restingWork = restingLabel(
      String(item.founderIntent ?? item.name ?? "Live work"),
      String((item.latestMeaningfulEvent as Record<string, unknown> | undefined)?.summary ?? "Agent work is attached to what it is changing."),
    );
    nodes.push({ id, type: "productGtm", position: workPosition, sourcePosition: Position.Top, targetPosition: Position.Left, data: { kind: "work", role: "work", territory, ref: threadRef, name: restingWork.name, detail: restingWork.detail, meta, active: item.activity === "running", attention: workAttention, focus: focus.has(id) } });
    if (subject) {
      const workEdge = edge(`work-edge:${id}:${subject}`, id, subject, undefined, "support", focus.has(id) && focus.has(subject), territory, territoryById.get(subject), "vertical");
      workEdge.sourceHandle = "work-source";
      workEdge.targetHandle = "work-target";
      edges.push(workEdge);
    }
    if (item.activity === "running" || id === chapterAnchorId) initialFocusIds.add(id);
  }

  // No provisional read floats free. A strategy read attaches to what it is about: the page(s) it derives
  // from (a cross-territory attachment takes the restrained spectrum automatically). When the map has no
  // page yet — the normal state right after a repository read-back — the reads chain into one provisional
  // reading trunk instead of scattering as orphans (AGENTS.md §Boundaries; docs/FIRM-SPEC.md, 2026-07-22).
  const incidentIds = new Set<string>();
  for (const entry of edges) { incidentIds.add(entry.source); incidentIds.add(entry.target); }
  const pageNodes = nodes.filter((node) => node.data.role === "page");
  const trunkAnchor = nodes.find((node) => node.data.kind === "truth" && node.data.role !== "provisional" && spineIndex.has(node.id)) ?? null;
  const readNodes = nodes
    .filter((node) => node.data.kind === "truth" && node.data.role === "provisional")
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
  let previousRead: ProductGtmNode | null = trunkAnchor;
  for (const read of readNodes) {
    if (incidentIds.has(read.id)) { previousRead = read; continue; }
    const object = model.objects.find((entry) => entry.id === read.id);
    const files = object ? readSourceFiles(object) : new Set<string>();
    const derived = pageNodes.filter((page) => {
      const file = (page.data.page as ProductGtmPageData | undefined)?.file;
      return file ? files.has(file) : false;
    });
    if (derived.length) {
      for (const page of derived) {
        edges.push(edge(`read-derivation:${read.id}:${page.id}`, page.id, read.id, "provisional read", "provisional", focus.has(page.id) && focus.has(read.id), page.data.territory, read.data.territory));
        incidentIds.add(page.id); incidentIds.add(read.id);
      }
    } else if (previousRead) {
      edges.push(edge(`read-attach:${previousRead.id}:${read.id}`, previousRead.id, read.id, undefined, "provisional", focus.has(previousRead.id) && focus.has(read.id), previousRead.data.territory, read.data.territory));
      incidentIds.add(previousRead.id); incidentIds.add(read.id);
    }
    previousRead = read;
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
    ? `${workflowRegister === "drafted" ? "Drafted play" : "Established play"} · ${workflowGraph.steps.length} steps${workflowGraph.objective ? ` · ${workflowGraph.objective}` : " across its complete operating path"}.`
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
