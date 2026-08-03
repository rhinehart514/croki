import type {
  CrokiPerceptionAffordance,
  CrokiPerceptionDelta,
  CrokiPerceptionFrame,
  CrokiPerceptionFrameReference,
  CrokiPerceptionObject,
  CrokiPerceptionRelationship,
  CrokiPerceptionSource,
  OrchestrationCheckpointSummary,
  OrchestrationThreadActivity,
} from "@croki/contracts";
import {
  parseCrokiCanvasArtifact,
  type CrokiCanvasArtifact,
  type CrokiCanvasArtifactEdge,
  type CrokiCanvasArtifactNode,
  type CrokiCanvasNodeRole,
  type CrokiCanvasPresentation,
} from "@croki/shared/crokiCanvasArtifact";

/**
 * The bounded shape projected by a legacy Product/GTM Canvas activity.
 *
 * This is intentionally kept at the chat seam instead of reusing project
 * context nodes. A presentation is a thread artifact, not durable project
 * truth, and old clients may still receive activities without the artifact
 * body.
 */
export type CanvasHarnessId = "product-v1" | "gtm-v1";
export type CanvasPresentation = CrokiCanvasPresentation;
export type CanvasArtifactRole = CrokiCanvasNodeRole;
export type HarnessCanvasArtifactNode = CrokiCanvasArtifactNode;
export type HarnessCanvasArtifactEdge = CrokiCanvasArtifactEdge;
export type HarnessCanvasArtifact = CrokiCanvasArtifact;

/** Source-oriented protocol aliases shared with the live Canvas projection. */
export type CanvasPerceptionAuthority = "read" | "propose" | "approval-required" | "external-write";
export type CanvasPerceptionAffordance = CrokiPerceptionAffordance;
export type CanvasPerceptionFrameReference = CrokiPerceptionFrameReference;
export type CanvasPerceptionSource = CrokiPerceptionSource;
export type CanvasPerceptionObject = CrokiPerceptionObject;
export type CanvasPerceptionRelationship = CrokiPerceptionRelationship;
export type CanvasPerceptionDelta = CrokiPerceptionDelta;
export type CanvasPerceptionFrame = CrokiPerceptionFrame;
export type CrokiCanvasPerceptionFrame = CrokiPerceptionFrame;

export interface CanvasPerceptionProjectionInput {
  readonly threadId: string;
  readonly activities: readonly OrchestrationThreadActivity[];
  readonly checkpoints?: readonly OrchestrationCheckpointSummary[];
  readonly activeTurnId?: string | null;
  readonly sinceRevision?: number;
  readonly limit?: number;
}

export interface CrokiSenseActivityProjection {
  readonly activityId: string;
  readonly kind: string;
  readonly operation: string | null;
  readonly observedRevision: number | null;
  readonly objectIds: readonly string[];
  readonly observation: CanvasPerceptionObservationPayload | null;
}

export interface CanvasPerceptionObservationPayload {
  readonly threadId: string | null;
  readonly revision: number;
  readonly sourceRevision: number;
  readonly objects: readonly CanvasPerceptionObject[];
  readonly relationships: readonly CanvasPerceptionRelationship[];
  readonly frame?: CanvasPerceptionFrameReference;
}

export interface CanvasPresentationTimelineActivity {
  readonly activityId: string;
  readonly createdAt: string;
  readonly artifact: HarnessCanvasArtifact | null;
  readonly harnessId: CanvasHarnessId | null;
  readonly question: string | null;
  readonly revision: number | null;
  readonly summary: string;
}

