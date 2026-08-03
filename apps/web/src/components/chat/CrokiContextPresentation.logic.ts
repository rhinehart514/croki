import type { OrchestrationThreadActivity, ProjectReadFileResult } from "@croki/contracts";
import {
  buildCrokiAgentContext,
  CROKI_CONTEXT_LIMITS,
  CROKI_CONTEXT_PARSE_ERROR_CODES,
  CROKI_CONTEXT_RECEIPT_STATUSES,
  CROKI_CONTEXT_RELATIVE_PATH,
  CrokiContextParseError,
  parseCrokiContext,
  type CrokiContextAppliedActivityPayload,
  type CrokiContextParseErrorCode,
  type CrokiContextReceipt,
} from "@croki/shared/crokiContext";
import { recoverCrokiContext } from "@croki/shared/crokiContextRecovery";
import { CROKI_RELEASE_LIMITS } from "@croki/shared/crokiReleaseCandidate";

const OMITTED_CONTEXT_MARKER = "[additional context omitted due to size limit]";

export type CrokiComposerContextState =
  | { readonly status: "loading" }
  | { readonly status: "absent" }
  | { readonly status: "unavailable" }
  | { readonly status: "oversized" }
  | { readonly status: "truncated" }
  | { readonly status: "invalid"; readonly errorCode: CrokiContextParseErrorCode }
  | {
      readonly status: "partial";
      readonly currentCount: number;
      readonly provisionalCount: number;
      readonly included: boolean;
      readonly issueCount: number;
      readonly promptTruncated: boolean;
      readonly updatedAt: string;
      readonly releaseVersion?: string | null;
    }
  | {
      readonly status: "loaded";
      readonly currentCount: number;
      readonly provisionalCount: number;
      readonly included: boolean;
      readonly promptTruncated: boolean;
      readonly updatedAt: string;
      readonly releaseVersion?: string | null;
    };

interface CrokiContextFileQueryState {
  readonly data: ProjectReadFileResult | null;
  readonly error: string | null;
  readonly failure: unknown | null;
  readonly isPending: boolean;
}

export function deriveCrokiComposerContextState(
  query: CrokiContextFileQueryState,
): CrokiComposerContextState {
  if (query.data) {
    if (query.data.truncated) return { status: "truncated" };
    if (query.data.byteLength > CROKI_CONTEXT_LIMITS.sourceBytes) {
      return { status: "oversized" };
    }
    try {
      const context = parseCrokiContext(query.data.contents);
      const prompt = buildCrokiAgentContext(context);
      return {
        status: "loaded",
        currentCount: context.nodes.filter((node) => node.status === "current").length,
        provisionalCount: context.nodes.filter((node) => node.status === "provisional").length,
        included: prompt !== null,
        promptTruncated: prompt?.includes(OMITTED_CONTEXT_MARKER) ?? false,
        updatedAt: context.updatedAt,
        releaseVersion: context.release?.status === "active" ? context.release.version : null,
      };
    } catch (error) {
      try {
        const recovery = recoverCrokiContext(query.data.contents);
        if (recovery.issues.length > 0) {
          const prompt = buildCrokiAgentContext(recovery.context);
          return {
            status: "partial",
            currentCount: recovery.context.nodes.filter((node) => node.status === "current").length,
            provisionalCount: recovery.context.nodes.filter((node) => node.status === "provisional")
              .length,
            included: prompt !== null,
            issueCount: recovery.issues.length,
            promptTruncated: prompt?.includes(OMITTED_CONTEXT_MARKER) ?? false,
            updatedAt: recovery.context.updatedAt,
            releaseVersion:
              recovery.context.release?.status === "active"
                ? recovery.context.release.version
                : null,
          };
        }
      } catch {
        // The strict parse error below remains the source-level diagnosis.
      }
      return {
        status: "invalid",
        errorCode: error instanceof CrokiContextParseError ? error.code : "malformed",
      };
    }
  }
  if (query.isPending) return { status: "loading" };
  if (query.failure && isMissingProjectFileFailure(query.failure)) {
    return { status: "absent" };
  }
  if (query.error) return { status: "unavailable" };
  return { status: "absent" };
}

export function deriveCrokiContextReceiptsByMessageId(
  activities: readonly OrchestrationThreadActivity[],
): ReadonlyMap<string, CrokiContextReceipt> {
  const receipts = new Map<string, CrokiContextReceipt>();
  for (const activity of activities) {
    if (activity.kind !== "croki.context.applied") continue;
    const payload = parseCrokiContextAppliedActivity(activity.payload);
    if (payload) receipts.set(payload.messageId, payload.receipt);
  }
  return receipts;
}

