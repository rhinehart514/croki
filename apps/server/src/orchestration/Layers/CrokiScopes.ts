import {
  buildCrokiReleasePrompt,
  buildCrokiVenturePrompt,
  CROKI_RELEASE_DIRECTORY,
  CROKI_SCOPE_LIMITS,
  CROKI_VENTURE_RELATIVE_PATH,
  parseCrokiReleaseFile,
  parseCrokiVentureFile,
} from "@croki/shared/crokiScopes";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

export interface LoadedCrokiScopes {
  readonly releasePrompt: string | null;
  readonly venturePrompt: string | null;
}

/** Optional parent scopes fail open and never execute or interpret embedded text as instructions. */
export function loadCrokiParentScopes(
  cwd: string | undefined,
  references: { readonly activeRelease?: string; readonly venture?: string } | undefined,
) {
  if (!cwd || !references) return Effect.succeed<LoadedCrokiScopes>(emptyScopes());
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const releasePrompt = isReleasePath(references.activeRelease)
      ? yield* loadScope(
          fileSystem,
          path,
          cwd,
          references.activeRelease,
          parseCrokiReleaseFile,
          buildCrokiReleasePrompt,
        )
      : null;
    const venturePrompt =
      references.venture === CROKI_VENTURE_RELATIVE_PATH
        ? yield* loadScope(
            fileSystem,
            path,
            cwd,
            references.venture,
            parseCrokiVentureFile,
            buildCrokiVenturePrompt,
          )
        : null;
    return { releasePrompt, venturePrompt };
  }).pipe(Effect.orElseSucceed(emptyScopes));
}

function loadScope<T>(
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  relativePath: string,
  parse: (source: string) => T,
  render: (value: T) => string | null,
) {
  return Effect.gen(function* () {
    const filePath = path.join(cwd, relativePath);
    if (!(yield* fileSystem.exists(filePath))) return null;
    const info = yield* fileSystem.stat(filePath);
    if (info.size > CROKI_SCOPE_LIMITS.sourceBytes) return null;
    const source = yield* fileSystem.readFileString(filePath);
    if (Buffer.byteLength(source, "utf8") > CROKI_SCOPE_LIMITS.sourceBytes) return null;
    return render(parse(source));
  }).pipe(Effect.orElseSucceed(() => null));
}

function isReleasePath(value: string | undefined): value is string {
  return Boolean(
    value?.startsWith(`${CROKI_RELEASE_DIRECTORY}/`) &&
    value.endsWith(".croki") &&
    !value.includes("..") &&
    !value.includes("\\"),
  );
}

function emptyScopes(): LoadedCrokiScopes {
  return { releasePrompt: null, venturePrompt: null };
}
