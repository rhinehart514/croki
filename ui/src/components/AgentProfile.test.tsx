import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock the API seam so the learning section renders from data we control, not the network.
vi.mock("@/api", () => ({
  getAgentLearning: vi.fn(),
}));

import { AgentProfile, type AgentProfileView } from "./AgentProfile";
import { getAgentLearning } from "@/api";

const mockedLearning = vi.mocked(getAgentLearning);

const view: AgentProfileView = { ref: "cold-outreach", job: "Write first-touch intros" };

const baseProps = {
  open: true,
  view,
  team: [],
  projectId: "proj-1",
  onClose: () => {},
  onEditSource: () => {},
  onSelectTeammate: () => {},
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentProfile learning section", () => {
  it("renders the honest 'no runs yet' copy when the agent has no history", async () => {
    mockedLearning.mockResolvedValue({
      profile: {
        hasRuns: false,
        runCount: 0,
        counts: { approved: 0, rejected: 0, edits: 0 },
        lastEdits: [],
        voice: "",
        note: null,
      },
    });
    render(<AgentProfile {...baseProps} />);

    await waitFor(() => expect(screen.getByText(/No runs yet/i)).toBeInTheDocument());
    // No fabricated stats row when there's no history.
    expect(screen.queryByText(/approved/i)).toBeNull();
  });

  it("renders the derived stats and correction edits when the agent has runs", async () => {
    mockedLearning.mockResolvedValue({
      profile: {
        hasRuns: true,
        runCount: 5,
        counts: { approved: 3, rejected: 1, edits: 1 },
        lastEdits: [{ from: "Hey there!", to: "Hi — quick note" }],
        voice: "Warmer, shorter, no exclamation marks.",
        note: null,
      },
    });
    render(<AgentProfile {...baseProps} />);

    // The stats are the real derived numbers.
    await waitFor(() => expect(screen.getByText("5")).toBeInTheDocument());
    expect(screen.getByText("3")).toBeInTheDocument(); // approved
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("rejected")).toBeInTheDocument();

    // The correction pair renders both the founder's before and after.
    expect(screen.getByText(/How you've corrected me/i)).toBeInTheDocument();
    expect(screen.getByText("Hey there!")).toBeInTheDocument();
    expect(screen.getByText("Hi — quick note")).toBeInTheDocument();

    // The learned voice shows through.
    expect(screen.getByText(/Warmer, shorter/i)).toBeInTheDocument();
  });

  it("fetches learning for the ref on screen", async () => {
    mockedLearning.mockResolvedValue({
      profile: { hasRuns: false, runCount: 0, counts: { approved: 0, rejected: 0, edits: 0 }, lastEdits: [], voice: "", note: null },
    });
    render(<AgentProfile {...baseProps} />);
    await waitFor(() => expect(mockedLearning).toHaveBeenCalledWith("proj-1", "cold-outreach"));
  });
});
