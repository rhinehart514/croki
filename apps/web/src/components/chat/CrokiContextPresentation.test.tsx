import type { OrchestrationThreadActivity } from "@croki/contracts";
import { CROKI_CONTEXT_RELATIVE_PATH, type CrokiContextReceipt } from "@croki/shared/crokiContext";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { CrokiAppliedContextReceipt } from "./CrokiContextPresentation";
import { deriveCrokiContextReceiptsByMessageId } from "./CrokiContextPresentation.logic";

describe("historical Croki context receipts", () => {
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
    expect(markup).toContain("Context applied");
    expect(markup).toContain("Native");
    expect(markup).toContain("2 approved");
    expect(markup).toContain("Proposals excluded: 1");
    expect(markup).toContain("aaaaaaaa");
    expect(markup).toContain("2026-07-30 14:00");
    expect(markup).not.toContain("SECRET");
  });

  it("keeps legacy truncation, recovery, harness, and release metadata inspectable", () => {
    const partial = {
      ...loadedReceipt(),
      status: "partial" as const,
      errorCode: "malformed" as const,
      issueCount: 2,
      truncated: true,
      harnessId: "product-v1" as const,
      releaseVersion: "0.4.2",
      releaseItemCount: 3,
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
    expect(markup).toContain("Product");
    expect(markup).toContain("Context applied with 2 omitted issues");
    expect(markup).toContain("Release 0.4.2");
    expect(markup).toContain("Truncated: yes");
  });

  it("rejects unbounded legacy release receipt metadata", () => {
    const receipts = deriveCrokiContextReceiptsByMessageId([
      activity({
        messageId: "unbounded-release",
        receipt: {
          ...loadedReceipt(),
          releaseVersion: "x".repeat(81),
          releaseItemCount: 61,
        },
      }),
    ]);
    expect(receipts.has("unbounded-release")).toBe(false);
  });
});

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
    summary: "Applied project context",
    payload,
    turnId: null,
    createdAt: "2026-07-30T14:00:01.000Z",
  };
}
