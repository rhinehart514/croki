// @effect-diagnostics nodeBuiltinImport:off
/**
 * Read-only access to persisted workflow scripts for the Agents surface's
 * "{} script" affordance.
 *
 * Containment rules (lifted from the reviewed #3650 inspection service):
 * - the resolved realpath must live under the originating thread's Claude
 *   instance config directory (where the Claude harness persists workflow
 *   scripts) — realpath re-containment defeats symlink escapes, including a
 *   symlinked leaf file;
 * - only .js leaf files are served;
 * - reads are size-capped rather than failed, with a truncation marker.
 *
 * The client-supplied path is a hint from the workflow's runHandles; it is
 * never trusted beyond these checks.
 */
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import {
  ClaudeSettings,
  OrchestrationGetWorkflowScriptError,
  type ProjectId,
  ProviderDriverKind,
  type ProviderInstanceConfig,
  type ProviderInstanceId,
  type ServerSettings,
  type ServerSettingsError,
  type ThreadId,
} from "@croki/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { expandHomePath } from "../pathExpansion.ts";
import type { ProjectionRepositoryError } from "../persistence/Errors.ts";

const SCRIPT_BYTE_CAP = 256 * 1024;

interface WorkflowScriptThreadContext {
  readonly projectId: ProjectId;
  readonly worktreePath: string | null;
  readonly modelSelection: { readonly instanceId: ProviderInstanceId };
  readonly session: { readonly providerInstanceId?: ProviderInstanceId | undefined } | null;
}

interface WorkflowScriptProjectContext {
  readonly workspaceRoot: string;
}

export interface WorkflowScriptLookup {
  readonly getThread: (
    threadId: ThreadId,
  ) => Effect.Effect<Option.Option<WorkflowScriptThreadContext>, ProjectionRepositoryError>;
  readonly getProject: (
    projectId: ProjectId,
  ) => Effect.Effect<Option.Option<WorkflowScriptProjectContext>, ProjectionRepositoryError>;
  readonly getSettings: Effect.Effect<ServerSettings, ServerSettingsError>;
}

function rootUnavailable(scriptPath: string, cause: unknown): OrchestrationGetWorkflowScriptError {
  return new OrchestrationGetWorkflowScriptError({
    reason: "root-unavailable",
    scriptPath,
    cause,
  });
}

function instanceEnvironmentValue(
  environment: ProviderInstanceConfig["environment"],
  name: string,
): string | undefined {
  let value: string | undefined;
  for (const variable of environment ?? []) {
    if (variable.name === name) value = variable.value;
  }
  return value;
}

function providerInstanceSettings(
  settings: ServerSettings,
  instanceId: ProviderInstanceId,
): ProviderInstanceConfig | undefined {
  const explicit = settings.providerInstances[instanceId];
  if (explicit !== undefined) return explicit;

  // The provider registry synthesizes canonical built-in instances from the
  // legacy settings bucket. Mirror that one compatibility case here so old
  // settings files still resolve the same Claude instance home.
  return instanceId === "claudeAgent"
    ? {
        driver: ProviderDriverKind.make("claudeAgent"),
        config: settings.providers.claudeAgent,
      }
    : undefined;
}

const resolveWorkflowScriptsRoot = Effect.fn("orchestration.resolveWorkflowScriptsRoot")(function* (
  input: { readonly threadId: ThreadId; readonly scriptPath: string },
  lookup: WorkflowScriptLookup,
) {
  const thread = yield* lookup.getThread(input.threadId).pipe(
    Effect.map(Option.getOrUndefined),
    Effect.mapError((cause) => rootUnavailable(input.scriptPath, cause)),
  );
  if (thread === undefined) {
    return yield* rootUnavailable(
      input.scriptPath,
      new Error(`Thread ${input.threadId} was not found`),
    );
  }

  const instanceId = thread.session?.providerInstanceId ?? thread.modelSelection.instanceId;
  const settings = yield* lookup.getSettings.pipe(
    Effect.mapError((cause) => rootUnavailable(input.scriptPath, cause)),
  );
  const instance = providerInstanceSettings(settings, instanceId);
  if (instance === undefined || instance.driver !== "claudeAgent") {
    return yield* rootUnavailable(
      input.scriptPath,
      new Error(`Claude provider instance ${instanceId} was not found`),
    );
  }

  const config = yield* Schema.decodeUnknownEffect(ClaudeSettings)(instance.config ?? {}).pipe(
    Effect.mapError((cause) => rootUnavailable(input.scriptPath, cause)),
  );
  const configuredHome = config.homePath.trim();
  if (configuredHome.length > 0) {
    return NodePath.join(NodePath.resolve(expandHomePath(configuredHome)), "projects");
  }

  // This matches the environment passed to the Claude process: instance
  // variables override the server environment when homePath is unset.
  const environmentConfigDir = (
    instanceEnvironmentValue(instance.environment, "CLAUDE_CONFIG_DIR") ??
    process.env.CLAUDE_CONFIG_DIR ??
    ""
  ).trim();
  if (environmentConfigDir.length === 0) {
    return NodePath.join(NodeOS.homedir(), ".claude", "projects");
  }
  if (NodePath.isAbsolute(environmentConfigDir)) {
    return NodePath.join(NodePath.resolve(environmentConfigDir), "projects");
  }

  // Relative environment values are resolved by Claude against its session
  // cwd, which is the thread worktree when present and the project root
  // otherwise.
  let cwd = thread.worktreePath;
  if (cwd === null) {
    const project = yield* lookup.getProject(thread.projectId).pipe(
      Effect.map(Option.getOrUndefined),
      Effect.mapError((cause) => rootUnavailable(input.scriptPath, cause)),
    );
    if (project === undefined) {
      return yield* rootUnavailable(
        input.scriptPath,
        new Error(`Project ${thread.projectId} was not found`),
      );
    }
    cwd = project.workspaceRoot;
  }
  return NodePath.join(NodePath.resolve(cwd, environmentConfigDir), "projects");
});

