import {
  type AuthEnvironmentScope,
  type AuthSessionId,
  type ClientOrchestrationCommand,
  EnvironmentAuthorizationError,
  type OrchestrationProjectShell,
  type OrchestrationShellSnapshot,
  type OrchestrationShellStreamEvent,
  type OrchestrationThreadShell,
  type ProjectId,
  type ProjectMembership,
  type ProjectMembershipRole,
  type ThreadId,
} from "@croki/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import type * as ProjectAccessService from "../identity/ProjectAccessService.ts";
import type * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";

/**
 * The server is the authority for the relationship between a Person and a
 * Project resource.  RPC payloads still carry the IDs/paths needed to select a
 * resource, but callers must pass them through this boundary before invoking a
 * resource service.
 *
 * This module intentionally has no Effect Layer.  A websocket connection owns
 * the authenticated session and supplies the already-live identity and
 * projection services, which keeps the guard easy to compose around both
 * unary and streaming handlers without introducing a second authorization
 * context.
 */
export interface ResourceAuthorizationDependencies {
  readonly sessionId: AuthSessionId;
  readonly projectAccess: Pick<
    ProjectAccessService.ProjectAccessService["Service"],
    "authorizeProject" | "ensureProjectOwner"
  >;
  readonly projection: Pick<
    ProjectionSnapshotQuery.ProjectionSnapshotQueryShape,
    "getShellSnapshot" | "getProjectShellById" | "getThreadShellById"
  >;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  /**
   * Legacy environment sessions predate durable Person binding.  They remain
   * usable for the single-user environment API, but never receive a positive
   * multiplayer authorization result.  Production clients bind before using
   * Project-scoped resources.
   */
  readonly enforceMembership?: boolean;
}

export type ResourceAuthorization = ReturnType<typeof make>;

export const isPathWithin = (candidate: string, root: string, separator = "/"): boolean => {
  const normalizedRoot = root.endsWith(separator) ? root.slice(0, -separator.length) : root;
  return candidate === normalizedRoot || candidate.startsWith(`${normalizedRoot}${separator}`);
};

