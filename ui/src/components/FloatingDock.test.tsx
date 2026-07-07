import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FloatingDock } from "./FloatingDock";

// The dock's decisions badge is the notification: it must carry the cross-product pending count and
// toggle the inbox panel. These assert the count shows when > 0, is absent at 0 (no fake zero), and
// clicking the button asks to open the inbox.

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
  showGtmToggle: false,
  productMode: false,
  onModeToggle: () => {},
  problems: 0,
  issuesOpen: false,
  onToggleIssues: () => {},
  onCloseMenus: () => {},
  graph: null,
  running: false,
  runningNodeId: null,
  onRun: () => {},
} as const;

describe("FloatingDock decisions badge", () => {
  it("shows the pending-decision count and toggles the inbox on click", () => {
    const onToggleDecisions = vi.fn();
    render(
      <FloatingDock
        {...baseProps}
        pendingDecisions={4}
        decisionsOpen={false}
        onToggleDecisions={onToggleDecisions}
      />,
    );
    const badge = screen.getByTitle("4 decisions waiting on you");
    expect(badge).toHaveTextContent("4");
    fireEvent.click(badge);
    expect(onToggleDecisions).toHaveBeenCalledTimes(1);
  });

  it("shows no count when nothing is waiting", () => {
    render(
      <FloatingDock
        {...baseProps}
        pendingDecisions={0}
        decisionsOpen={false}
        onToggleDecisions={() => {}}
      />,
    );
    const badge = screen.getByTitle("Nothing waiting on you");
    expect(badge).not.toHaveTextContent("0");
  });
});
