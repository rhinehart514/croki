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

const MAX_CONCLUSIONS = 3;

/**
 * Compresses source perception into the smallest useful model of the work.
 * Raw observations remain attached to the evidence object for inspection, but
 * mechanical activity never becomes a first-class Canvas card.
 */
export function projectCrokiPerceptionFrame(frame: CrokiPerceptionFrame): CrokiCanvasLiveScene {
  const ordered = [...frame.objects].sort(compareNewestFirst);
  const outcome = ordered.find((object) => object.type.toLowerCase() === "thread");
  const showOutcome = outcome !== undefined && !isEmptyThread(outcome, ordered.length);
  const latestArtifactRevision = latestSemanticArtifactRevision(ordered);
  const semanticObjects = ordered.filter(
    (object) => artifactRevision(object) === latestArtifactRevision,
  );

  const judgment =
    semanticObjects.find(isJudgment) ??
    ordered.find((object) => isJudgment(object) && !isMechanical(object));
  const conclusions = semanticObjects
    .filter((object) => object.id !== judgment?.id && isConclusion(object))
    .slice(0, MAX_CONCLUSIONS);
  const primaryIds = new Set(
    [outcome, ...conclusions, judgment].filter(isDefined).map((object) => object.id),
  );
  const evidence = ordered.filter((object) => !primaryIds.has(object.id));

  const objects: CrokiCanvasLiveObject[] = [];
  if (showOutcome)
    objects.push(toLiveObject(outcome, { source: "outcome", authority: "Current task" }));
  objects.push(...conclusions.map((object) => toLiveObject(object, { source: "context" })));
  if (judgment) objects.push(toLiveObject(judgment, { source: "attention" }));
  if (evidence.length > 0) objects.push(collapsedEvidenceObject(evidence));

  const visibleIds = new Set(objects.map((object) => object.id));
  const edges = frame.relationships
    .filter((relationship) => visibleIds.has(relationship.from) && visibleIds.has(relationship.to))
    .map(toLiveEdge);
  const updatedAt =
    frame.latestActivityAt ??
    latestPerceptionTimestamp(frame.objects.map((object) => object.source.observedAt));

  return {
    objects,
    edges,
    attentionIds: judgment ? [judgment.id] : [],
    revisionObjects: [],
    updatedAt,
    perceptionRevision: frame.revision,
  };
}

function isEmptyThread(object: CrokiPerceptionObject, objectCount: number): boolean {
  return objectCount === 1 && object.summary?.trim() === "0 source events";
}

function toLiveObject(
  object: CrokiPerceptionObject,
  overrides: { readonly source?: CrokiCanvasLiveSource; readonly authority?: string } = {},
): CrokiCanvasLiveObject {
  return {
    id: object.id,
    source: overrides.source ?? perceptionSource(object),
    title: object.title,
    body: object.summary ?? "",
    kind: object.type,
    ...(object.state !== undefined ? { status: object.state } : {}),
    authority: overrides.authority ?? perceptionAuthority(object),
    updatedAt: object.source.observedAt,
    revision: object.revision,
    selectionId: object.id,
    perceptionObject: object,
    ...(object.source.uri ? { perceptionSourceUri: object.source.uri } : {}),
    ...(object.source.kind === "thread" && object.source.id
      ? { sourceThreadId: object.source.id }
      : {}),
    affordances: perceptionAffordances(object),
  };
}

function collapsedEvidenceObject(
  evidence: readonly CrokiPerceptionObject[],
): CrokiCanvasLiveObject {
  const representative = evidence[0]!;
  const sourceKinds = new Set(evidence.map((object) => object.source.kind));
  const perceptionObject: CrokiPerceptionObject = {
    ...representative,
    type: "evidence",
    title: "Evidence",
    summary: `${evidence.length} source ${evidence.length === 1 ? "observation" : "observations"} collapsed`,
    data: {
      ...asRecord(representative.data),
      backingObjectIds: evidence.map((object) => object.id),
      backingObjects: evidence,
    },
  };
  return {
    ...toLiveObject(perceptionObject, {
      source: "reference",
      authority: `Observed from ${sourceKinds.size} source ${sourceKinds.size === 1 ? "family" : "families"}`,
    }),
    id: "evidence:collapsed",
    selectionId: representative.id,
    perceptionObjects: evidence,
    affordances: [{ id: "source", label: "Inspect evidence" }],
  };
}

