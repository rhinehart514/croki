import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FloatingDock } from "./FloatingDock";

// The dock is deliberately limited to context, real attention, settings, and Run.

const graph = {
  id: "g1", name: "Test", version: "0",
  nodes: [{ id: "n1", label: "Draft", category: "generate" as const, position: { x: 0, y: 0 }, config: {} }],
  edges: [],
};

const baseProps = {
  projects: [],
  activeProjectId: null,
  projectBusy: false,
  onSwitchProject: () => {},
  onManageProjects: () => {},
  onNewProduct: () => {},
  channels: [],
  activeChannelId: null,
  onOpenChannel: () => {},
  onNewChannel: () => {},
  problems: 0,
  issuesOpen: false,
  onToggleIssues: () => {},
  pendingDecisions: 0,
  decisionsOpen: false,
  onToggleDecisions: () => {},
  graph: null,
  running: false,
  onRun: () => {},
} as const;

describe("FloatingDock", () => {
  it("shows Run, and runs on click when there is a runnable graph", () => {
    const onRun = vi.fn();
    render(<FloatingDock {...baseProps} graph={graph} onRun={onRun} />);
    const run = screen.getByRole("button", { name: "Run" });
    expect(run).not.toBeDisabled();
    fireEvent.click(run);
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("disables Run when there is no runnable graph (no fake affordance)", () => {
    render(<FloatingDock {...baseProps} graph={null} />);
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  });

  it("opens the real issue and founder-decision panels from live counts", () => {
    const onToggleIssues = vi.fn();
    const onToggleDecisions = vi.fn();
    render(<FloatingDock {...baseProps} problems={2} pendingDecisions={4} onToggleIssues={onToggleIssues} onToggleDecisions={onToggleDecisions} />);
    fireEvent.click(screen.getByRole("button", { name: "Issues, 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Waiting on you, 4" }));
    expect(onToggleIssues).toHaveBeenCalledTimes(1);
    expect(onToggleDecisions).toHaveBeenCalledTimes(1);
  });

  it("keeps attention controls absent when nothing needs the founder", () => {
    render(<FloatingDock {...baseProps} />);
    expect(screen.queryByRole("button", { name: /Issues/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Waiting on you/ })).toBeNull();
  });

  it("does not expose product modes", () => {
    render(<FloatingDock {...baseProps} />);
    expect(screen.queryByRole("group", { name: "Canvas altitude" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Operator" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Engineer" })).toBeNull();
  });

  // The quiet one-line operation status (docs/production-direction/16) — a polite status region, never a
  // command, omitted when there's nothing to orient with.
  it("renders the operation status as a polite status region when provided", () => {
    render(<FloatingDock {...baseProps} operationStatus="3 pipelines · 1 waiting on you · 2 back" />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("3 pipelines · 1 waiting on you · 2 back");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("omits the operation status when absent (no empty chrome)", () => {
    render(<FloatingDock {...baseProps} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
