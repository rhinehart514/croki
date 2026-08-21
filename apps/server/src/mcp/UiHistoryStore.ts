// @effect-diagnostics nodeBuiltinImport:off
import * as NodeBuffer from "node:buffer";

import {
  CommandId,
  EventId,
  type ApplicationAwarenessCheckedScreen,
  type ApplicationScreenReference,
  type CrokiPerceptionObject,
  type OrchestrationThread,
  UI_HISTORY_ACTIVITY_KIND,
  UiHistoryActivityPayload,
  type PreviewAutomationSnapshotConcept,
  type PreviewAutomationSnapshot,
  type ThreadId,
  type UiHistoryEntry,
} from "@croki/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { createAttachmentId, resolveAttachmentPathById } from "../attachmentStore.ts";
import * as ServerConfig from "../config.ts";
import { OrchestrationEngineService } from "../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";

const DEFAULT_LIST_LIMIT = 10;

export class UiHistoryStoreError extends Schema.TaggedErrorClass<UiHistoryStoreError>()(
  "UiHistoryStoreError",
  {
    operation: Schema.Literals([
      "resolve-thread",
      "resolve-project",
      "write-image",
      "persist",
      "read-image",
    ]),
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

export interface UiHistoryImage {
  readonly entry: UiHistoryEntry;
  readonly data: Uint8Array;
}

export interface ProjectUiHistoryImage {
  readonly screen: ApplicationAwarenessCheckedScreen;
  readonly data: Uint8Array;
}

export interface UiHistoryStoreShape {
  readonly record: (
    threadId: ThreadId,
    snapshot: PreviewAutomationSnapshot,
    concept?: PreviewAutomationSnapshotConcept,
  ) => Effect.Effect<UiHistoryEntry, UiHistoryStoreError>;
  readonly list: (
    threadId: ThreadId,
    limit?: number,
  ) => Effect.Effect<
    { readonly entries: readonly UiHistoryEntry[]; readonly truncated: boolean },
    UiHistoryStoreError
  >;
  readonly read: (
    threadId: ThreadId,
    id: string,
  ) => Effect.Effect<UiHistoryImage | null, UiHistoryStoreError>;
  readonly listProject: (
    anchorThreadId: ThreadId,
    limit?: number,
  ) => Effect.Effect<
    { readonly screens: readonly ApplicationAwarenessCheckedScreen[]; readonly truncated: boolean },
    UiHistoryStoreError
  >;
  readonly readProject: (
    anchorThreadId: ThreadId,
    ref: ApplicationScreenReference,
  ) => Effect.Effect<ProjectUiHistoryImage | null, UiHistoryStoreError>;
}

export class UiHistoryStore extends Context.Service<UiHistoryStore, UiHistoryStoreShape>()(
  "croki-server/mcp/UiHistoryStore",
) {}

const decodePayload = Schema.decodeUnknownOption(UiHistoryActivityPayload);

function bounded(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function checkedScreenLabel(entry: UiHistoryEntry): string {
  if (entry.title.trim().length > 0) return entry.title.trim();
  try {
    const url = new URL(entry.url);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return entry.url || "Preview";
  }
}

function entriesFromActivities(
  activities: ReadonlyArray<{ readonly kind: string; readonly payload: unknown }>,
): UiHistoryEntry[] {
  const entries: UiHistoryEntry[] = [];
  const seen = new Set<string>();
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const activity = activities[index];
    if (!activity || activity.kind !== UI_HISTORY_ACTIVITY_KIND) continue;
    const payload = Option.getOrUndefined(decodePayload(activity.payload));
    if (!payload || seen.has(payload.entry.id)) continue;
    seen.add(payload.entry.id);
    entries.push(payload.entry);
  }
  return entries;
}

const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const crypto = yield* Crypto.Crypto;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const engine = yield* OrchestrationEngineService;
  const query = yield* ProjectionSnapshotQuery;

  const resolveThread = (threadId: ThreadId) =>
    query.getThreadDetailById(threadId).pipe(
      Effect.mapError(
        (cause) =>
          new UiHistoryStoreError({
            operation: "resolve-thread",
            message: "UI history could not read this Thread.",
            cause,
          }),
      ),
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              new UiHistoryStoreError({
                operation: "resolve-thread",
                message: "UI history could not find this Thread.",
              }),
            ),
          onSome: Effect.succeed,
        }),
      ),
    );

  const list: UiHistoryStoreShape["list"] = Effect.fn("UiHistoryStore.list")(function* (
    threadId,
    limit = DEFAULT_LIST_LIMIT,
  ) {
    const thread = yield* resolveThread(threadId);
    const entries = entriesFromActivities(thread.activities);
    return {
      entries: entries.slice(0, limit),
      truncated: entries.length > limit,
    };
  });

  const read: UiHistoryStoreShape["read"] = Effect.fn("UiHistoryStore.read")(
    function* (threadId, id) {
      const thread = yield* resolveThread(threadId);
      const entry = entriesFromActivities(thread.activities).find(
        (candidate) => candidate.id === id,
      );
      if (!entry) return null;
      const attachmentPath = resolveAttachmentPathById({
        attachmentsDir: config.attachmentsDir,
        attachmentId: entry.attachmentId,
      });
      if (!attachmentPath) return null;
      const data = yield* fileSystem.readFile(attachmentPath).pipe(
        Effect.mapError(
          (cause) =>
            new UiHistoryStoreError({
              operation: "read-image",
              message: "The checked-screen image could not be read.",
              cause,
            }),
        ),
      );
      return { entry, data };
    },
  );

  const listProject: UiHistoryStoreShape["listProject"] = Effect.fn("UiHistoryStore.listProject")(
    function* (anchorThreadId, limit = DEFAULT_LIST_LIMIT) {
      const anchor = yield* resolveThread(anchorThreadId);
      const projectPerception = yield* (
        query.getProjectPerception?.({ projectId: anchor.projectId, limit: 200 }) ??
        Effect.succeed(Option.none())
      ).pipe(
        Effect.mapError(
          (cause) =>
            new UiHistoryStoreError({
              operation: "resolve-project",
              message: "UI history could not read application screens for this project.",
              cause,
            }),
        ),
      );
      if (Option.isNone(projectPerception)) {
        return { screens: [], truncated: false };
      }
      const screenObjects = projectPerception.value.objects.filter(isCheckedScreenObject);
      const sourceThreadIds = [
        ...new Set(
          screenObjects
            .map((object) => object.source.sourceThreadId)
            .filter((value): value is ThreadId => value !== undefined),
        ),
      ];
      const sourceThreads = yield* Effect.forEach(
        sourceThreadIds,
        (sourceThreadId) =>
          query.getThreadDetailById(sourceThreadId).pipe(
            Effect.map((thread) => [String(sourceThreadId), Option.getOrNull(thread)] as const),
            Effect.mapError(
              (cause) =>
                new UiHistoryStoreError({
                  operation: "resolve-thread",
                  message: "UI history could not resolve a source Thread.",
                  cause,
                }),
            ),
          ),
        { concurrency: 4 },
      );
      const threadById = new Map(sourceThreads);
      const screens = screenObjects
        .map((object) =>
          applicationScreenFromObject(
            object,
            object.source.sourceThreadId
              ? (threadById.get(String(object.source.sourceThreadId)) ?? null)
              : null,
          ),
        )
        .filter((screen): screen is ApplicationAwarenessCheckedScreen => screen !== null)
        .sort((left, right) => right.entry.observedAt.localeCompare(left.entry.observedAt));
      const uniqueScreens = screens.filter(
        (screen, index) =>
          screens.findIndex(
            (candidate) =>
              candidate.ref.sourceThreadId === screen.ref.sourceThreadId &&
              candidate.ref.id === screen.ref.id,
          ) === index,
      );
      return {
        screens: uniqueScreens.slice(0, limit),
        truncated: projectPerception.value.truncated || uniqueScreens.length > limit,
      };
    },
  );

  const readProject: UiHistoryStoreShape["readProject"] = Effect.fn("UiHistoryStore.readProject")(
    function* (anchorThreadId, ref) {
      const result = yield* listProject(anchorThreadId, 200);
      const screen = result.screens.find(
        (candidate) =>
          candidate.ref.sourceThreadId === ref.sourceThreadId && candidate.ref.id === ref.id,
      );
      if (!screen) return null;
      const attachmentPath = resolveAttachmentPathById({
        attachmentsDir: config.attachmentsDir,
        attachmentId: screen.entry.attachmentId,
      });
      if (!attachmentPath) return null;
      const data = yield* fileSystem.readFile(attachmentPath).pipe(
        Effect.mapError(
          (cause) =>
            new UiHistoryStoreError({
              operation: "read-image",
              message: "The application screen image could not be read.",
              cause,
            }),
        ),
      );
      return { screen, data };
    },
  );

  const record: UiHistoryStoreShape["record"] = Effect.fn("UiHistoryStore.record")(
    function* (threadId, snapshot, concept) {
      const thread = yield* resolveThread(threadId);
      const attachmentId = createAttachmentId(String(threadId));
      if (!attachmentId) {
        return yield* new UiHistoryStoreError({
          operation: "write-image",
          message: "UI history could not create a safe image id for this Thread.",
        });
      }

      const uuid = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
      const observedAt = DateTime.formatIso(yield* DateTime.now);
      const filePath = path.join(config.attachmentsDir, `${attachmentId}.png`);
      const image = new Uint8Array(NodeBuffer.Buffer.from(snapshot.screenshot.data, "base64"));
      yield* fileSystem.makeDirectory(config.attachmentsDir, { recursive: true }).pipe(
        Effect.andThen(fileSystem.writeFile(filePath, image)),
        Effect.mapError(
          (cause) =>
            new UiHistoryStoreError({
              operation: "write-image",
              message: "Croki inspected the screen but could not preserve its image.",
              cause,
            }),
        ),
      );

      const entry: UiHistoryEntry = {
        id: `screen-${uuid}`,
        attachmentId,
        url: bounded(snapshot.url, 4_096),
        title: bounded(snapshot.title, 512),
        ...(concept === undefined ? {} : { concept }),
        observedAt,
        width: snapshot.screenshot.width,
        height: snapshot.screenshot.height,
        interactiveElementCount: snapshot.interactiveElements.length,
        consoleErrorCount: snapshot.consoleEntries.filter(
          (consoleEntry) => consoleEntry.level.toLowerCase() === "error",
        ).length,
        networkFailureCount: snapshot.networkEntries.filter((request) => request.failed).length,
        actionCount: snapshot.actionTimeline.length,
      };
      const payload: UiHistoryActivityPayload = {
        version: 1,
        entry,
        frame: {
          kind: "attachment",
          ref: attachmentId,
          mimeType: "image/png",
          width: entry.width,
          height: entry.height,
        },
      };
      yield* engine
        .dispatch({
          type: "thread.activity.append",
          commandId: CommandId.make(`ui-history:${uuid}`),
          threadId,
          activity: {
            id: EventId.make(`ui-history:${uuid}`),
            tone: "info",
            kind: UI_HISTORY_ACTIVITY_KIND,
            summary: `Checked ${checkedScreenLabel(entry)}`,
            payload,
            turnId: thread.latestTurn?.turnId ?? null,
            createdAt: observedAt,
          },
          createdAt: observedAt,
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new UiHistoryStoreError({
                operation: "persist",
                message: "Croki preserved the screen but could not add it to UI history.",
                cause,
              }),
          ),
        );
      return entry;
    },
  );

  return UiHistoryStore.of({ record, list, read, listProject, readProject });
});

