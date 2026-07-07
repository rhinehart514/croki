import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DecisionInbox } from "./DecisionInbox";
import type { PendingDecision } from "@/types";

// The pending-decision inbox is a router, not a decider: it lists everything waiting on the founder and
// hands each Open back to the caller (which jumps to the real gate / review / inbox surface). These
// assert the two things that must hold: the list renders one row per waiting item with its plain-words
// kind, and Open fires with the exact decision clicked. The honest empty state is its own case.

const decisions: PendingDecision[] = [
  {
    id: "op-1:gate", kind: "gate", projectId: "rodentradar", projectName: "RodentRadar",
    pipelineId: "pipeline-a", pipelineName: "Operator outreach", sessionId: "op-1", inputId: null,
    title: "Land a pest-control pilot", summary: "2 staged items ready to approve or reject",
    waitingSince: new Date().toISOString(),
  },
  {
    id: "op-2:ideas", kind: "ideas", projectId: "strelva", projectName: "Strelva",
    pipelineId: null, pipelineName: null, sessionId: "op-2", inputId: null,
    title: "Find a content angle", summary: "3 to build or cut", optionCount: 3,
    waitingSince: new Date().toISOString(),
  },
  {
    id: "input:strelva:s1", kind: "signal", projectId: "strelva", projectName: "Strelva",
    pipelineId: null, pipelineName: null, sessionId: null, inputId: "s1",
    title: "signup from landing", summary: "A world-signal came in — route it into a pipeline or set it aside",
    waitingSince: new Date().toISOString(),
  },
];

describe("DecisionInbox", () => {
  it("renders one row per waiting item, each with its plain-words kind", () => {
    render(<DecisionInbox decisions={decisions} onOpen={() => {}} />);
    expect(screen.getAllByRole("button", { name: "Open" })).toHaveLength(3);
    expect(screen.getByText("Ready for your approval")).toBeInTheDocument();
    expect(screen.getByText("Directions to weigh")).toBeInTheDocument();
    expect(screen.getByText("A signal to route")).toBeInTheDocument();
    // The product each item belongs to is named, so a decision from a pipeline you're not looking at
    // still says where it came from.
    expect(screen.getByText(/RodentRadar · Operator outreach/)).toBeInTheDocument();
  });

  it("fires onOpen with the exact decision when its Open is clicked", () => {
    const onOpen = vi.fn();
    render(<DecisionInbox decisions={decisions} onOpen={onOpen} />);
    const openButtons = screen.getAllByRole("button", { name: "Open" });
    fireEvent.click(openButtons[1]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(decisions[1]);
  });

  it("shows an honest empty state, not a fake number, when nothing is waiting", () => {
    render(<DecisionInbox decisions={[]} onOpen={() => {}} />);
    expect(screen.getByText("Nothing's waiting on you.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
  });
});
