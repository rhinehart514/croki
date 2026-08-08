import {
  isCrokiEvidenceObservedActivityPayload,
  type CrokiEvidenceObservation,
  type OrchestrationThread,
  type OrchestrationThreadActivity,
  type ThreadId,
} from "@croki/contracts";
import {
  getCrokiCanvasArtifactFromActivity,
  parseCrokiCanvasPresentedActivityPayload,
} from "@croki/shared/crokiCanvasActivity";
import type {
  CrokiCanvasArtifact,
  CrokiCanvasArtifactNode,
} from "@croki/shared/crokiCanvasArtifact";

import type {
  CrokiSenseAffordance,
  CrokiSenseDelta,
  CrokiSenseFrameReference,
  CrokiSenseObject,
  CrokiSenseRelationship,
  CrokiSenseSource,
} from "./tools.ts";

const DEFAULT_LIMIT = 100;

export interface ProjectPerceptionOptions {
  readonly sinceRevision?: number;
  readonly limit?: number;
  readonly sources?: readonly string[];
}

export interface ProjectedThreadPerception {
  readonly threadId: string;
  readonly revision: number;
  readonly sourceRevision: number;
  readonly changed: boolean;
  readonly objects: readonly CrokiSenseObject[];
  readonly relationships: readonly CrokiSenseRelationship[];
  readonly delta: CrokiSenseDelta;
  readonly frame?: CrokiSenseFrameReference;
  readonly latestActivityAt: string | null;
  readonly activeTurnId: string | null;
  readonly truncated: boolean;
}

/** @deprecated Use ProjectedThreadPerception. */
export type ProjectedPerceptionFrame = ProjectedThreadPerception;

interface ActivityProjection {
  readonly object: CrokiSenseObject;
  readonly revision: number;
  readonly taskId?: string;
  readonly parentTaskId?: string;
  readonly requestId?: string;
}

interface ProjectedScene {
  readonly objects: readonly CrokiSenseObject[];
  readonly relationships: readonly CrokiSenseRelationship[];
  readonly frame?: CrokiSenseFrameReference;
  readonly sourceRevision: number;
  readonly latestActivityAt: string | null;
  readonly activeTurnId: string | null;
  readonly allActivityObjectIds: ReadonlySet<string>;
  readonly allRelationshipIds: ReadonlySet<string>;
  readonly truncated: boolean;
}

/**
 * Project the Thread's source activity into stable semantic objects. This is
 * deliberately independent of the Canvas UI: the same packet can be consumed
 * by a model, a mobile client, or the live Canvas field.
 */
export function projectThreadPerception(
  thread: OrchestrationThread,
  options: ProjectPerceptionOptions = {},
): ProjectedThreadPerception {
  const sinceRevision = options.sinceRevision ?? 0;
  const scene = projectScene(thread, options);
  const changed = scene.sourceRevision > sinceRevision;
  const changedObjects = scene.objects.filter((object) => object.revision > sinceRevision);
  const changedRelationships = scene.relationships.filter(
    (relationship) => relationship.revision > sinceRevision,
  );
  const delta: CrokiSenseDelta = {
    sinceRevision,
    addedObjects: changedObjects,
    updatedObjects: [],
    removedObjectIds: [],
    addedRelationships: changedRelationships,
    removedRelationshipIds: [],
  };

  return {
    threadId: String(thread.id),
    revision: scene.sourceRevision,
    sourceRevision: scene.sourceRevision,
    changed,
    objects: scene.objects,
    relationships: scene.relationships,
    delta,
    ...(scene.frame ? { frame: scene.frame } : {}),
    latestActivityAt: scene.latestActivityAt,
    activeTurnId: scene.activeTurnId,
    truncated: scene.truncated,
  };
}

