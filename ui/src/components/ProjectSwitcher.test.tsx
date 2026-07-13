import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectSwitcher } from "./ProjectSwitcher";
import type { ProjectSummary } from "@/types";

const projects = [
  { id: "alpha", name: "Alpha", channelCount: 2 },
  { id: "beta", name: "Beta", channelCount: 0 },
] as ProjectSummary[];

describe("ProjectSwitcher", () => {
  it("exposes products as an accessible radio menu and switches from the menu item", () => {
    const onSwitch = vi.fn();
    render(
      <ProjectSwitcher
        projects={projects}
        activeProjectId="alpha"
        busy={false}
        onSwitch={onSwitch}
        onManage={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /current product: alpha/i }));
    const beta = screen.getByRole("menuitemradio", { name: /beta/i });
    expect(screen.getByRole("menuitemradio", { name: /alpha/i })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(beta);

    expect(onSwitch).toHaveBeenCalledWith("beta");
  });

  it("moves removal into an explicit destructive confirmation", () => {
    const onDelete = vi.fn();
    render(
      <ProjectSwitcher
        projects={projects}
        activeProjectId="alpha"
        busy={false}
        onSwitch={vi.fn()}
        onManage={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /current product: alpha/i }));
    expect(screen.getByText("Remove product")).toHaveAttribute("data-slot", "dropdown-menu-label");
    fireEvent.click(screen.getByRole("menuitem", { name: /beta/i }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByRole("heading", { name: "Remove Beta?" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove product" }));

    expect(onDelete).toHaveBeenCalledWith("beta");
  });
});
