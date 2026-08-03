import { CommandId, EventId, type OrchestrationThread } from "@croki/contracts";
import * as Crypto from "effect/Crypto";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { buildCrokiCanvasArtifact } from "./presentation.ts";
import {
  inspectPerceptionObject,
  projectThreadPerception,
  type ProjectedThreadPerception,
} from "./perception.ts";
import {
  CrokiSenseError,
  type CrokiSenseInspectInput,
  type CrokiSenseObserveInput,
  type CrokiSenseStatusInput,
  type CrokiSenseWaitInput,
  type CrokiSenseInspection,
  type CrokiSenseObservation,
  type CrokiSenseStatus,
  type CrokiSenseWaitResult,
  CrokiCanvasPresentError,
  CrokiSenseToolkit,
  type CrokiCanvasHarnessId,
  type CrokiCanvasPresentInput,
  type CrokiCanvasPresentResult,
} from "./tools.ts";

const fail = (
  code: CrokiCanvasPresentError["code"],
  message: string,
): Effect.Effect<never, CrokiCanvasPresentError> =>
  Effect.fail(new CrokiCanvasPresentError({ code, message }));

/**
 * Presents a visual as an immutable Thread activity. Project context is not
 * read or written here: Canvas is a harness artifact, never a memory store.
 */
export const presentCrokiCanvas = Effect.fn("CrokiLegacyCanvasPresentation.present")(function* (
  input: CrokiCanvasPresentInput,
) {
  const invocation = yield* McpInvocationContext.McpInvocationContext;
  const invocationHarnessId = getInvocationHarnessId(invocation);
  const inputHarnessId = getInputHarnessId(input);

  // During the rollout the invocation scope is authoritative. The capability
  // fallback keeps old MCP sessions and deterministic tests readable until all
  // providers issue explicit harness ids.
  if (
    invocationHarnessId === "native" ||
    (invocationHarnessId === undefined && !invocation.capabilities.has("canvas"))
  ) {
    return yield* fail(
      "canvas-unavailable",
      "Canvas presentation is available only during an explicit Product or GTM turn.",
    );
  }

  const harnessId = invocationHarnessId ?? inputHarnessId;
  if (harnessId !== "product-v1" && harnessId !== "gtm-v1") {
    return yield* fail(
      "canvas-unavailable",
      "Canvas presentation requires an explicit Product or GTM harness.",
    );
  }
  if (inputHarnessId !== undefined && inputHarnessId !== harnessId) {
    return yield* fail(
      "artifact-invalid",
      "Canvas harness attribution does not match the active turn.",
    );
  }

  const query = yield* ProjectionSnapshotQuery;
  const thread = yield* query.getThreadDetailById(invocation.threadId).pipe(
    Effect.mapError(
      () =>
        new CrokiCanvasPresentError({
          code: "thread-not-found",
          message: "Could not resolve the Thread for this Canvas visual.",
        }),
    ),
  );
  if (Option.isNone(thread)) {
    return yield* fail("thread-not-found", "Could not resolve the Thread for this Canvas visual.");
  }

  const revision = nextCanvasRevision(thread.value);
  const timestamp = DateTime.formatIso(yield* DateTime.now);
  const crypto = yield* Crypto.Crypto;
  const artifactId = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
  const commandUuid = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
  const eventUuid = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
  const turnId = thread.value.latestTurn?.turnId ?? null;

  const artifact = yield* Effect.try({
    try: () =>
      buildCrokiCanvasArtifact(input, {
        artifactId,
        revision,
        threadId: invocation.threadId,
        turnId,
        harnessId,
        createdAt: timestamp,
      }),
    catch: (cause) =>
      new CrokiCanvasPresentError({
        code: "artifact-invalid",
        message: cause instanceof Error ? cause.message : "The Canvas visual is invalid.",
      }),
  });

  const engine = yield* OrchestrationEngineService;
  const activityPayload = {
    artifact,
  };
  yield* engine
    .dispatch({
      type: "thread.activity.append",
      commandId: CommandId.make(`canvas-presented:${commandUuid}`),
      threadId: invocation.threadId,
      activity: {
        id: EventId.make(eventUuid),
        tone: "info",
        kind: "croki.canvas.presented",
        summary: `Canvas visual ready · ${artifact.nodes.length} items`,
        payload: activityPayload,
        turnId,
        createdAt: timestamp,
      },
      createdAt: timestamp,
    })
    .pipe(
      Effect.mapError(
        () =>
          new CrokiCanvasPresentError({
            code: "persistence-failed",
            message: "The Canvas visual could not be saved to this Thread.",
          }),
      ),
    );

  return {
    artifactId: artifact.id,
    revision: artifact.revision,
    harnessId: artifact.harnessId,
    presentation: artifact.presentation,
    nodeCount: artifact.nodes.length,
    edgeCount: artifact.edges.length,
    createdAt: artifact.createdAt,
  } satisfies CrokiCanvasPresentResult;
});

