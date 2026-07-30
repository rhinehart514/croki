import * as NodeCrypto from "node:crypto";

import {
  compileCrokiAgentContext,
  CROKI_CONTEXT_LIMITS,
  CROKI_CONTEXT_PARSE_ERROR_CODES,
  CROKI_CONTEXT_RELATIVE_PATH,
  CROKI_CONTEXT_VERSION,
  CrokiContextParseError,
  type CrokiContextAppliedActivityPayload,
  type CrokiContextParseErrorCode,
  type CrokiContextReceipt,
  isCrokiAgentContextTruncated,
  parseCrokiContext,
} from "@t3tools/shared/crokiContext";
import { recoverCrokiContext } from "@t3tools/shared/crokiContextRecovery";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

export interface LoadedCrokiAgentContext {
  readonly prompt: string | null;
  readonly receipt: CrokiContextReceipt;
}

const emptyReceipt = (
  status: CrokiContextReceipt["status"],
  fields: Partial<CrokiContextReceipt> = {},
): CrokiContextReceipt => ({
  status,
  relativePath: CROKI_CONTEXT_RELATIVE_PATH,
  version: null,
  sha256: null,
  updatedAt: null,
  activeCount: 0,
  currentCount: 0,
  provisionalCount: 0,
  renderedChars: 0,
  truncated: false,
  ...fields,
});

const sha256 = (contents: string): string =>
  NodeCrypto.createHash("sha256").update(contents, "utf8").digest("hex");

function parseLoadedContext(
  contents: string,
  fingerprint: string,
  query: string | undefined,
): LoadedCrokiAgentContext {
  try {
    const context = parseCrokiContext(contents);
    return loadedContext(context, fingerprint, query, "loaded");
  } catch (error) {
    try {
      const recovery = recoverCrokiContext(contents);
      if (recovery.issues.length > 0) {
        return loadedContext(recovery.context, fingerprint, query, "partial", {
          errorCode: recovery.issues[0]!.code,
          issueCount: recovery.issues.length,
        });
      }
    } catch {
      // The strict error below is the authoritative envelope failure.
    }
    return invalidContext(error, fingerprint);
  }
}

function loadedContext(
  context: ReturnType<typeof parseCrokiContext>,
  fingerprint: string,
  query: string | undefined,
  status: "loaded" | "partial",
  recovery: Pick<CrokiContextReceipt, "errorCode" | "issueCount"> = {},
): LoadedCrokiAgentContext {
  const compilation = compileCrokiAgentContext(context, {
    ...(query !== undefined ? { query } : {}),
  });
  const currentCount = context.nodes.filter((node) => node.status === "current").length;
  const provisionalCount = context.nodes.filter((node) => node.status === "provisional").length;
  return {
    prompt: compilation.prompt,
    receipt: emptyReceipt(status, {
      version: context.version,
      sha256: fingerprint,
      updatedAt: context.updatedAt,
      activeCount: currentCount + provisionalCount,
      currentCount,
      provisionalCount,
      renderedChars: compilation.prompt?.length ?? 0,
      truncated: isCrokiAgentContextTruncated(compilation.prompt),
      includedCount: compilation.includedCount,
      omittedCount: compilation.omittedCount,
      selectionMode: compilation.selectionMode,
      ...recovery,
    }),
  };
}

function invalidContext(error: unknown, fingerprint: string): LoadedCrokiAgentContext {
  const errorCode: CrokiContextParseErrorCode =
    error instanceof CrokiContextParseError ? error.code : "malformed";
  return {
    prompt: null,
    receipt: emptyReceipt("invalid", {
      sha256: fingerprint,
      errorCode,
    }),
  };
}

