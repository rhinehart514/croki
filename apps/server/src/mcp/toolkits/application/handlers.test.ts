import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type CrokiProjectPerceptionSnapshot,
  type OrchestrationProjectShell,
  type OrchestrationThread,
} from "@croki/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as UiHistoryStore from "../../UiHistoryStore.ts";
import { observeApplication } from "./handlers.ts";

const threadId = ThreadId.make("thread-awareness");
const projectId = ProjectId.make("project-awareness");
const invocation = {
  environmentId: EnvironmentId.make("environment-awareness"),
  threadId,
  providerSessionId: "provider-session-awareness",
  providerInstanceId: ProviderInstanceId.make("codex"),
  harnessId: "native" as const,
  capabilities: new Set(["canvas"] as const),
  issuedAt: 1,
};

const thread = {
  id: threadId,
  projectId,
  title: "Assess onboarding",
  branch: "feature/onboarding",
  worktreePath: "/workspace/onboarding",
  checkpoints: [
    {
      turnId: "turn-1",
      checkpointTurnCount: 1,
      checkpointRef: "checkpoint-1",
      status: "ready",
      files: [{ path: "apps/web/Onboarding.tsx", kind: "modified", additions: 12, deletions: 4 }],
      assistantMessageId: null,
      completedAt: "2026-08-05T12:00:00.000Z",
    },
  ],
} as unknown as OrchestrationThread;

const project = {
  id: projectId,
  workspaceRoot: "/croki-awareness-fixture-does-not-exist",
} as unknown as OrchestrationProjectShell;

const projectPerception = {
  revision: 7,
  status: "ready",
  truncated: false,
  objects: [
    {
      id: "review-1",
      type: "review",
      title: "Onboarding review",
      revision: 7,
      source: {
        kind: "review",
        sourceThreadId: threadId,
        turnId: "turn-1",
        observedAt: "2026-08-05T12:00:00.000Z",
      },
      affordances: [],
    },
    {
      id: "runtime-1",
      type: "runtime",
      title: "Runtime receipt",
      revision: 8,
      source: {
        kind: "runtime",
        sourceThreadId: threadId,
        turnId: "turn-1",
        observedAt: "2026-08-05T12:01:00.000Z",
      },
      affordances: [],
    },
  ],
} as unknown as CrokiProjectPerceptionSnapshot;

const TestLayer = Layer.mergeAll(
  Layer.mock(ProjectionSnapshotQuery)({
    getThreadDetailById: () => Effect.succeed(Option.some(thread)),
    getProjectShellById: () => Effect.succeed(Option.some(project)),
    getProjectPerception: () => Effect.succeed(Option.some(projectPerception)),
  }),
  UiHistoryStore.testingLayer({
    record: () => Effect.die("unused"),
    list: () => Effect.succeed({ entries: [], truncated: false }),
    read: () => Effect.succeed(null),
    listProject: () => Effect.succeed({ screens: [], truncated: false }),
    readProject: () => Effect.succeed(null),
  }),
  Layer.succeed(McpInvocationContext.McpInvocationContext, invocation),
  NodeServices.layer,
);

it.effect("keeps absent canon unknown and filters observed evidence by source kind", () =>
  Effect.gen(function* () {
    const result = yield* observeApplication({ sourceKinds: ["review"] });

    expect(result.canonStatus).toBe("absent");
    expect(result.canon).toBeNull();
    expect(result.change).toMatchObject({
      sourceThreadId: String(threadId),
      baselineVersion: null,
      targetVersion: null,
      latestCheckpoint: {
        ref: "checkpoint-1",
        files: [{ path: "apps/web/Onboarding.tsx" }],
      },
    });
    expect(result.projectEvidence.map((evidence) => evidence.id)).toEqual(["review-1"]);
    expect(result.coverage.limitations).toContain(
      "Project-declared application direction is unavailable; do not infer mission from repository activity alone.",
    );
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("requires both qualified references for a before/after comparison", () =>
  observeApplication({ baselineScreen: { sourceThreadId: String(threadId), id: "screen-1" } }).pipe(
    Effect.flip,
    Effect.tap((error) =>
      Effect.sync(() => {
        expect(error.code).toBe("evidence-not-found");
      }),
    ),
    Effect.provide(TestLayer),
  ),
);

it.effect("prioritizes product evidence over newer runtime receipts", () =>
  Effect.gen(function* () {
    const result = yield* observeApplication({ evidenceLimit: 1 });
    expect(result.projectEvidence.map((evidence) => evidence.id)).toEqual(["review-1"]);
    expect(result.coverage.projectEvidenceTruncated).toBe(true);
  }).pipe(Effect.provide(TestLayer)),
);
