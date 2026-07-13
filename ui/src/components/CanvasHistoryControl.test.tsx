import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasHistoryControl } from "@/components/CanvasHistoryControl";
import type { CanvasEdit } from "@/lib/canvasHistory";
import type { GTMGraph } from "@/types";

const graph: GTMGraph = { id: "g1", name: "Pipeline", version: "1", nodes: [], edges: [] };

function edit(over: Partial<CanvasEdit> = {}): CanvasEdit {
  return {
    id: "edit-1",
    label: "Added research",
    actor: { by: "you" },
    at: Date.now() - 10_000,
    before: graph,
    after: graph,
    ...over,
  };
}

describe("CanvasHistoryControl", () => {
  it("keeps the human-readable receipt order and undone state", () => {
    render(
      <CanvasHistoryControl
        edits={[
          edit(),
          edit({ id: "edit-2", label: "Connected research to draft", actor: { by: "claude" } }),
        ]}
        index={1}
        canUndo
        canRedo
        onUndo={vi.fn()}
        onRedo={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show the board history" }));
    const trail = screen.getByRole("log", { name: "What you and Claude built" });
    const rows = within(trail).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Connected research to draft");
    expect(rows[0]).toHaveTextContent("Claude");
    expect(rows[0]).toHaveClass("undone");
    expect(rows[1]).toHaveTextContent("Added research");
    expect(rows[1]).toHaveTextContent("You");
  });

  it("opens from the keyboard, returns focus on Escape, and dismisses outside", async () => {
    render(
      <>
        <CanvasHistoryControl
          edits={[edit()]}
          index={1}
          canUndo
          canRedo={false}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
        />
        <button type="button">Outside history</button>
      </>,
    );

    const trigger = screen.getByRole("button", { name: "Show the board history" });
    trigger.focus();
    // Native buttons turn Enter/Space into a zero-detail click; jsdom does not synthesize it.
    fireEvent.click(trigger, { detail: 0 });
    expect(await screen.findByRole("log", { name: "What you and Claude built" })).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("log", { name: "What you and Claude built" })).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    expect(await screen.findByRole("log", { name: "What you and Claude built" })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside history" }));
    fireEvent.click(screen.getByRole("button", { name: "Outside history" }));
    await waitFor(() => expect(screen.queryByRole("log", { name: "What you and Claude built" })).toBeNull());
  });

  it("keeps an open trail visible while using its undo and redo controls", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(
      <CanvasHistoryControl
        edits={[edit()]}
        index={1}
        canUndo
        canRedo
        onUndo={onUndo}
        onRedo={onRedo}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show the board history" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo the last board edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo the next board edit" }));

    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).toHaveBeenCalledOnce();
    expect(screen.getByRole("log", { name: "What you and Claude built" })).toBeInTheDocument();
  });
});
