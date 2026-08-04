import type { OrchestrationThreadActivity } from "@croki/contracts";
import {
  CROKI_CONTEXT_PARSE_ERROR_CODES,
  CROKI_CONTEXT_RECEIPT_STATUSES,
  CROKI_CONTEXT_RELATIVE_PATH,
  type CrokiContextAppliedActivityPayload,
  type CrokiContextParseErrorCode,
  type CrokiContextReceipt,
} from "@croki/shared/crokiContext";
import { CROKI_RELEASE_LIMITS } from "@croki/shared/crokiReleaseCandidate";

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
