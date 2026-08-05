// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { VcsProcessExitError, type CheckpointRef, type VcsError } from "@croki/contracts";
import * as Effect from "effect/Effect";
import * as Semaphore from "effect/Semaphore";

import type { VcsCheckpointOps } from "../vcs/VcsDriver.ts";
import type { VcsProcess } from "../vcs/VcsProcess.ts";

const CHECKPOINT_DIFF_MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

function workspaceKey(cwd: string): string {
  let canonicalPath = NodePath.resolve(cwd);
  try {
    canonicalPath = NodeFS.realpathSync(canonicalPath);
  } catch {
    // The process call will return the useful typed error if the workspace vanished.
  }
  return NodeCrypto.createHash("sha256").update(canonicalPath).digest("hex");
}

function filesystemError(operation: string, cwd: string, detail: string): VcsProcessExitError {
  return new VcsProcessExitError({
    operation,
    command: "git",
    cwd,
    exitCode: 1,
    detail,
  });
}

export interface ManagedWorkspaceCheckpointsOptions {
  readonly stateDir: string;
  readonly process: VcsProcess["Service"];
}

/**
 * Creates an external Git object store for folders that are not repositories.
 * The workspace receives no metadata or behavioral configuration; Croki keeps
 * recovery state in its own application data and uses it only for turn evidence.
 */