/** Read a Thread without granting a model any Canvas mutation surface. */
export const senseStatus = Effect.fn("CrokiSenseToolkit.status")(function* (
  input: CrokiSenseStatusInput,
) {
  const thread = yield* resolveSenseThread(input.threadId);
  const observation = projectThreadPerception(thread);
  const sourceKinds = new Set(observation.objects.map((object) => object.source.kind));
  const result: CrokiSenseStatus = {
    threadId: String(thread.id),
    available: true,
    revision: observation.revision,
    sourceRevision: observation.sourceRevision,
    objectCount: observation.objects.length,
    relationshipCount: observation.relationships.length,
    latestActivityAt: observation.latestActivityAt,
    activeTurnId: observation.activeTurnId,
    sources: Array.from(sourceKinds).sort(),
    affordances: [
      {
        id: "observe",
        kind: "observe",
        label: "Observe live sources",
        authority: "read",
        reversible: true,
        requiresApproval: false,
      },
      {
        id: "inspect",
        kind: "inspect",
        label: "Inspect a sensed object",
        authority: "read",
        reversible: true,
        requiresApproval: false,
      },
      {
        id: "wait",
        kind: "wait",
        label: "Wait for source change",
        authority: "read",
        reversible: true,
        requiresApproval: false,
      },
    ],
  };
  return result;
});

export const senseObserve = Effect.fn("CrokiSenseToolkit.observe")(function* (
  input: CrokiSenseObserveInput,
) {
  const thread = yield* resolveSenseThread(input.threadId);
  return projectThreadPerception(thread, {
    ...(input.sinceRevision === undefined ? {} : { sinceRevision: input.sinceRevision }),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    ...(input.sources === undefined ? {} : { sources: input.sources }),
  }) satisfies CrokiSenseObservation;
});

export const senseInspect = Effect.fn("CrokiSenseToolkit.inspect")(function* (
  input: CrokiSenseInspectInput,
) {
  const thread = yield* resolveSenseThread(input.threadId);
  let observation = projectThreadPerception(thread);
  let inspected = inspectPerceptionObject(observation, input.objectId, input.depth ?? 0);

  // A project Canvas can carry an object selected while another Thread is
  // active. Resolve that stable id through the project-wide model derived from
  // durable Thread projections, while keeping the invocation Thread as the
  // authorization anchor.
  if (!inspected.object) {
    const query = yield* ProjectionSnapshotQuery;
    const projectSnapshot = yield* (
      query.getProjectPerception?.({ projectId: thread.projectId }) ?? Effect.succeed(Option.none())
    ).pipe(
      Effect.mapError(
        () =>
          new CrokiSenseError({
            code: "persistence-failed",
            message: "Could not load the project perception model.",
          }),
      ),
    );
    if (Option.isSome(projectSnapshot)) {
      observation = {
        threadId: String(thread.id),
        revision: projectSnapshot.value.revision,
        sourceRevision: projectSnapshot.value.sourceRevision,
        changed: projectSnapshot.value.changed,
        objects: projectSnapshot.value.objects,
        relationships: projectSnapshot.value.relationships,
        delta: projectSnapshot.value.delta,
        latestActivityAt: projectSnapshot.value.latestActivityAt,
        activeTurnId: thread.latestTurn?.turnId ?? null,
        truncated: projectSnapshot.value.truncated,
      };
      inspected = inspectPerceptionObject(observation, input.objectId, input.depth ?? 0);
    }
  }
  if (input.revision !== undefined && input.revision !== observation.revision) {
    return yield* senseFail(
      "invalid-revision",
      `The sensed project advanced from revision ${input.revision} to ${observation.revision}; observe again before inspecting.`,
    );
  }
  if (!inspected.object) {
    return yield* senseFail(
      "object-not-found",
      `No sensed object exists with id '${input.objectId}'.`,
    );
  }
  return {
    observation,
    object: inspected.object,
    relationships: inspected.relationships,
    relatedObjects: inspected.relatedObjects,
  } satisfies CrokiSenseInspection;
});

