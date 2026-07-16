import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AtlasWallPanel } from "./AtlasWallPanel";

describe("AtlasWallPanel", () => {
  it("opens a truthful clear-wall state and points to inward motion", () => {
    const onOpenChange = vi.fn();
    const props = {
      queue: [],
      wallCount: 0,
      liveBetCount: 3,
      open: false,
      onOpenChange,
      onDecide: vi.fn(),
    };
    const view = render(<AtlasWallPanel {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /nothing needs you yet/i }));
    expect(onOpenChange).toHaveBeenCalledWith(true);

    view.rerender(<AtlasWallPanel {...props} open />);
    expect(screen.getByRole("heading", { name: /the firm is still here/i })).toBeVisible();
    expect(screen.getByText(/3 lines are still moving inward/i)).toBeVisible();
  });
});