export const makeManagedWorkspaceCheckpoints = Effect.fn("ManagedWorkspaceCheckpoints.make")(
  function* (options: ManagedWorkspaceCheckpointsOptions) {
    const operationLock = yield* Semaphore.make(1);
    const rootDirectory = NodePath.join(options.stateDir, "workspace-checkpoints");

    const runExclusive = <A>(effect: Effect.Effect<A, VcsError>) =>
      operationLock.withPermits(1)(effect);

    const resolveRepository = Effect.fn("ManagedWorkspaceCheckpoints.resolveRepository")(function* (
      cwd: string,
    ) {
      const repositoryPath = NodePath.join(rootDirectory, `${workspaceKey(cwd)}.git`);
      if (!NodeFS.existsSync(NodePath.join(repositoryPath, "HEAD"))) {
        yield* Effect.try({
          try: () => NodeFS.mkdirSync(rootDirectory, { recursive: true }),
          catch: (cause) =>
            filesystemError(
              "ManagedWorkspaceCheckpoints.initialize",
              cwd,
              `Unable to create Croki checkpoint storage: ${String(cause)}`,
            ),
        });
        yield* options.process.run({
          operation: "ManagedWorkspaceCheckpoints.initialize",
          command: "git",
          cwd,
          args: ["init", "--bare", repositoryPath],
          timeoutMs: 10_000,
        });
      }
      return repositoryPath;
    });

    const withRepository = <A>(
      cwd: string,
      use: (input: {
        readonly repositoryPath: string;
        readonly env: NodeJS.ProcessEnv;
      }) => Effect.Effect<A, VcsError>,
    ) =>
      runExclusive(
        Effect.gen(function* () {
          const repositoryPath = yield* resolveRepository(cwd);
          return yield* use({
            repositoryPath,
            env: {
              ...process.env,
              GIT_DIR: repositoryPath,
              GIT_WORK_TREE: cwd,
            },
          });
        }),
      );

    const runGit = (
      operation: string,
      cwd: string,
      env: NodeJS.ProcessEnv,
      args: readonly string[],
      settings?: {
        readonly allowNonZeroExit?: boolean;
        readonly maxOutputBytes?: number;
      },
    ) =>
      options.process.run({
        operation,
        command: "git",
        cwd,
        args,
        env,
        timeoutMs: 30_000,
        ...(settings?.allowNonZeroExit === true ? { allowNonZeroExit: true } : {}),
        ...(settings?.maxOutputBytes !== undefined
          ? { maxOutputBytes: settings.maxOutputBytes }
          : {}),
      });

    const resolveCommit = (
      operation: string,
      cwd: string,
      env: NodeJS.ProcessEnv,
      checkpointRef: CheckpointRef,
    ) =>
      runGit(
        operation,
        cwd,
        env,
        ["rev-parse", "--verify", "--quiet", `${checkpointRef}^{commit}`],
        { allowNonZeroExit: true },
      ).pipe(Effect.map((result) => (result.exitCode === 0 ? result.stdout.trim() || null : null)));

    const checkpoints: VcsCheckpointOps = {
      captureCheckpoint: (input) =>
        withRepository(input.cwd, ({ repositoryPath, env }) => {
          const operation = "ManagedWorkspaceCheckpoints.captureCheckpoint";
          const indexPath = NodePath.join(repositoryPath, `index-${NodeCrypto.randomUUID()}`);
          const checkpointEnv: NodeJS.ProcessEnv = {
            ...env,
            GIT_INDEX_FILE: indexPath,
            GIT_AUTHOR_NAME: "Croki",
            GIT_AUTHOR_EMAIL: "croki@users.noreply.github.com",
            GIT_COMMITTER_NAME: "Croki",
            GIT_COMMITTER_EMAIL: "croki@users.noreply.github.com",
          };
          return Effect.gen(function* () {
            yield* runGit(operation, input.cwd, checkpointEnv, ["read-tree", "--empty"]);
            yield* runGit(operation, input.cwd, checkpointEnv, ["add", "-A", "--", "."]);
            const tree = yield* runGit(operation, input.cwd, checkpointEnv, ["write-tree"]);
            const treeOid = tree.stdout.trim();
            if (treeOid.length === 0) {
              return yield* filesystemError(
                operation,
                input.cwd,
                "git write-tree returned no tree.",
              );
            }
            const commit = yield* runGit(operation, input.cwd, checkpointEnv, [
              "commit-tree",
              treeOid,
              "-m",
              `croki checkpoint ref=${input.checkpointRef}`,
            ]);
            const commitOid = commit.stdout.trim();
            if (commitOid.length === 0) {
              return yield* filesystemError(
                operation,
                input.cwd,
                "git commit-tree returned no commit.",
              );
            }
            yield* runGit(operation, input.cwd, env, [
              "update-ref",
              input.checkpointRef,
              commitOid,
            ]);
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => NodeFS.rmSync(indexPath, { force: true })).pipe(Effect.ignore),
            ),
          );
        }),

      hasCheckpointRef: (input) =>
        withRepository(input.cwd, ({ env }) =>
          resolveCommit(
            "ManagedWorkspaceCheckpoints.hasCheckpointRef",
            input.cwd,
            env,
            input.checkpointRef,
          ).pipe(Effect.map((commit) => commit !== null)),
        ),

      restoreCheckpoint: (input) =>
        withRepository(input.cwd, ({ repositoryPath, env }) => {
          const operation = "ManagedWorkspaceCheckpoints.restoreCheckpoint";
          const indexPath = NodePath.join(repositoryPath, `index-${NodeCrypto.randomUUID()}`);
          const restoreEnv = { ...env, GIT_INDEX_FILE: indexPath };
          return Effect.gen(function* () {
            const commit = yield* resolveCommit(
              operation,
              input.cwd,
              restoreEnv,
              input.checkpointRef,
            );
            if (!commit) return false;

            yield* runGit(operation, input.cwd, restoreEnv, ["read-tree", commit]);
            yield* runGit(operation, input.cwd, restoreEnv, ["checkout-index", "--all", "--force"]);
            yield* runGit(operation, input.cwd, restoreEnv, ["clean", "-fd", "--", "."]);
            return true;
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => NodeFS.rmSync(indexPath, { force: true })).pipe(Effect.ignore),
            ),
          );
        }),

      diffCheckpoints: (input) =>
        withRepository(input.cwd, ({ env }) => {
          const operation = "ManagedWorkspaceCheckpoints.diffCheckpoints";
          return Effect.gen(function* () {
            const fromCommit = yield* resolveCommit(
              operation,
              input.cwd,
              env,
              input.fromCheckpointRef,
            );
            const toCommit = yield* resolveCommit(operation, input.cwd, env, input.toCheckpointRef);
            if (!fromCommit || !toCommit) {
              return yield* filesystemError(operation, input.cwd, "Checkpoint ref is unavailable.");
            }
            const result = yield* runGit(
              operation,
              input.cwd,
              env,
              [
                "diff",
                "--patch",
                "--no-color",
                "--no-ext-diff",
                "--no-textconv",
                ...(input.ignoreWhitespace ? ["--ignore-all-space"] : []),
                fromCommit,
                toCommit,
              ],
              { allowNonZeroExit: true, maxOutputBytes: CHECKPOINT_DIFF_MAX_OUTPUT_BYTES },
            );
            if (result.exitCode !== 0) {
              return yield* filesystemError(
                operation,
                input.cwd,
                result.stderr.trim() || "Checkpoint diff failed.",
              );
            }
            return result.stdout;
          });
        }),

      deleteCheckpointRefs: (input) =>
        withRepository(input.cwd, ({ env }) =>
          Effect.forEach(
            input.checkpointRefs,
            (checkpointRef) =>
              runGit(
                "ManagedWorkspaceCheckpoints.deleteCheckpointRefs",
                input.cwd,
                env,
                ["update-ref", "-d", checkpointRef],
                { allowNonZeroExit: true },
              ),
            { discard: true },
          ),
        ),
    };

    return checkpoints;
  },
);
