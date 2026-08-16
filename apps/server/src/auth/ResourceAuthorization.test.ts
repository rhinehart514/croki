import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  AuthSessionId,
  PersonId,
  ProjectId,
  type ProjectMembership,
  ProjectMembershipError,
  ThreadId,
  type OrchestrationProjectShell,
  type OrchestrationShellSnapshot,
  type OrchestrationThreadShell,
} from "@croki/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as ResourceAuthorization from "./ResourceAuthorization.ts";

const sessionId = AuthSessionId.make("session-member");
const personId = PersonId.make("person-member");
const projectA = ProjectId.make("project-a");
const projectB = ProjectId.make("project-b");
const threadA = ThreadId.make("thread-a");
const threadB = ThreadId.make("thread-b");

const project = (id: ProjectId, workspaceRoot: string): OrchestrationProjectShell =>
  ({ id, workspaceRoot }) as OrchestrationProjectShell;

const thread = (id: ThreadId, projectId: ProjectId): OrchestrationThreadShell =>
  ({ id, projectId, worktreePath: null }) as OrchestrationThreadShell;

const membership = (projectId: ProjectId, role: "member" | "owner"): ProjectMembership => ({
  projectId,
  personId,
  role,
  createdAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-16T00:00:00.000Z",
  removedAt: null,
});

const makeAuthorization = Effect.gen(function* () {
  const path = yield* Path.Path;
  const fileSystem = yield* FileSystem.FileSystem;
  const projectShellA = project(projectA, "/tmp/croki-project-a");
  const projectShellB = project(projectB, "/tmp/croki-project-b");
  const threadShellA = thread(threadA, projectA);
  const threadShellB = thread(threadB, projectB);
  const snapshot = {
    snapshotSequence: 1,
    projects: [projectShellA, projectShellB],
    threads: [threadShellA, threadShellB],
    updatedAt: "2026-08-16T00:00:00.000Z",
  } satisfies OrchestrationShellSnapshot;

  return {
    authorization: ResourceAuthorization.make({
      sessionId,
      projectAccess: {
        authorizeProject: (_session, requestedProject, requiredRole = "member") =>
          requestedProject === projectA
            ? Effect.succeed(membership(projectA, requiredRole))
            : Effect.fail(
                new ProjectMembershipError({
                  reason: requiredRole === "owner" ? "owner_required" : "not_a_member",
                  message: "not a member",
                }),
              ),
        ensureProjectOwner: (_session, requestedProject) =>
          requestedProject === projectA
            ? Effect.succeed(membership(projectA, "owner"))
            : Effect.fail(
                new ProjectMembershipError({
                  reason: "owner_required",
                  message: "not an owner",
                }),
              ),
      },
      projection: {
        getShellSnapshot: () => Effect.succeed(snapshot),
        getProjectShellById: (requestedProject) =>
          Effect.succeed(
            requestedProject === projectA
              ? Option.some(projectShellA)
              : requestedProject === projectB
                ? Option.some(projectShellB)
                : Option.none(),
          ),
        getThreadShellById: (requestedThread) =>
          Effect.succeed(
            requestedThread === threadA
              ? Option.some(threadShellA)
              : requestedThread === threadB
                ? Option.some(threadShellB)
                : Option.none(),
          ),
      },
      fileSystem,
      path,
    }),
    snapshot,
  };
});

it("keeps path boundaries exact", () => {
  expect(ResourceAuthorization.isPathWithin("/workspace/project/src", "/workspace/project")).toBe(
    true,
  );
  expect(ResourceAuthorization.isPathWithin("/workspace/project-other", "/workspace/project")).toBe(
    false,
  );
});

it.layer(NodeServices.layer)("ResourceAuthorization", (it) => {
  it.effect("allows members to read every Thread in their Project", () =>
    Effect.gen(function* () {
      const { authorization } = yield* makeAuthorization;
      const authorized = yield* authorization.authorizeThread(threadA, "orchestration:read");
      expect(authorized.id).toBe(threadA);
    }),
  );

  it.effect("denies a cross-Project Thread while allowing owner consequences", () =>
    Effect.gen(function* () {
      const { authorization } = yield* makeAuthorization;
      const denied = yield* Effect.flip(
        authorization.authorizeThread(threadB, "terminal:operate", "owner"),
      );
      expect(denied.requiredScope).toBe("terminal:operate");

      const owner = yield* authorization.authorizeProject(
        projectA,
        "orchestration:operate",
        "owner",
      );
      expect(owner.role).toBe("owner");
    }),
  );

  it.effect("filters shell state to active Project membership", () =>
    Effect.gen(function* () {
      const { authorization, snapshot: shellSnapshot } = yield* makeAuthorization;
      const snapshot = yield* authorization.filterShellSnapshot(
        shellSnapshot,
        "orchestration:read",
      );
      expect(snapshot.projects.map((project) => project.id)).toEqual([projectA]);
      expect(snapshot.threads.map((thread) => thread.id)).toEqual([threadA]);
    }),
  );
});
