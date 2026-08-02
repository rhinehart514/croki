import type { CrokiContext, CrokiContextEdge } from "@croki/shared/crokiContext";

import type { ActivePlanState } from "~/session-logic";
import {
  buildCrokiPlanStepItems,
  buildCrokiReferenceItems,
  buildCrokiSemanticItems,
  ensureCrokiCanvasItemIdsUnique,
  type CrokiCanvasItem,
} from "./crokiCanvasItems";
import type { CrokiCanvasView } from "./crokiCanvasLanguage";
import { projectCrokiCanvas } from "./crokiCanvasProjection";

export interface CrokiCanvasVisualEdge extends CrokiContextEdge {
  readonly edgeKind: "plan" | "reference" | "semantic";
  readonly mutable: boolean;
}

export interface CrokiCanvasScene {
  readonly edges: readonly CrokiCanvasVisualEdge[];
  readonly focusId: string | null;
  readonly items: readonly CrokiCanvasItem[];
  readonly topologyKey: string;
}

/** Builds the ephemeral scene without coercing native ADE artifacts into context nodes. */
export function projectCrokiCanvasScene(input: {
  readonly activePlan: ActivePlanState | null;
  readonly context: CrokiContext;
  readonly focusIds: readonly string[];
  readonly view: CrokiCanvasView;
}): CrokiCanvasScene {
  const projection = projectCrokiCanvas(input.context, input.view);
  const visibleIds = new Set(input.focusIds);
  if (visibleIds.size > 0) {
    const focusIds = new Set(visibleIds);
    for (const edge of projection.edges) {
      if (focusIds.has(edge.from)) visibleIds.add(edge.to);
      if (focusIds.has(edge.to)) visibleIds.add(edge.from);
    }
  }
  const semanticNodes = projection.items
    .filter((item) => visibleIds.size === 0 || visibleIds.has(item.id))
    .map((item) => item.node);
  const semanticIds = new Set(semanticNodes.map((node) => node.id));
  const semanticEdges = projection.edges.filter(
    (edge) => semanticIds.has(edge.from) && semanticIds.has(edge.to),
  );
  const builtPlanItems =
    input.view === "workflow" && input.activePlan ? buildCrokiPlanStepItems(input.activePlan) : [];
  const builtReferenceItems = buildCrokiReferenceItems(semanticNodes);
  const items = ensureCrokiCanvasItemIdsUnique([
    ...buildCrokiSemanticItems(semanticNodes),
    ...builtReferenceItems,
    ...builtPlanItems,
  ]);
  const referenceItems = items.filter((item) => item.kind === "reference");
  const planItems = items.filter((item) => item.kind === "plan-step");
  const edges: CrokiCanvasVisualEdge[] = [
    ...semanticEdges.map((edge) => ({ ...edge, edgeKind: "semantic" as const, mutable: true })),
    ...referenceItems.map((item) => ({
      from: item.ownerNodeId,
      to: item.id,
      relation: "source",
      edgeKind: "reference" as const,
      mutable: false,
    })),
    ...planItems.slice(1).map((item, index) => ({
      from: planItems[index]!.id,
      to: item.id,
      relation: "then",
      edgeKind: "plan" as const,
      mutable: false,
    })),
  ];
  const requestedFocusId = input.focusIds.find((id) => semanticIds.has(id));
  const focusId =
    requestedFocusId ?? (semanticIds.has(projection.focusId ?? "") ? projection.focusId : null);
  const topologyKey = JSON.stringify([
    items.map((item) => item.id),
    edges.map((edge) => [edge.edgeKind, edge.from, edge.relation, edge.to]),
  ]);
  return { edges, focusId, items, topologyKey };
}
