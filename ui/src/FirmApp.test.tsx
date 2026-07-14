// FirmApp.test.tsx — the firm shell: venture picker (list/create, founder-gated), opening a venture
// renders the lens, the wall/activity states are reachable, and the drive affordance posts a real goal.
// FirmLens itself is mocked to a lightweight stub — its own render/pan/zoom/placement/wall acceptance is
// already covered by FirmLens.test.tsx; this file proves FirmApp's OWN shell responsibilities.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { FirmLens as FirmLensPayload } from "@/types";

const listVentures = vi.fn();
const createVenture = vi.fn();
const getLens = vi.fn();
const getFounderSession = vi.fn();
const unlockFounderSession = vi.fn();
const driveTeammate = vi.fn();
const markFounderPresent = vi.fn();
const markFounderAway = vi.fn();
const getHeatSettings = vi.fn();
const setHeatSettings = vi.fn();

vi.mock("@/api", () => ({
  listVentures: (...args: unknown[]) => listVentures(...args),
  createVenture: (...args: unknown[]) => createVenture(...args),
  getLens: (...args: unknown[]) => getLens(...args),
  getFounderSession: (...args: unknown[]) => getFounderSession(...args),
  unlockFounderSession: (...args: unknown[]) => unlockFounderSession(...args),
  driveTeammate: (...args: unknown[]) => driveTeammate(...args),
  markFounderPresent: (...args: unknown[]) => markFounderPresent(...args),
  markFounderAway: (...args: unknown[]) => markFounderAway(...args),
  getHeatSettings: (...args: unknown[]) => getHeatSettings(...args),
  setHeatSettings: (...args: unknown[]) => setHeatSettings(...args),
}));

vi.mock("@/components/lens/FirmLens", () => ({
  FirmLens: ({ ventureId }: { ventureId: string }) => <div data-testid="firm-lens-stub">lens for {ventureId}</div>,
}));

import FirmApp from "./FirmApp";

const fixtureLens: FirmLensPayload = {
  ventureId: "v1",
  crew: [],
  bets: [
    {
      id: "bet-1", ventureId: "v1", intent: "cold outbound", forkedFrom: null, teammateRef: "writer",
      refs: [], evidence: [], staged: [], joinKey: "j1", createdAt: "now", updatedAt: "now",
      endedAt: null, endedBy: null, learning: null, position: "live", stagedCount: 0, latestOutcome: null,
      events: [{ type: "bet_forked", detail: "cold outbound", at: "2026-07-01T00:00:00.000Z" }],
    },
  ],
  wall: { count: 0, oldestParkedAt: null },
  placement: { positions: {}, revision: 0 },
};

describe("FirmApp", () => {
  beforeEach(() => {
    listVentures.mockReset().mockResolvedValue({ ventures: [] });
    createVenture.mockReset();
    getLens.mockReset().mockResolvedValue({ lens: fixtureLens });
    getFounderSession.mockReset().mockResolvedValue({ authenticated: true });
    unlockFounderSession.mockReset().mockResolvedValue({ authenticated: true });
    driveTeammate.mockReset().mockResolvedValue({ outcome: {}, work: {} });
    markFounderPresent.mockReset().mockResolvedValue({ present: true });
    markFounderAway.mockReset().mockResolvedValue({ present: false });
    getHeatSettings.mockReset().mockResolvedValue({ heat: "off", dailySpendUsd: 0 });
    setHeatSettings.mockReset().mockResolvedValue({ heat: "off", dailySpendUsd: 0 });
  });

  it("shows an honest empty state with no ventures yet", async () => {
    render(<FirmApp />);
    await screen.findByText(/no ventures yet/i);
  });

  it("lists existing ventures and opens one into the lens on click", async () => {
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "LocalSeoData pipeline", repository: "/products/lsd", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "now" }],
    });
    render(<FirmApp />);
    const row = await screen.findByRole("button", { name: /LocalSeoData pipeline/i });
    fireEvent.click(row);
    await screen.findByTestId("firm-lens-stub");
    expect(screen.getByText("lens for v1")).toBeTruthy();
  });

  it("starting a new venture (already authenticated) creates it and opens it directly", async () => {
    createVenture.mockResolvedValue({ venture: { id: "v2", name: "A new venture", repository: "/products/new", createdAt: "now", updatedAt: "now" } });
    render(<FirmApp />);
    await screen.findByText(/no ventures yet/i);

    fireEvent.change(screen.getByLabelText(/new venture name/i), { target: { value: "A new venture" } });
    fireEvent.change(screen.getByLabelText(/product repository path/i), { target: { value: "/products/new" } });
    fireEvent.click(screen.getByRole("button", { name: /start venture/i }));

    await waitFor(() => expect(createVenture).toHaveBeenCalledWith("A new venture", "/products/new"));
    await screen.findByTestId("firm-lens-stub");
  });

  it("starting a venture while unauthenticated parks the action behind the founder unlock, then completes it", async () => {
    getFounderSession.mockResolvedValue({ authenticated: false });
    createVenture.mockResolvedValue({ venture: { id: "v3", name: "Gated venture", repository: "/products/gated", createdAt: "now", updatedAt: "now" } });
    render(<FirmApp />);
    await screen.findByText(/no ventures yet/i);

    fireEvent.change(screen.getByLabelText(/new venture name/i), { target: { value: "Gated venture" } });
    fireEvent.change(screen.getByLabelText(/product repository path/i), { target: { value: "/products/gated" } });
    fireEvent.click(screen.getByRole("button", { name: /start venture/i }));

    // The founder unlock prompt appears instead of an immediate create call.
    await screen.findByText(/unlock founder actions/i);
    expect(createVenture).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText(/founder action code/i), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: /^unlock$/i }));

    await waitFor(() => expect(createVenture).toHaveBeenCalledWith("Gated venture", "/products/gated"));
    await screen.findByTestId("firm-lens-stub");
  });

  it("opening a venture exposes the drive affordance, and driving posts the teammate + goal", async () => {
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });
    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));
    await screen.findByTestId("firm-lens-stub");

    fireEvent.click(screen.getByRole("button", { name: /give the crew a goal/i }));
    fireEvent.change(screen.getByLabelText(/teammate ref/i), { target: { value: "outreach-writer" } });
    fireEvent.change(screen.getByLabelText(/^goal$/i), { target: { value: "Try a colder subject line" } });
    fireEvent.click(screen.getByRole("button", { name: /^drive$/i }));

    await waitFor(() => expect(driveTeammate).toHaveBeenCalledWith("v1", {
      teammateRef: "outreach-writer",
      goal: "Try a colder subject line",
    }));
  });

  it("the activity toggle reveals the per-bet event feed read from bet.events", async () => {
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });
    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));
    await screen.findByTestId("firm-lens-stub");
    // The feed panel gates on the lens having loaded (a separate getLens() call from FirmApp itself,
    // not the mocked FirmLens stub) — wait for that fetch to actually resolve before toggling, same
    // as production's own async load.
    await waitFor(() => expect(getLens).toHaveBeenCalledWith("v1"));

    fireEvent.click(screen.getByRole("button", { name: /show activity/i }));
    await screen.findAllByText("cold outbound");
    expect(screen.getByText("bet_forked")).toBeTruthy();
  });

  it("the back control returns to the venture picker", async () => {
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });
    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));
    await screen.findByTestId("firm-lens-stub");

    fireEvent.click(screen.getByRole("button", { name: /ventures/i }));
    await screen.findByText(/a portfolio of isolated machines/i);
  });
});