export const readWorkflowScript = Effect.fn("orchestration.readWorkflowScript")(function* (
  input: { readonly threadId: ThreadId; readonly scriptPath: string },
  lookup: WorkflowScriptLookup,
) {
  const requested = input.scriptPath;

  if (!NodePath.isAbsolute(requested) || NodePath.extname(requested) !== ".js") {
    return yield* new OrchestrationGetWorkflowScriptError({
      reason: "invalid-path",
      scriptPath: requested,
    });
  }

  const scriptsRoot = yield* resolveWorkflowScriptsRoot(input, lookup);
  const root = yield* Effect.tryPromise({
    try: () => NodeFSP.realpath(scriptsRoot),
    catch: (cause) =>
      new OrchestrationGetWorkflowScriptError({
        reason: "root-unavailable",
        scriptPath: requested,
        cause,
      }),
  });

  // Realpath the FILE itself (not just its directory): a symlink named
  // like a script inside a contained directory must not escape.
  const resolved = yield* Effect.tryPromise({
    try: () => NodeFSP.realpath(requested),
    catch: (cause) =>
      new OrchestrationGetWorkflowScriptError({
        reason: "not-found",
        scriptPath: requested,
        cause,
      }),
  });

  if (resolved !== root && !resolved.startsWith(`${root}${NodePath.sep}`)) {
    return yield* new OrchestrationGetWorkflowScriptError({
      reason: "outside-root",
      scriptPath: resolved,
    });
  }
  if (NodePath.extname(resolved) !== ".js") {
    return yield* new OrchestrationGetWorkflowScriptError({
      reason: "not-js",
      scriptPath: resolved,
    });
  }

  // TOCTOU-safe read (review finding): open FIRST, then verify what was
  // actually opened via the file descriptor. Re-checking the path after
  // open would race against a swap; fstat on the handle cannot. The two
  // containment checks fail with their own tagged reasons (not manufactured
  // Errors folded into read-failed); "read-failed" is reserved for genuine
  // platform failures with the real cause attached.
  const read = yield* Effect.tryPromise({
    try: async () => {
      const handle = await NodeFSP.open(resolved, "r");
      try {
        const stat = await handle.stat();
        if (!stat.isFile()) {
          return { failure: "not-regular-file" as const };
        }
        // The opened inode must be the same one realpath resolved to: a
        // process swapping the path between realpath and open changes the
        // inode, which this comparison catches.
        const pathStat = await NodeFSP.lstat(resolved);
        if (stat.ino !== pathStat.ino || stat.dev !== pathStat.dev) {
          return { failure: "changed-during-read" as const };
        }
        const truncated = stat.size > SCRIPT_BYTE_CAP;
        const buffer = Buffer.alloc(Math.min(stat.size, SCRIPT_BYTE_CAP));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        return {
          contents: buffer.subarray(0, bytesRead).toString("utf8"),
          truncated,
        };
      } finally {
        await handle.close();
      }
    },
    catch: (cause) =>
      new OrchestrationGetWorkflowScriptError({
        reason: "read-failed",
        scriptPath: resolved,
        cause,
      }),
  });
  if ("failure" in read) {
    return yield* new OrchestrationGetWorkflowScriptError({
      reason: read.failure,
      scriptPath: resolved,
    });
  }

  return {
    scriptPath: resolved,
    contents: read.contents,
    truncated: read.truncated,
  };
});
