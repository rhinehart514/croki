import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { deriveCurrentReality } from "@croki/client-runtime/state/current-reality";
import type { CurrentRealityThread } from "@croki/client-runtime/state/thread-evidence";
import { ThreadId, TurnId } from "@croki/contracts";

import { CurrentReality } from "./CurrentReality";

function thread(): CurrentRealityThread {
  const threadId = ThreadId.make("thread-view");
  const turnId = TurnId.make("turn-view");
  return {
    id: threadId,
    title: "Render Current Reality",
    branch: "feature/reality",
    worktreePath: "/workspace/croki",
    latestTurn: {
      turnId,
      state: "running",
      requestedAt: "2026-08-16T10:00:00.000Z",
      startedAt: "2026-08-16T10:00:01.000Z",
      completedAt: null,
      assistantMessageId: null,
    },
    createdAt: "2026-08-16T09:00:00.000Z",
    updatedAt: "2026-08-16T10:01:00.000Z",
    messages: [],
    proposedPlans: [],
    activities: [],
    checkpoints: [],
    session: null,
  };
}

describe("CurrentReality", () => {
  it("shows source labels, explicit missing evidence, and open affordances", () => {
    const reality = deriveCurrentReality({
      thread: thread(),
      additionalFacts: [
        {
          id: "reality:test-missing",
          section: "checks",
          label: "Visual evidence",
          value: "Not checked",
          state: "missing",
          source: {
            id: "checkpoint:test",
            kind: "checkpoint",
            label: "latest checkpoint",
            observedAt: "2026-08-16T10:01:00.000Z",
            target: { surface: "diff", threadId: thread().id },
          },
        },
      ],
    });
    const markup = renderToStaticMarkup(
      <CurrentReality reality={reality} onOpenSource={vi.fn()} onDismiss={vi.fn()} />,
    );

    expect(markup).toContain("Current reality");
    expect(markup).toContain("Not checked");
    expect(markup).toContain("Source: latest checkpoint");
    expect(markup).toContain("Open source: latest checkpoint");
    expect(markup).toContain('data-current-reality="true"');
  });
});
