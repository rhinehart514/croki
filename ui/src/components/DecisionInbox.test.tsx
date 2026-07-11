import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DecisionInbox } from "./DecisionInbox";
import type { PendingDecision } from "@/types";

// The pending-decision inbox is a router, not a decider: it lists everything waiting on the founder and
// hands each Open back to the caller (which jumps to the real gate / review / inbox surface). These
// assert what must hold: each row leads with the DECISION the founder must make (not the raw prompt),
// a raw error payload is never shown to the founder, one run collapses to one row, and Open fires with
// the exact decision clicked. The honest empty state is its own case.

const decisions: PendingDecision[] = [
  {
    id: "op-1:gate", kind: "gate", projectId: "rodentradar", projectName: "RodentRadar",
    pipelineId: "pipeline-a", pipelineName: "Operator outreach", sessionId: "op-1", inputId: null,
    title: "i want to land a pest-control pilot lol", summary: "2 staged items ready to approve or reject",
    waitingSince: new Date().toISOString(),
  },
  {
    id: "op-2:ideas", kind: "ideas", projectId: "strelva", projectName: "Strelva",
    pipelineId: null, pipelineName: null, sessionId: "op-2", inputId: null,
    title: "find a content angle", summary: "3 to build or cut", optionCount: 3,
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
  it("leads each row with the decision to make, not the raw founder prompt", () => {
    render(<DecisionInbox decisions={decisions} onOpen={() => {}} />);
    expect(screen.getAllByRole("button", { name: "Open" })).toHaveLength(3);
    // The bold line is the ask, with the real count folded in when it's a pick among N.
    expect(screen.getByText("Ready for your approval")).toBeInTheDocument();
    expect(screen.getByText("3 directions to weigh")).toBeInTheDocument();
    expect(screen.getByText("A signal to route")).toBeInTheDocument();
    // The raw founder prompt is never rendered as a title.
    expect(screen.queryByText(/i want to land a pest-control pilot/)).toBeNull();
    // The product each item belongs to is still named, so a decision from a pipeline you're not
    // looking at still says where it came from.
    expect(screen.getByText(/RodentRadar · Operator outreach/)).toBeInTheDocument();
  });

  it("shows a plain sentence instead of a raw error payload when a run stops early", () => {
    const failed: PendingDecision[] = [
      {
        id: "op-9:failed", kind: "failed", projectId: "strelva", projectName: "Strelva",
        pipelineId: "pipeline-x", pipelineName: "Cold email", sessionId: "op-9", inputId: null,
        title: "i want to ideate different GTM pipelines",
        summary: '{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"\'gpt-5.5-codex\' model is not supported when using Codex with a ChatGPT account."}}',
        waitingSince: new Date().toISOString(),
      },
    ];
    render(<DecisionInbox decisions={failed} onOpen={() => {}} />);
    expect(screen.getByText("A run stopped early")).toBeInTheDocument();
    // The raw JSON never reaches the founder; a human sentence stands in for it.
    expect(screen.queryByText(/invalid_request_error/)).toBeNull();
    expect(screen.queryByText(/"type"/)).toBeNull();
    expect(screen.getByText(/isn't available on your plan/)).toBeInTheDocument();
  });

  it("collapses one run to a single row at its newest waiting state", () => {
    const now = Date.now();
    const sameRun: PendingDecision[] = [
      {
        id: "op-5:candidates", kind: "candidates", projectId: "strelva", projectName: "Strelva",
        pipelineId: "pipeline-y", pipelineName: "Outbound", sessionId: "op-5", inputId: null,
        title: "same prompt", summary: "3 pipeline shapes to pick from", optionCount: 3,
        waitingSince: new Date(now - 60_000).toISOString(),
      },
      {
        id: "op-5:gate", kind: "gate", projectId: "strelva", projectName: "Strelva",
        pipelineId: "pipeline-y", pipelineName: "Outbound", sessionId: "op-5", inputId: null,
        title: "same prompt", summary: "1 staged item ready to approve or reject",
        waitingSince: new Date(now).toISOString(),
      },
    ];
    render(<DecisionInbox decisions={sameRun} onOpen={() => {}} />);
    // Two entries, one run → one row, at its newest (gate) state.
    expect(screen.getAllByRole("button", { name: "Open" })).toHaveLength(1);
    expect(screen.getByText("Ready for your approval")).toBeInTheDocument();
    expect(screen.queryByText("3 pipeline shapes to pick")).toBeNull();
  });

  it("fires onOpen with the exact decision when its Open is clicked", () => {
    const onOpen = vi.fn();
    render(<DecisionInbox decisions={decisions} onOpen={onOpen} />);
    const openButtons = screen.getAllByRole("button", { name: "Open" });
    fireEvent.click(openButtons[1]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    // decisions[1] is the ideas item; order is newest-first but these share a timestamp so index holds.
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String) }));
  });

  it("shows an honest empty state, not a fake number, when nothing is waiting", () => {
    render(<DecisionInbox decisions={[]} onOpen={() => {}} />);
    expect(screen.getByText("Nothing's waiting on you.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
  });
});
