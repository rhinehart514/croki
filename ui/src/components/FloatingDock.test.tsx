import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FloatingDock } from "./FloatingDock";

// The dock is deliberately limited to context, real attention, founder state, and settings.

const baseProps = {
  projects: [],
  activeProjectId: null,
  projectBusy: false,
  onSwitchProject: () => {},
  onManageProjects: () => {},
  onNewProduct: () => {},
  problems: 0,
  issuesOpen: false,
  onToggleIssues: () => {},
  pendingDecisions: 0,
  decisionsOpen: false,
  onToggleDecisions: () => {},
} as const;

describe("FloatingDock", () => {
  it("names the dock for the product canvas and has no global Run action", () => {
    render(<FloatingDock {...baseProps} />);
    expect(screen.getByRole("toolbar", { name: "Product canvas controls" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
  });

  it("uses the product canvas as the home destination", () => {
    const onGoHome = vi.fn();
    render(<FloatingDock {...baseProps} onGoHome={onGoHome} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to the product canvas" }));
    expect(onGoHome).toHaveBeenCalledTimes(1);
  });

  it("keeps founder decisions in Needs you and system conditions in separate controls", () => {
    const onToggleIssues = vi.fn();
    const onToggleDecisions = vi.fn();
    const onToggleFailures = vi.fn();
    render(<FloatingDock {...baseProps} problems={2} pendingDecisions={4} failures={3} onToggleIssues={onToggleIssues} onToggleDecisions={onToggleDecisions} onToggleFailures={onToggleFailures} />);
    fireEvent.click(screen.getByRole("button", { name: "Needs you, 4" }));
    fireEvent.click(screen.getByRole("button", { name: "System issues, 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Run failures, 3" }));
    expect(onToggleIssues).toHaveBeenCalledTimes(1);
    expect(onToggleDecisions).toHaveBeenCalledTimes(1);
    expect(onToggleFailures).toHaveBeenCalledTimes(1);
  });

  it("keeps attention controls absent when nothing needs the founder", () => {
    render(<FloatingDock {...baseProps} />);
    expect(screen.queryByRole("button", { name: /Needs you/ })).toBeNull();
  });

  it("does not expose product modes", () => {
    render(<FloatingDock {...baseProps} />);
    expect(screen.queryByRole("group", { name: "Canvas altitude" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Operator" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Engineer" })).toBeNull();
  });

  it("reports founder presence as a polite status region", () => {
    render(<FloatingDock {...baseProps} presence={{ state: "away", present: false }} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Away · outward held");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("omits presence status when unavailable (no empty chrome)", () => {
    render(<FloatingDock {...baseProps} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps retired work navigation out of the product dock", () => {
    render(<FloatingDock {...baseProps} />);
    expect(screen.getByRole("button", { name: "Choose product" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Choose work/ })).toBeNull();
    expect(screen.queryByText("All work")).toBeNull();
    expect(screen.queryByText("New work")).toBeNull();
  });
});
