import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkIndexItem } from "@/api";
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
      onOpenVisual={vi.fn()}
      onTogglePin={vi.fn()}
      onRename={vi.fn(async () => undefined)}
      onDelete={onDelete}
      renameDisabledReason={null}
    />);

    fireEvent.click(screen.getByLabelText("Thread actions"));
    fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));
    expect(screen.getByText("Any active work will stop. Product changes and receipts stay.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });
});