/** Parse only the content-safe artifact projection used by the web client. */
export function parseCanvasPresentationActivity(
  activity: Pick<OrchestrationThreadActivity, "id" | "kind" | "createdAt" | "payload" | "summary">,
): CanvasPresentationTimelineActivity | null {
  if (activity.kind !== "croki.canvas.presented") return null;
  const payload = asRecord(activity.payload);
  const artifact = parseArtifact(payload?.artifact);
  const legacyHarnessId =
    payload?.view === "gtm"
      ? ("gtm-v1" as const)
      : payload?.view === "product"
        ? ("product-v1" as const)
        : null;
  const legacyQuestion = typeof payload?.question === "string" ? payload.question : null;
  const legacyRevision =
    typeof payload?.revision === "number" && Number.isSafeInteger(payload.revision)
      ? payload.revision
      : null;
  return {
    activityId: String(activity.id),
    createdAt: activity.createdAt,
    artifact,
    harnessId: artifact?.harnessId ?? legacyHarnessId,
    question: artifact?.question ?? legacyQuestion,
    revision: artifact?.revision ?? legacyRevision,
    summary:
      typeof activity.summary === "string" && activity.summary.trim().length > 0
        ? activity.summary
        : artifact
          ? `${artifact.nodes.length} Canvas ${artifact.nodes.length === 1 ? "item" : "items"}`
          : "Canvas visual unavailable",
  };
}

export function deriveCanvasPresentationActivities(
  activities: readonly OrchestrationThreadActivity[],
): CanvasPresentationTimelineActivity[] {
  return activities
    .flatMap((activity) => {
      const parsed = parseCanvasPresentationActivity(activity);
      return parsed ? [parsed] : [];
    })
    .toSorted(
      (left, right) =>
        (left.revision ?? Number.MAX_SAFE_INTEGER) - (right.revision ?? Number.MAX_SAFE_INTEGER) ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.activityId.localeCompare(right.activityId),
    );
}

export function canvasHarnessLabel(harnessId: CanvasHarnessId | null): "Product" | "GTM" {
  return harnessId === "gtm-v1" ? "GTM" : "Product";
}

/**
 * Keep Canvas selections visible in the sent message. The selection is not
 * appended to the composer draft, so selecting and then abandoning a turn
 * never mutates or sends anything.
 */
export function appendCanvasSelectionToPrompt(
  prompt: string,
  selectedNodes: readonly HarnessCanvasArtifactNode[],
  options: { readonly includeLegacySerialization?: boolean } = {},
): string {
  // Native perception carries stable object ids in the Thread stream. Keep
  // the text form for old artifact-only turns so historical conversations can
  // still be continued by clients that do not understand those ids.
  if (selectedNodes.length === 0 || options.includeLegacySerialization === false) return prompt;
  const blocks = selectedNodes.map((node) => {
    const lines = [`- ${node.title}`];
    if (node.body?.trim()) lines.push(`  ${node.body.trim()}`);
    if (node.whyItMatters?.trim()) lines.push(`  Why it matters: ${node.whyItMatters.trim()}`);
    for (const reference of node.references ?? []) {
      lines.push(`  Evidence: ${reference.kind === "file" ? reference.path : reference.url}`);
    }
    return lines.join("\n");
  });
  const selection = `Canvas selection\n${blocks.join("\n")}`;
  const trimmed = prompt.trim();
  return trimmed.length > 0 ? `${trimmed}\n\n${selection}` : selection;
}

/**
 * Carry only stable sensed ids into a new turn. The model can call
 * `sense_inspect` for details; serializing bodies or provider payloads here
 * would recreate the manual Canvas handoff this projection replaces.
 */
export function appendCrokiPerceptionFocusToPrompt(
  prompt: string,
  selectedIds: readonly string[],
  frame: Pick<CanvasPerceptionFrame, "objects"> | null | undefined,
): string {
  if (!frame || selectedIds.length === 0) return prompt;
  const ids = new Set(selectedIds);
  const selected = frame.objects.filter((object) => ids.has(object.id));
  if (selected.length === 0) return prompt;
  const lines = [
    "Croki perception focus",
    ...selected.map((object) => `- ${object.id} · ${object.title} · source: ${object.source.kind}`),
  ];
  const focus = lines.join("\n");
  const trimmed = prompt.trim();
  return trimmed.length > 0 ? `${trimmed}\n\n${focus}` : focus;
}

export const appendCrokiPerceptionFocusPrompt = appendCrokiPerceptionFocusToPrompt;

