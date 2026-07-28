import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ThreadTimeline, VisualReference } from "@/api";
import { WORK_REVIEW_REQUEST_EVENT, type WorkReviewRequest } from "@/components/work-mode/previewPresentation";
import { useWorkspaceVisuals } from "./useWorkspaceVisuals";

const codeVisual: VisualReference = {
  kind: "diff",
  ref: "work:attempt-one",
  threadRef: "thread:one",
  title: "Fix return continuity",
};

function timeline(item: ThreadTimeline["items"][number]): ThreadTimeline {
  return {
    ventureId: "venture-one",
    revision: 1,
    thread: { threadRef: "thread:one" } as ThreadTimeline["thread"],
    agents: [],
    visuals: [codeVisual],
    items: [item],
  };
}

function setup(value: ThreadTimeline) {
  const setCanvasOpen = vi.fn();
  const setStage = vi.fn();
  const setArtifactFocus = vi.fn();
  const openerRef = { current: null };
  const hook = renderHook(() => useWorkspaceVisuals({
    timeline: value,
    openerRef,
    setCanvasOpen,
    setStage,
    setArtifactFocus,
  }));
  return { ...hook, setCanvasOpen, setStage, setArtifactFocus };
}

describe("useWorkspaceVisuals contextual Review routing", () => {
  it("opens the exact native attempt in Review instead of a second visual stage", () => {
    const requested = vi.fn<(event: Event) => void>();
    window.addEventListener(WORK_REVIEW_REQUEST_EVENT, requested);
    const source = document.createElement("button");
    const view = setup(timeline({
      kind: "artifact",
      id: "artifact:attempt-one",
      ref: "work:attempt-one",
      visual: codeVisual,
      artifact: { id: "attempt-one", kind: "native-code" },
    }));
    try {
      act(() => view.result.current(codeVisual, source));
      expect(view.setCanvasOpen).toHaveBeenCalledWith(false);
      expect(view.setStage).toHaveBeenCalledWith(null);
      const event = requested.mock.calls[0]?.[0] as CustomEvent<WorkReviewRequest>;
      expect(event.detail).toMatchObject({
        threadRef: "thread:one",
        workspaceId: "attempt-one",
        target: "changes",
        source,
      });
    } finally {
      window.removeEventListener(WORK_REVIEW_REQUEST_EVENT, requested);
    }
  });

  it("routes a coding-attempt comparison to the same contextual Review", () => {
    const comparison: VisualReference = {
      kind: "comparison",
      ref: "thread:one#code-attempts",
      threadRef: "thread:one",
      title: "Implementation attempts",
    };
    const requested = vi.fn<(event: Event) => void>();
    window.addEventListener(WORK_REVIEW_REQUEST_EVENT, requested);
    const view = setup(timeline({
      kind: "comparison",
      id: "comparison:one",
      ref: comparison.ref,
      visual: comparison,
      alternatives: [],
    }));
    try {
      act(() => view.result.current(comparison, document.createElement("button")));
      const event = requested.mock.calls[0]?.[0] as CustomEvent<WorkReviewRequest>;
      expect(event.detail).toMatchObject({ threadRef: "thread:one", target: "comparison" });
      expect(view.setStage).toHaveBeenCalledWith(null);
    } finally {
      window.removeEventListener(WORK_REVIEW_REQUEST_EVENT, requested);
    }
  });
});
