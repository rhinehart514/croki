import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasRegionGroupingControl } from "./CanvasRegionGroupingControl";

describe("CanvasRegionGroupingControl", () => {
  it("names a multi-selection inline and explains that members remain shared", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<CanvasRegionGroupingControl selectionCount={3} open={false} onOpen={vi.fn()} onCancel={vi.fn()} onCreate={onCreate} />);
    expect(screen.getByRole("button", { name: /Group 3 items/ })).toBeInTheDocument();
    rerender(<CanvasRegionGroupingControl selectionCount={3} open onOpen={vi.fn()} onCancel={vi.fn()} onCreate={onCreate} />);
    expect(screen.getByText(/references stay shared and editable/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name this work"), { target: { value: "Fix activation" } });
    fireEvent.click(screen.getByRole("button", { name: "Create region" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("Fix activation"));
  });

  it("supports Escape as a keyboard cancellation equivalent", () => {
    const onCancel = vi.fn();
    render(<CanvasRegionGroupingControl selectionCount={2} open onOpen={vi.fn()} onCancel={onCancel} onCreate={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole("form", { name: /Create work region/ }), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
