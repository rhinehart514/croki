import {
  ApplicationAwarenessError,
  type ApplicationAwarenessCheckedScreen,
  type ApplicationAwarenessEvidence,
  type ApplicationAwarenessInput,
  type ApplicationAwarenessResult,
  type CrokiProjectPerceptionSnapshot,
  type ThreadId,
} from "@croki/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { loadCrokiApplication } from "../../../orchestration/Layers/CrokiApplication.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { UiHistoryStore, type UiHistoryStoreShape } from "../../UiHistoryStore.ts";
import { ApplicationAwarenessToolkit } from "./tools.ts";

const DEFAULT_EVIDENCE_LIMIT = 20;
const DEFAULT_CHECKED_SCREEN_LIMIT = 10;
const PROJECT_EVIDENCE_SCAN_LIMIT = 200;
const EXCLUDED_EVIDENCE_TYPES = new Set(["thread", "turn"]);
const SOURCE_PRIORITY = new Map([
  ["evidence", 0],
  ["preview", 1],
  ["review", 2],
  ["checkpoint", 3],
  ["authority", 4],
  ["canvas", 5],
  ["sense", 6],
  ["agent", 7],
  ["runtime", 8],
]);

export const observeApplication = Effect.fn("ApplicationAwareness.observe")(function* (
  input: ApplicationAwarenessInput,
) {
  const invocation = yield* McpInvocationContext.McpInvocationContext;
  const query = yield* ProjectionSnapshotQuery;
  const thread = yield* query
    .getThreadDetailById(invocation.threadId)
    .pipe(Effect.mapError(() => failure("thread-not-found", "Could not resolve this Thread.")));
  if (Option.isNone(thread)) {
    return yield* failure("thread-not-found", "Could not resolve this Thread.");
  }
  const project = yield* query
    .getProjectShellById(thread.value.projectId)
    .pipe(Effect.mapError(() => failure("project-not-found", "Could not resolve this project.")));
  if (Option.isNone(project)) {
    return yield* failure("project-not-found", "Could not resolve this project.");
  }

  const application = yield* loadCrokiApplication(project.value.workspaceRoot);
  const checkedScreenLimit = input.checkedScreenLimit ?? DEFAULT_CHECKED_SCREEN_LIMIT;
  const uiHistory = yield* UiHistoryStore;
  const history = yield* uiHistory.listProject(invocation.threadId, checkedScreenLimit).pipe(
    Effect.match({
      onFailure: () => ({ screens: [], truncated: false, unavailable: true as const }),
      onSuccess: (result) => ({ ...result, unavailable: false as const }),
    }),
  );
  const projectPerception = yield* (
    query.getProjectPerception?.({
      projectId: thread.value.projectId,
      limit: PROJECT_EVIDENCE_SCAN_LIMIT,
    }) ?? Effect.succeed(Option.none<CrokiProjectPerceptionSnapshot>())
  ).pipe(
    Effect.match({
      onFailure: () => Option.none<CrokiProjectPerceptionSnapshot>(),
      onSuccess: (result) => result,
    }),
  );

  const evidenceLimit = input.evidenceLimit ?? DEFAULT_EVIDENCE_LIMIT;
  const snapshot = Option.getOrNull(projectPerception);
  const sourceKinds = input.sourceKinds ? new Set(input.sourceKinds) : null;
  const candidates = (snapshot?.objects ?? [])
    .filter(
      (object) =>
        !EXCLUDED_EVIDENCE_TYPES.has(object.type) &&
        (sourceKinds === null || sourceKinds.has(object.source.kind)),
    )
    .sort((left, right) => {
      const priorityDelta = sourcePriority(left.source.kind) - sourcePriority(right.source.kind);
      return priorityDelta === 0 ? right.revision - left.revision : priorityDelta;
    });
  const projectEvidence = candidates.slice(0, evidenceLimit).map(toEvidence);
  const projectEvidenceStatus = snapshot?.status ?? "unavailable";
  const projectEvidenceTruncated = Boolean(
    snapshot?.truncated || candidates.length > projectEvidence.length,
  );
  const limitations = buildLimitations({
    canonStatus: application.status,
    checkedScreenCount: history.screens.length,
    checkedScreensUnavailable: history.unavailable,
    projectEvidenceStatus,
    projectEvidenceTruncated,
  });
  const comparison = yield* resolveComparison(uiHistory, invocation.threadId, input);
  const latestCheckpoint = [...thread.value.checkpoints].sort((left, right) =>
    right.completedAt.localeCompare(left.completedAt),
  )[0];
  const released = application.status === "loaded" ? application.application?.released : undefined;
  const building = application.status === "loaded" ? application.application?.building : undefined;

  return {
    version: 1,
    threadId: String(thread.value.id),
    projectId: String(thread.value.projectId),
    generatedAt: DateTime.formatIso(yield* DateTime.now),
    canonStatus: application.status,
    canon:
      application.status === "loaded" && application.application && application.sha256
        ? {
            authority: "project-declared",
            approval: "unverified",
            path: application.sourcePath ?? ".croki/application.croki",
            sha256: application.sha256,
            name: application.application.application.name,
            released: application.application.released ?? null,
            building: application.application.building ?? null,
          }
        : null,
    change: {
      scope: "invoking-thread",
      sourceThreadId: String(thread.value.id),
      branch: thread.value.branch,
      worktreePath: thread.value.worktreePath,
      baselineVersion: released?.version ?? null,
      targetVersion: building?.version ?? null,
      declaredIntent: building?.intent ?? null,
      declaredProductChanges: building?.product ?? [],
      declaredMarketChanges: building?.gtm ?? [],
      declaredSuccessSignals: building?.successSignals ?? [],
      latestCheckpoint: latestCheckpoint
        ? {
            ref: String(latestCheckpoint.checkpointRef),
            completedAt: latestCheckpoint.completedAt,
            files: latestCheckpoint.files,
          }
        : null,
    },
    checkedScreens: history.screens,
    experienceComparison: comparison,
    projectEvidence,
    evidenceRevision: snapshot?.revision ?? 0,
    coverage: {
      projectEvidenceStatus,
      projectEvidenceTruncated,
      checkedScreensTruncated: history.truncated,
      checkedScreenScope: "project",
      limitations,
    },
  } satisfies ApplicationAwarenessResult;
});

