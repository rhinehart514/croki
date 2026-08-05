import * as NodeCrypto from "node:crypto";

import type { CrokiHarnessId } from "@croki/contracts";

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
} from "@croki/shared/crokiContext";
import { recoverCrokiContext } from "@croki/shared/crokiContextRecovery";
import { CROKI_RELEASE_LIMITS } from "@croki/shared/crokiReleaseCandidate";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

export interface LoadedCrokiAgentContext {
  readonly prompt: string | null;
  readonly receipt: CrokiContextReceipt;
}

export const CROKI_PRODUCT_HARNESS_INSTRUCTION = `<croki_product_harness version="1">
Use the provider's native agent runtime, tools, authority, Review, and Croki Senses. For this turn, act as the founder's product judgment partner and treat product, customer, market, positioning, and release direction as one reality. Inspect declared application direction, repository and release evidence, actual product behavior, and bounded sibling-Thread activity when they can change the outcome. Clarify the outcome behind the request; make assumptions, evidence, contradictions, consequences, and reversible tests explicit; and leave consequential judgment to the founder. Propose exact released/building deltas, but never create or rewrite .croki/application.croki until the founder explicitly confirms that delta in the Thread. Do not ask the user to fill forms, maintain a Canvas, task board, CRM, or second workflow system, and do not treat agent proposals as canon. Canvas is Croki's automatic visual projection of sensed state, not project memory or a source of truth.
</croki_product_harness>`;

export const CROKI_GTM_HARNESS_INSTRUCTION = `<croki_gtm_harness version="1">
Use the provider's native agent runtime, tools, authority, Review, and Croki Senses. For this turn, act as the founder's go-to-market judgment partner: clarify the decision behind the request; make assumptions, evidence, contradictions, consequences, and reversible tests explicit; and leave consequential judgment to the founder. Observe and inspect live sources when they materially improve your judgment. Do not ask the user to author or connect nodes, fill forms, maintain a Canvas, or treat agent proposals as canon. Canvas is Croki's automatic visual projection of sensed state, not another memory, runtime, source of truth, execution surface, or proposal inbox.
</croki_gtm_harness>`;

export const CROKI_VENTURE_HARNESS_INSTRUCTION = `<croki_venture_harness version="1">
Use the provider's native runtime, tools, authority, Review, and Croki Senses. For this explicit turn, help the founder develop the product and its market as one reality. Inspect actual product behavior, implementation, customer evidence, current promise, market alternatives, and distribution evidence when they can change the outcome. Name contradictions between what is built, what is promised, and what sources support. When parallel investigation is useful and the user asks for it, give native workers bounded and meaningfully different assignments, keep research read-only by default, and converge conclusions with provenance in this Thread. Recommend or implement the strongest coherent result within the user's authority; do not stop at a strategy document when repository-local work can make the direction true. Leave consequential product, positioning, external-write, spending, and publication judgments to the founder. Never promote observations or agent inferences into .croki/venture.croki without an explicit founder action. Do not create or maintain a Canvas, task board, CRM, marketing dashboard, or second workflow system.
</croki_venture_harness>`;

export const CROKI_PARALLEL_THREADS_INSTRUCTION = `<croki_parallel_threads_beta version="1">
The user has enabled Croki's Parallel Threads beta. Only when the user explicitly asks to split, delegate, fan out, spin up multiple threads, investigate in parallel, or converge independent work, use the provider's native delegation tools. Keep the current Thread as the canonical conversation. Give each worker a bounded, meaningfully different assignment; default parallel investigation to read-only; use no more than five workers unless the user explicitly requests more; wait for every worker to reach a terminal state; then synthesize conclusions, evidence, disagreements, and source references back in this Thread. Do not create a second plan, coordinator, task board, or hidden workflow. Ordinary requests remain ordinary native turns.
</croki_parallel_threads_beta>`;

/**
 * Compiles one provider turn without creating a second Canvas conversation or
 * history. Runtime turns no longer hydrate this value from `.croki/context.json`.
 * The optional context argument remains for legacy import/export callers and
 * for replaying historical turns that already persisted a rendered snapshot.
 */
export function compileCrokiTurnInput(input: {
  readonly harnessId: CrokiHarnessId;
  readonly agentContext: string | null;
  readonly userInput: string | undefined;
  readonly parallelThreadsEnabled?: boolean;
}): string | undefined {
  const parallelInstruction = input.parallelThreadsEnabled
    ? CROKI_PARALLEL_THREADS_INSTRUCTION
    : null;
  if (input.harnessId === "native")
    return (
      [parallelInstruction, input.agentContext, input.userInput]
        .filter((value): value is string => Boolean(value))
        .join("\n\n") || undefined
    );
  const harnessInstruction =
    input.harnessId === "venture-v1"
      ? CROKI_VENTURE_HARNESS_INSTRUCTION
      : input.harnessId === "product-v1"
        ? CROKI_PRODUCT_HARNESS_INSTRUCTION
        : CROKI_GTM_HARNESS_INSTRUCTION;
  return [harnessInstruction, parallelInstruction, input.agentContext, input.userInput]
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
}

