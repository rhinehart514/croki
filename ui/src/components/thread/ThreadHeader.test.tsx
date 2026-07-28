import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ThreadTimeline, WorkIndexItem } from "@/api";
import { ThreadHeader } from "./ThreadHeader";

const item: WorkIndexItem = {
  threadRef: "thread:activation",
  ventureRef: "venture:drover",
  parentThreadRef: "thread:venture-root",
  originMessageRef: "conversation:one",
  subjectRefs: [],
  focusRef: "thread:activation",
  founderIntent: "Improve activation",
  lifecycle: "open",
  activity: "running",
  attention: "none",
  terminal: null,
  unread: false,
  reviewedThrough: null,
  latestMeaningfulEvent: { kind: "running", ref: "run:one#running", at: null, summary: "Working" },
  runRefs: ["run:one"],
  pinnedAt: null,
  participantRefs: ["codex"],
  activeParticipantRefs: ["codex"],
  createdAt: null,
  updatedAt: null,
};

describe("ThreadHeader deletion", () => {
  it("warns that active work stops before deleting the chat", async () => {
    const onDelete = vi.fn(async () => undefined);
    render(<ThreadHeader
      item={item}
      timeline={null}
      onTogglePin={vi.fn()}
      onRename={vi.fn(async () => undefined)}
      onDelete={onDelete}
      renameDisabledReason={null}
    />);

    fireEvent.click(screen.getByLabelText("Thread actions"));
    fireEvent.click(screen.getByRole("button", { name: "Delete thread" }));
    expect(screen.getByText("Any active work will stop. Applied changes and receipts stay.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete thread" }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });
});

describe("ThreadHeader usage readout", () => {
  const timelineWith = (usage: ThreadTimeline["usage"]): ThreadTimeline => ({
    ventureId: "drover",
    revision: 1,
    thread: item,
    items: [],
    usage,
    agents: [],
    visuals: [],
  });
  const renderHeader = (timeline: ThreadTimeline | null) => render(<ThreadHeader
    item={item}
    timeline={timeline}
    onTogglePin={vi.fn()}
    onRename={vi.fn(async () => undefined)}
    onDelete={vi.fn(async () => undefined)}
    renameDisabledReason={null}
  />);

  it("shows measured cost and tokens compactly", () => {
    renderHeader(timelineWith({ costUsd: 0.4234, inputTokens: 118_000, outputTokens: 12_400, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, driveCount: 3 }));
    const readout = screen.getByText(/\$0\.42 · 130k tokens/);
    expect(readout).toHaveClass("thread-usage");
    expect(readout).toHaveAttribute("title", "118k in · 12k out · 3 runs");
  });

  it("shows nothing when no usage was measured", () => {
    const { container } = renderHeader(timelineWith(null));
    expect(container.querySelector(".thread-usage")).toBeNull();
  });
});
