import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkChangeComment } from "./WorkChangeComment";

const replyInConversation = vi.fn();
vi.mock("@/api", () => ({
  replyInConversation: (...args: unknown[]) => replyInConversation(...args),
}));

const workspace = (overrides: Record<string, unknown> = {}) => ({
  id: "ws-1",
  ventureId: "v1",
  threadRef: "thread:abc",
  betId: "bet-1",
  ...overrides,
}) as never;

describe("WorkChangeComment", () => {
  beforeEach(() => {
    replyInConversation.mockReset().mockResolvedValue({});
  });

  it("renders nothing without a selected file", () => {
    const { container } = render(
      <WorkChangeComment workspace={workspace()} path={null} readOnlyReason={null} onSteered={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("steers the live drive with the file anchored to the comment", async () => {
    const onSteered = vi.fn();
    render(
      <WorkChangeComment workspace={workspace()} path="src/app/WorkSurface.tsx" readOnlyReason={null} onSteered={onSteered} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Comment on WorkSurface.tsx/ }));
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "tighten the empty state" } });
    fireEvent.click(screen.getByRole("button", { name: "Steer" }));

    await waitFor(() => expect(onSteered).toHaveBeenCalled());
    expect(replyInConversation).toHaveBeenCalledWith("v1", {
      message: "Re `src/app/WorkSurface.tsx`:\n\ntighten the empty state",
      threadRef: "thread:abc",
      betId: "bet-1",
      mode: "work",
    });
  });

  it("is honest that a completed workspace opens the next direction, not a steer", () => {
    render(
      <WorkChangeComment workspace={workspace({ betId: null })} path="src/app/WorkSurface.tsx" readOnlyReason={null} onSteered={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Comment on WorkSurface.tsx/ }));
    expect(screen.getByText("Opens the next direction in this Thread.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("holds behind the read-only reason instead of sending", () => {
    render(
      <WorkChangeComment workspace={workspace()} path="src/app/WorkSurface.tsx" readOnlyReason="Croki is reconnecting." onSteered={() => {}} />,
    );
    expect(screen.getByText("Croki is reconnecting.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Comment on/ })).not.toBeInTheDocument();
  });
});
