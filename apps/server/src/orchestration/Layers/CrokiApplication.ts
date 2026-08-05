import * as NodeCrypto from "node:crypto";

import {
  buildCrokiApplicationPrompt,
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
  readonly prompt: string | null;
  readonly sha256: string | null;
  readonly sourcePath: CrokiApplicationRelativePath | null;
  readonly errorCode?: CrokiApplicationErrorCode;
}

const sha256 = (contents: string): string =>
  NodeCrypto.createHash("sha256").update(contents, "utf8").digest("hex");

/** Application lineage is optional factual context and must never block a native turn. */
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
        prompt: null,
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
        prompt: null,
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
    const prompt = buildCrokiApplicationPrompt(application, sourcePath);
    if (prompt === null) {
      return {
        status: "oversized",
        application: null,
        prompt: null,
        sha256: fingerprint,
        sourcePath,
      };
    }
    return { status: "loaded", application, prompt, sha256: fingerprint, sourcePath };
  } catch (error) {
    return {
      status: "invalid",
      application: null,
      prompt: null,
      sha256: fingerprint,
      sourcePath,
      errorCode: error instanceof CrokiApplicationParseError ? error.code : "malformed",
    };
  }
}

function absentApplication(): LoadedCrokiApplication {
  return { status: "absent", application: null, prompt: null, sha256: null, sourcePath: null };
}

function invalidApplication(): LoadedCrokiApplication {
  return {
    status: "invalid",
    application: null,
    prompt: null,
    sha256: null,
    sourcePath: null,
    errorCode: "malformed",
  };
}