function latestSemanticArtifactRevision(objects: readonly CrokiPerceptionObject[]): number | null {
  const revisions = objects
    .map(artifactRevision)
    .filter((value): value is number => value !== null);
  return revisions.length > 0 ? Math.max(...revisions) : null;
}

function artifactRevision(object: CrokiPerceptionObject): number | null {
  const value = asRecord(object.data)?.artifactRevision;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isConclusion(object: CrokiPerceptionObject): boolean {
  const role = semanticRole(object);
  return role === "focal" || role === "route";
}

function isJudgment(object: CrokiPerceptionObject): boolean {
  const role = semanticRole(object);
  return (
    role === "warning" ||
    role === "action" ||
    object.affordances.some((affordance) => affordance.requiresApproval) ||
    isAttentionState(object.state)
  );
}

function semanticRole(object: CrokiPerceptionObject): string | null {
  const role = asRecord(object.data)?.role;
  return typeof role === "string" ? role.toLowerCase() : null;
}

function isMechanical(object: CrokiPerceptionObject): boolean {
  const normalized = `${object.type} ${object.source.kind} ${object.title}`.toLowerCase();
  return (
    normalized.includes("context window") ||
    normalized.includes("checkpoint") ||
    normalized.includes("ran command") ||
    object.type === "turn" ||
    object.type === "runtime" ||
    object.type === "tool"
  );
}

function perceptionSource(object: CrokiPerceptionObject): CrokiCanvasLiveSource {
  const type = `${object.type} ${object.source.kind}`.toLowerCase();
  if (type.includes("evidence") || type.includes("source") || type.includes("file"))
    return "reference";
  if (type.includes("outcome") || type.includes("verified") || type.includes("release"))
    return "outcome";
  if (
    type.includes("thread") ||
    type.includes("turn") ||
    type.includes("task") ||
    type.includes("agent")
  )
    return "agent";
  if (
    type.includes("artifact") ||
    type.includes("preview") ||
    type.includes("runtime") ||
    type.includes("visual")
  )
    return "visual";
  return "context";
}

function perceptionAuthority(object: CrokiPerceptionObject): string {
  const approval = object.affordances.find((affordance) => affordance.requiresApproval);
  if (approval) return approval.authority || "Founder approval required";
  return `Observed from ${object.source.kind}`;
}

function perceptionAffordances(
  object: CrokiPerceptionObject,
): CrokiCanvasLiveObject["affordances"] {
  const affordances = object.affordances.map((affordance) => ({
    id: affordanceId(affordance.kind),
    label: affordance.label,
  }));
  return [...new Map(affordances.map((affordance) => [affordance.id, affordance])).values()];
}

function affordanceId(kind: string): CrokiCanvasLiveObject["affordances"][number]["id"] {
  const normalized = kind.toLowerCase();
  if (
    normalized.includes("source") ||
    normalized.includes("open") ||
    normalized.includes("inspect")
  )
    return "source";
  if (normalized.includes("branch") || normalized.includes("choose")) return "branch";
  if (normalized.includes("approv") || normalized.includes("commit")) return "approve";
  if (normalized.includes("use") || normalized.includes("apply")) return "use";
  return "focus";
}

function toLiveEdge(relationship: CrokiPerceptionRelationship): CrokiCanvasLiveEdge {
  return {
    from: relationship.from,
    to: relationship.to,
    relation: relationship.label ?? relationship.kind,
    kind: perceptionRelationKind(relationship),
  };
}

function perceptionRelationKind(
  relationship: CrokiPerceptionRelationship,
): CrokiCanvasLiveEdge["kind"] {
  const normalized = `${relationship.kind} ${relationship.label ?? ""}`.toLowerCase();
  if (
    normalized.includes("source") ||
    normalized.includes("evidence") ||
    normalized.includes("support")
  )
    return "epistemic";
  if (normalized.includes("before") || normalized.includes("then") || normalized.includes("during"))
    return "temporal";
  if (normalized.includes("agent") || normalized.includes("task") || normalized.includes("thread"))
    return "agent";
  return "causal";
}

function isAttentionState(state: string | undefined): boolean {
  if (!state) return false;
  return ["blocked", "error", "awaiting-approval"].includes(state);
}

function compareNewestFirst(left: CrokiPerceptionObject, right: CrokiPerceptionObject): number {
  return (
    right.revision - left.revision || right.source.observedAt.localeCompare(left.source.observedAt)
  );
}

function latestPerceptionTimestamp(values: readonly string[]): string {
  return (
    values.slice().sort((left, right) => right.localeCompare(left))[0] ?? new Date(0).toISOString()
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
