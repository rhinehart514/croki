import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadTimeline, WorkIndexItem } from "@/api";
import { ThreadConversation } from "./ThreadConversation";

let composerProps: Record<string, unknown> = {};

vi.mock("./ThreadComposer", () => ({
  ThreadComposer: (props: Record<string, unknown>) => {
    composerProps = props;
    return <button type="button" onClick={() => (props.onSubmitStart as (() => void) | undefined)?.()}>Submit context</button>;
  },
}));
vi.mock("./ThreadMessage", () => ({ ThreadMessage: () => null }));
vi.mock("@/components/FirmFreshness", () => ({ FirmFreshness: () => null }));
vi.mock("@/components/work-mode/productGtmView", () => ({ productGtmViewFromTimeline: () => null }));
vi.mock("@/components/work-mode/workflowSketch", () => ({ workflowSketchFromTimeline: () => null }));

const item: WorkIndexItem = {
  threadRef: "thread:one", ventureRef: "venture:v1", parentThreadRef: null,
  originMessageRef: null, subjectRefs: [], focusRef: "thread:one", founderIntent: "Test direction",
  lifecycle: "open", activity: "idle", attention: "none", terminal: null, unread: false,
  reviewedThrough: null, latestMeaningfulEvent: { kind: "created", ref: "thread:one", at: null, summary: null },
  runRefs: [], pinnedAt: null, participantRefs: [], activeParticipantRefs: [], createdAt: null, updatedAt: null,
};

function timeline(items: ThreadTimeline["items"]): ThreadTimeline {
  return { ventureId: "v1", revision: items.length, thread: item, items, agents: [], visuals: [] };
}

const handoff = (id: string, changed: boolean) => ({
  kind: "message" as const,
  id,
  ref: `conversation:${id}`,
  at: null,
  role: "system",
  messageKind: "handoff",
  content: "Work landed on the canvas.",
  changes: changed
    ? { openedBetIds: ["bet-one"], stagedBetIds: [], wallBetIds: [] }
    : { openedBetIds: [], stagedBetIds: [], wallBetIds: [] },
});

function props(currentTimeline: ThreadTimeline, onWorkRouted: (ref: string) => void) {
  return {
    ventureId: "v1", ventureName: "Venture", surface: "context" as const,
    contextKind: "product-gtm" as const, item, timeline: currentTimeline, lens: null,
    connection: { phase: "current" as const, message: null, lastCurrentAt: null },
    loading: false, error: null, draft: false, draftSession: 1,
    initialScrollTop: null, onScrollChange: vi.fn(), onOpenVisual: vi.fn(), onOpenThread: vi.fn(),
    onTogglePin: vi.fn(), onRename: vi.fn(), onDelete: vi.fn(), onDriven: vi.fn(), onWorkRouted,
  };
}

describe("ThreadConversation contextual work handoff", () => {
  beforeEach(() => { composerProps = {}; });

  it("moves a submitted contextual turn into its Thread when durable work lands", async () => {
    const onWorkRouted = vi.fn();
    const existing = timeline([handoff("old-handoff", true)]);
    const view = render(<ThreadConversation {...props(existing, onWorkRouted)} />);

    fireEvent.click(view.getByRole("button", { name: "Submit context" }));
    view.rerender(<ThreadConversation {...props(timeline([...existing.items, handoff("new-handoff", true)]), onWorkRouted)} />);

    await waitFor(() => expect(onWorkRouted).toHaveBeenCalledWith("thread:one"));
    expect(onWorkRouted).toHaveBeenCalledTimes(1);
  });

  it("keeps a plain contextual answer in place", async () => {
    const onWorkRouted = vi.fn();
    const view = render(<ThreadConversation {...props(timeline([]), onWorkRouted)} />);

    fireEvent.click(view.getByRole("button", { name: "Submit context" }));
    view.rerender(<ThreadConversation {...props(timeline([handoff("answer", false)]), onWorkRouted)} />);

    await waitFor(() => expect(composerProps.onSubmitStart).toBeTypeOf("function"));
    expect(onWorkRouted).not.toHaveBeenCalled();
  });
});
