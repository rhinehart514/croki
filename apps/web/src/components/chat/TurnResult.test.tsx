import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ThreadId, TurnId } from "@croki/contracts";
import type { TurnResultProjection } from "@croki/client-runtime/state/thread-evidence";

import { TurnResult } from "./TurnResult";

describe("TurnResult", () => {
  it("renders one factual receipt with source affordances and attribution", () => {
    const threadId = ThreadId.make("thread-result-view");
    const turnId = TurnId.make("turn-result-view");
    const result: TurnResultProjection = {
      id: "turn-result:thread-result-view:turn-result-view",
      threadId,
      turnId,
      status: "completed",
      settledAt: "2026-08-16T10:04:00.000Z",
      facts: [
        {
          id: "result:files",
          kind: "changed-files",
          label: "Changed files",
          value: "2 files",
          state: "observed",
          source: {
            id: "checkpoint-1",
            kind: "checkpoint",
            label: "checkpoint",
            observedAt: "2026-08-16T10:03:00.000Z",
            target: { surface: "diff", threadId, turnId },
          },
        },
        {
          id: "result:visual-missing",
          kind: "visual-evidence",
          label: "Visual evidence",
          value: "Not checked",
          state: "missing",
          source: {
            id: "checkpoint-1",
            kind: "checkpoint",
            label: "changed UI files",
            observedAt: "2026-08-16T10:03:00.000Z",
            target: { surface: "diff", threadId, turnId },
          },
        },
        {
          id: "result:provider",
          kind: "provider-conclusion",
          label: "Provider conclusion",
          value: "The provider reported the observed result.",
          state: "observed",
          attributedTo: "provider",
          source: {
            id: "message-1",
            kind: "message",
            label: "provider answer",
            observedAt: "2026-08-16T10:04:00.000Z",
            target: { surface: "thread", threadId, turnId },
          },
        },
      ],
    };
    const markup = renderToStaticMarkup(<TurnResult result={result} onOpenSource={vi.fn()} />);

    expect(markup).toContain("Turn result");
    expect(markup).toContain("Not checked");
    expect(markup).toContain("provider-reported");
    expect(markup).toContain("Source: checkpoint");
    expect(markup).toContain('data-turn-result="turn-result-view"');
  });
});
