import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FloatingDock } from "./FloatingDock";

// The dock was slimmed to two jobs: "where am I" (breadcrumb) and "go" (Run). The competing badges it
// used to carry — the Decisions count, the Issues count, Summon — moved onto the canvas, so their
// props are still ACCEPTED (App keeps compiling) but no longer rendered here. These pin that contract:
// Run is the one primary action and it disables with no runnable graph. The moved badges are covered
// where they now live, not on this bar.

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
  onCloseMenus: () => {},
  graph: null,
  running: false,
  runningNodeId: null,
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

  it("no longer renders a decisions badge here (it moved onto the canvas)", () => {
    render(<FloatingDock {...baseProps} pendingDecisions={4} />);
    expect(screen.queryByTitle(/waiting on you/)).toBeNull();
  });
});