export const layer = Layer.effect(UiHistoryStore, make);

export const testingLayer = (service: UiHistoryStoreShape) =>
  Layer.succeed(UiHistoryStore, UiHistoryStore.of(service));

function isCheckedScreenObject(object: CrokiPerceptionObject): boolean {
  if (object.source.kind !== "preview" || !object.data) return false;
  return Option.isSome(decodePayload(object.data));
}

function applicationScreenFromObject(
  object: CrokiPerceptionObject,
  thread: OrchestrationThread | null,
): ApplicationAwarenessCheckedScreen | null {
  if (!object.data || !object.frame || object.source.sourceThreadId === undefined) return null;
  const payload = Option.getOrUndefined(decodePayload(object.data));
  if (!payload) return null;
  const turnId = object.source.turnId;
  const checkpoint =
    turnId === null
      ? undefined
      : thread?.checkpoints.find((candidate) => String(candidate.turnId) === turnId);
  return {
    ref: {
      sourceThreadId: String(object.source.sourceThreadId),
      id: payload.entry.id,
    },
    entry: payload.entry,
    sourceThreadId: String(object.source.sourceThreadId),
    sourceThreadTitle: thread?.title ?? String(object.source.sourceThreadId),
    turnId,
    sourceThreadBranchAtRead: thread?.branch ?? null,
    sourceThreadWorktreeAtRead: thread?.worktreePath ?? null,
    codeRevision: checkpoint
      ? { kind: "checkpoint", ref: String(checkpoint.checkpointRef) }
      : { kind: "unresolved", reason: "no-checkpoint-for-source-turn" },
    frame: object.frame,
  };
}
