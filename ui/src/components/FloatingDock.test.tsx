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

  // The two discrete altitude controls (docs/production-direction/09) live on the dock because the canvas
  // is chromeless. These pin: both controls render, the active one is exposed, and a click reports up.
  it("renders both Operator and Engineer altitude controls, with the active one exposed", () => {
    render(<FloatingDock {...baseProps} activeLens="operator" onLensChange={() => {}} />);
    expect(screen.getByRole("group", { name: "Canvas altitude" })).toBeTruthy();
    const operator = screen.getByRole("button", { name: "Operator" });
    const engineer = screen.getByRole("button", { name: "Engineer" });
    // Active state is exposed accessibly (aria-pressed) — Operator active here, Engineer not.
    expect(operator).toHaveAttribute("aria-pressed", "true");
    expect(engineer).toHaveAttribute("aria-pressed", "false");
  });

  it("reflects Engineer as the active altitude when that is the effective lens", () => {
    render(<FloatingDock {...baseProps} activeLens="engineer" onLensChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Engineer" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Operator" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onLensChange with the chosen altitude on click", () => {
    const onLensChange = vi.fn();
    render(<FloatingDock {...baseProps} activeLens="operator" onLensChange={onLensChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Engineer" }));
    expect(onLensChange).toHaveBeenCalledWith("engineer");
    fireEvent.click(screen.getByRole("button", { name: "Operator" }));
    expect(onLensChange).toHaveBeenCalledWith("operator");
  });

  it("omits the altitude control when no lens change is wired (no dead affordance)", () => {
    render(<FloatingDock {...baseProps} />);
    expect(screen.queryByRole("group", { name: "Canvas altitude" })).toBeNull();
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
