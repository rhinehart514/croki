import * as NodeCrypto from "node:crypto";

import {
  CROKI_APPLICATION_LEGACY_RELATIVE_PATH,
  CROKI_APPLICATION_LIMITS,
  CROKI_APPLICATION_RELATIVE_PATH,
  CrokiApplicationParseError,
  parseCrokiApplication,
  type CrokiApplication,
  type CrokiApplicationErrorCode,
  type CrokiApplicationRelativePath,
} from "@croki/shared/crokiApplication";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

export type CrokiApplicationLoadStatus = "loaded" | "absent" | "invalid" | "oversized";

export interface LoadedCrokiApplication {
  readonly status: CrokiApplicationLoadStatus;
  readonly application: CrokiApplication | null;
  readonly sha256: string | null;
  readonly sourcePath: CrokiApplicationRelativePath | null;
  readonly errorCode?: CrokiApplicationErrorCode;
}

const sha256 = (contents: string): string =>
  NodeCrypto.createHash("sha256").update(contents, "utf8").digest("hex");

/** Reads the repository-owned application brief for explicit UI/tool requests. */
export function loadCrokiApplication(cwd: string | undefined) {
  if (!cwd) return Effect.succeed(absentApplication());
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sourcePath = (yield* fileSystem.exists(path.join(cwd, CROKI_APPLICATION_RELATIVE_PATH)))
      ? CROKI_APPLICATION_RELATIVE_PATH
      : (yield* fileSystem.exists(path.join(cwd, CROKI_APPLICATION_LEGACY_RELATIVE_PATH)))
        ? CROKI_APPLICATION_LEGACY_RELATIVE_PATH
        : null;
    if (!sourcePath) return absentApplication();
    const applicationPath = path.join(cwd, sourcePath);

    const fileInfo = yield* fileSystem.stat(applicationPath);
    if (fileInfo.size > CROKI_APPLICATION_LIMITS.sourceBytes) {
      return {
        status: "oversized",
        application: null,
        sha256: null,
        sourcePath,
      } satisfies LoadedCrokiApplication;
    }
    const contents = yield* fileSystem.readFileString(applicationPath);
    const fingerprint = sha256(contents);
    if (Buffer.byteLength(contents, "utf8") > CROKI_APPLICATION_LIMITS.sourceBytes) {
      return {
        status: "oversized",
        application: null,
        sha256: fingerprint,
        sourcePath,
      } satisfies LoadedCrokiApplication;
    }

    return parseLoadedApplication(contents, fingerprint, sourcePath);
  }).pipe(Effect.orElseSucceed(() => invalidApplication()));
}

function parseLoadedApplication(
  contents: string,
  fingerprint: string,
  sourcePath: CrokiApplicationRelativePath,
): LoadedCrokiApplication {
  try {
    const application = parseCrokiApplication(contents);
    return { status: "loaded", application, sha256: fingerprint, sourcePath };
  } catch (error) {
    return {
      status: "invalid",
      application: null,
      sha256: fingerprint,
      sourcePath,
      errorCode: error instanceof CrokiApplicationParseError ? error.code : "malformed",
    };
  }
}

function absentApplication(): LoadedCrokiApplication {
  return { status: "absent", application: null, sha256: null, sourcePath: null };
}

function invalidApplication(): LoadedCrokiApplication {
  return {
    status: "invalid",
    application: null,
    sha256: null,
    sourcePath: null,
    errorCode: "malformed",
  };
}
