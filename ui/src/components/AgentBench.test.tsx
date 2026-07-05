import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock the API seam so the bench renders from data we control, not the network.
vi.mock("@/api", () => ({
  getAgentBench: vi.fn(),
}));

import { AgentBench } from "./AgentBench";
import { getAgentBench, type AgentBenchRow } from "@/api";

const mockedBench = vi.mocked(getAgentBench);

const baseProps = {
  open: true,
  projectId: "proj-1",
  onClose: () => {},
  onOpenAgent: () => {},
};

const rows: AgentBenchRow[] = [
  { ref: "prospect-researcher", job: "Find fits with a now-trigger", hasRuns: true, runCount: 4, counts: { approved: 3, rejected: 1, edits: 0 }, note: null },
  { ref: "cold-outreach", job: "Write first-touch intros", hasRuns: false, runCount: 0, counts: { approved: 0, rejected: 0, edits: 0 }, note: "no runs yet" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentBench", () => {
  it("splits proven agents from never-run ones and shows real derived stats", async () => {
    mockedBench.mockResolvedValue({ bench: rows });
    render(<AgentBench {...baseProps} />);

    // The proven agent renders with its real approved count and role.
    await waitFor(() => expect(screen.getByText("Prospect Researcher")).toBeInTheDocument());
    expect(screen.getByText(/Proven/i)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument(); // approved count
    expect(screen.getByText(/4 runs/i)).toBeInTheDocument();

    // The never-run agent reads honestly under its own section — no fabricated numbers.
    expect(screen.getByText(/On the bench/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing decided at your gate/i)).toBeInTheDocument();
  });

  it("shows an honest empty state when there are no agents", async () => {
    mockedBench.mockResolvedValue({ bench: [] });
    render(<AgentBench {...baseProps} />);
    await waitFor(() => expect(screen.getByText(/No agents on disk yet/i)).toBeInTheDocument());
  });

  it("fetches the bench for the active project", async () => {
    mockedBench.mockResolvedValue({ bench: [] });
    render(<AgentBench {...baseProps} />);
    await waitFor(() => expect(mockedBench).toHaveBeenCalledWith("proj-1"));
  });
});
