import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock the API seam so the soul section renders from data we control, not the network.
vi.mock("@/api", () => ({
  getCrewMemberProfile: vi.fn(),
  promoteCrewLearning: vi.fn(),
  dismissCrewLearning: vi.fn(),
}));

import { AgentProfile, type AgentProfileView } from "./AgentProfile";
import { getCrewMemberProfile, promoteCrewLearning, dismissCrewLearning } from "@/api";

const mockedSoul = vi.mocked(getCrewMemberProfile);
const mockedPromote = vi.mocked(promoteCrewLearning);
const mockedDismiss = vi.mocked(dismissCrewLearning);

const EMPTY_SOUL = { name: null, record: { runs: 0, sent: 0, replies: 0, wins: 0 }, learned: [], stillFiguring: [], ready: [] };

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
  mockedSoul.mockResolvedValue({ profile: EMPTY_SOUL });
});

// There is ONE learning story now — the soul. The legacy "What I've become" derived-stats section was
// folded into it, so a teammate has a single "What I've learned from you" panel that handles every state.
describe("AgentProfile — the single learning story (soul)", () => {
  it("renders the honest 'no runs yet' copy when nothing has been learned", async () => {
    render(<AgentProfile {...baseProps} />);
    await waitFor(() => expect(screen.getByText(/No runs yet/i)).toBeInTheDocument());
    // Exactly one learning section — the legacy block is gone.
    expect(screen.getByText(/What I've learned from you/i)).toBeInTheDocument();
    expect(screen.queryByText(/What I've become/i)).toBeNull();
  });

  it("fetches the soul for the ref on screen", async () => {
    render(<AgentProfile {...baseProps} />);
    await waitFor(() => expect(mockedSoul).toHaveBeenCalledWith("proj-1", "cold-outreach"));
  });

  it("shows the track record (omitting zero counters) and learned + still-figuring lessons", async () => {
    mockedSoul.mockResolvedValue({
      profile: {
        name: "Maya",
        record: { runs: 4, sent: 0, replies: 2, wins: 0 },
        learned: [{ text: "lead with their trigger", why: "you corrected this 3 times" }],
        stillFiguring: [{ text: "keep it under three sentences", why: "" }],
        ready: [],
      },
    });
    render(<AgentProfile {...baseProps} />);

    // The exact line proves zero counters are omitted: no "sent", no "wins" — only real runs+replies.
    await waitFor(() => expect(screen.getByText("Proven on 4 runs · 2 replies")).toBeInTheDocument());
    expect(screen.getByText("lead with their trigger")).toBeInTheDocument();
    expect(screen.getByText(/Still figuring out/i)).toBeInTheDocument();
    expect(screen.getByText("keep it under three sentences")).toBeInTheDocument();
  });

  it("renders a ready lesson and promotes it on the founder's tap", async () => {
    mockedSoul.mockResolvedValue({
      profile: {
        name: "Maya",
        record: { runs: 0, sent: 0, replies: 0, wins: 0 },
        learned: [],
        stillFiguring: [],
        ready: [{ text: "no em-dashes ever", why: "", patternKey: "no em dashes ever" }],
      },
    });
    mockedPromote.mockResolvedValue({
      profile: { ...EMPTY_SOUL, name: "Maya", learned: [{ text: "no em-dashes ever", why: "" }] },
    });
    const { getByText } = render(<AgentProfile {...baseProps} />);

    await waitFor(() => expect(getByText(/Ready to make permanent\?/i)).toBeInTheDocument());
    getByText("Make permanent").click();

    await waitFor(() => expect(mockedPromote).toHaveBeenCalledWith("proj-1", "cold-outreach", "no em dashes ever"));
    // After blessing, the lesson is permanent and no longer asking.
    await waitFor(() => expect(screen.queryByText(/Ready to make permanent\?/i)).toBeNull());
  });

  it("filters empty-run / no-op verdicts out of the learned feed and shows the calm empty state", async () => {
    // An audit teammate ran on an empty input and emitted a machine no-op verdict. That is internal
    // exhaust, not a lesson — it must never surface as something the teammate "learned".
    mockedSoul.mockResolvedValue({
      profile: {
        name: "Maya",
        record: { runs: 0, sent: 0, replies: 0, wins: 0 },
        learned: [],
        stillFiguring: [
          { text: "No drafted first-contact message was provided to audit. Cannot issue a pass verdict on an empty input.", why: "" },
        ],
        ready: [],
      },
    });
    render(<AgentProfile {...baseProps} />);

    // The no-op verdict never appears anywhere on the sheet.
    await waitFor(() => expect(screen.getByText(/What I've learned from you/i)).toBeInTheDocument());
    expect(screen.queryByText(/provided to audit/i)).toBeNull();
    expect(screen.queryByText(/Still figuring out/i)).toBeNull();
    // With no real lessons left, the honest "no runs yet" empty state stands in.
    expect(screen.getByText(/No runs yet/i)).toBeInTheDocument();
  });

  it("keeps a real lesson while dropping an empty-input sibling in the same list", async () => {
    mockedSoul.mockResolvedValue({
      profile: {
        name: "Maya",
        record: { runs: 3, sent: 0, replies: 0, wins: 0 },
        learned: [
          { text: "lead with their trigger", why: "" },
          { text: "The input items contained no draft, so there is nothing to label or strip.", why: "" },
        ],
        stillFiguring: [],
        ready: [],
      },
    });
    render(<AgentProfile {...baseProps} />);

    await waitFor(() => expect(screen.getByText("lead with their trigger")).toBeInTheDocument());
    expect(screen.queryByText(/nothing to label/i)).toBeNull();
  });

  it("dismisses a ready lesson on 'Not yet'", async () => {
    mockedSoul.mockResolvedValue({
      profile: {
        ...EMPTY_SOUL, name: "Maya",
        ready: [{ text: "mention the case study", why: "", patternKey: "mention the case study" }],
      },
    });
    mockedDismiss.mockResolvedValue({ profile: { ...EMPTY_SOUL, name: "Maya" } });
    render(<AgentProfile {...baseProps} />);

    await waitFor(() => expect(screen.getByText("Not yet")).toBeInTheDocument());
    screen.getByText("Not yet").click();
    await waitFor(() => expect(mockedDismiss).toHaveBeenCalledWith("proj-1", "cold-outreach", "mention the case study"));
  });
});
