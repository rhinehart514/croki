import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@xyflow/react", () => ({
  ViewportPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReactFlow: () => ({
    screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x: x - 100, y: y - 50 }),
  }),
}));

import { CanvasNativeCreate } from "@/components/canvas/CanvasNativeCreate";

describe("CanvasNativeCreate", () => {
  it("creates a goal at the intended flow coordinate", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const dismiss = vi.fn();
    render(
      <CanvasNativeCreate
        intent={{ token: 1, screen: { x: 460, y: 290 } }}
        onCreate={create}
        onDismiss={dismiss}
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Improve first-session activation" } });
    fireEvent.submit(screen.getByRole("form", { name: "Add to canvas" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith({
      kind: "goal",
      title: "Improve first-session activation",
      position: { x: 360, y: 240 },
    }));
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it("switches to open work and keeps failures correctable in place", async () => {
    const create = vi.fn().mockRejectedValue(new Error("The canvas changed. Try again."));
    const dismiss = vi.fn();
    render(
      <CanvasNativeCreate
        intent={{ token: 2, screen: { x: 200, y: 150 } }}
        onCreate={create}
        onDismiss={dismiss}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Work" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Draft onboarding comparison" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("The canvas changed. Try again.")).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith({
      kind: "work",
      title: "Draft onboarding comparison",
      position: { x: 100, y: 100 },
    });
    expect(dismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("Draft onboarding comparison");
  });

  it("closes locally with Escape", () => {
    const dismiss = vi.fn();
    render(
      <CanvasNativeCreate
        intent={{ token: 3, screen: { x: 200, y: 150 } }}
        onCreate={vi.fn()}
        onDismiss={dismiss}
      />,
    );
    fireEvent.keyDown(screen.getByRole("form", { name: "Add to canvas" }), { key: "Escape" });
    expect(dismiss).toHaveBeenCalledOnce();
  });
});