function resolveComparison(
  history: UiHistoryStoreShape,
  threadId: ThreadId,
  input: ApplicationAwarenessInput,
) {
  if (!input.baselineScreen && !input.targetScreen) return Effect.succeed(null);
  if (!input.baselineScreen || !input.targetScreen) {
    return Effect.fail(
      failure(
        "evidence-not-found",
        "A screen comparison requires both a baselineScreen and targetScreen reference.",
      ),
    );
  }
  return Effect.all({
    baseline: history.readProject(threadId, input.baselineScreen),
    target: history.readProject(threadId, input.targetScreen),
  }).pipe(
    Effect.mapError(() => failure("observation-failed", "Could not reopen checked screens.")),
    Effect.flatMap(({ baseline, target }) => {
      if (!baseline || !target) {
        return Effect.fail(
          failure(
            "evidence-not-found",
            "A referenced checked screen is absent from this project or no longer available.",
          ),
        );
      }
      return Effect.succeed(compareScreens(baseline.screen, target.screen));
    }),
  );
}

function compareScreens(
  baseline: ApplicationAwarenessCheckedScreen,
  target: ApplicationAwarenessCheckedScreen,
): NonNullable<ApplicationAwarenessResult["experienceComparison"]> {
  return {
    baseline,
    target,
    sameUrl: baseline.entry.url === target.entry.url,
    widthDelta: target.entry.width - baseline.entry.width,
    heightDelta: target.entry.height - baseline.entry.height,
    interactiveElementCountDelta:
      target.entry.interactiveElementCount - baseline.entry.interactiveElementCount,
    consoleErrorCountDelta: target.entry.consoleErrorCount - baseline.entry.consoleErrorCount,
    networkFailureCountDelta: target.entry.networkFailureCount - baseline.entry.networkFailureCount,
    actionCountDelta: target.entry.actionCount - baseline.entry.actionCount,
  };
}

function toEvidence(
  object: CrokiProjectPerceptionSnapshot["objects"][number],
): ApplicationAwarenessEvidence {
  return {
    authority: "observed",
    id: object.id,
    type: object.type,
    title: bounded(object.title),
    ...(object.summary ? { summary: bounded(object.summary) } : {}),
    ...(object.state ? { state: bounded(object.state) } : {}),
    source: object.source,
    ...(object.frame ? { frame: object.frame } : {}),
  };
}

function buildLimitations(input: {
  readonly canonStatus: ApplicationAwarenessResult["canonStatus"];
  readonly checkedScreenCount: number;
  readonly checkedScreensUnavailable: boolean;
  readonly projectEvidenceStatus: ApplicationAwarenessResult["coverage"]["projectEvidenceStatus"];
  readonly projectEvidenceTruncated: boolean;
}): readonly string[] {
  const limitations: string[] = [
    "Checked screens prove only states a model explicitly inspected; they do not establish complete user flows.",
    "Customer and production behavior are absent unless a source activity explicitly observed them.",
  ];
  if (input.canonStatus !== "loaded") {
    limitations.push(
      "Project-declared application direction is unavailable; do not infer mission from repository activity alone.",
    );
  }
  if (input.checkedScreensUnavailable) {
    limitations.push("Checked-screen history could not be read for this project.");
  } else if (input.checkedScreenCount === 0) {
    limitations.push("No checked screens exist in this project.");
  }
  if (input.projectEvidenceStatus === "unavailable") {
    limitations.push("Project evidence could not be loaded.");
  } else if (input.projectEvidenceStatus !== "ready") {
    limitations.push(`Project evidence is ${input.projectEvidenceStatus}; verify current sources.`);
  }
  if (input.projectEvidenceTruncated) {
    limitations.push(
      "Project evidence was bounded; inspect relevant source objects before concluding.",
    );
  }
  return limitations;
}

function bounded(value: string): string {
  return value.length <= 4_096 ? value : value.slice(0, 4_096);
}

function sourcePriority(kind: string): number {
  return SOURCE_PRIORITY.get(kind) ?? 7;
}

function failure(
  code: ApplicationAwarenessError["code"],
  message: string,
): ApplicationAwarenessError {
  return new ApplicationAwarenessError({ code, message });
}

export const ApplicationAwarenessToolkitHandlersLive = ApplicationAwarenessToolkit.toLayer({
  application_observe: observeApplication,
});
