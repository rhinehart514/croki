import type { EnvironmentId } from "@croki/contracts";
import {
  CROKI_CONTEXT_LIMITS,
  parseCrokiContextReference,
  type CrokiContextReference,
} from "@croki/shared/crokiContext";

import { randomHex } from "~/lib/utils";
import {
  getCrokiCanvasDraft,
  makeCrokiCanvasWorkspaceKey,
  replaceCrokiCanvasDraft,
} from "./crokiCanvasDraftStore";
import { addCrokiNodeReference, crokiReferenceKey } from "./crokiCanvasModel";

export function addProvisionalCrokiEvidence(input: {
  readonly environmentId: EnvironmentId;
  readonly productName: string;
  readonly reference: CrokiContextReference;
  readonly title: string;
  readonly workspaceRoot: string;
}): "added" | "duplicate" | "unavailable" {
  const key = makeCrokiCanvasWorkspaceKey(input.environmentId, input.workspaceRoot);
  const state = getCrokiCanvasDraft(key, input.productName);
  if (
    state.sourceState === "loading" ||
    state.sourceState === "malformed" ||
    (state.sourceState === "partial" && !state.repairInProgress) ||
    state.sourceState === "read-error"
  ) {
    return "unavailable";
  }
  let reference: CrokiContextReference;
  try {
    reference = parseCrokiContextReference(input.reference);
  } catch {
    return "unavailable";
  }
  const referenceKey = crokiReferenceKey(reference);
  if (
    state.context.nodes.some((node) =>
      (node.references ?? []).some((candidate) => crokiReferenceKey(candidate) === referenceKey),
    )
  ) {
    return "duplicate";
  }
  const title =
    input.title.trim().slice(0, CROKI_CONTEXT_LIMITS.nodeTitleChars) || "Captured evidence";
  const candidate = state.context.nodes.find(
    (node) =>
      node.kind === "evidence" &&
      node.status === "provisional" &&
      node.title === title &&
      (node.references?.length ?? 0) < CROKI_CONTEXT_LIMITS.referencesPerNode,
  );
  const now = new Date().toISOString();
  if (candidate) {
    const transition = addCrokiNodeReference(state.context, candidate.id, reference, now);
    if (transition.error) return "unavailable";
    replaceCrokiCanvasDraft(key, transition.context);
    return "added";
  }
  if (state.context.nodes.length >= CROKI_CONTEXT_LIMITS.nodes) {
    return "unavailable";
  }
  replaceCrokiCanvasDraft(key, {
    ...state.context,
    updatedAt: now,
    nodes: [
      ...state.context.nodes,
      {
        id: `evidence-${randomHex(16)}`,
        kind: "evidence",
        status: "provisional",
        domain: "product",
        origin: reference.kind === "file" ? "repository" : "external",
        title,
        body: "",
        updatedAt: now,
        references: [reference],
      },
    ],
  });
  return "added";
}
