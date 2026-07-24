import type { Edge } from "@xyflow/react";
import type { FirmSemanticModel, FirmSemanticRelationship, MarketMovementIndex } from "@/types";
import { pageWalkOrder, productGtmRefId, productGtmTerritoryFor } from "./productGtmLayout";
import {
  projectProductGtm,
  type ProductGtmEdgeData,
  type ProductGtmNode,
  type ProductGtmProjection,
  type ProductGtmProjectionContext,
} from "./productGtmProjection";
import { parseProductGtmWorkflowNodeId, productGtmWorkflowGraph } from "./productGtmWorkflow";

// Presentation state only. These projections answer the current founder question without minting a
// product mode, a second model, or a persisted canvas configuration.
export type ProductGtmProjectionState =
  | { kind: "product-walk"; selectedPageRef?: string; journeyOverlayRef?: string }
  | { kind: "consequence-trace"; anchorRef: string }
  | { kind: "play"; playRef: string; stepRef?: string }
  | { kind: "evidence-return"; evidenceRef: string };

export type AdaptiveProductGtmProjection = ProductGtmProjection & {
  projection: ProductGtmProjectionState;
  initialFrameIds: string[];
};

const selectedObjectId = (selectedId: string | null) =>
  parseProductGtmWorkflowNodeId(selectedId)?.ownerId ?? selectedId;

export function deriveProductGtmProjectionState(
  model: FirmSemanticModel,
  movement: MarketMovementIndex | null,
  selectedId: string | null,
): ProductGtmProjectionState {
  if (!selectedId) return { kind: "product-walk" };
  const workflowStep = parseProductGtmWorkflowNodeId(selectedId);
  if (workflowStep) {
    return { kind: "play", playRef: `object:${workflowStep.ownerId}`, stepRef: selectedId };
  }
  if (selectedId.startsWith("action:")) {
    return { kind: "evidence-return", evidenceRef: `outward-action:${selectedId.slice("action:".length)}` };
  }
  const object = model.objects.find((entry) => entry.id === selectedId);
  if (object?.type.toLowerCase() === "page") {
    return { kind: "product-walk", selectedPageRef: `object:${object.id}` };
  }
  if (object && productGtmWorkflowGraph(object.properties)) {
    return { kind: "play", playRef: `object:${object.id}` };
  }
  const returnedAction = movement?.actions.find((action) =>
    (action.state === "returned" || action.state === "silent")
    && action.outcomeRefs.some((ref) => productGtmRefId(ref) === selectedId)
  );
  if (returnedAction) {
    return { kind: "evidence-return", evidenceRef: `outward-action:${returnedAction.id}` };
  }
  return { kind: "consequence-trace", anchorRef: selectedId };
}

function relationshipVerb(
  relationship: FirmSemanticRelationship | undefined,
  pageIds: Set<string>,
): NonNullable<ProductGtmEdgeData["relationshipVerb"]> {
  if (!relationship) return "Related to";
  const source = productGtmRefId(relationship.fromRef);
  const target = productGtmRefId(relationship.toRef);
  if (pageIds.has(source) && pageIds.has(target)) return "Links to";
  const phrase = `${relationship.type} ${relationship.label}`.toLowerCase();
  if (phrase.includes("contradict")) return "Contradicts";
  if (phrase.includes("support") || phrase.includes("validate")) return "Supports";
  if (phrase.includes("require") || phrase.includes("depend")) return "Requires";
  if (phrase.includes("expected to improve") || phrase.includes("improve")) return "Expected to improve";
  if (phrase.includes("returned after")) return "Returned after";
  // Legacy causal language is deliberately not promoted. "Causes" requires visible assumptions and
  // supporting evidence; an arbitrary stored label cannot establish that burden on its own.
  return "Related to";
}

