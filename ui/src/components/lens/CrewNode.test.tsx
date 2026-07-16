import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  NodeToolbar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Position: { Bottom: "bottom", Right: "right" },
}));
vi.mock("@/components/crew/CrewFace", () => ({ CrewFace: () => <span data-testid="crew-face" /> }));

import { CrewNode, type CrewNodeData } from "./CrewNode";

describe("CrewNode", () => {
  it("sends a capability proposal to chat and collapses the canvas form", async () => {
    const onProposeCapability = vi.fn().mockResolvedValue(undefined);
    const data: CrewNodeData = {
      crew: { ref: "mara", summonedAt: "now", soul: { name: "Mara" } },
      agent: null,
      participantLabel: "employee",
      working: false,
      onProposeCapability,
    };
    const props = { data, selected: true } as unknown as ComponentProps<typeof CrewNode>;
    render(<CrewNode {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /propose capability/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /capability for mara/i }), { target: { value: "independent verification" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to chat" }));

    await waitFor(() => expect(onProposeCapability).toHaveBeenCalledWith("mara", "independent verification"));
    expect(screen.getByRole("button", { name: "Proposal sent to chat" })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
