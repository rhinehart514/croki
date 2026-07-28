import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadInterventionControls } from "./ThreadInterventionControls";

const editQueuedFounderTurn = vi.fn();
const removeQueuedFounderTurn = vi.fn();
vi.mock("@/api", () => ({
  editQueuedFounderTurn: (...args: unknown[]) => editQueuedFounderTurn(...args),
  removeQueuedFounderTurn: (...args: unknown[]) => removeQueuedFounderTurn(...args),
  decideWallItem: vi.fn(),
}));

const turns = [
  { id: "founder-turn:one", text: "First correction", fromMessageId: "m1", state: "queued" as const, queuedAt: "2026-07-25T10:00:00Z", updatedAt: "2026-07-25T10:00:00Z" },
  { id: "founder-turn:two", text: "Second correction", fromMessageId: "m2", state: "queued" as const, queuedAt: "2026-07-25T10:01:00Z", updatedAt: "2026-07-25T10:01:00Z" },
];

describe("ThreadInterventionControls", () => {
  beforeEach(() => {
    editQueuedFounderTurn.mockReset().mockResolvedValue({});
    removeQueuedFounderTurn.mockReset().mockResolvedValue({});
  });

  it("keeps queued founder turns ordered, editable, and removable above the composer", async () => {
    const changed = vi.fn();
    render(<ThreadInterventionControls ventureId="v1" threadRef="thread:one" betId="b1" items={[]} queuedTurns={turns} readOnlyReason={null} onChanged={changed} />);
    const list = screen.getByRole("list");
    expect(list.textContent).toMatch(/First correction.*Second correction/);

    fireEvent.click(screen.getByRole("button", { name: "Edit queued follow-up: First correction" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit queued follow-up" }), { target: { value: "Edited first" } });
    fireEvent.click(screen.getByRole("button", { name: "Save queued follow-up" }));
    await waitFor(() => expect(editQueuedFounderTurn).toHaveBeenCalledWith("v1", "thread:one", "b1", "founder-turn:one", "Edited first"));

    fireEvent.click(screen.getByRole("button", { name: "Remove queued follow-up: Second correction" }));
    await waitFor(() => expect(removeQueuedFounderTurn).toHaveBeenCalledWith("v1", "thread:one", "b1", "founder-turn:two"));
    expect(changed).toHaveBeenCalledTimes(2);
  });
});
