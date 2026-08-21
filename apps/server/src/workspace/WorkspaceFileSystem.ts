// @effect-diagnostics nodeBuiltinImport:off
/**
 * WorkspaceFileSystem - Effect service contract for workspace file mutations.
 *
 * Owns workspace-root-relative file read/write operations and their associated
 * safety checks and cache invalidation hooks.
 *
 * @module WorkspaceFileSystem
 */
import * as NodeFSP from "node:fs/promises";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";

import type {
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "@croki/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import * as WorkspaceEntries from "./WorkspaceEntries.ts";
import * as WorkspacePaths from "./WorkspacePaths.ts";

const PROJECT_READ_FILE_MAX_BYTES = 1024 * 1024;

export class WorkspaceFileSystemOperationError extends Schema.TaggedErrorClass<WorkspaceFileSystemOperationError>()(
  "WorkspaceFileSystemOperationError",
  {
    workspaceRoot: Schema.String,
    relativePath: Schema.String,
    resolvedPath: Schema.String,
    operationPath: Schema.String,
    operation: Schema.Literals([
      "realpath-workspace-root",
      "realpath-target",
      "open",
      "stat",
      "read",
      "close",
      "make-directory",
      "write-file",
    ]),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Workspace file operation '${this.operation}' failed at '${this.operationPath}' for resolved path '${this.resolvedPath}' (requested as '${this.relativePath}' in '${this.workspaceRoot}').`;
  }
}

export class WorkspaceFilePathEscapeError extends Schema.TaggedErrorClass<WorkspaceFilePathEscapeError>()(
  "WorkspaceFilePathEscapeError",
  {
    workspaceRoot: Schema.String,
    relativePath: Schema.String,
    resolvedWorkspaceRoot: Schema.String,
    resolvedPath: Schema.String,
  },
) {
  override get message(): string {
    return `Workspace file '${this.relativePath}' resolves outside workspace root '${this.workspaceRoot}': ${this.resolvedPath}`;
  }
}

export class WorkspacePathNotFileError extends Schema.TaggedErrorClass<WorkspacePathNotFileError>()(
  "WorkspacePathNotFileError",
  {
    workspaceRoot: Schema.String,
    relativePath: Schema.String,
    resolvedPath: Schema.String,
  },
) {
  override get message(): string {
    return `Workspace path '${this.relativePath}' in '${this.workspaceRoot}' is not a file: ${this.resolvedPath}`;
  }
}

export class WorkspaceBinaryFileError extends Schema.TaggedErrorClass<WorkspaceBinaryFileError>()(
  "WorkspaceBinaryFileError",
  {
    workspaceRoot: Schema.String,
    relativePath: Schema.String,
    resolvedPath: Schema.String,
  },
) {
  override get message(): string {
    return `Workspace file '${this.relativePath}' in '${this.workspaceRoot}' is binary and cannot be previewed as text.`;
  }
}

export class WorkspaceFileWriteConflictError extends Schema.TaggedErrorClass<WorkspaceFileWriteConflictError>()(
  "WorkspaceFileWriteConflictError",
  {
    workspaceRoot: Schema.String,
    relativePath: Schema.String,
    resolvedPath: Schema.String,
    expectedContentsSha256: Schema.NullOr(Schema.String),
    actualContentsSha256: Schema.NullOr(Schema.String),
  },
) {
  override get message(): string {
    return `Workspace file '${this.relativePath}' changed before it could be written.`;
  }
}

const isWorkspaceFileWriteConflictError = Schema.is(WorkspaceFileWriteConflictError);
const isWorkspacePathNotFileError = Schema.is(WorkspacePathNotFileError);

export const WorkspaceFileSystemError = Schema.Union([
  WorkspaceFileSystemOperationError,
  WorkspaceFilePathEscapeError,
  WorkspacePathNotFileError,
  WorkspaceBinaryFileError,
  WorkspaceFileWriteConflictError,
]);
export type WorkspaceFileSystemError = typeof WorkspaceFileSystemError.Type;

/** Service tag for workspace file operations. */
export class WorkspaceFileSystem extends Context.Service<
  WorkspaceFileSystem,
  {
    /** Read a UTF-8 text file relative to the workspace root. */
    readonly readFile: (
      input: ProjectReadFileInput,
    ) => Effect.Effect<
      ProjectReadFileResult,
      WorkspaceFileSystemError | WorkspacePaths.WorkspacePathOutsideRootError
    >;
    /**
     * Write a file relative to the workspace root.
     *
     * Creates parent directories as needed and rejects paths that escape the
     * workspace root.
     */
    readonly writeFile: (
      input: ProjectWriteFileInput,
    ) => Effect.Effect<
      ProjectWriteFileResult,
      WorkspaceFileSystemError | WorkspacePaths.WorkspacePathOutsideRootError
    >;
  }
>()("croki-server/workspace/WorkspaceFileSystem") {}

export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspacePaths = yield* WorkspacePaths.WorkspacePaths;
  const workspaceEntries = yield* WorkspaceEntries.WorkspaceEntries;
  const writeSemaphore = yield* Semaphore.make(1);

  const readFile: WorkspaceFileSystem["Service"]["readFile"] = Effect.fn(
    "WorkspaceFileSystem.readFile",
  )(function* (input) {
    const target = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
    });

    const realWorkspaceRoot = yield* Effect.tryPromise({
      try: () => NodeFSP.realpath(input.cwd),
      catch: (cause) =>
        new WorkspaceFileSystemOperationError({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
          resolvedPath: target.absolutePath,
          operationPath: input.cwd,
          operation: "realpath-workspace-root",
          cause,
        }),
    });
    const realTargetPath = yield* Effect.tryPromise({
      try: () => NodeFSP.realpath(target.absolutePath),
      catch: (cause) =>
        new WorkspaceFileSystemOperationError({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
          resolvedPath: target.absolutePath,
          operationPath: target.absolutePath,
          operation: "realpath-target",
          cause,
        }),
    });
    const relativeRealPath = path.relative(realWorkspaceRoot, realTargetPath);
    if (
      relativeRealPath.startsWith(`..${path.sep}`) ||
      relativeRealPath === ".." ||
      path.isAbsolute(relativeRealPath)
    ) {
      return yield* new WorkspaceFilePathEscapeError({
        workspaceRoot: input.cwd,
        relativePath: input.relativePath,
        resolvedWorkspaceRoot: realWorkspaceRoot,
        resolvedPath: realTargetPath,
      });
    }

    return yield* Effect.acquireUseRelease(
      Effect.tryPromise({
        try: () => NodeFSP.open(realTargetPath, "r"),
        catch: (cause) =>
          new WorkspaceFileSystemOperationError({
            workspaceRoot: input.cwd,
            relativePath: input.relativePath,
            resolvedPath: realTargetPath,
            operationPath: realTargetPath,
            operation: "open",
            cause,
          }),
      }),
      (handle) =>
        Effect.gen(function* () {
          const stat = yield* Effect.tryPromise({
            try: () => handle.stat(),
            catch: (cause) =>
              new WorkspaceFileSystemOperationError({
                workspaceRoot: input.cwd,
                relativePath: input.relativePath,
                resolvedPath: realTargetPath,
                operationPath: realTargetPath,
                operation: "stat",
                cause,
              }),
          });
          if (!stat.isFile()) {
            return yield* new WorkspacePathNotFileError({
              workspaceRoot: input.cwd,
              relativePath: input.relativePath,
              resolvedPath: realTargetPath,
            });
          }

          const bytesToRead = Math.min(stat.size, PROJECT_READ_FILE_MAX_BYTES);
          const buffer = Buffer.alloc(bytesToRead);
          const { bytesRead } = yield* Effect.tryPromise({
            try: () => handle.read(buffer, 0, bytesToRead, 0),
            catch: (cause) =>
              new WorkspaceFileSystemOperationError({
                workspaceRoot: input.cwd,
                relativePath: input.relativePath,
                resolvedPath: realTargetPath,
                operationPath: realTargetPath,
                operation: "read",
                cause,
              }),
          });
          const fileBytes = buffer.subarray(0, bytesRead);
          if (fileBytes.includes(0)) {
            return yield* new WorkspaceBinaryFileError({
              workspaceRoot: input.cwd,
              relativePath: input.relativePath,
              resolvedPath: realTargetPath,
            });
          }

          return {
            relativePath: target.relativePath,
            contents: new TextDecoder("utf-8").decode(fileBytes),
            byteLength: stat.size,
            truncated: stat.size > PROJECT_READ_FILE_MAX_BYTES,
          };
        }),
      (handle) =>
        Effect.tryPromise({
          try: () => handle.close(),
          catch: (cause) =>
            new WorkspaceFileSystemOperationError({
              workspaceRoot: input.cwd,
              relativePath: input.relativePath,
              resolvedPath: realTargetPath,
              operationPath: realTargetPath,
              operation: "close",
              cause,
            }),
        }),
    );
  });

  const writeFileUnlocked: WorkspaceFileSystem["Service"]["writeFile"] = Effect.fn(
    "WorkspaceFileSystem.writeFileUnlocked",
  )(function* (input) {
    const target = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
    });

    const realWorkspaceRoot = yield* Effect.tryPromise({
      try: () => NodeFSP.realpath(input.cwd),
      catch: (cause) =>
        new WorkspaceFileSystemOperationError({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
          resolvedPath: target.absolutePath,
          operationPath: input.cwd,
          operation: "realpath-workspace-root",
          cause,
        }),
    });

    const isWithinRealWorkspace = (resolvedPath: string) => {
      const relativeRealPath = path.relative(realWorkspaceRoot, resolvedPath);
      return (
        relativeRealPath !== ".." &&
        !relativeRealPath.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativeRealPath)
      );
    };
    const assertWithinRealWorkspace = (resolvedPath: string) =>
      isWithinRealWorkspace(resolvedPath)
        ? Effect.void
        : new WorkspaceFilePathEscapeError({
            workspaceRoot: input.cwd,
            relativePath: input.relativePath,
            resolvedWorkspaceRoot: realWorkspaceRoot,
            resolvedPath,
          });

    // Resolve the nearest existing ancestor so symlinked parents are checked
    // before creating directories or opening the target for writing.
    let nearestExistingPath = target.absolutePath;
    const missingSegments: Array<string> = [];
    while (
      !(yield* Effect.tryPromise({
        try: async () => {
          try {
            await NodeFSP.lstat(nearestExistingPath);
            return true;
          } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code === "ENOENT") return false;
            throw cause;
          }
        },
        catch: (cause) =>
          new WorkspaceFileSystemOperationError({
            workspaceRoot: input.cwd,
            relativePath: input.relativePath,
            resolvedPath: target.absolutePath,
            operationPath: nearestExistingPath,
            operation: "realpath-target",
            cause,
          }),
      }))
    ) {
      missingSegments.unshift(path.basename(nearestExistingPath));
      nearestExistingPath = path.dirname(nearestExistingPath);
    }

    const realNearestExistingPath = yield* Effect.tryPromise({
      try: () => NodeFSP.realpath(nearestExistingPath),
      catch: (cause) =>
        new WorkspaceFileSystemOperationError({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
          resolvedPath: target.absolutePath,
          operationPath: nearestExistingPath,
          operation: "realpath-target",
          cause,
        }),
    });
    const resolvedTargetPath = path.join(realNearestExistingPath, ...missingSegments);
    yield* assertWithinRealWorkspace(resolvedTargetPath);

    const requestedParentPath = path.dirname(resolvedTargetPath);
    yield* fileSystem.makeDirectory(requestedParentPath, { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceFileSystemOperationError({
            workspaceRoot: input.cwd,
            relativePath: input.relativePath,
            resolvedPath: resolvedTargetPath,
            operationPath: requestedParentPath,
            operation: "make-directory",
            cause,
          }),
      ),
    );

    // Re-resolve after mkdir to catch a parent replaced by a symlink between
    // the first safety check and the write.
    const realParentPath = yield* Effect.tryPromise({
      try: () => NodeFSP.realpath(requestedParentPath),
      catch: (cause) =>
        new WorkspaceFileSystemOperationError({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
          resolvedPath: resolvedTargetPath,
          operationPath: requestedParentPath,
          operation: "realpath-target",
          cause,
        }),
    });
    const finalTargetPath = path.join(realParentPath, path.basename(resolvedTargetPath));
    yield* assertWithinRealWorkspace(finalTargetPath);

    yield* Effect.tryPromise({
      try: async () => {
        const digest = (contents: Uint8Array) =>
          NodeCrypto.createHash("sha256").update(contents).digest("hex");
        const readDigest = async (filePath: string): Promise<string | null> => {
          try {
            const stat = await NodeFSP.lstat(filePath);
            if (!stat.isFile()) return null;
            return digest(await NodeFSP.readFile(filePath));
          } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
            throw cause;
          }
        };
        const writeHandleContents = async (
          handle: NodeFSP.FileHandle,
          contents: string,
        ): Promise<void> => {
          await handle.writeFile(contents, "utf8");
          await handle.sync();
        };

        if (input.expectedContentsSha256 === null) {
          let handle: NodeFSP.FileHandle;
          try {
            handle = await NodeFSP.open(
              finalTargetPath,
              NodeFS.constants.O_WRONLY |
                NodeFS.constants.O_CREAT |
                NodeFS.constants.O_EXCL |
                NodeFS.constants.O_NOFOLLOW,
              0o666,
            );
          } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code === "EEXIST") {
              throw new WorkspaceFileWriteConflictError({
                workspaceRoot: input.cwd,
                relativePath: input.relativePath,
                resolvedPath: finalTargetPath,
                expectedContentsSha256: null,
                actualContentsSha256: await readDigest(finalTargetPath),
              });
            }
            throw cause;
          }
          try {
            await writeHandleContents(handle, input.contents);
          } finally {
            await handle.close();
          }
          return;
        }

        if (input.expectedContentsSha256 !== undefined) {
          let handle: NodeFSP.FileHandle;
          try {
            handle = await NodeFSP.open(
              finalTargetPath,
              NodeFS.constants.O_RDWR | NodeFS.constants.O_NOFOLLOW,
            );
          } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
              throw new WorkspaceFileWriteConflictError({
                workspaceRoot: input.cwd,
                relativePath: input.relativePath,
                resolvedPath: finalTargetPath,
                expectedContentsSha256: input.expectedContentsSha256,
                actualContentsSha256: null,
              });
            }
            throw cause;
          }
          try {
            const stat = await handle.stat();
            if (!stat.isFile()) {
              throw new WorkspacePathNotFileError({
                workspaceRoot: input.cwd,
                relativePath: input.relativePath,
                resolvedPath: finalTargetPath,
              });
            }
            const currentContents = Buffer.alloc(stat.size);
            let offset = 0;
            while (offset < currentContents.length) {
              const { bytesRead } = await handle.read(
                currentContents,
                offset,
                currentContents.length - offset,
                offset,
              );
              if (bytesRead === 0) break;
              offset += bytesRead;
            }
            const actualContentsSha256 = digest(currentContents.subarray(0, offset));
            if (actualContentsSha256 !== input.expectedContentsSha256) {
              throw new WorkspaceFileWriteConflictError({
                workspaceRoot: input.cwd,
                relativePath: input.relativePath,
                resolvedPath: finalTargetPath,
                expectedContentsSha256: input.expectedContentsSha256,
                actualContentsSha256,
              });
            }
            await handle.truncate(0);
            await writeHandleContents(handle, input.contents);
          } finally {
            await handle.close();
          }
          return;
        }

        const handle = await NodeFSP.open(
          finalTargetPath,
          NodeFS.constants.O_WRONLY |
            NodeFS.constants.O_CREAT |
            NodeFS.constants.O_TRUNC |
            NodeFS.constants.O_NOFOLLOW,
          0o666,
        );
        try {
          await writeHandleContents(handle, input.contents);
        } finally {
          await handle.close();
        }
      },
      catch: (cause) => {
        if (isWorkspaceFileWriteConflictError(cause) || isWorkspacePathNotFileError(cause)) {
          return cause;
        }
        return new WorkspaceFileSystemOperationError({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
          resolvedPath: finalTargetPath,
          operationPath: finalTargetPath,
          operation: "write-file",
          cause,
        });
      },
    });
    yield* workspaceEntries.refresh(input.cwd);
    return { relativePath: target.relativePath };
  });

  const writeFile: WorkspaceFileSystem["Service"]["writeFile"] = (input) =>
    writeSemaphore.withPermits(1)(writeFileUnlocked(input));

  return WorkspaceFileSystem.of({ readFile, writeFile });
});

export const layer = Layer.effect(WorkspaceFileSystem, make);