/** Return the object and its immediate relationship neighborhood. */
export function inspectPerceptionObject(
  observation: ProjectedThreadPerception,
  objectId: string,
  depth = 0,
): {
  object: CrokiSenseObject | undefined;
  relationships: readonly CrokiSenseRelationship[];
  relatedObjects: readonly CrokiSenseObject[];
} {
  const object = observation.objects.find((candidate) => candidate.id === objectId);
  if (!object) {
    return { object: undefined, relationships: [], relatedObjects: [] };
  }
  const relationships = observation.relationships.filter(
    (relationship) => relationship.from === objectId || relationship.to === objectId,
  );
  if (depth <= 0) {
    return { object, relationships, relatedObjects: [] };
  }
  const relatedIds = new Set<string>();
  for (const relationship of relationships) {
    relatedIds.add(relationship.from === objectId ? relationship.to : relationship.from);
  }
  const relatedObjects = observation.objects.filter((candidate) => relatedIds.has(candidate.id));
  return { object, relationships, relatedObjects };
}

function projectScene(
  thread: OrchestrationThread,
  options: ProjectPerceptionOptions,
): ProjectedScene {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const sourceFilter = options.sources && new Set(options.sources.map(normalizeSource));
  const activities = thread.activities;
  const activityRevisions = new Map<string, number>();
  let sourceRevision = 0;
  let latestActivityAt: string | null = null;
  for (const [index, activity] of activities.entries()) {
    const revision = activity.sequence ?? index + 1;
    activityRevisions.set(String(activity.id), revision);
    sourceRevision = Math.max(sourceRevision, revision);
    if (latestActivityAt === null || activity.createdAt > latestActivityAt) {
      latestActivityAt = activity.createdAt;
    }
  }

  const artifacts = activities
    .map((activity, index) => {
      const artifact = getArtifact(activity);
      return artifact
        ? {
            activity,
            artifact,
            revision: artifact.revision || activityRevisions.get(String(activity.id)) || index + 1,
          }
        : undefined;
    })
    .filter(
      (
        value,
      ): value is {
        activity: OrchestrationThreadActivity;
        artifact: CrokiCanvasArtifact;
        revision: number;
      } => value !== undefined,
    )
    .sort((left, right) => right.revision - left.revision);
  const latestArtifact = artifacts[0];
  if (latestArtifact) sourceRevision = Math.max(sourceRevision, latestArtifact.revision);

  const objects: CrokiSenseObject[] = [];
  const relationships: CrokiSenseRelationship[] = [];
  const objectByActivityId = new Map<string, string>();
  const objectByTaskId = new Map<string, string>();
  const objectByRequestId = new Map<string, string>();

  const threadSource: CrokiSenseSource = {
    kind: "thread",
    id: String(thread.id),
    sourceThreadId: thread.id,
    turnId: thread.latestTurn ? String(thread.latestTurn.turnId) : null,
    observedAt: thread.updatedAt,
  };
  const threadObjectId = `thread:${thread.id}`;
  objects.push({
    id: threadObjectId,
    type: "thread",
    title: thread.title,
    summary: `${thread.activities.length} source events`,
    state: thread.latestTurn?.state ?? "idle",
    revision: sourceRevision,
    source: threadSource,
    affordances: [
      affordance("observe", "Observe Thread", "read"),
      affordance("wait", "Wait for change", "read"),
    ],
    data: {
      projectId: String(thread.projectId),
      runtimeMode: thread.runtimeMode,
      branch: thread.branch,
    },
  });

  if (thread.latestTurn) {
    const turnObjectId = `turn:${thread.latestTurn.turnId}`;
    objects.push({
      id: turnObjectId,
      type: "turn",
      title: `Turn ${thread.latestTurn.turnId}`,
      summary: thread.latestTurn.state,
      state: thread.latestTurn.state,
      revision: sourceRevision,
      source: {
        kind: "turn",
        id: String(thread.latestTurn.turnId),
        sourceThreadId: thread.id,
        turnId: String(thread.latestTurn.turnId),
        observedAt: thread.latestTurn.completedAt ?? thread.latestTurn.requestedAt,
      },
      affordances: [affordance("inspect", "Inspect turn", "read")],
      data: {
        requestedAt: thread.latestTurn.requestedAt,
        startedAt: thread.latestTurn.startedAt,
        completedAt: thread.latestTurn.completedAt,
      },
    });
    relationships.push(
      relationship(threadObjectId, turnObjectId, "contains", "active turn", sourceRevision),
    );
  }

  const sourceActivities = activities.slice(Math.max(0, activities.length - limit));
  const truncated = sourceActivities.length < activities.length;
  for (const [index, activity] of sourceActivities.entries()) {
    if (
      sourceFilter &&
      !sourceFilter.has(normalizeSource(sourceFamily(activity.kind, record(activity.payload))))
    )
      continue;
    // A latest artifact is represented by its semantic nodes below. The
    // activity receipt itself remains useful as provenance, so retain it too.
    const revision = activityRevisions.get(String(activity.id)) ?? index + 1;
    const projected = projectActivity(activity, revision, thread.id);
    objects.push(projected.object);
    objectByActivityId.set(String(activity.id), projected.object.id);
    if (projected.taskId) objectByTaskId.set(projected.taskId, projected.object.id);
    if (projected.requestId) objectByRequestId.set(projected.requestId, projected.object.id);
    relationships.push(
      relationship(threadObjectId, projected.object.id, "contains", activity.kind, revision),
    );
    for (const evidence of evidenceFromActivity(activity)) {
      const evidenceObject = projectEvidenceObservation(evidence, activity, revision, thread.id);
      objects.push(evidenceObject);
      relationships.push(
        relationship(projected.object.id, evidenceObject.id, "observed", evidence.domain, revision),
      );
    }
    if (activity.turnId !== null) {
      relationships.push(
        relationship(
          `turn:${activity.turnId}`,
          projected.object.id,
          "occurred-during",
          undefined,
          revision,
        ),
      );
    }
  }

  for (const checkpoint of thread.checkpoints ?? []) {
    if (sourceFilter && !sourceFilter.has("checkpoint")) continue;
    const revision = checkpoint.checkpointTurnCount;
    sourceRevision = Math.max(sourceRevision, revision);
    const checkpointObjectId = `checkpoint:${checkpoint.turnId}`;
    const checkpointSource: CrokiSenseSource = {
      kind: "checkpoint",
      id: String(checkpoint.checkpointRef),
      sourceThreadId: thread.id,
      turnId: String(checkpoint.turnId),
      observedAt: checkpoint.completedAt,
    };
    objects.push({
      id: checkpointObjectId,
      type: "checkpoint",
      title: `Checkpoint ${checkpoint.checkpointTurnCount}`,
      summary: `${checkpoint.files.length} changed file${checkpoint.files.length === 1 ? "" : "s"}`,
      state: checkpoint.status,
      revision,
      source: checkpointSource,
      affordances: [affordance("inspect", "Inspect diff", "read")],
      data: {
        turnId: String(checkpoint.turnId),
        checkpointRef: String(checkpoint.checkpointRef),
        status: checkpoint.status,
        files: checkpoint.files.map((file) => ({
          path: file.path,
          kind: file.kind,
          additions: file.additions,
          deletions: file.deletions,
        })),
      },
    });
    relationships.push(
      relationship(threadObjectId, checkpointObjectId, "contains", "checkpoint", revision),
    );
    const turnId = String(checkpoint.turnId);
    if (objects.some((object) => object.id === `turn:${turnId}`)) {
      relationships.push(
        relationship(`turn:${turnId}`, checkpointObjectId, "produced", undefined, revision),
      );
    }
  }

  for (const artifactRevision of artifacts) {
    if (sourceFilter && !sourceFilter.has("canvas")) continue;
    const artifact = artifactRevision.artifact;
    const artifactObjectId = `artifact:${artifact.id}`;
    const artifactSource = sourceForActivity(artifactRevision.activity, "canvas", thread.id);
    objects.push({
      id: artifactObjectId,
      type: "canvas-artifact",
      title: artifact.question,
      summary: `${artifact.nodes.length} semantic object${artifact.nodes.length === 1 ? "" : "s"} · ${artifact.presentation}`,
      state: artifact.revision === latestArtifact?.artifact.revision ? "current" : "prior",
      revision: artifactRevision.revision,
      source: artifactSource,
      affordances: [affordance("inspect", "Inspect artifact", "read")],
      data: {
        presentation: artifact.presentation,
        ...(artifact.source !== undefined ? { source: artifact.source } : {}),
        ...(artifact.harnessId !== undefined ? { harnessId: artifact.harnessId } : {}),
        activityId: String(artifactRevision.activity.id),
      },
    });
    relationships.push(
      relationship(
        threadObjectId,
        artifactObjectId,
        "contains",
        artifact.presentation,
        artifactRevision.revision,
      ),
    );
    const nodeIdMap = new Map<string, string>();
    for (const node of artifact.nodes) {
      const objectId = `${artifactObjectId}:node:${node.id}`;
      nodeIdMap.set(node.id, objectId);
      objects.push(
        projectArtifactNode(
          node,
          artifact,
          artifactRevision.activity,
          artifactRevision.revision,
          objectId,
          thread.id,
        ),
      );
      relationships.push(
        relationship(artifactObjectId, objectId, "contains", node.role, artifactRevision.revision),
      );
    }
    for (const edge of artifact.edges) {
      const from = nodeIdMap.get(edge.from);
      const to = nodeIdMap.get(edge.to);
      if (from && to)
        relationships.push(
          relationship(from, to, "semantic", edge.relation, artifactRevision.revision),
        );
    }
  }

  // Resolve parent-task and request links after all activity objects exist.
  for (const activity of sourceActivities) {
    const projectedId = objectByActivityId.get(String(activity.id));
    if (!projectedId) continue;
    const payload = record(activity.payload);
    const revision = activityRevisions.get(String(activity.id)) ?? 0;
    const parentTaskId = text(payload?.parentTaskId);
    const taskId = text(payload?.taskId);
    const requestId = text(payload?.requestId);
    const parentObjectId = parentTaskId ? objectByTaskId.get(parentTaskId) : undefined;
    const taskObjectId = taskId ? objectByTaskId.get(taskId) : undefined;
    const requestObjectId = requestId ? objectByRequestId.get(requestId) : undefined;
    if (parentObjectId && parentObjectId !== projectedId) {
      relationships.push(relationship(parentObjectId, projectedId, "subtask", undefined, revision));
    }
    if (taskObjectId && taskObjectId !== projectedId) {
      relationships.push(
        relationship(taskObjectId, projectedId, "task-update", undefined, revision),
      );
    }
    if (requestObjectId && requestObjectId !== projectedId) {
      relationships.push(
        relationship(requestObjectId, projectedId, "resolves", undefined, revision),
      );
    }
  }

  const frame = findFrame(activities);
  const visibleIds = new Set(objects.map((object) => object.id));
  const visibleRelationships = dedupeRelationships(
    relationships.filter((item) => visibleIds.has(item.from) && visibleIds.has(item.to)),
  );
  return {
    objects,
    relationships: visibleRelationships,
    ...(frame ? { frame } : {}),
    sourceRevision,
    latestActivityAt,
    activeTurnId: thread.latestTurn ? String(thread.latestTurn.turnId) : null,
    allActivityObjectIds: new Set(objects.map((object) => object.id)),
    allRelationshipIds: new Set(visibleRelationships.map((item) => item.id)),
    truncated,
  };
}

