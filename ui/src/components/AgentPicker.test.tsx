import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentPicker } from "./AgentPicker";

describe("AgentPicker", () => {
  it("uses an accessible radio menu and reports the selected model", async () => {
    const onChange = vi.fn();
    render(<AgentPicker value="auto" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /auto/i }));
    expect(screen.getAllByRole("group")).toHaveLength(1);
    const model = await screen.findByRole("menuitemradio", { name: /sonnet 4\.6/i });
    fireEvent.pointerDown(model, { pointerType: "mouse" });
    fireEvent.click(model);

    expect(onChange).toHaveBeenCalledWith("claude-sonnet-4-6");
  });

  it("keeps preview models behind an explicit keyboard-reachable disclosure", async () => {
    render(<AgentPicker value="auto" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /auto/i }));
    expect(screen.queryByRole("menuitemradio", { name: /gpt-5\.6 sol/i })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("menuitem", { name: "More models" }));
    expect(await screen.findByRole("menuitemradio", { name: /gpt-5\.6 sol/i })).toBeInTheDocument();
  });
});