export function loadCrokiAgentContext(cwd: string | undefined, query?: string) {
  if (!cwd) {
    return Effect.succeed<LoadedCrokiAgentContext>({
      prompt: null,
      receipt: emptyReceipt("absent"),
    });
  }

  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const contextPath = path.join(cwd, CROKI_CONTEXT_RELATIVE_PATH);
    if (!(yield* fileSystem.exists(contextPath))) {
      return {
        prompt: null,
        receipt: emptyReceipt("absent"),
      } satisfies LoadedCrokiAgentContext;
    }

    const contents = yield* fileSystem.readFileString(contextPath);
    const fingerprint = sha256(contents);
    if (Buffer.byteLength(contents, "utf8") > CROKI_CONTEXT_LIMITS.sourceBytes) {
      return {
        prompt: null,
        receipt: emptyReceipt("oversized", { sha256: fingerprint }),
      } satisfies LoadedCrokiAgentContext;
    }

    return parseLoadedContext(contents, fingerprint, query);
  }).pipe(
    // Product context is optional. Filesystem failures must never block a turn.
    Effect.orElseSucceed(
      () =>
        ({
          prompt: null,
          receipt: emptyReceipt("invalid", { errorCode: "malformed" }),
        }) satisfies LoadedCrokiAgentContext,
    ),
  );
}

export function isCrokiContextAppliedActivityPayload(
  value: unknown,
): value is CrokiContextAppliedActivityPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<CrokiContextAppliedActivityPayload>;
  const receipt = candidate.receipt as Partial<CrokiContextReceipt> | undefined;
  const prompt = candidate.prompt;
  if (
    typeof candidate.sourceEventId !== "string" ||
    candidate.sourceEventId.trim().length === 0 ||
    typeof candidate.messageId !== "string" ||
    candidate.messageId.trim().length === 0 ||
    (typeof prompt !== "string" && prompt !== null) ||
    !receipt
  ) {
    return false;
  }
  const promptIsBounded =
    prompt === null ||
    (prompt.length <= CROKI_CONTEXT_LIMITS.renderChars &&
      prompt.startsWith('<croki_product_context version="1">') &&
      prompt.endsWith("</croki_product_context>"));
  const countsAreValid =
    isNonNegativeInteger(receipt.activeCount) &&
    isNonNegativeInteger(receipt.currentCount) &&
    isNonNegativeInteger(receipt.provisionalCount) &&
    receipt.activeCount === receipt.currentCount + receipt.provisionalCount;
  const fingerprintIsValid =
    receipt.sha256 === null ||
    (typeof receipt.sha256 === "string" && /^[a-f0-9]{64}$/.test(receipt.sha256));
  const timestampIsValid =
    receipt.updatedAt === null ||
    (typeof receipt.updatedAt === "string" && Number.isFinite(Date.parse(receipt.updatedAt)));
  const errorCodeIsValid =
    receipt.errorCode === undefined ||
    CROKI_CONTEXT_PARSE_ERROR_CODES.includes(receipt.errorCode as CrokiContextParseErrorCode);
  const issueCountIsValid =
    receipt.status === "partial"
      ? isNonNegativeInteger(receipt.issueCount) && receipt.issueCount > 0
      : receipt.issueCount === undefined;
  const selectionIsValid =
    receipt.includedCount === undefined &&
    receipt.omittedCount === undefined &&
    receipt.selectionMode === undefined
      ? true
      : isNonNegativeInteger(receipt.includedCount) &&
        isNonNegativeInteger(receipt.omittedCount) &&
        receipt.includedCount + receipt.omittedCount === receipt.activeCount &&
        (receipt.selectionMode === "full" ||
          receipt.selectionMode === "focused" ||
          receipt.selectionMode === "bounded");
  return (
    promptIsBounded &&
    receipt.relativePath === CROKI_CONTEXT_RELATIVE_PATH &&
    (receipt.status === "loaded" ||
      receipt.status === "partial" ||
      receipt.status === "absent" ||
      receipt.status === "invalid" ||
      receipt.status === "oversized") &&
    (receipt.version === CROKI_CONTEXT_VERSION || receipt.version === null) &&
    fingerprintIsValid &&
    timestampIsValid &&
    countsAreValid &&
    isNonNegativeInteger(receipt.renderedChars) &&
    receipt.renderedChars === (prompt?.length ?? 0) &&
    typeof receipt.truncated === "boolean" &&
    receipt.truncated === isCrokiAgentContextTruncated(prompt) &&
    errorCodeIsValid &&
    issueCountIsValid &&
    selectionIsValid
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