function edgeSemantics(
  entry: Edge<ProductGtmEdgeData>,
  relationship: FirmSemanticRelationship | undefined,
  pageIds: Set<string>,
) {
  if (entry.id.startsWith("workflow-edge:")) return { verb: "Then" as const, truthStatus: "adopted" };
  if (entry.id.startsWith("workflow-root:")) return { verb: "Requires" as const, truthStatus: "adopted" };
  if (entry.id.startsWith("branch-edge:")) return { verb: "Expected to improve" as const, truthStatus: "provisional" };
  if (entry.id.startsWith("return-edge:")) return { verb: "Returned after" as const, truthStatus: "observed" };
  if (entry.id.startsWith("action-edge:")) return { verb: "Then" as const, truthStatus: "adopted" };
  if (entry.id.startsWith("work-edge:")) return { verb: "Requires" as const, truthStatus: "observed" };
  if (entry.id.startsWith("read-")) return { verb: "Supports" as const, truthStatus: "provisional" };
  return {
    verb: relationshipVerb(relationship, pageIds),
    truthStatus: pageIds.has(entry.source) && pageIds.has(entry.target)
      ? "code-proven"
      : relationship?.assertion === "tentative" ? "provisional" : "adopted",
  };
}

function semanticEdges(
  edges: Array<Edge<ProductGtmEdgeData>>,
  nodes: ProductGtmNode[],
  model: FirmSemanticModel,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const relationshipById = new Map(model.relationships.map((relationship) => [relationship.id, relationship]));
  const pageIds = new Set(model.objects.filter((object) => object.type.toLowerCase() === "page").map((object) => object.id));
  return edges.map((entry) => {
    const semantics = edgeSemantics(entry, relationshipById.get(entry.id), pageIds);
    const sourceName = nodeById.get(entry.source)?.data.name ?? entry.source;
    const targetName = nodeById.get(entry.target)?.data.name ?? entry.target;
    return {
      ...entry,
      label: semantics.verb,
      ariaLabel: `${sourceName} ${semantics.verb.toLowerCase()} ${targetName}. ${semantics.truthStatus}.`,
      data: { ...entry.data!, relationshipVerb: semantics.verb, truthStatus: semantics.truthStatus },
    };
  });
}

function productDependencies(model: FirmSemanticModel, ownerId: string) {
  const objectById = new Map(model.objects.map((object) => [object.id, object]));
  const result = new Set<string>();
  for (const relationship of model.relationships) {
    const source = productGtmRefId(relationship.fromRef);
    const target = productGtmRefId(relationship.toRef);
    const otherId = source === ownerId ? target : target === ownerId ? source : null;
    const other = otherId ? objectById.get(otherId) : null;
    if (other && (other.type.toLowerCase() === "page" || productGtmTerritoryFor(other.type, other.properties) === "product")) {
      result.add(other.id);
    }
  }
  return result;
}

function visibleIds(
  projection: ProductGtmProjectionState,
  graph: ProductGtmProjection,
  model: FirmSemanticModel,
  movement: MarketMovementIndex | null,
) {
  if (projection.kind === "product-walk") {
    const pages = new Set(pageWalkOrder(model));
    for (const action of movement?.actions ?? []) {
      if (!["needs-founder", "returned", "silent"].includes(action.state)) continue;
      if (action.subjectRefs.some((ref) => pages.has(productGtmRefId(ref)))) pages.add(`action:${action.id}`);
    }
    return pages;
  }
  if (projection.kind === "play") {
    const ownerId = selectedObjectId(projection.stepRef ?? productGtmRefId(projection.playRef));
    const ids = new Set([ownerId ?? "", ...productDependencies(model, ownerId ?? "")]);
    for (const node of graph.nodes) {
      if (node.data.kind === "workflow" && node.data.workRef === `object:${ownerId}`) ids.add(node.id);
    }
    return ids;
  }
  const anchorId = projection.kind === "evidence-return"
    ? `action:${productGtmRefId(projection.evidenceRef)}`
    : productGtmRefId(projection.anchorRef);
  const ids = new Set([anchorId]);
  for (const node of graph.nodes) if (node.data.focus) ids.add(node.id);
  return ids;
}

