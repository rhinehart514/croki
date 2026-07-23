import type { Edge } from "@xyflow/react";
import type { ProductGtmEdgeData, ProductGtmNode, ProductGtmProjection } from "./productGtmProjection";

// Narrow UI contract matching the aggregate-only observation receipt. Raw rows and identities never enter
// the canvas. The API layer can bind this structural type once its route is available.
export type ProductGtmJourneyObservation = {
  id: string;
  receiptRef: string;
  sourceRef: string;
  window: { from: string; to: string; timezone: string };
  pageCounts: Array<{ pageRef: string; count: number }>;
  transitions: Array<{ fromPageRef: string; toPageRef: string; count: number }>;
  dropOffs: Array<{ pageRef: string; count: number }>;
  unmatchedRoutes?: Array<{ route: string; count: number }>;
  createdAt: string;
};

export function journeyObservationByRef(
  observations: ProductGtmJourneyObservation[],
  ref: string | null,
) {
  if (!ref) return null;
  return observations.find((entry) => entry.id === ref || entry.receiptRef === ref) ?? null;
}

const pageId = (ref: string) => ref.replace(/^[^:]+:/, "");

export function applyJourneyObservation<T extends ProductGtmProjection>(
  graph: T,
  observation: ProductGtmJourneyObservation | null,
): T {
  if (!observation) return graph;
  const visits = new Map(observation.pageCounts.map((entry) => [pageId(entry.pageRef), entry.count]));
  const dropOffs = new Map(observation.dropOffs.map((entry) => [pageId(entry.pageRef), entry.count]));
  const nodes: ProductGtmNode[] = graph.nodes.map((node) => {
    const visitCount = visits.get(node.id);
    const dropOffCount = dropOffs.get(node.id);
    if (visitCount === undefined && dropOffCount === undefined) return node;
    return {
      ...node,
      data: {
        ...node.data,
        journeyCountLabel: [
          visitCount === undefined ? null : `${visitCount.toLocaleString()} observed`,
          dropOffCount === undefined ? null : `${dropOffCount.toLocaleString()} drop-off${dropOffCount === 1 ? "" : "s"}`,
        ].filter(Boolean).join(" · "),
      },
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.map((entry) => ({
    ...entry,
    data: entry.data ? { ...entry.data } : undefined,
    style: entry.style ? { ...entry.style } : undefined,
  })) as Array<Edge<ProductGtmEdgeData>>;
  for (const [index, transition] of observation.transitions.entries()) {
    const source = pageId(transition.fromPageRef);
    const target = pageId(transition.toPageRef);
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
    const proven = edges.find((entry) => entry.source === source && entry.target === target);
    const count = transition.count.toLocaleString();
    const strokeWidth = Math.min(4, 1.45 + Math.log10(Math.max(transition.count, 1)) * .55);
    if (proven) {
      proven.label = `${proven.data?.relationshipVerb ?? "Links to"} · ${count} observed`;
      proven.ariaLabel = `${proven.ariaLabel ?? `${source} links to ${target}`} ${count} observed transitions.`;
      proven.className = `${proven.className ?? ""} is-observed`.trim();
      proven.data = { ...proven.data!, observedCount: transition.count, observedOnly: false };
      proven.style = { ...proven.style, strokeWidth };
      continue;
    }
    edges.push({
      id: `journey:${observation.id}:${source}:${target}:${index}`,
      source,
      target,
      type: "productGtmEdge",
      label: `${count} observed`,
      ariaLabel: `${count} observed transitions from ${source} to ${target}. Not a code-proven link.`,
      className: "product-gtm-edge is-observed-only",
      style: { strokeWidth },
      data: {
        kind: "observed",
        focused: true,
        crossTerritory: false,
        sourceTerritory: "product",
        targetTerritory: "product",
        route: "observed",
        relationshipVerb: "Related to",
        truthStatus: "observed",
        observedCount: transition.count,
        observedOnly: true,
      },
    });
  }
  return { ...graph, nodes, edges } as T;
}