/**
 * Parse a `croki.sense.*` receipt without trusting provider payloads. Sense
 * observations may be emitted as `{ observation }`, as a packet containing
 * `objects`/`relationships`, or as a compact receipt containing only ids.
 */
export function parseCrokiSenseActivity(
  activity: Pick<OrchestrationThreadActivity, "id" | "kind" | "payload">,
): CrokiSenseActivityProjection | null {
  if (!activity.kind.startsWith("croki.sense.")) return null;
  const payload = asRecord(activity.payload);
  const observationRecord = asRecord(payload?.observation) ?? payload;
  const observation = parseObservationPayload(observationRecord);
  const objectIds = readStringArray(payload?.objectIds);
  const observedRevision = readFiniteInt(
    payload?.observedRevision ?? observationRecord?.sourceRevision ?? observationRecord?.revision,
  );
  return {
    activityId: String(activity.id),
    kind: activity.kind,
    operation: asTrimmedString(payload?.operation),
    observedRevision,
    objectIds,
    observation,
  };
}

/**
 * Build the live perceptual frame from ordinary Thread activity. This is the
 * authoritative Canvas input for new turns; legacy artifacts are included as
 * historical observations only and never become editable Canvas state.
 */
export function deriveCanvasPerceptionFrame(
  input: CanvasPerceptionProjectionInput,
): CanvasPerceptionFrame {
  const limit = clampInt(input.limit ?? 200, 1, 200);
  const activities = input.activities;
  const startIndex = Math.max(0, activities.length - limit);
  const visibleActivities = activities.slice(startIndex);
  const truncated = startIndex > 0;
  const activityRevisionById = new Map<string, number>();
  let sourceRevision = 0;
  let latestActivityAt: string | null = null;
  for (const [index, activity] of activities.entries()) {
    const revision = readFiniteInt(activity.sequence) ?? index + 1;
    activityRevisionById.set(String(activity.id), revision);
    sourceRevision = Math.max(sourceRevision, revision);
    if (latestActivityAt === null || activity.createdAt > latestActivityAt) {
      latestActivityAt = activity.createdAt;
    }
  }

  const objects: CanvasPerceptionObject[] = [];
  const relationships: CanvasPerceptionRelationship[] = [];
  const objectIds = new Set<string>();
  const objectByActivityId = new Map<string, string>();
  const taskObjects = new Map<string, string>();
  const requestObjects = new Map<string, string>();
  const pushObject = (object: CanvasPerceptionObject) => {
    if (objectIds.has(object.id)) return;
    objectIds.add(object.id);
    objects.push(object);
  };
  const pushRelationship = (
    from: string,
    to: string,
    kind: string,
    revision: number,
    label?: string,
    source?: CanvasPerceptionSource,
  ) => {
    if (from === to || !objectIds.has(from) || !objectIds.has(to)) return;
    const id = `${from}->${kind}->${to}`;
    if (relationships.some((relationship) => relationship.id === id)) return;
    relationships.push({
      id,
      from,
      to,
      kind,
      revision,
      ...(label ? { label } : {}),
      ...(source ? { source } : {}),
    });
  };

  const threadObjectId = `thread:${input.threadId}`;
  const activeTurnId = input.activeTurnId ?? latestTurnId(activities);
  sourceRevision = Math.max(
    sourceRevision,
    ...(input.checkpoints ?? []).map((checkpoint) => checkpoint.checkpointTurnCount),
  );
  pushObject({
    id: threadObjectId,
    type: "thread",
    title: "Thread",
    summary: `${activities.length} source event${activities.length === 1 ? "" : "s"}`,
    state: activeTurnId ? "active" : "idle",
    revision: sourceRevision,
    source: {
      kind: "thread",
      id: input.threadId,
      turnId: activeTurnId,
      observedAt: latestActivityAt ?? new Date(0).toISOString(),
    },
    affordances: [
      perceptionAffordance("observe", "Observe Thread", "read"),
      perceptionAffordance("wait", "Wait for change", "read"),
    ],
    data: { activityCount: activities.length },
  });

  if (activeTurnId) {
    const turnObjectId = `turn:${activeTurnId}`;
    const turnRevision = sourceRevision;
    pushObject({
      id: turnObjectId,
      type: "turn",
      title: `Turn ${activeTurnId}`,
      summary: "Current reasoning stream",
      state: "active",
      revision: turnRevision,
      source: {
        kind: "turn",
        id: activeTurnId,
        turnId: activeTurnId,
        observedAt: latestActivityAt ?? new Date(0).toISOString(),
      },
      affordances: [perceptionAffordance("inspect", "Inspect turn", "read")],
    });
    pushRelationship(threadObjectId, turnObjectId, "contains", turnRevision, "active turn");
  }

  for (const [localIndex, activity] of visibleActivities.entries()) {
    const revision = activityRevisionById.get(String(activity.id)) ?? startIndex + localIndex + 1;
    const projected = projectActivityPerception(activity, revision);
    pushObject(projected.object);
    objectByActivityId.set(String(activity.id), projected.object.id);
    if (projected.taskId) taskObjects.set(projected.taskId, projected.object.id);
    if (projected.requestId) requestObjects.set(projected.requestId, projected.object.id);
    pushRelationship(
      threadObjectId,
      projected.object.id,
      "contains",
      revision,
      activity.kind,
      projected.object.source,
    );
    if (activity.turnId !== null && objectIds.has(`turn:${activity.turnId}`)) {
      pushRelationship(`turn:${activity.turnId}`, projected.object.id, "occurred-during", revision);
    }

    // A sense packet may contain canonical objects richer than its compact
    // receipt. Merge those objects into the same stream and retain provenance.
    const sense = parseCrokiSenseActivity(activity);
    if (sense?.observation) {
      sourceRevision = Math.max(sourceRevision, sense.observation.sourceRevision);
      for (const object of sense.observation.objects) pushObject(object);
      for (const relationship of sense.observation.relationships) {
        if (objectIds.has(relationship.from) && objectIds.has(relationship.to)) {
          relationships.push(relationship);
        }
      }
    }
  }

  for (const checkpoint of input.checkpoints ?? []) {
    const revision = checkpoint.checkpointTurnCount;
    const checkpointObjectId = `checkpoint:${checkpoint.turnId}`;
    const checkpointSource: CanvasPerceptionSource = {
      kind: "checkpoint",
      id: String(checkpoint.checkpointRef),
      turnId: String(checkpoint.turnId),
      observedAt: checkpoint.completedAt,
    };
    pushObject({
      id: checkpointObjectId,
      type: "checkpoint",
      title: `Checkpoint ${checkpoint.checkpointTurnCount}`,
      summary: `${checkpoint.files.length} changed file${checkpoint.files.length === 1 ? "" : "s"}`,
      state: checkpoint.status,
      revision,
      source: checkpointSource,
      affordances: [perceptionAffordance("inspect", "Inspect diff", "read")],
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
    pushRelationship(
      threadObjectId,
      checkpointObjectId,
      "contains",
      revision,
      "checkpoint",
      checkpointSource,
    );
    if (objectIds.has(`turn:${checkpoint.turnId}`)) {
      pushRelationship(`turn:${checkpoint.turnId}`, checkpointObjectId, "produced", revision);
    }
  }

  // Resolve task and request relationships after every visible activity has
  // an object id. This keeps parent-child agent work inspectable without
  // exposing the underlying provider payload.
  for (const activity of visibleActivities) {
    const projectedId = objectByActivityId.get(String(activity.id));
    if (!projectedId) continue;
    const payload = asRecord(activity.payload);
    const revision = activityRevisionById.get(String(activity.id)) ?? 0;
    const parentTaskId = asTrimmedString(payload?.parentTaskId);
    const taskId = asTrimmedString(payload?.taskId);
    const requestId = asTrimmedString(payload?.requestId);
    if (parentTaskId) {
      const parentId = taskObjects.get(parentTaskId);
      if (parentId) pushRelationship(parentId, projectedId, "subtask", revision);
    }
    if (taskId) {
      const taskIdObject = taskObjects.get(taskId);
      if (taskIdObject && taskIdObject !== projectedId) {
        pushRelationship(taskIdObject, projectedId, "task-update", revision);
      }
    }
    if (requestId) {
      const requestIdObject = requestObjects.get(requestId);
      if (requestIdObject && requestIdObject !== projectedId) {
        pushRelationship(requestIdObject, projectedId, "resolves", revision);
      }
    }
  }

  const legacyArtifacts = deriveCanvasPresentationActivities(activities)
    .filter((entry) => entry.artifact !== null)
    .flatMap((entry) => (entry.artifact ? [{ entry, artifact: entry.artifact }] : []));
  const latestArtifactRevision = legacyArtifacts.reduce(
    (latest, candidate) => Math.max(latest, candidate.artifact.revision),
    0,
  );
  for (const { entry, artifact } of legacyArtifacts) {
    const artifactObjectId = `legacy-canvas:${artifact.id}`;
    const artifactSource: CanvasPerceptionSource = {
      kind: "canvas",
      id: artifact.id,
      activityId: entry.activityId,
      turnId: artifact.turnId,
      observedAt: artifact.createdAt,
    };
    pushObject({
      id: artifactObjectId,
      type: "canvas-artifact",
      title: artifact.question,
      summary: `${artifact.nodes.length} historical visual object${artifact.nodes.length === 1 ? "" : "s"}`,
      state: artifact.revision === latestArtifactRevision ? "current" : "prior",
      revision: artifact.revision,
      source: artifactSource,
      affordances: [perceptionAffordance("inspect", "Inspect historical visual", "read")],
      data: {
        artifactId: artifact.id,
        artifactRevision: artifact.revision,
        harnessId: artifact.harnessId,
        presentation: artifact.presentation,
      },
    });
    pushRelationship(
      threadObjectId,
      artifactObjectId,
      "contains",
      artifact.revision,
      "legacy visual",
      artifactSource,
    );
    const nodeObjectIds = new Map<string, string>();
    for (const node of artifact.nodes) {
      const nodeObjectId = `${artifactObjectId}:node:${node.id}`;
      nodeObjectIds.set(node.id, nodeObjectId);
      pushObject({
        id: nodeObjectId,
        type: node.role,
        title: node.title,
        ...(node.body ? { summary: node.body } : {}),
        state: "historical",
        revision: artifact.revision,
        source: artifactSource,
        affordances: [perceptionAffordance("inspect", "Inspect historical object", "read")],
        data: {
          artifactId: artifact.id,
          role: node.role,
          ...(node.whyItMatters ? { whyItMatters: node.whyItMatters } : {}),
          ...(node.references ? { references: node.references } : {}),
        },
      });
      pushRelationship(
        artifactObjectId,
        nodeObjectId,
        "contains",
        artifact.revision,
        node.role,
        artifactSource,
      );
    }
    for (const edge of artifact.edges) {
      const from = nodeObjectIds.get(edge.from);
      const to = nodeObjectIds.get(edge.to);
      if (from && to)
        pushRelationship(from, to, "semantic", artifact.revision, edge.relation, artifactSource);
    }
  }
  sourceRevision = Math.max(sourceRevision, latestArtifactRevision);

  const frame = findPerceptionFrame(activities);
  const sinceRevision = Math.max(0, input.sinceRevision ?? 0);
  const changed = sourceRevision > sinceRevision;
  const visibleRelationships = dedupePerceptionRelationships(relationships);
  const finalFrame: CanvasPerceptionFrame = {
    threadId: input.threadId,
    revision: sourceRevision,
    sourceRevision,
    changed,
    objects,
    relationships: visibleRelationships,
    delta: {
      sinceRevision,
      addedObjects: objects.filter((object) => object.revision > sinceRevision),
      updatedObjects: [],
      removedObjectIds: [],
      addedRelationships: visibleRelationships.filter(
        (relationship) => relationship.revision > sinceRevision,
      ),
      removedRelationshipIds: [],
    },
    ...(frame ? { frame } : {}),
    latestActivityAt,
    activeTurnId,
    truncated,
  };
  return finalFrame;
}

/** Compatibility spelling for callers that use the protocol's `Croki` prefix. */
export const deriveCrokiPerceptionFrame = deriveCanvasPerceptionFrame;
export const projectCanvasPerception = deriveCanvasPerceptionFrame;

function projectActivityPerception(
  activity: OrchestrationThreadActivity,
  revision: number,
): {
  readonly object: CanvasPerceptionObject;
  readonly taskId?: string;
  readonly requestId?: string;
} {
  const payload = asRecord(activity.payload);
  const taskId = asTrimmedString(payload?.taskId);
  const requestId = asTrimmedString(payload?.requestId);
  const sourceKind = perceptionSourceKind(activity.kind);
  const activityType =
    asTrimmedString(payload?.itemType)?.toLowerCase().includes("preview") ||
    asTrimmedString(payload?.itemType)?.toLowerCase().includes("browser")
      ? "preview"
      : perceptionObjectType(activity.kind);
  const title = asTrimmedString(payload?.title) ?? activity.summary;
  const summary =
    asTrimmedString(payload?.detail) ?? asTrimmedString(payload?.summary) ?? activity.summary;
  const frame = findPerceptionFrame([activity]);
  const safePayload = safePerceptionPayload(payload);
  const object: CanvasPerceptionObject = {
    id: `activity:${activity.id}`,
    type: activityType,
    title: truncatePerceptionText(title, 240),
    summary: truncatePerceptionText(summary, 2_000),
    state: asTrimmedString(payload?.status) ?? activity.tone,
    revision,
    source: {
      kind: sourceKind,
      id: String(activity.id),
      activityId: String(activity.id),
      turnId: activity.turnId === null ? null : String(activity.turnId),
      observedAt: activity.createdAt,
    },
    affordances: perceptionAffordancesForActivity(activity),
    ...(safePayload ? { data: safePayload } : {}),
    ...(frame ? { frame } : {}),
  };
  return {
    object,
    ...(taskId ? { taskId } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

function perceptionObjectType(kind: string): string {
  const normalized = kind.toLowerCase();
  if (normalized.startsWith("tool.")) return "tool";
  if (normalized.includes("preview") || normalized.includes("browser")) return "preview";
  if (normalized.startsWith("checkpoint.") || normalized.includes("diff")) return "diff";
  if (normalized.startsWith("approval.") || normalized.startsWith("user-input.")) return "approval";
  if (
    normalized.includes("error") ||
    normalized.includes("failed") ||
    normalized.includes("denied")
  ) {
    return "error";
  }
  if (normalized.startsWith("croki.canvas.")) return "canvas";
  if (normalized.startsWith("croki.context.")) return "context";
  if (normalized.startsWith("croki.sense.")) return "sense";
  if (normalized.startsWith("task.")) return "agent";
  return "activity";
}

function perceptionSourceKind(kind: string): string {
  const normalized = kind.toLowerCase();
  if (normalized.startsWith("croki.sense.")) return "sense";
  if (normalized.startsWith("croki.canvas.")) return "canvas";
  if (normalized.startsWith("croki.context.")) return "context";
  if (normalized.includes("preview") || normalized.includes("browser")) return "preview";
  if (normalized.startsWith("tool.") || normalized.startsWith("runtime.")) return "runtime";
  if (normalized.startsWith("checkpoint.") || normalized.includes("diff")) return "diff";
  if (normalized.startsWith("approval.") || normalized.startsWith("user-input."))
    return "authority";
  if (normalized.startsWith("task.")) return "agent";
  return normalized.split(".")[0] || "thread";
}

function perceptionAffordancesForActivity(
  activity: OrchestrationThreadActivity,
): readonly CanvasPerceptionAffordance[] {
  const base = [perceptionAffordance("inspect", "Inspect source", "read")];
  if (activity.kind === "approval.requested" || activity.kind === "user-input.requested") {
    return [
      ...base,
      perceptionAffordance(
        "approve",
        "Resolve request",
        "approval-required",
        false,
        true,
        "approval.respond",
      ),
    ];
  }
  if (
    activity.tone === "error" ||
    activity.kind.includes(".failed") ||
    activity.kind === "tool.denied" ||
    activity.kind === "runtime.error"
  ) {
    return [...base, perceptionAffordance("retry", "Retry source operation", "propose")];
  }
  return base;
}

function perceptionAffordance(
  kind: string,
  label: string,
  authority: CanvasPerceptionAuthority,
  reversible = true,
  requiresApproval = false,
  sourceTool?: string,
): CanvasPerceptionAffordance {
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

function safePerceptionPayload(
  payload: Record<string, unknown> | null,
): Readonly<Record<string, unknown>> | undefined {
  if (!payload) return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (
      key === "prompt" ||
      key === "privatePrompt" ||
      key === "screenshot" ||
      key === "data" ||
      key === "rawOutput"
    ) {
      continue;
    }
    if (typeof value === "string") output[key] = truncatePerceptionText(value, 2_000);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      output[key] = value;
    } else if (Array.isArray(value) && value.length <= 32) {
      output[key] = value.slice(0, 32);
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function parseObservationPayload(
  value: Record<string, unknown> | null,
): CanvasPerceptionObservationPayload | null {
  if (!value || !Array.isArray(value.objects)) return null;
  const objects = value.objects.flatMap((entry) => {
    const parsed = parsePerceptionObject(entry);
    return parsed ? [parsed] : [];
  });
  const relationships = Array.isArray(value.relationships)
    ? value.relationships.flatMap((entry) => {
        const parsed = parsePerceptionRelationship(entry);
        return parsed ? [parsed] : [];
      })
    : [];
  if (objects.length === 0 && relationships.length === 0) return null;
  const revision = readFiniteInt(value.revision) ?? readFiniteInt(value.sourceRevision) ?? 0;
  const sourceRevision = readFiniteInt(value.sourceRevision) ?? revision;
  const frame = parseFrameReference(value.frame);
  return {
    threadId: asTrimmedString(value.threadId),
    revision,
    sourceRevision,
    objects,
    relationships,
    ...(frame ? { frame } : {}),
  };
}

function parsePerceptionObject(value: unknown): CanvasPerceptionObject | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asTrimmedString(record.id);
  const title = asTrimmedString(record.title);
  const type = asTrimmedString(record.type);
  const sourceRecord = asRecord(record.source);
  const sourceKind = asTrimmedString(sourceRecord?.kind);
  const observedAt = asTrimmedString(sourceRecord?.observedAt);
  if (!id || !title || !type || !sourceKind || !observedAt) return null;
  const revision = readFiniteInt(record.revision) ?? 0;
  const affordances = Array.isArray(record.affordances)
    ? record.affordances.flatMap((entry) => {
        const parsed = parsePerceptionAffordance(entry);
        return parsed ? [parsed] : [];
      })
    : [];
  const frame = parseFrameReference(record.frame);
  const safeData = asRecord(record.data) ? safePerceptionPayload(asRecord(record.data)) : undefined;
  const source = sourceRecord ?? {};
  return {
    id,
    type,
    title: truncatePerceptionText(title, 240),
    ...(asTrimmedString(record.summary)
      ? { summary: truncatePerceptionText(asTrimmedString(record.summary)!, 2_000) }
      : {}),
    ...(asTrimmedString(record.state) ? { state: asTrimmedString(record.state)! } : {}),
    revision,
    source: {
      kind: sourceKind,
      ...(asTrimmedString(source.id) ? { id: asTrimmedString(source.id)! } : {}),
      ...(asTrimmedString(source.uri) ? { uri: asTrimmedString(source.uri)! } : {}),
      ...(asTrimmedString(source.activityId)
        ? { activityId: asTrimmedString(source.activityId)! }
        : {}),
      turnId: asTrimmedString(source.turnId),
      observedAt,
    },
    affordances,
    ...(safeData ? { data: safeData } : {}),
    ...(frame ? { frame } : {}),
  };
}

function parsePerceptionAffordance(value: unknown): CanvasPerceptionAffordance | null {
  const record = asRecord(value);
  const id = asTrimmedString(record?.id);
  const kind = asTrimmedString(record?.kind);
  const label = asTrimmedString(record?.label);
  const authority = record?.authority;
  if (
    !id ||
    !kind ||
    !label ||
    (authority !== "read" &&
      authority !== "propose" &&
      authority !== "approval-required" &&
      authority !== "external-write")
  ) {
    return null;
  }
  return {
    id,
    kind,
    label,
    authority,
    reversible: record?.reversible !== false,
    requiresApproval: record?.requiresApproval === true,
    ...(asTrimmedString(record?.sourceTool)
      ? { sourceTool: asTrimmedString(record?.sourceTool)! }
      : {}),
  };
}

function parsePerceptionRelationship(value: unknown): CanvasPerceptionRelationship | null {
  const record = asRecord(value);
  const id = asTrimmedString(record?.id);
  const from = asTrimmedString(record?.from);
  const to = asTrimmedString(record?.to);
  const kind = asTrimmedString(record?.kind);
  if (!id || !from || !to || !kind) return null;
  const revision = readFiniteInt(record?.revision) ?? 0;
  const confidence =
    typeof record?.confidence === "number" && Number.isFinite(record.confidence)
      ? record.confidence
      : undefined;
  return {
    id,
    from,
    to,
    kind,
    ...(asTrimmedString(record?.label) ? { label: asTrimmedString(record?.label)! } : {}),
    revision,
    ...(confidence === undefined ? {} : { confidence }),
  };
}

function parseFrameReference(value: unknown): CanvasPerceptionFrameReference | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    const ref = value.trim();
    return {
      kind: /^https?:\/\//u.test(ref) ? "url" : "path",
      ref,
    };
  }
  const record = asRecord(value);
  if (!record) return undefined;
  const ref =
    asTrimmedString(record.ref) ?? asTrimmedString(record.url) ?? asTrimmedString(record.path);
  if (!ref) {
    return typeof record.data === "string" && record.data.length > 0
      ? { kind: "inline", ref: "activity:frame" }
      : undefined;
  }
  return {
    kind: asTrimmedString(record.url) ? "url" : "path",
    ref,
    ...(asTrimmedString(record.mimeType) ? { mimeType: asTrimmedString(record.mimeType)! } : {}),
    ...(typeof record.width === "number" && Number.isFinite(record.width)
      ? { width: record.width }
      : {}),
    ...(typeof record.height === "number" && Number.isFinite(record.height)
      ? { height: record.height }
      : {}),
  };
}

function findPerceptionFrame(
  activities: readonly OrchestrationThreadActivity[],
): CanvasPerceptionFrameReference | undefined {
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const activity = activities[index];
    const payload = asRecord(activity?.payload);
    const candidate =
      payload?.frame ?? payload?.frameRef ?? payload?.renderedFrame ?? payload?.screenshot;
    const frame = parseFrameReference(candidate);
    if (frame) return frame;
  }
  return undefined;
}

function dedupePerceptionRelationships(
  relationships: readonly CanvasPerceptionRelationship[],
): CanvasPerceptionRelationship[] {
  const seen = new Set<string>();
  return relationships.filter((relationship) => {
    if (seen.has(relationship.id)) return false;
    seen.add(relationship.id);
    return true;
  });
}

function latestTurnId(activities: readonly OrchestrationThreadActivity[]): string | null {
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const turnId = activities[index]?.turnId;
    if (turnId !== null && turnId !== undefined) return String(turnId);
  }
  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const text = asTrimmedString(entry);
    return text ? [text] : [];
  });
}

function readFiniteInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function clampInt(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function truncatePerceptionText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function parseArtifact(value: unknown): HarnessCanvasArtifact | null {
  return parseCrokiCanvasArtifact(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
