import {
  CROKI_CONTEXT_LIMITS,
  parseCrokiContext,
  serializeCrokiContext,
  type CrokiContext,
  type CrokiContextEdge,
  type CrokiContextNode,
  type CrokiNodeDomain,
} from "@t3tools/shared/crokiContext";

import type { CrokiCanvasPresentInput } from "./tools.ts";

/**
 * Applies an agent scene as provisional semantics. Founder-approved and retired
 * records are immutable at this boundary; position remains a derived UI concern.
 */
export function applyCrokiCanvasPresentation(
  context: CrokiContext,
  scene: CrokiCanvasPresentInput,
  now: string,
): CrokiContext {
  const sceneIds = new Set<string>();
  for (const node of scene.nodes) {
    const id = node.id.trim();
    if (sceneIds.has(id)) throw new Error(`Scene node id '${id}' is duplicated.`);
    sceneIds.add(id);
  }

  const existingById = new Map(context.nodes.map((node) => [node.id, node]));
  const presentedNodes = scene.nodes.map((input): CrokiContextNode => {
    const id = input.id.trim();
    const existing = existingById.get(id);
    if (existing && (existing.status !== "provisional" || existing.origin !== "agent")) {
      throw new Error(`Scene node id '${id}' belongs to founder or repository context.`);
    }
    const domain = input.domain ?? defaultDomain(scene.view);
    if (domain !== scene.view && domain !== "shared") {
      throw new Error(`Scene node '${id}' must belong to the presented view or be shared.`);
    }
    return {
      id,
      kind: input.kind,
      status: "provisional",
      domain,
      origin: "agent",
      title: input.title.trim(),
      body: input.body ?? "",
      updatedAt: now,
      ...(input.references && input.references.length > 0
        ? {
            references: input.references.map((reference) =>
              reference.kind === "file"
                ? {
                    kind: reference.kind,
                    path: reference.path,
                    ...(reference.line !== undefined ? { line: reference.line } : {}),
                  }
                : reference,
            ),
          }
        : {}),
    };
  });
  const presentedById = new Map(presentedNodes.map((node) => [node.id, node]));
  const nodes = [
    ...context.nodes.map((node) => presentedById.get(node.id) ?? node),
    ...presentedNodes.filter((node) => !existingById.has(node.id)),
  ];
  if (nodes.length > CROKI_CONTEXT_LIMITS.nodes) {
    throw new Error("The scene would exceed the Canvas item limit.");
  }

  const allIds = new Set(nodes.map((node) => node.id));
  const incomingEdges = scene.edges.map((edge): CrokiContextEdge => {
    const from = edge.from.trim();
    const to = edge.to.trim();
    const relation = edge.relation.trim();
    if (from === to) throw new Error("A scene relationship cannot point to itself.");
    if (!allIds.has(from) || !allIds.has(to)) {
      throw new Error(`Scene relationship '${from}' to '${to}' references a missing item.`);
    }
    if (!sceneIds.has(from) && !sceneIds.has(to)) {
      throw new Error("A scene relationship must touch an agent-authored proposal.");
    }
    return { from, to, relation };
  });
  const retainedEdges = context.edges.filter(
    (edge) => !sceneIds.has(edge.from) && !sceneIds.has(edge.to),
  );
  const edges = dedupeEdges([...retainedEdges, ...incomingEdges]);
  if (edges.length > CROKI_CONTEXT_LIMITS.edges) {
    throw new Error("The scene would exceed the Canvas relationship limit.");
  }

  // The strict parser is the final authority for references, ids, timestamps,
  // duplicate relationships, and every repository storage invariant.
  return parseCrokiContext(
    serializeCrokiContext({
      ...context,
      updatedAt: now,
      nodes,
      edges,
    }),
  );
}

function defaultDomain(view: CrokiCanvasPresentInput["view"]): CrokiNodeDomain {
  return view;
}

function dedupeEdges(edges: readonly CrokiContextEdge[]): CrokiContextEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = JSON.stringify([edge.from, edge.relation, edge.to]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
