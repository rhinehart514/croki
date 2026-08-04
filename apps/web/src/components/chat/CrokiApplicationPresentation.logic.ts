import type { ProjectReadFileResult } from "@croki/contracts";
import {
  buildCrokiApplicationPrompt,
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
  | { readonly status: "oversized" }
  | { readonly status: "truncated" }
  | { readonly status: "invalid"; readonly errorCode: CrokiApplicationErrorCode }
  | { readonly status: "loaded"; readonly application: CrokiApplication };

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
    if (query.data.truncated) return { status: "truncated" };
    if (query.data.byteLength > CROKI_APPLICATION_LIMITS.sourceBytes) {
      return { status: "oversized" };
    }
    try {
      const application = parseCrokiApplication(query.data.contents);
      return buildCrokiApplicationPrompt(application) === null
        ? { status: "oversized" }
        : { status: "loaded", application };
    } catch (error) {
      return {
        status: "invalid",
        errorCode: error instanceof CrokiApplicationParseError ? error.code : "malformed",
      };
    }
  }
  if (query.isPending) return { status: "loading" };
  if (query.failure && isMissingApplicationFile(query.failure)) return { status: "absent" };
  if (query.error) return { status: "unavailable" };
  return { status: "absent" };
}

function isMissingApplicationFile(value: unknown): boolean {
  if (!isRecord(value) || value.operation !== "realpath-target") return false;
  return value.relativePath === CROKI_APPLICATION_RELATIVE_PATH;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
