import type { ProjectReadFileResult } from "@croki/contracts";
import {
  buildCrokiApplicationPrompt,
  CROKI_APPLICATION_LEGACY_RELATIVE_PATH,
  CROKI_APPLICATION_LIMITS,
  CROKI_APPLICATION_RELATIVE_PATH,
  CrokiApplicationParseError,
  parseCrokiApplication,
  type CrokiApplication,
  type CrokiApplicationErrorCode,
} from "@croki/shared/crokiApplication";

export type CrokiApplicationState =
  | { readonly status: "loading" }
  | { readonly status: "absent" }
  | { readonly status: "unavailable" }
  | { readonly status: "oversized"; readonly sourcePath: string }
  | { readonly status: "truncated"; readonly sourcePath: string }
  | {
      readonly status: "invalid";
      readonly errorCode: CrokiApplicationErrorCode;
      readonly sourcePath: string;
    }
  | {
      readonly status: "loaded";
      readonly application: CrokiApplication;
      readonly sourcePath: string;
    };

interface CrokiApplicationFileQueryState {
  readonly data: ProjectReadFileResult | null;
  readonly error: string | null;
  readonly failure: unknown | null;
  readonly isPending: boolean;
}

export function deriveCrokiApplicationState(
  query: CrokiApplicationFileQueryState,
): CrokiApplicationState {
  if (query.data) {
    if (query.data.truncated) {
      return { status: "truncated", sourcePath: query.data.relativePath };
    }
    if (query.data.byteLength > CROKI_APPLICATION_LIMITS.sourceBytes) {
      return { status: "oversized", sourcePath: query.data.relativePath };
    }
    try {
      const application = parseCrokiApplication(query.data.contents);
      return buildCrokiApplicationPrompt(application, query.data.relativePath) === null
        ? { status: "oversized", sourcePath: query.data.relativePath }
        : { status: "loaded", application, sourcePath: query.data.relativePath };
    } catch (error) {
      return {
        status: "invalid",
        errorCode: error instanceof CrokiApplicationParseError ? error.code : "malformed",
        sourcePath: query.data.relativePath,
      };
    }
  }
  if (query.isPending) return { status: "loading" };
  if (query.failure && isMissingApplicationFile(query.failure)) return { status: "absent" };
  if (query.error) return { status: "unavailable" };
  return { status: "absent" };
}

/** Prefer the native application brief while allowing older repositories to migrate lazily. */
export function deriveCrokiApplicationStateWithLegacy(
  current: CrokiApplicationFileQueryState,
  legacy: CrokiApplicationFileQueryState,
): CrokiApplicationState {
  const currentState = deriveCrokiApplicationState(current);
  return currentState.status === "absent" ? deriveCrokiApplicationState(legacy) : currentState;
}

export function applicationFocusLabel(application: CrokiApplication): string {
  const { released, building } = application;
  if (released && building) return `${released.version} → ${building.version}`;
  return building?.version ?? released?.version ?? application.application.name;
}

function isMissingApplicationFile(value: unknown): boolean {
  if (!isRecord(value) || value.operation !== "realpath-target") return false;
  return (
    value.relativePath === CROKI_APPLICATION_RELATIVE_PATH ||
    value.relativePath === CROKI_APPLICATION_LEGACY_RELATIVE_PATH
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