const emptyReceipt = (
  status: CrokiContextReceipt["status"],
  harnessId: CrokiHarnessId,
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
  harnessId,
  ...fields,
});

const sha256 = (contents: string): string =>
  NodeCrypto.createHash("sha256").update(contents, "utf8").digest("hex");

function parseLoadedContext(
  contents: string,
  fingerprint: string,
  query: string | undefined,
  harnessId: CrokiHarnessId,
): LoadedCrokiAgentContext {
  try {
    const context = parseCrokiContext(contents);
    return loadedContext(context, fingerprint, query, harnessId, "loaded");
  } catch (error) {
    try {
      const recovery = recoverCrokiContext(contents);
      if (recovery.issues.length > 0) {
        return loadedContext(recovery.context, fingerprint, query, harnessId, "partial", {
          errorCode: recovery.issues[0]!.code,
          issueCount: recovery.issues.length,
        });
      }
    } catch {
      // The strict error below is the authoritative envelope failure.
    }
    return invalidContext(error, fingerprint, harnessId);
  }
}

function loadedContext(
  context: ReturnType<typeof parseCrokiContext>,
  fingerprint: string,
  query: string | undefined,
  harnessId: CrokiHarnessId,
  status: "loaded" | "partial",
  recovery: Pick<CrokiContextReceipt, "errorCode" | "issueCount"> = {},
): LoadedCrokiAgentContext {
  const compilation = compileCrokiAgentContext(context, query !== undefined ? { query } : {});
  const currentCount = context.nodes.filter((node) => node.status === "current").length;
  const provisionalCount = context.nodes.filter((node) => node.status === "provisional").length;
  return {
    prompt: compilation.prompt,
    receipt: emptyReceipt(status, harnessId, {
      version: context.version,
      sha256: fingerprint,
      updatedAt: context.updatedAt,
      activeCount: currentCount,
      currentCount,
      provisionalCount,
      renderedChars: compilation.prompt?.length ?? 0,
      truncated: isCrokiAgentContextTruncated(compilation.prompt),
      includedCount: compilation.includedCount,
      omittedCount: compilation.omittedCount,
      selectionMode: compilation.selectionMode,
      ...(context.release?.status === "active"
        ? {
            releaseVersion: context.release.version,
            releaseItemCount: context.release.items.filter(
              (item) => item.status !== "proposed" && item.status !== "deferred",
            ).length,
          }
        : {}),
      ...recovery,
    }),
  };
}

function invalidContext(
  error: unknown,
  fingerprint: string,
  harnessId: CrokiHarnessId,
): LoadedCrokiAgentContext {
  const errorCode: CrokiContextParseErrorCode =
    error instanceof CrokiContextParseError ? error.code : "malformed";
  return {
    prompt: null,
    receipt: emptyReceipt("invalid", harnessId, {
      sha256: fingerprint,
      errorCode,
    }),
  };
}

export function loadCrokiAgentContext(
  cwd: string | undefined,
  query?: string,
  harnessId: CrokiHarnessId = "native",
) {
  if (!cwd) {
    return Effect.succeed<LoadedCrokiAgentContext>({
      prompt: null,
      receipt: emptyReceipt("absent", harnessId),
    });
  }

  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const contextPath = path.join(cwd, CROKI_CONTEXT_RELATIVE_PATH);
    if (!(yield* fileSystem.exists(contextPath))) {
      return {
        prompt: null,
        receipt: emptyReceipt("absent", harnessId),
      } satisfies LoadedCrokiAgentContext;
    }

    const contents = yield* fileSystem.readFileString(contextPath);
    const fingerprint = sha256(contents);
    if (Buffer.byteLength(contents, "utf8") > CROKI_CONTEXT_LIMITS.sourceBytes) {
      return {
        prompt: null,
        receipt: emptyReceipt("oversized", harnessId, { sha256: fingerprint }),
      } satisfies LoadedCrokiAgentContext;
    }

    return parseLoadedContext(contents, fingerprint, query, harnessId);
  }).pipe(
    // Product context is optional. Filesystem failures must never block a turn.
    Effect.orElseSucceed(
      () =>
        ({
          prompt: null,
          receipt: emptyReceipt("invalid", harnessId, { errorCode: "malformed" }),
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
    (receipt.activeCount === receipt.currentCount ||
      receipt.activeCount === receipt.currentCount + receipt.provisionalCount);
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
  const harnessIsValid =
    receipt.harnessId === undefined ||
    receipt.harnessId === "native" ||
    receipt.harnessId === "venture-v1" ||
    receipt.harnessId === "product-v1" ||
    receipt.harnessId === "gtm-v1";
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
  const releaseIsValid =
    receipt.releaseVersion === undefined && receipt.releaseItemCount === undefined
      ? true
      : typeof receipt.releaseVersion === "string" &&
        receipt.releaseVersion === receipt.releaseVersion.trim() &&
        receipt.releaseVersion.length > 0 &&
        receipt.releaseVersion.length <= CROKI_RELEASE_LIMITS.versionChars &&
        isNonNegativeInteger(receipt.releaseItemCount) &&
        receipt.releaseItemCount <= CROKI_RELEASE_LIMITS.items;
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
    harnessIsValid &&
    selectionIsValid &&
    releaseIsValid
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