const errorMessage = (cause: unknown): string => {
  if (typeof cause === "object" && cause !== null && "message" in cause) {
    const message = (cause as { readonly message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Project resource authorization failed.";
};

const deny = (requiredScope: AuthEnvironmentScope, message: string) =>
  new EnvironmentAuthorizationError({
    requiredScope,
    message,
  });

const canonicalPath = (fileSystem: FileSystem.FileSystem, path: Path.Path, value: string) =>
  fileSystem.realPath(value).pipe(Effect.orElseSucceed(() => path.resolve(value)));

const projectRootCandidates = (
  snapshot: OrchestrationShellSnapshot,
  path: Path.Path,
): ReadonlyArray<{ readonly projectId: ProjectId; readonly root: string }> => {
  const candidates: Array<{ readonly projectId: ProjectId; readonly root: string }> = [];

  for (const project of snapshot.projects) {
    candidates.push({
      projectId: project.id,
      root: path.resolve(project.workspaceRoot),
    });
  }

  // A worktree is a server-derived resource of its parent Project.  Include
  // it so a path-based Git/terminal/file request cannot escape the Project just
  // because the worktree lives outside the primary workspace root.
  for (const thread of snapshot.threads) {
    if (thread.worktreePath === null) continue;
    candidates.push({
      projectId: thread.projectId,
      root: path.resolve(thread.worktreePath),
    });
  }

  // Prefer the most-specific root when Projects or worktrees are nested.
  return candidates.toSorted((left, right) => right.root.length - left.root.length);
};

const projectForPath = Effect.fn("ResourceAuthorization.projectForPath")(function* (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  projection: ResourceAuthorizationDependencies["projection"],
  value: string,
  requiredScope: AuthEnvironmentScope,
) {
  const snapshot = yield* projection
    .getShellSnapshot()
    .pipe(
      Effect.mapError(() => deny(requiredScope, "The Project resource could not be resolved.")),
    );
  const candidatePath = yield* canonicalPath(fileSystem, path, value);
  const candidate = projectRootCandidates(snapshot, path).find(({ root }) =>
    isPathWithin(candidatePath, root, path.sep),
  );
  if (candidate === undefined) {
    return yield* deny(
      requiredScope,
      "The requested path is not inside an authorized Project workspace or worktree.",
    );
  }
  return candidate.projectId;
});

const threadProject = Effect.fn("ResourceAuthorization.threadProject")(function* (
  projection: ResourceAuthorizationDependencies["projection"],
  threadId: ThreadId,
  requiredScope: AuthEnvironmentScope,
) {
  const thread = yield* projection
    .getThreadShellById(threadId)
    .pipe(
      Effect.mapError(() =>
        deny(requiredScope, "The requested Thread resource could not be resolved."),
      ),
    );
  if (Option.isNone(thread)) {
    return yield* deny(requiredScope, "The requested Thread resource could not be resolved.");
  }
  return thread.value;
});

const projectExists = Effect.fn("ResourceAuthorization.projectExists")(function* (
  projection: ResourceAuthorizationDependencies["projection"],
  projectId: ProjectId,
  requiredScope: AuthEnvironmentScope,
) {
  const project = yield* projection
    .getProjectShellById(projectId)
    .pipe(
      Effect.mapError(() =>
        deny(requiredScope, "The requested Project resource could not be resolved."),
      ),
    );
  if (Option.isNone(project)) {
    return yield* deny(requiredScope, "The requested Project resource could not be resolved.");
  }
  return project.value;
});

const shellProjectId = (event: OrchestrationShellStreamEvent): ProjectId | undefined => {
  switch (event.kind) {
    case "project-upserted":
      return event.project.id;
    case "project-removed":
      return event.projectId;
    case "thread-upserted":
      return event.thread.projectId;
    case "thread-removed":
      return undefined;
  }
};

export const make = (dependencies: ResourceAuthorizationDependencies) => {
  const enforceMembership = dependencies.enforceMembership !== false;

  const authorizeProject = (
    projectId: ProjectId,
    requiredScope: AuthEnvironmentScope,
    requiredRole: ProjectMembershipRole = "member",
  ): Effect.Effect<ProjectMembership, EnvironmentAuthorizationError> => {
    if (!enforceMembership) {
      // Legacy sessions are deliberately not granted a membership result.  A
      // caller that chooses compatibility mode should only use this to leave
      // existing single-user RPCs operational; Project-scoped callers still
      // need a concrete resource resolution before invoking the service.
      return Effect.fail(deny(requiredScope, "A durable Project membership is required."));
    }

    return projectExists(dependencies.projection, projectId, requiredScope).pipe(
      Effect.flatMap(() =>
        dependencies.projectAccess
          .authorizeProject(dependencies.sessionId, projectId, requiredRole)
          .pipe(
            Effect.mapError((cause) =>
              deny(requiredScope, `Project authorization denied: ${errorMessage(cause)}`),
            ),
          ),
      ),
    );
  };

  const authorizeThread = (
    threadId: ThreadId,
    requiredScope: AuthEnvironmentScope,
    requiredRole: ProjectMembershipRole = "member",
  ): Effect.Effect<OrchestrationThreadShell, EnvironmentAuthorizationError> =>
    threadProject(dependencies.projection, threadId, requiredScope).pipe(
      Effect.tap((thread) => authorizeProject(thread.projectId, requiredScope, requiredRole)),
    );

  const authorizeWorkspace = (
    cwd: string,
    requiredScope: AuthEnvironmentScope,
    requiredRole: ProjectMembershipRole = "member",
  ): Effect.Effect<ProjectId, EnvironmentAuthorizationError> =>
    projectForPath(
      dependencies.fileSystem,
      dependencies.path,
      dependencies.projection,
      cwd,
      requiredScope,
    ).pipe(Effect.tap((projectId) => authorizeProject(projectId, requiredScope, requiredRole)));

  const authorizeCommand = (
    command: ClientOrchestrationCommand,
    requiredScope: AuthEnvironmentScope,
  ): Effect.Effect<void, EnvironmentAuthorizationError> => {
    switch (command.type) {
      case "project.create":
        if (!enforceMembership) {
          return Effect.void;
        }
        return dependencies.projectAccess
          .ensureProjectOwner(dependencies.sessionId, command.projectId)
          .pipe(
            Effect.asVoid,
            Effect.mapError((cause) =>
              deny(
                requiredScope,
                `Project ownership could not be established: ${errorMessage(cause)}`,
              ),
            ),
          );
      case "project.meta.update":
      case "project.delete":
        return authorizeProject(command.projectId, requiredScope, "owner").pipe(Effect.asVoid);
      case "thread.create":
        return authorizeProject(command.projectId, requiredScope).pipe(Effect.asVoid);
      case "thread.fork":
        return authorizeThread(command.sourceThreadId, requiredScope).pipe(Effect.asVoid);
      case "thread.turn.start":
        if (command.bootstrap?.createThread) {
          return authorizeProject(command.bootstrap.createThread.projectId, requiredScope).pipe(
            Effect.asVoid,
          );
        }
        return authorizeThread(command.threadId, requiredScope).pipe(Effect.asVoid);
      default:
        return authorizeThread(command.threadId, requiredScope).pipe(Effect.asVoid);
    }
  };

  const filterShellSnapshot = (
    snapshot: OrchestrationShellSnapshot,
    requiredScope: AuthEnvironmentScope,
  ): Effect.Effect<OrchestrationShellSnapshot, never> =>
    Effect.gen(function* () {
      if (!enforceMembership) return snapshot;
      const visibleProjects = yield* Effect.forEach(snapshot.projects, (project) =>
        authorizeProject(project.id, requiredScope).pipe(
          Effect.as(project),
          Effect.orElseSucceed(() => null),
        ),
      );
      const projectIds = new Set(
        visibleProjects.flatMap((project) => (project === null ? [] : [project.id])),
      );
      return {
        ...snapshot,
        projects: visibleProjects.flatMap((project) => (project === null ? [] : [project])),
        threads: snapshot.threads.filter((thread) => projectIds.has(thread.projectId)),
      };
    });

  const filterShellEvent = (
    event: OrchestrationShellStreamEvent,
    requiredScope: AuthEnvironmentScope,
  ): Effect.Effect<Option.Option<OrchestrationShellStreamEvent>, never> => {
    if (!enforceMembership) return Effect.succeed(Option.some(event));
    const projectId = shellProjectId(event);
    if (projectId === undefined) {
      // A thread removal has no project ID in the wire event.  Resolve the
      // current Thread if it still exists; if it was deleted, omitting the
      // removal is safer than leaking a cross-Project identifier.
      if (event.kind !== "thread-removed") return Effect.succeed(Option.none());
      return threadProject(dependencies.projection, event.threadId, requiredScope).pipe(
        Effect.flatMap((thread) =>
          authorizeProject(thread.projectId, requiredScope).pipe(
            Effect.as(Option.some(event)),
            Effect.orElseSucceed(() => Option.none()),
          ),
        ),
        Effect.orElseSucceed(() => Option.none()),
      );
    }
    return authorizeProject(projectId, requiredScope).pipe(
      Effect.as(Option.some(event)),
      Effect.orElseSucceed(() => Option.none()),
    );
  };

  return {
    authorizeProject,
    authorizeThread,
    authorizeWorkspace,
    authorizeCommand,
    filterShellSnapshot,
    filterShellEvent,
  };
};