function isMissingProjectFileFailure(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.operation !== "realpath-target") return false;
  if (!("relativePath" in value) || value.relativePath !== CROKI_CONTEXT_RELATIVE_PATH)
    return false;
  return true;
}

function parseCrokiContextReceipt(value: unknown): CrokiContextReceipt | null {
  if (!isRecord(value)) return null;
  if (
    !isCrokiContextReceiptStatus(value.status) ||
    value.relativePath !== CROKI_CONTEXT_RELATIVE_PATH ||
    (value.version !== 1 && value.version !== null) ||
    (value.sha256 !== null &&
      (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256))) ||
    (value.updatedAt !== null && typeof value.updatedAt !== "string") ||
    !isNonNegativeInteger(value.activeCount) ||
    !isNonNegativeInteger(value.currentCount) ||
    !isNonNegativeInteger(value.provisionalCount) ||
    !isNonNegativeInteger(value.renderedChars) ||
    typeof value.truncated !== "boolean" ||
    (value.harnessId !== undefined &&
      value.harnessId !== "native" &&
      value.harnessId !== "venture-v1" &&
      value.harnessId !== "product-v1" &&
      value.harnessId !== "gtm-v1")
  ) {
    return null;
  }
  const hasRelease = value.releaseVersion !== undefined || value.releaseItemCount !== undefined;
  if (
    hasRelease &&
    (typeof value.releaseVersion !== "string" ||
      value.releaseVersion !== value.releaseVersion.trim() ||
      !value.releaseVersion ||
      value.releaseVersion.length > CROKI_RELEASE_LIMITS.versionChars ||
      !isNonNegativeInteger(value.releaseItemCount) ||
      value.releaseItemCount > CROKI_RELEASE_LIMITS.items)
  ) {
    return null;
  }
  if (value.errorCode !== undefined && !isCrokiContextParseErrorCode(value.errorCode)) {
    return null;
  }
  if (
    value.status === "partial"
      ? !isNonNegativeInteger(value.issueCount) || value.issueCount === 0
      : value.issueCount !== undefined
  ) {
    return null;
  }
  const hasSelection =
    value.includedCount !== undefined ||
    value.omittedCount !== undefined ||
    value.selectionMode !== undefined;
  if (
    hasSelection &&
    (!isNonNegativeInteger(value.includedCount) ||
      !isNonNegativeInteger(value.omittedCount) ||
      value.includedCount + value.omittedCount !== value.activeCount ||
      !isCrokiContextSelectionMode(value.selectionMode))
  ) {
    return null;
  }
  return {
    status: value.status,
    relativePath: CROKI_CONTEXT_RELATIVE_PATH,
    version: value.version,
    sha256: value.sha256,
    updatedAt: value.updatedAt,
    activeCount: value.activeCount,
    currentCount: value.currentCount,
    provisionalCount: value.provisionalCount,
    renderedChars: value.renderedChars,
    truncated: value.truncated,
    ...(value.harnessId ? { harnessId: value.harnessId } : {}),
    ...(value.errorCode ? { errorCode: value.errorCode } : {}),
    ...(value.issueCount !== undefined ? { issueCount: value.issueCount as number } : {}),
    ...(hasRelease
      ? {
          releaseVersion: value.releaseVersion as string,
          releaseItemCount: value.releaseItemCount as number,
        }
      : {}),
    ...(hasSelection
      ? {
          includedCount: value.includedCount as number,
          omittedCount: value.omittedCount as number,
          selectionMode: value.selectionMode as NonNullable<CrokiContextReceipt["selectionMode"]>,
        }
      : {}),
  };
}

function parseCrokiContextAppliedActivity(
  value: unknown,
): Pick<CrokiContextAppliedActivityPayload, "messageId" | "receipt"> | null {
  if (!isRecord(value) || typeof value.messageId !== "string") return null;
  const receipt = parseCrokiContextReceipt(value.receipt);
  return receipt ? { messageId: value.messageId, receipt } : null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isCrokiContextReceiptStatus(value: unknown): value is CrokiContextReceipt["status"] {
  return (
    typeof value === "string" &&
    CROKI_CONTEXT_RECEIPT_STATUSES.includes(
      value as (typeof CROKI_CONTEXT_RECEIPT_STATUSES)[number],
    )
  );
}

function isCrokiContextSelectionMode(
  value: unknown,
): value is NonNullable<CrokiContextReceipt["selectionMode"]> {
  return value === "full" || value === "focused" || value === "bounded";
}

function isCrokiContextParseErrorCode(value: unknown): value is CrokiContextParseErrorCode {
  return (
    typeof value === "string" &&
    CROKI_CONTEXT_PARSE_ERROR_CODES.includes(
      value as (typeof CROKI_CONTEXT_PARSE_ERROR_CODES)[number],
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
