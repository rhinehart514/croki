/**
 * CrokiProjectFileLoader - Effect service that loads the checked-in `croki.json`
 * project file from a workspace root.
 *
 * Loading is best-effort: a missing file resolves to `Option.none`, and
 * unreadable or invalid files are logged and treated as absent so callers
 * can fall back to their defaults.
 *
 * @module CrokiProjectFileLoader
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { CROKI_PROJECT_FILE_NAME, type CrokiProjectFile } from "@croki/contracts";
import { CrokiProjectFileFromJson } from "@croki/shared/crokiProjectFile";

const decodeCrokiProjectFileJson = Schema.decodeEffect(CrokiProjectFileFromJson);

export class CrokiProjectFileLoadError extends Schema.TaggedErrorClass<CrokiProjectFileLoadError>()(
  "CrokiProjectFileLoadError",
  {
    operation: Schema.Literals(["read", "decode"]),
    workspaceRoot: Schema.String,
    filePath: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to ${this.operation} ${CROKI_PROJECT_FILE_NAME} at ${this.filePath}.`;
  }
}

/** Service tag for croki.json project file loading. */
export class CrokiProjectFileLoader extends Context.Service<
  CrokiProjectFileLoader,
  {
    /**
     * Load and decode `croki.json` at the workspace root.
     *
     * Never fails: missing, unreadable, or invalid files resolve to
     * `Option.none` (invalid files are logged as warnings).
     */
    readonly load: (workspaceRoot: string) => Effect.Effect<Option.Option<CrokiProjectFile>>;
  }
>()("croki-server/project/CrokiProjectFileLoader") {}

const logCrokiProjectFileLoadError = (error: CrokiProjectFileLoadError) =>
  Effect.logWarning(error).pipe(
    Effect.annotateLogs({
      operation: error.operation,
      workspaceRoot: error.workspaceRoot,
      filePath: error.filePath,
      errorTag: error._tag,
    }),
  );

export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const load: CrokiProjectFileLoader["Service"]["load"] = Effect.fn("CrokiProjectFileLoader.load")(
    function* (workspaceRoot) {
      const filePath = path.join(workspaceRoot, CROKI_PROJECT_FILE_NAME);
      const raw = yield* fileSystem.readFileString(filePath).pipe(
        Effect.map(Option.some),
        Effect.catchTags({
          PlatformError: (error) =>
            error.reason._tag === "NotFound"
              ? Effect.succeed(Option.none<string>())
              : logCrokiProjectFileLoadError(
                  new CrokiProjectFileLoadError({
                    operation: "read",
                    workspaceRoot,
                    filePath,
                    cause: error,
                  }),
                ).pipe(Effect.as(Option.none<string>())),
        }),
      );
      if (Option.isNone(raw)) {
        return Option.none<CrokiProjectFile>();
      }
      return yield* decodeCrokiProjectFileJson(raw.value).pipe(
        Effect.map(Option.some),
        Effect.catchTags({
          SchemaError: (error) =>
            logCrokiProjectFileLoadError(
              new CrokiProjectFileLoadError({
                operation: "decode",
                workspaceRoot,
                filePath,
                cause: error,
              }),
            ).pipe(Effect.as(Option.none<CrokiProjectFile>())),
        }),
      );
    },
  );

  return CrokiProjectFileLoader.of({ load });
});

export const layer = Layer.effect(CrokiProjectFileLoader, make);
