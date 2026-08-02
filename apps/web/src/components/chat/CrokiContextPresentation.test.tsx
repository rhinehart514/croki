import type { OrchestrationThreadActivity, ProjectReadFileResult } from "@t3tools/contracts";
import {
  CROKI_CONTEXT_LIMITS,
  CROKI_CONTEXT_RELATIVE_PATH,
  serializeCrokiContext,
  type CrokiContext,
  type CrokiContextReceipt,
} from "@t3tools/shared/crokiContext";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  CrokiAppliedContextReceipt,
  CrokiComposerContextIndicator,
} from "./CrokiContextPresentation";
import {
  deriveCrokiComposerContextState,
  deriveCrokiContextReceiptsByMessageId,
} from "./CrokiContextPresentation.logic";

const validContext: CrokiContext = {
  version: 1,
  product: "Croki",
  updatedAt: "2026-07-30T14:00:00.000Z",
  nodes: [
    {
      id: "intent-1",
      kind: "intent",
      status: "current",
      title: "Build deliberately",
      body: "Keep the product coherent.",
      updatedAt: "2026-07-30T14:00:00.000Z",
    },
    {
      id: "work-1",
      kind: "work",
      status: "provisional",
      title: "Make context visible",
      body: "Show receipts without changing user text.",
      updatedAt: "2026-07-30T14:00:00.000Z",
    },
  ],
  edges: [],
};

describe("deriveCrokiComposerContextState", () => {
  it("reports the exact active counts for valid provider context", () => {
    expect(
      deriveCrokiComposerContextState(queryForContents(serializeCrokiContext(validContext))),
    ).toEqual({
      status: "loaded",
      currentCount: 1,
      provisionalCount: 1,
      included: true,
      promptTruncated: false,
      updatedAt: "2026-07-30T14:00:00.000Z",
    });
  });

  it("distinguishes provider truncation from file and source limits", () => {
    const largeContext: CrokiContext = {
      ...validContext,
      nodes: [
        { ...validContext.nodes[0]!, body: "x".repeat(11_000) },
        { ...validContext.nodes[1]!, status: "current", body: "y".repeat(11_000) },
      ],
    };
    expect(
      deriveCrokiComposerContextState(queryForContents(serializeCrokiContext(largeContext))),
    ).toMatchObject({ status: "loaded", promptTruncated: true });

    expect(
      deriveCrokiComposerContextState({
        ...queryForContents("{}"),
        data: {
          relativePath: CROKI_CONTEXT_RELATIVE_PATH,
          contents: "{}",
          byteLength: CROKI_CONTEXT_LIMITS.sourceBytes + 1,
          truncated: false,
        },
      }),
    ).toEqual({ status: "oversized" });

    expect(
      deriveCrokiComposerContextState({
        ...queryForContents("{}"),
        data: {
          relativePath: CROKI_CONTEXT_RELATIVE_PATH,
          contents: "{}",
          byteLength: CROKI_CONTEXT_LIMITS.sourceBytes + 1,
          truncated: true,
        },
      }),
    ).toEqual({ status: "truncated" });
  });

  it("keeps missing, invalid, unavailable, and loading states nonblocking and distinct", () => {
    expect(deriveCrokiComposerContextState(queryForContents("not json"))).toEqual({
      status: "invalid",
      errorCode: "invalid-json",
    });
    expect(
      deriveCrokiComposerContextState({
        data: null,
        error: "Failed to read workspace file",
        failure: {
          operation: "realpath-target",
          relativePath: CROKI_CONTEXT_RELATIVE_PATH,
        },
        isPending: false,
      }),
    ).toEqual({ status: "absent" });
    expect(
      deriveCrokiComposerContextState({
        data: null,
        error: "Connection failed",
        failure: new Error("Connection failed"),
        isPending: false,
      }),
    ).toEqual({ status: "unavailable" });
    expect(
      deriveCrokiComposerContextState({
        data: null,
        error: null,
        failure: null,
        isPending: true,
      }),
    ).toEqual({ status: "loading" });
  });
});

