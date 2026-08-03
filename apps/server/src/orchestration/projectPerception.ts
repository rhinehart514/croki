import type {
  CrokiPerceptionObject,
  CrokiPerceptionRelationship,
  CrokiProjectPerceptionSnapshot,
  OrchestrationThread,
  ProjectId,
  ThreadId,
} from "@croki/contracts";
import { TurnId } from "@croki/contracts";
import { projectThreadPerception } from "../mcp/toolkits/canvas/perception.ts";

const DEFAULT_PROJECT_LIMIT = 100;
const MAX_PROJECT_OBJECTS = 500;

export interface ProjectPerceptionProjectionOptions {
  /** Global orchestration sequence that changed this project model. */
  readonly revision?: number;
  readonly sinceRevision?: number;
  readonly limit?: number;
  readonly stale?: boolean;
  readonly status?: "ready" | "stale" | "rebuilding";
}

/**
 * Merge bounded Thread perceptions into one deterministic project model.
 * Objects keep their source Thread in provenance; no source payloads are
 * copied beyond the content-safe projection produced by the Thread projector.
 */
export function projectProjectPerception(
  projectId: ProjectId,
  threads: ReadonlyArray<OrchestrationThread>,
  options: ProjectPerceptionProjectionOptions = {},
): CrokiProjectPerceptionSnapshot {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_PROJECT_LIMIT, 200));
  const objectsById = new Map<string, CrokiPerceptionObject>();
  const relationshipsById = new Map<string, CrokiPerceptionRelationship>();
  const sourceThreadIds: ThreadId[] = [];
  const activeTurnIds: TurnId[] = [];
  let semanticRevision = 0;
  let latestActivityAt: string | null = null;
  let truncated = false;

  for (const thread of threads) {
    sourceThreadIds.push(thread.id);
    const frame = projectThreadPerception(thread, { limit });
    semanticRevision = Math.max(semanticRevision, frame.sourceRevision);
    if (frame.latestActivityAt !== null) {
      latestActivityAt =
        latestActivityAt === null || frame.latestActivityAt.localeCompare(latestActivityAt) > 0
          ? frame.latestActivityAt
          : latestActivityAt;
    }
    if (frame.activeTurnId !== null) {
      const activeTurnId = TurnId.make(frame.activeTurnId);
      if (!activeTurnIds.includes(activeTurnId)) activeTurnIds.push(activeTurnId);
    }
    truncated ||= frame.truncated;

    const objectIdByThreadId = new Map<string, string>();
    for (const object of frame.objects) {
      const projectObjectId = `${thread.id}:${object.id}`;
      objectIdByThreadId.set(object.id, projectObjectId);
      const projected = {
        ...object,
        id: projectObjectId,
        source: {
          ...object.source,
          sourceThreadId: thread.id,
        },
        data: {
          ...(typeof object.data === "object" && object.data !== null ? object.data : {}),
          sourceObjectId: object.id,
        },
      } satisfies CrokiPerceptionObject;
      const existing = objectsById.get(projected.id);
      if (
        existing === undefined ||
        projected.revision > existing.revision ||
        (projected.revision === existing.revision && projected.title > existing.title)
      ) {
        objectsById.set(projected.id, projected);
      }
    }
    for (const relationship of frame.relationships) {
      const from = objectIdByThreadId.get(relationship.from);
      const to = objectIdByThreadId.get(relationship.to);
      if (!from || !to) continue;
      const projected = relationship.source
        ? {
            ...relationship,
            id: `${thread.id}:${relationship.id}`,
            from,
            to,
            source: {
              ...relationship.source,
              sourceThreadId: thread.id,
            },
          }
        : {
            ...relationship,
            id: `${thread.id}:${relationship.id}`,
            from,
            to,
          };
      const existing = relationshipsById.get(projected.id);
      if (existing === undefined || projected.revision > existing.revision) {
        relationshipsById.set(projected.id, projected);
      }
    }
  }

  sourceThreadIds.sort((left, right) => String(left).localeCompare(String(right)));
  activeTurnIds.sort((left, right) => String(left).localeCompare(String(right)));

  const objects = [...objectsById.values()]
    .sort(
      (left, right) =>
        right.revision - left.revision ||
        right.source.observedAt.localeCompare(left.source.observedAt) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, Math.min(limit, MAX_PROJECT_OBJECTS));
  truncated ||= objects.length < objectsById.size;
  const visibleObjectIds = new Set(objects.map((object) => object.id));
  const relationships = [...relationshipsById.values()]
    .filter(
      (relationship) =>
        visibleObjectIds.has(relationship.from) && visibleObjectIds.has(relationship.to),
    )
    .sort((left, right) => right.revision - left.revision || left.id.localeCompare(right.id));
  const sinceRevision = Math.max(0, options.sinceRevision ?? 0);
  const revision = options.revision ?? semanticRevision;
  // Object revisions are Thread-local source revisions. A changed project
  // therefore returns its bounded current set as the delta instead of
  // comparing unrelated local cursors to the project cursor.
  const sourceRevision = revision;

  return {
    projectId,
    revision,
    sourceRevision,
    changed: revision > sinceRevision,
    objects,
    relationships,
    delta: {
      sinceRevision,
      addedObjects: revision > sinceRevision ? objects : [],
      updatedObjects: [],
      removedObjectIds: [],
      addedRelationships: revision > sinceRevision ? relationships : [],
      removedRelationshipIds: [],
    },
    latestActivityAt,
    sourceThreadIds,
    activeTurnIds,
    truncated,
    stale: options.stale ?? false,
    status: options.status ?? "ready",
  };
}