export function projectAdaptiveProductGtm(
  model: FirmSemanticModel,
  movement: MarketMovementIndex | null,
  selectedId: string | null = null,
  context: ProductGtmProjectionContext = {},
): AdaptiveProductGtmProjection {
  const projection = deriveProductGtmProjectionState(model, movement, selectedId);
  // Product walk is intentionally immune to automatic attention framing. Returned evidence remains a
  // compact marker until the founder selects it; the map never opens on a surprise pseudo-mode.
  const graph = projectProductGtm(
    model,
    movement,
    selectedId,
    projection.kind === "product-walk" && !selectedId ? { ...context, wholeVenture: true } : context,
  );
  const shown = visibleIds(projection, graph, model, movement);
  const nodes = graph.nodes
    .filter((node) => shown.has(node.id))
    .map((node) => ({ ...node, data: { ...node.data, focus: true } }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const rawEdges = graph.edges.filter((entry) => nodeIds.has(entry.source) && nodeIds.has(entry.target)) as Array<Edge<ProductGtmEdgeData>>;
  // A resting Product walk only admits links backed by repository citations. Observed transitions belong
  // to a summoned journey overlay and never become code-proven topology.
  const edges = projection.kind === "product-walk"
    ? rawEdges.filter((entry) => {
      if (entry.source.startsWith("action:") || entry.target.startsWith("action:")) return true;
      const relationship = model.relationships.find((candidate) => candidate.id === entry.id);
      return Boolean(relationship?.sourceRefs.some((ref) => ref.startsWith("repository:")));
    })
    : rawEdges;
  const orderedSteps = nodes
    .filter((node) => node.data.kind === "workflow")
    .sort((left, right) => Number(left.data.workflowPosition ?? 0) - Number(right.data.workflowPosition ?? 0));
  const ownerId = projection.kind === "play" ? productGtmRefId(projection.playRef) : null;
  const initialFrameIds = projection.kind === "play"
    ? [ownerId, ...orderedSteps.slice(0, 3).map((node) => node.id)].filter((id): id is string => Boolean(id))
    : projection.kind === "product-walk"
      ? projection.selectedPageRef
        ? [productGtmRefId(projection.selectedPageRef)]
        : pageWalkOrder(model).filter((id) => nodeIds.has(id)).slice(0, 4)
      : graph.initialFocusIds.filter((id) => nodeIds.has(id));
  const selectedNode = selectedId ? nodes.find((node) => node.id === selectedId) : null;
  return {
    ...graph,
    nodes,
    edges: semanticEdges(edges, nodes, model),
    projection,
    initialFrameIds: initialFrameIds.length ? initialFrameIds : nodes.slice(0, 1).map((node) => node.id),
    initialFocusIds: nodes.map((node) => node.id),
    chapterKind: projection.kind === "evidence-return" ? "return" : selectedId ? "selection" : "whole",
    chapterAnchorId: selectedId,
    focusName: selectedNode?.data.name ?? graph.focusName,
    focusSummary: projection.kind === "product-walk"
      ? projection.selectedPageRef ? "What this page is now, grounded in code." : "Code-proven pages in user walk order."
      : projection.kind === "play"
        ? graph.focusSummary
        : projection.kind === "evidence-return"
          ? "Returned reality beside the exact Product or GTM consequence it may change."
          // Focusing a GTM motion whose workflow is not mapped yet lands here too, and the Product
          // sentence below is then a false read of the founder's own object — a market motion
          // described as a Product change. The territory the focus actually sits in decides.
          : selectedNode?.data.territory === "gtm"
            ? "Everything this market motion is joined to."
            : "The Product change, its assumptions, supporting evidence, and next founder decision.",
  };
}