export const senseWait = Effect.fn("CrokiSenseToolkit.wait")(function* (
  input: CrokiSenseWaitInput,
) {
  const startedAt = yield* Clock.currentTimeMillis;
  const timeoutMs = input.timeoutMs ?? 0;
  const pollIntervalMs = input.pollIntervalMs ?? 100;
  let observation: ProjectedThreadPerception;
  while (true) {
    const thread = yield* resolveSenseThread(input.threadId);
    observation = projectThreadPerception(thread);
    if (observation.revision > input.sinceRevision) break;
    const waitedMs = Number(yield* Clock.currentTimeMillis) - Number(startedAt);
    if (waitedMs >= timeoutMs) {
      return {
        observation,
        changed: false,
        timedOut: true,
        waitedMs,
      } satisfies CrokiSenseWaitResult;
    }
    yield* Effect.sleep(Math.min(pollIntervalMs, timeoutMs - waitedMs));
  }
  const waitedMs = Number(yield* Clock.currentTimeMillis) - Number(startedAt);
  return {
    observation,
    changed: true,
    timedOut: false,
    waitedMs,
  } satisfies CrokiSenseWaitResult;
});

function resolveSenseThread(requestedThreadId?: string) {
  return Effect.gen(function* () {
    const invocation = yield* McpInvocationContext.McpInvocationContext;
    if (requestedThreadId !== undefined && requestedThreadId !== String(invocation.threadId)) {
      return yield* senseFail(
        "thread-not-found",
        "Sense calls may only observe the Thread bound to this provider session.",
      );
    }
    const query = yield* ProjectionSnapshotQuery;
    const thread = yield* query.getThreadDetailById(invocation.threadId).pipe(
      Effect.mapError(
        () =>
          new CrokiSenseError({
            code: "thread-not-found",
            message: "Could not resolve the Thread.",
          }),
      ),
    );
    if (Option.isNone(thread)) {
      return yield* senseFail("thread-not-found", "Could not resolve the Thread.");
    }
    return thread.value;
  });
}

function senseFail(
  code: CrokiSenseError["code"],
  message: string,
): Effect.Effect<never, CrokiSenseError> {
  return Effect.fail(new CrokiSenseError({ code, message }));
}

function getInvocationHarnessId(
  invocation: McpInvocationContext.McpInvocationScope,
): CrokiCanvasHarnessId | "native" | undefined {
  const value = (
    invocation as McpInvocationContext.McpInvocationScope & {
      readonly harnessId?: unknown;
    }
  ).harnessId;
  return value === "native" || value === "product-v1" || value === "gtm-v1" ? value : undefined;
}

function getInputHarnessId(input: CrokiCanvasPresentInput): CrokiCanvasHarnessId | undefined {
  if ("presentation" in input) {
    return input.harnessId;
  }
  if (input.view === "product") return "product-v1";
  if (input.view === "gtm") return "gtm-v1";
  return undefined;
}

function nextCanvasRevision(thread: OrchestrationThread): number {
  let latest = 0;
  for (const activity of thread.activities) {
    if (activity.kind !== "croki.canvas.presented") continue;
    const revision = readRevision(activity.payload);
    if (revision !== null) latest = Math.max(latest, revision);
  }
  return latest + 1;
}

function readRevision(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const artifact = isRecord(value.artifact) ? value.artifact : undefined;
  const candidate = artifact?.revision ?? value.revision;
  return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 1
    ? candidate
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const CrokiSenseToolkitHandlersLive = CrokiSenseToolkit.toLayer({
  sense_status: senseStatus,
  sense_observe: senseObserve,
  sense_inspect: senseInspect,
  sense_wait: senseWait,
});