/** Generic alias used by older server projection imports. */
export const projectPerceptionFrame = projectThreadPerception;

function projectActivity(
  activity: OrchestrationThreadActivity,
  revision: number,
  sourceThreadId: ThreadId,
): ActivityProjection {
  const payload = record(activity.payload);
  const taskId = text(payload?.taskId);
  const parentTaskId = text(payload?.parentTaskId);
  const requestId = text(payload?.requestId);
  const kind = sourceFamily(activity.kind, payload);
  const title = text(payload?.title) ?? activity.summary;
  const summary = text(payload?.detail) ?? text(payload?.summary) ?? activity.summary;
  return {
    object: {
      id: `activity:${activity.id}`,
      type: kind,
      title,
      summary,
      state: activity.tone,
      revision,
      source: sourceForActivity(activity, kind, sourceThreadId),
      affordances: affordancesForActivity(activity),
      data: {
        activityKind: activity.kind,
        tone: activity.tone,
        ...(taskId ? { taskId } : {}),
        ...(parentTaskId ? { parentTaskId } : {}),
        ...(requestId ? { requestId } : {}),
        ...safePayload(payload),
      },
      ...(findFrame([activity]) ? { frame: findFrame([activity]) } : {}),
    },
    revision,
    ...(taskId ? { taskId } : {}),
    ...(parentTaskId ? { parentTaskId } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

function evidenceFromActivity(
  activity: OrchestrationThreadActivity,
): readonly CrokiEvidenceObservation[] {
  if (activity.kind !== "croki.evidence.observed") return [];
  return isCrokiEvidenceObservedActivityPayload(activity.payload)
    ? activity.payload.observations
    : [];
}

function projectEvidenceObservation(
  evidence: CrokiEvidenceObservation,
  activity: OrchestrationThreadActivity,
  revision: number,
  sourceThreadId: ThreadId,
): CrokiSenseObject {
  return {
    id: `evidence:${evidence.id}`,
    type: evidence.type,
    title: evidence.title,
    ...(evidence.summary ? { summary: evidence.summary } : {}),
    state: "observed",
    revision,
    source: {
      kind: evidence.source.kind,
      id: evidence.source.id,
      ...(evidence.source.uri ? { uri: evidence.source.uri } : {}),
      activityId: String(activity.id),
      sourceThreadId,
      turnId: activity.turnId === null ? null : String(activity.turnId),
      observedAt: evidence.observedAt,
    },
    affordances: [affordance("inspect", "Inspect evidence", "read")],
    data: {
      domain: evidence.domain,
      evidenceType: evidence.type,
      sourceLabel: evidence.source.label ?? evidence.source.kind,
      ...(evidence.confidence !== undefined ? { confidence: evidence.confidence } : {}),
    },
  };
}

function projectArtifactNode(
  node: CrokiCanvasArtifactNode,
  artifact: CrokiCanvasArtifact,
  activity: OrchestrationThreadActivity,
  revision: number,
  objectId: string,
  sourceThreadId: ThreadId,
): CrokiSenseObject {
  return {
    id: objectId,
    type: node.role,
    title: node.title,
    ...(node.body ? { summary: node.body } : {}),
    state: "observed",
    revision,
    source: sourceForActivity(activity, "canvas", sourceThreadId),
    affordances: [affordance("inspect", "Inspect evidence", "read")],
    data: {
      artifactId: String(artifact.id),
      artifactRevision: artifact.revision,
      role: node.role,
      ...(node.whyItMatters ? { whyItMatters: node.whyItMatters } : {}),
      ...(node.references ? { references: node.references } : {}),
    },
  };
}

function affordancesForActivity(
  activity: OrchestrationThreadActivity,
): readonly CrokiSenseAffordance[] {
  const base = [affordance("inspect", "Inspect source", "read")];
  switch (activity.kind) {
    case "approval.requested":
      return [
        ...base,
        affordance(
          "approve",
          "Resolve approval",
          "approval-required",
          false,
          true,
          "approval.respond",
        ),
      ];
    case "runtime.error":
    case "tool.denied":
      return [...base, affordance("retry", "Retry source operation", "propose")];
    default:
      return base;
  }
}

function affordance(
  kind: string,
  label: string,
  authority: CrokiSenseAffordance["authority"],
  reversible = true,
  requiresApproval = false,
  sourceTool?: string,
): CrokiSenseAffordance {
  return {
    id: kind,
    kind,
    label,
    authority,
    reversible,
    requiresApproval,
    ...(sourceTool ? { sourceTool } : {}),
  };
}

function relationship(
  from: string,
  to: string,
  kind: string,
  label: string | undefined,
  revision: number,
): CrokiSenseRelationship {
  const id = `${from}->${kind}->${to}`;
  return {
    id,
    from,
    to,
    kind,
    ...(label ? { label } : {}),
    revision,
  };
}

function sourceForActivity(
  activity: OrchestrationThreadActivity,
  kind = sourceFamily(activity.kind, record(activity.payload)),
  sourceThreadId?: ThreadId,
): CrokiSenseSource {
  return {
    kind,
    id: String(activity.id),
    activityId: String(activity.id),
    ...(sourceThreadId !== undefined ? { sourceThreadId } : {}),
    turnId: activity.turnId === null ? null : String(activity.turnId),
    observedAt: activity.createdAt,
  };
}

function sourceFamily(kind: string, payload?: Record<string, unknown>): string {
  if (kind === "croki.evidence.observed") return "evidence";
  if (kind.startsWith("croki.sense.")) return "sense";
  if (kind.startsWith("croki.canvas.")) return "canvas";
  if (kind.startsWith("preview.")) return "preview";
  if (kind.startsWith("tool.") || kind.startsWith("runtime.")) {
    const sourceHint = [
      text(payload?.itemType),
      text(payload?.toolName),
      text(payload?.title),
      text(payload?.name),
    ]
      .filter((value): value is string => value !== undefined)
      .join(" ")
      .toLowerCase();
    if (sourceHint.includes("preview") || sourceHint.includes("browser")) return "preview";
    return "runtime";
  }
  if (kind.startsWith("task.")) return "agent";
  if (kind.startsWith("approval.")) return "authority";
  const [first] = kind.split(".");
  return first || "thread";
}

function normalizeSource(value: string): string {
  return value.trim().toLowerCase();
}

function getArtifact(activity: OrchestrationThreadActivity): CrokiCanvasArtifact | null {
  if (activity.kind !== "croki.canvas.presented") return null;
  const payload = parseCrokiCanvasPresentedActivityPayload(activity.payload);
  return getCrokiCanvasArtifactFromActivity(payload);
}

function findFrame(
  activities: readonly OrchestrationThreadActivity[],
): CrokiSenseFrameReference | undefined {
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const activity = activities[index];
    if (!activity) continue;
    const payload = record(activity.payload);
    const candidate =
      payload?.frame ?? payload?.frameRef ?? payload?.renderedFrame ?? payload?.screenshot;
    const frame = frameFromValue(candidate, String(activity.id));
    if (frame) return frame;
  }
  return undefined;
}

function frameFromValue(value: unknown, activityId: string): CrokiSenseFrameReference | undefined {
  if (typeof value === "string" && value.length > 0) {
    return {
      kind: value.startsWith("http://") || value.startsWith("https://") ? "url" : "path",
      ref: value,
    };
  }
  const object = record(value);
  if (!object) return undefined;
  const ref = text(object.ref) ?? text(object.url) ?? text(object.path);
  if (ref) {
    const width = number(object.width);
    const height = number(object.height);
    return {
      kind: text(object.kind) ?? (text(object.url) ? "url" : "path"),
      ref,
      ...(text(object.mimeType) ? { mimeType: text(object.mimeType) } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
    };
  }
  // A screenshot payload may only contain image bytes. Preserve a stable
  // reference without copying the potentially huge data through MCP.
  if (typeof object.data === "string" && object.data.length > 0) {
    return {
      kind: "inline",
      ref: `activity:${activityId}#frame`,
      ...(text(object.mimeType) ? { mimeType: text(object.mimeType) } : {}),
      ...(number(object.width) ? { width: number(object.width) } : {}),
      ...(number(object.height) ? { height: number(object.height) } : {}),
    };
  }
  return undefined;
}

function dedupeRelationships(
  relationships: readonly CrokiSenseRelationship[],
): CrokiSenseRelationship[] {
  const seen = new Set<string>();
  return relationships.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function safePayload(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) return {};
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "prompt" || key === "privatePrompt" || key === "screenshot" || key === "data")
      continue;
    if (typeof entry === "string")
      output[key] = entry.length > 2_000 ? `${entry.slice(0, 1_997)}...` : entry;
    else if (typeof entry === "number" || typeof entry === "boolean" || entry === null)
      output[key] = entry;
    else if (Array.isArray(entry) && entry.length <= 32) output[key] = entry;
  }
  return output;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
