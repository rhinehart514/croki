import {
  createGoal,
  createGoalRelation,
  createWorkArtifact,
  createWorkRelationship,
  listWorkArtifacts,
  listWorkRelationships,
  createCanvasRegion,
  listCanvasRegions,
} from "@/api";
import type { CanvasRegion, StableRef } from "@/openCanvasTypes";
import type { CanvasCreateRequest, CanvasRegionCreateRequest, CanvasRelationshipRequest } from "@/lib/canvasNativeActions";

function mutationKey(scope: string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `ui:canvas-native:${scope}:${suffix}`;
}

const founderActor = (actorId: string) => ({ type: "founder", id: actorId });

export async function createCanvasObject(
  projectId: string,
  request: CanvasCreateRequest,
  actorId: string,
): Promise<StableRef> {
  if (request.kind === "goal") {
    const { goal } = await createGoal(projectId, {
      statement: request.title,
      createdBy: actorId,
      status: "active",
      idempotencyKey: mutationKey("goal"),
    });
    return { type: "goal", id: goal.id };
  }

  // The open-work store is revisioned as one project authority. Read the exact current revision before
  // writing so a concurrent tab fails visibly instead of losing either founder's new object.
  const current = await listWorkArtifacts(projectId);
  const { artifact } = await createWorkArtifact(projectId, {
    expectedStoreRevision: current.storeRevision,
    kind: request.workKind?.trim() || "note",
    title: request.title,
    summary: request.title,
    format: "text",
    contentType: request.contentType?.trim() || "text/plain",
    content: request.content ?? request.title,
    provenance: "founder-stated",
    createdBy: founderActor(actorId),
    idempotencyKey: mutationKey("work"),
  });
  return { type: "work-artifact", id: artifact.artifactId };
}

export async function connectCanvasObjects(
  projectId: string,
  request: CanvasRelationshipRequest,
  actorId: string,
): Promise<StableRef> {
  if (request.sourceRef.type === "goal" && request.targetRef.type === "goal") {
    const { relation } = await createGoalRelation(projectId, {
      sourceRef: request.sourceRef,
      targetRef: request.targetRef,
      kind: request.kind,
      basis: [{ statement: "The founder connected these items on the canvas.", provenance: "founder-stated" }],
      provenance: "founder-stated",
      createdBy: actorId,
      idempotencyKey: mutationKey("goal-relationship"),
    });
    return { type: "goal-relation", id: relation.id };
  }

  const current = await listWorkRelationships(projectId);
  const { relationship } = await createWorkRelationship(projectId, {
    expectedStoreRevision: current.storeRevision,
    sourceRef: request.sourceRef,
    targetRef: request.targetRef,
    kind: request.kind,
    basis: [{ statement: "The founder connected these items on the canvas.", provenance: "founder-stated" }],
    provenance: "founder-stated",
    createdBy: founderActor(actorId),
    idempotencyKey: mutationKey("work-relationship"),
  });
  return { type: "work-relationship", id: relationship.relationshipId };
}

export async function createCanvasRegionFromSelection(
  projectId: string,
  request: CanvasRegionCreateRequest,
  actorId: string,
): Promise<CanvasRegion> {
  const current = await listCanvasRegions(projectId);
  const { region } = await createCanvasRegion(projectId, {
    expectedStoreRevision: current.storeRevision,
    idempotencyKey: mutationKey("region"),
    title: request.title,
    memberRefs: request.memberRefs,
    position: request.position,
    size: request.size,
    placementMode: "founder",
    createdBy: actorId,
    revisionAuthor: actorId,
  });
  return region;
}