describe("Croki context presentation", () => {
  it("renders a compact next-turn control that opens Canvas", () => {
    const onOpenCanvas = vi.fn();
    const markup = renderToStaticMarkup(
      <CrokiComposerContextIndicator
        compact
        state={{
          status: "loaded",
          currentCount: 2,
          provisionalCount: 1,
          included: true,
          promptTruncated: false,
          updatedAt: "2026-07-30T14:00:00.000Z",
        }}
        onOpenCanvas={onOpenCanvas}
      />,
    );

    expect(markup).toContain("Canvas 2");
    expect(markup).toContain("The next turn will include 2 approved Canvas items");
    expect(markup).toContain("1 proposal is excluded");
    expect(markup).not.toContain("2026-07-30T14:00:00.000Z");
  });

  it("identifies the exact active worktree used for the next-turn context", () => {
    const markup = renderToStaticMarkup(
      <CrokiComposerContextIndicator
        compact={false}
        state={{
          status: "loaded",
          currentCount: 2,
          provisionalCount: 1,
          included: true,
          promptTruncated: false,
          updatedAt: "2026-07-30T14:00:00.000Z",
        }}
        workspaceKind="worktree"
        workspaceRoot="/workspace/croki-feature"
        onOpenCanvas={vi.fn()}
      />,
    );

    expect(markup).toContain("worktree croki-feature");
    expect(markup).toContain('data-croki-workspace-root="/workspace/croki-feature"');
    expect(markup).toContain("Context source: active worktree /workspace/croki-feature.");
  });

  it("derives and renders only content-free applied receipts", () => {
    const receipt = loadedReceipt();
    const activities = [
      activity({
        messageId: "message-1",
        prompt: "SECRET PRODUCT CONTEXT",
        receipt,
        sourceEventId: "event-source",
      }),
      activity({ messageId: "ignored", prompt: "SECRET", receipt: { status: "loaded" } }),
    ];
    const receipts = deriveCrokiContextReceiptsByMessageId(activities);
    const markup = renderToStaticMarkup(
      <CrokiAppliedContextReceipt receipt={receipts.get("message-1") ?? null} />,
    );

    expect(receipts.size).toBe(1);
    expect(markup).toContain("Canvas applied");
    expect(markup).toContain("Native");
    expect(markup).toContain("2 approved");
    expect(markup).toContain("Proposals excluded: 1");
    expect(markup).toContain("aaaaaaaa");
    expect(markup).toContain("2026-07-30 14:00");
    expect(markup).not.toContain("SECRET");
  });

  it("shows historical provider-context truncation from content-free receipt metadata", () => {
    const markup = renderToStaticMarkup(
      <CrokiAppliedContextReceipt receipt={{ ...loadedReceipt(), truncated: true }} />,
    );

    expect(markup).toContain("partial");
    expect(markup).toContain("Truncated: yes");
  });

  it("renders partial recovery only when the receipt declares omitted issues", () => {
    const partial = {
      ...loadedReceipt(),
      status: "partial" as const,
      errorCode: "malformed" as const,
      issueCount: 2,
    };
    const receipts = deriveCrokiContextReceiptsByMessageId([
      activity({ messageId: "partial", receipt: partial }),
      activity({
        messageId: "invalid-partial",
        receipt: { ...partial, issueCount: undefined },
      }),
    ]);
    const markup = renderToStaticMarkup(
      <CrokiAppliedContextReceipt receipt={receipts.get("partial") ?? null} />,
    );

    expect(receipts.has("partial")).toBe(true);
    expect(receipts.has("invalid-partial")).toBe(false);
    expect(markup).toContain("Canvas applied with 2 omitted issues");
  });
});

function queryForContents(contents: string): {
  data: ProjectReadFileResult;
  error: null;
  failure: null;
  isPending: false;
} {
  return {
    data: {
      relativePath: CROKI_CONTEXT_RELATIVE_PATH,
      contents,
      byteLength: new TextEncoder().encode(contents).byteLength,
      truncated: false,
    },
    error: null,
    failure: null,
    isPending: false,
  };
}

function loadedReceipt(): CrokiContextReceipt {
  return {
    status: "loaded",
    relativePath: CROKI_CONTEXT_RELATIVE_PATH,
    version: 1,
    sha256: "a".repeat(64),
    updatedAt: "2026-07-30T14:00:00.000Z",
    activeCount: 2,
    currentCount: 2,
    provisionalCount: 1,
    renderedChars: 420,
    truncated: false,
    harnessId: "native",
  };
}

function activity(payload: unknown): OrchestrationThreadActivity {
  return {
    id: "activity-1" as OrchestrationThreadActivity["id"],
    tone: "info",
    kind: "croki.context.applied",
    summary: "Applied Canvas context",
    payload,
    turnId: null,
    createdAt: "2026-07-30T14:00:01.000Z",
  };
}
