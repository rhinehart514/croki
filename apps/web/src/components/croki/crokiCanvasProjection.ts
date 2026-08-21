import type { CrokiContext, CrokiContextEdge, CrokiContextNode } from "@croki/shared/crokiContext";

import { crokiNodeMatchesView, type CrokiCanvasView } from "./crokiCanvasLanguage";

export interface CrokiFieldItem {
  readonly id: string;
  readonly node: CrokiContextNode;
}

export interface CrokiFieldProjection {
  readonly items: readonly CrokiFieldItem[];
  readonly edges: readonly CrokiContextEdge[];
  readonly focusId: string | null;
}

/**
 * Filters durable semantic objects for one workflow. Spatial arrangement is
 * owned separately by the field so the model remains portable and diffable.
 */
export function projectCrokiCanvas(
  context: CrokiContext,
  view: CrokiCanvasView,
): CrokiFieldProjection {
  const nodes = context.nodes.filter((node) => crokiNodeMatchesView(node, view));
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = context.edges.filter(
    (edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to),
  );
  const connected = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    connected.set(edge.from, (connected.get(edge.from) ?? 0) + 1);
    connected.set(edge.to, (connected.get(edge.to) ?? 0) + 1);
  }
  const focusId = chooseFocus(nodes, connected);
  const ordered = [...nodes].sort((left, right) => {
    if (left.id === focusId) return -1;
    if (right.id === focusId) return 1;
    if (left.status !== right.status) return statusRank(left) - statusRank(right);
    return right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title);
  });
  const items = ordered.map((node) => ({ id: node.id, node }));
  return { items, edges, focusId };
}

export function crokiNodeEpistemicLabel(node: CrokiContextNode): string {
  if (node.status === "retired") return "Prior understanding";
  if (node.status === "provisional") {
    return node.kind === "evidence" ? "Unverified signal" : "Open proposition";
  }
  if (node.kind === "evidence") {
    return (node.references?.length ?? 0) > 0 ? "Source-backed" : "Observed evidence";
  }
  return "Founder-approved";
}

function chooseFocus(
  nodes: readonly CrokiContextNode[],
  connected: ReadonlyMap<string, number>,
): string | null {
  const candidates = nodes.filter((node) => node.status !== "retired");
  const decisions = candidates.filter((node) => node.kind === "decision");
  const pool = decisions.length > 0 ? decisions : candidates;
  return (
    [...pool].sort((left, right) => {
      if (left.status !== right.status) return statusRank(left) - statusRank(right);
      return (connected.get(right.id) ?? 0) - (connected.get(left.id) ?? 0);
    })[0]?.id ?? null
  );
}

function statusRank(node: CrokiContextNode): number {
  if (node.status === "current") return 0;
  if (node.status === "provisional") return 1;
  return 2;
}
