import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CodingWorkspace } from "@/api";
import { WorkChangeComment } from "./WorkChangeComment";

const {
  replyInConversation,
  addCodingReviewComment,
  addComposerSourceReference,
} = vi.hoisted(() => ({
  replyInConversation: vi.fn(),
  addCodingReviewComment: vi.fn(),
  addComposerSourceReference: vi.fn(),
}));
vi.mock("@/api", async (original) => ({
  ...await original<typeof import("@/api")>(),
  replyInConversation,
  addCodingReviewComment,
}));
vi.mock("@/components/now/composerSourceReference", async (original) => ({
  ...await original<typeof import("@/components/now/composerSourceReference")>(),
  addComposerSourceReference,
}));

const workspace = {
  id: "attempt-one",
  ventureId: "venture-one",
  threadRef: "thread:one",
  betId: "bet-one",
  checkpoints: [{ id: "turn-1" }],
} as CodingWorkspace;
const line = {
  path: "ui/src/App.tsx",
  line: 42,
  side: "additions" as const,
  selectedText: "return <App />;",
};

describe("Work exact-line review comment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replyInConversation.mockResolvedValue({ act: "new-direction", messageId: "message-one" });
    addCodingReviewComment.mockResolvedValue({});
  });

  it("continues the exact attempt and attaches the correction to its checkpoint and founder turn", async () => {
    const onSteered = vi.fn();
    render(<WorkChangeComment workspace={workspace} line={line} sourceScopeKey="scope:one" readOnlyReason={null} onSteered={onSteered} />);
    fireEvent.click(screen.getByRole("button", { name: "Comment on App.tsx:42" }));
    fireEvent.change(screen.getByPlaceholderText("What should change at App.tsx:42?"), { target: { value: "Keep the pending state visible." } });
    fireEvent.click(screen.getByRole("button", { name: "Send correction" }));

    await waitFor(() => expect(addCodingReviewComment).toHaveBeenCalledWith("venture-one", "attempt-one", expect.objectContaining({
      checkpointId: "turn-1",
      path: "ui/src/App.tsx",
      startLine: 42,
      endLine: 42,
      selectedText: "return <App />;",
      body: "Keep the pending state visible.",
      messageRef: "conversation:message-one",
    })));
    expect(replyInConversation).toHaveBeenCalledWith("venture-one", expect.objectContaining({
      threadRef: "thread:one",
      betId: "bet-one",
      workRef: "attempt-one",
      mode: "work",
    }));
    expect(onSteered).toHaveBeenCalled();
  });

  it("adds the selected line through the shared readable composer-reference grammar", () => {
    render(<WorkChangeComment workspace={workspace} line={line} sourceScopeKey="scope:one" readOnlyReason={null} onSteered={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Reference App.tsx:42" }));
    expect(addComposerSourceReference).toHaveBeenCalledWith({
      scopeKey: "scope:one",
      path: "ui/src/App.tsx",
      startLine: 42,
      endLine: 42,
      ref: "diff:attempt-one:ui/src/App.tsx#L42:additions",
    });
  });
});
