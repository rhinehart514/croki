import type {
  CrokiPerceptionFrame,
  CrokiPerceptionObject,
  CrokiPerceptionRelationship,
} from "@croki/shared/crokiPerception";

import type {
  CrokiCanvasLiveEdge,
  CrokiCanvasLiveObject,
  CrokiCanvasLiveScene,
  CrokiCanvasLiveSource,
} from "./crokiCanvasLiveScene";

/**
 * Projects the typed runtime perception frame into the read-only Canvas scene.
 * The projection is intentionally one-way: it never creates or mutates source state.
 */
export function projectCrokiPerceptionFrame(frame: CrokiPerceptionFrame): CrokiCanvasLiveScene {
  const objects: CrokiCanvasLiveObject[] = [];
  const edges: CrokiCanvasLiveEdge[] = [];
  const objectIds = new Set(frame.objects.map((object) => object.id));
  const attentionIds: string[] = [];
  const updatedAt =
    frame.latestActivityAt ??
    latestPerceptionTimestamp(frame.objects.map((object) => object.source.observedAt));

  objects.push({
    id: "attention:stream",
    source: "attention",
    title: "Live perception",
    body: `${frame.objects.length} observations · ${frame.relationships.length} relationships`,
    kind: "attention",
    authority: frame.changed === false ? "Stable observation" : "Observed now",
    updatedAt,
    affordances: [{ id: "focus", label: "Focus" }],
  });

  for (const object of frame.objects) {
    const id = object.id;
    const requiresApproval = object.affordances.some((affordance) => affordance.requiresApproval);
    objects.push({
      id,
      source: perceptionSource(object),
      title: object.title,
      body: object.summary ?? "",
      kind: object.type,
      ...(object.state !== undefined ? { status: object.state } : {}),
      authority: perceptionAuthority(object),
      updatedAt: object.source.observedAt,
      revision: object.revision,
      selectionId: object.id,
      perceptionObject: object,
      ...(object.source.uri ? { perceptionSourceUri: object.source.uri } : {}),
      ...(object.source.kind === "thread" && object.source.id
        ? { sourceThreadId: object.source.id }
        : {}),
      affordances: perceptionAffordances(object),
    });

    if (requiresApproval || isAttentionState(object.state) || object.type === "turn") {
      attentionIds.push(id);
      edges.push({
        from: "attention:stream",
        to: id,
        relation: requiresApproval ? "needs approval" : "requires attention",
        kind: "epistemic",
      });
    }
  }

  for (const relationship of frame.relationships) {
    if (!objectIds.has(relationship.from) || !objectIds.has(relationship.to)) continue;
    edges.push({
      from: relationship.from,
      to: relationship.to,
      relation: relationship.label ?? relationship.kind,
      kind: perceptionRelationKind(relationship),
    });
  }

  return {
    objects,
    edges,
    attentionIds: [...new Set(attentionIds)],
    revisionObjects: [],
    updatedAt,
    perceptionRevision: frame.revision,
  };
}

function perceptionSource(object: CrokiPerceptionObject): CrokiCanvasLiveSource {
  const type = `${object.type} ${object.source.kind}`.toLowerCase();
  if (type.includes("evidence") || type.includes("source") || type.includes("file")) {
    return "reference";
  }
  if (type.includes("outcome") || type.includes("verified") || type.includes("release")) {
    return "outcome";
  }
  if (
    type.includes("thread") ||
    type.includes("turn") ||
    type.includes("task") ||
    type.includes("agent")
  ) {
    return "agent";
  }
  if (
    type.includes("artifact") ||
    type.includes("preview") ||
    type.includes("runtime") ||
    type.includes("visual")
  ) {
    return "visual";
  }
  return "context";
}

function perceptionAuthority(object: CrokiPerceptionObject): string {
  const approval = object.affordances.find((affordance) => affordance.requiresApproval);
  if (approval) return approval.authority || "Founder approval required";
  if (object.source.kind) return `Observed from ${object.source.kind}`;
  return "Observed now";
}

function perceptionAffordances(
  object: CrokiPerceptionObject,
): CrokiCanvasLiveObject["affordances"] {
  const affordances = object.affordances.map((affordance) => ({
    id: affordanceId(affordance.kind),
    label: affordance.label,
  }));
  const unique = new Map(affordances.map((affordance) => [affordance.id, affordance]));
  return [...unique.values()];
}

function affordanceId(kind: string): CrokiCanvasLiveObject["affordances"][number]["id"] {
  const normalized = kind.toLowerCase();
  if (
    normalized.includes("source") ||
    normalized.includes("open") ||
    normalized.includes("inspect")
  ) {
    return "source";
  }
  if (normalized.includes("branch") || normalized.includes("choose")) return "branch";
  if (normalized.includes("approv") || normalized.includes("commit")) return "approve";
  if (normalized.includes("use") || normalized.includes("apply")) return "use";
  return "focus";
}

function perceptionRelationKind(
  relationship: CrokiPerceptionRelationship,
): CrokiCanvasLiveEdge["kind"] {
  const normalized = `${relationship.kind} ${relationship.label ?? ""}`.toLowerCase();
  if (
    normalized.includes("source") ||
    normalized.includes("evidence") ||
    normalized.includes("support")
  ) {
    return "epistemic";
  }
  if (
    normalized.includes("before") ||
    normalized.includes("then") ||
    normalized.includes("during")
  ) {
    return "temporal";
  }
  if (
    normalized.includes("agent") ||
    normalized.includes("task") ||
    normalized.includes("thread")
  ) {
    return "agent";
  }
  return "causal";
}

function isAttentionState(state: string | undefined): boolean {
  if (!state) return false;
  return [
    "blocked",
    "error",
    "pending",
    "working",
    "in-progress",
    "inProgress",
    "awaiting-approval",
  ].includes(state);
}

function latestPerceptionTimestamp(values: readonly string[]): string {
  return (
    values.slice().sort((left, right) => right.localeCompare(left))[0] ?? new Date(0).toISOString()
  );
}
