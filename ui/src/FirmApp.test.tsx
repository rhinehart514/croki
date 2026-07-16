// FirmApp.test.tsx — the firm shell: venture picker (list/create), opening a venture
// renders the lens, the wall/activity states are reachable, and the drive affordance posts a real goal.
// FirmLens itself is mocked to a lightweight stub — its own render/pan/zoom/placement/wall acceptance is
// already covered by FirmLens.test.tsx; this file proves FirmApp's OWN shell responsibilities.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { FirmLens as FirmLensPayload } from "@/types";
import { advanceReturnCursor, readReturnCursor } from "@/lib/return-cursor";
import { readUxMetrics } from "@/lib/ux-metrics";

const listVentures = vi.fn();
const listRepositoryChoices = vi.fn();
const createVenture = vi.fn();
const getLens = vi.fn();
const getArchitectureProjection = vi.fn();
const getConversation = vi.fn();
const getActiveDrives = vi.fn();
const getHealth = vi.fn();
const stopActiveDrive = vi.fn();
const getPortfolioWall = vi.fn();
const driveTeammate = vi.fn();
const getRuntimeStatuses = vi.fn();
const markFounderPresent = vi.fn();
const markFounderAway = vi.fn();
const getHeatSettings = vi.fn();
const setHeatSettings = vi.fn();
const getCredentials = vi.fn();
const connectGmail = vi.fn();
const removeCredential = vi.fn();

vi.mock("@/api", () => ({
  listVentures: (...args: unknown[]) => listVentures(...args),
  listRepositoryChoices: (...args: unknown[]) => listRepositoryChoices(...args),
  createVenture: (...args: unknown[]) => createVenture(...args),
  getLens: (...args: unknown[]) => getLens(...args),
  getArchitectureProjection: (...args: unknown[]) => getArchitectureProjection(...args),
  getConversation: (...args: unknown[]) => getConversation(...args),
  getActiveDrives: (...args: unknown[]) => getActiveDrives(...args),
  getHealth: (...args: unknown[]) => getHealth(...args),
  stopActiveDrive: (...args: unknown[]) => stopActiveDrive(...args),
  getPortfolioWall: (...args: unknown[]) => getPortfolioWall(...args),
  driveTeammate: (...args: unknown[]) => driveTeammate(...args),
  getRuntimeStatuses: (...args: unknown[]) => getRuntimeStatuses(...args),
  markFounderPresent: (...args: unknown[]) => markFounderPresent(...args),
  markFounderAway: (...args: unknown[]) => markFounderAway(...args),
  getHeatSettings: (...args: unknown[]) => getHeatSettings(...args),
  setHeatSettings: (...args: unknown[]) => setHeatSettings(...args),
  getCredentials: (...args: unknown[]) => getCredentials(...args),
  connectGmail: (...args: unknown[]) => connectGmail(...args),
  removeCredential: (...args: unknown[]) => removeCredential(...args),
}));

vi.mock("@/components/lens/FirmLens", () => ({
  FirmLens: ({ ventureId, selection, wallOpen, onSelectionChange, onWallOpenChange }: {
    ventureId: string;
    selection?: { betId: string | null; workRef: string | null; teammateRefs: string[] } | null;
    wallOpen?: boolean;
    onSelectionChange?: (selection: { betId: string | null; workRef: string | null; teammateRefs: string[] } | null) => void;
    onWallOpenChange?: (open: boolean) => void;
  }) => (
    <div
      data-testid="firm-lens-stub"
      data-selection={selection?.workRef ? `work:${selection.workRef}` : selection?.betId ? `bet:${selection.betId}` : selection?.teammateRefs.length ? `crew:${selection.teammateRefs.join(",")}` : "venture"}
      data-wall-open={wallOpen ? "true" : "false"}
    >
      lens for {ventureId}
      <button type="button" onClick={() => onSelectionChange?.({ betId: null, workRef: null, teammateRefs: ["closer"] })}>Select Reed</button>
      <button type="button" onClick={() => onSelectionChange?.({ betId: "bet-1", workRef: "work-1", teammateRefs: ["outreach-writer"] })}>Select exact work</button>
      <button type="button" onClick={() => onSelectionChange?.(null)}>Clear selection</button>
      <button type="button" onClick={() => onWallOpenChange?.(true)}>Open wall</button>
      <button type="button" onClick={() => onWallOpenChange?.(false)}>Close wall</button>
    </div>
  ),
}));

// FirmApp's shell tests use the same lightweight canvas stub whether the production
// workbench chooses the Orbital Atlas or its untouched compatibility lens.
vi.mock("@/components/atlas/VentureAtlas", () => ({
  VentureAtlas: ({ fallback }: { fallback: ReactNode }) => fallback,
}));

import FirmApp from "./FirmApp";

const fixtureLens: FirmLensPayload = {
  ventureId: "v1",
  crew: [
    { ref: "outreach-writer", summonedAt: "now", soul: { name: "Sable" } },
    { ref: "closer", summonedAt: "now", soul: { name: "Reed" } },
  ],
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
    delete window.droverDesktop;
    localStorage.clear();
    advanceReturnCursor("v1", "2026-07-02T00:00:00.000Z");
    listVentures.mockReset().mockResolvedValue({ ventures: [] });
    listRepositoryChoices.mockReset().mockResolvedValue({
      repositories: [{ name: "new", path: "/products/new", source: "workspace" }],
    });
    createVenture.mockReset();
    getLens.mockReset().mockResolvedValue({ lens: fixtureLens });
    getArchitectureProjection.mockReset().mockRejectedValue(new Error("Architecture fixture not supplied by this shell test."));
    getConversation.mockReset().mockResolvedValue({ messages: [] });
    getActiveDrives.mockReset().mockResolvedValue({ drives: [] });
    getHealth.mockReset().mockResolvedValue({ founderAuthority: { available: true } });
    stopActiveDrive.mockReset().mockResolvedValue({ drive: { abortRequestedAt: "2026-07-14T12:01:00.000Z" } });
    getPortfolioWall.mockReset().mockResolvedValue({
      eligibility: { status: "proof-required", requirement: "Outside-founder proof is required" },
      groups: [],
    });
    driveTeammate.mockReset().mockResolvedValue({
      outcome: { kind: "completed" }, work: {}, runtime: { id: "codex", label: "Codex", auth: "chatgpt-login" },
      handoff: null,
    });
    getRuntimeStatuses.mockReset().mockResolvedValue({
      runtimes: [
        { id: "claude-code", label: "Claude Code (Agent SDK)", connected: true, auth: "oauth-login", authLabel: "Claude subscription", reason: null },
        { id: "codex", label: "Codex", connected: true, auth: "chatgpt-login", authLabel: "ChatGPT subscription", reason: null },
      ],
    });
    markFounderPresent.mockReset().mockResolvedValue({ present: true });
    markFounderAway.mockReset().mockResolvedValue({ present: false });
    getHeatSettings.mockReset().mockResolvedValue({ heat: "off", dailySpendUsd: 0 });
    setHeatSettings.mockReset().mockResolvedValue({ heat: "off", dailySpendUsd: 0 });
    getCredentials.mockReset().mockResolvedValue({ credentials: [] });
    connectGmail.mockReset();
    removeCredential.mockReset();
  });

  it("explains the venture model and makes starting the first venture the primary path", async () => {
    render(<FirmApp />);
    expect(await screen.findByRole("heading", { name: /start your first venture/i })).toBeTruthy();
    expect(screen.getByText(/one venture per product/i)).toHaveTextContent(/repository.*parallel work.*market returns.*founder decisions/i);
    expect(screen.getByRole("form", { name: /start a venture/i })).toBeTruthy();
  });

  it("makes continuing an existing venture primary and keeps creation collapsed", async () => {
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "LocalSeoData pipeline", repository: "/products/lsd", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "now" }],
    });
    render(<FirmApp />);
    expect(await screen.findByRole("heading", { name: /continue a venture/i })).toBeTruthy();
    expect(screen.getByText(/open the live canvas for that product/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /start another venture/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText(/new venture name/i)).toBeNull();
    const row = await screen.findByRole("button", { name: /LocalSeoData pipeline/i });
    expect(row).toHaveTextContent(/open canvas/i);
    fireEvent.click(row);
    await screen.findByTestId("firm-lens-stub");
    expect(screen.getByText("lens for v1")).toBeTruthy();
  });

  it("opens a portfolio wall item in its owning venture and canonical bet context", async () => {
    const venture = { id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" };
    listVentures.mockResolvedValue({ ventures: [venture] });
    getPortfolioWall.mockResolvedValue({
      eligibility: {
        status: "eligible",
        proofDate: "2026-07-14",
        requirement: "Dated Batch 8 outside-founder evidence recorded in docs/STATE.md",
        activation: "Already eligible",
      },
      groups: [{
        venture: { id: venture.id, name: venture.name },
        items: [{
          id: "wall-1",
          ventureId: venture.id,
          betId: "bet-1",
          purpose: "review-outcome",
          blocksBet: false,
          effect: { outcome: { id: "outcome-1", body: "The narrower promise earned a reply." } },
          parkedAt: "2026-07-14T10:00:00.000Z",
          decision: null,
          context: { ventureId: venture.id, betId: "bet-1", outcomeId: "outcome-1" },
        }],
      }],
    });

    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /the narrower promise earned a reply/i }));

    expect(await screen.findByTestId("firm-lens-stub")).toHaveAttribute("data-selection", "bet:bet-1");
    expect(screen.getByTestId("firm-lens-stub")).toHaveAttribute("data-wall-open", "true");
  });

  it("starting a new venture creates it and opens it directly", async () => {
    createVenture.mockResolvedValue({ venture: { id: "v2", name: "A new venture", repository: "/products/new", createdAt: "now", updatedAt: "now" } });
    render(<FirmApp />);
    await screen.findByRole("heading", { name: /start your first venture/i });

    fireEvent.change(screen.getByLabelText(/new venture name/i), { target: { value: "A new venture" } });
    await screen.findByRole("button", { name: /selected new product folder/i });
    expect(screen.queryByLabelText(/product repository path/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /start venture/i }));

    await waitFor(() => expect(createVenture).toHaveBeenCalledWith("A new venture", "/products/new"));
    await screen.findByTestId("firm-lens-stub");
  });

  it("offers trusted local folders as explicit choices and keeps the derived name in sync", async () => {
    listRepositoryChoices.mockResolvedValue({
      repositories: [
        { name: "drover", path: "/products/drover", source: "workspace" },
        { name: "second-product", path: "/products/second", source: "venture" },
      ],
    });
    render(<FirmApp />);

    const current = await screen.findByRole("button", { name: /selected drover product folder/i });
    expect(current).toHaveAttribute("aria-pressed", "true");
    expect(current).toHaveTextContent(/current workspace/i);
    expect(screen.getByLabelText(/new venture name/i)).toHaveValue("drover");
    expect(screen.queryByLabelText(/product repository path/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /use second-product product folder/i }));
    expect(screen.getByLabelText(/new venture name/i)).toHaveValue("second-product");
    expect(screen.getByRole("button", { name: /selected second-product product folder/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not offer or prefill the product repository already connected to an existing venture", async () => {
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Drover", repository: "/products/drover", createdAt: "now", updatedAt: "now" }],
    });
    listRepositoryChoices.mockResolvedValue({
      repositories: [{ name: "drover", path: "/products/drover", source: "workspace" }],
    });
    render(<FirmApp />);

    fireEvent.click(await screen.findByRole("button", { name: /start another venture/i }));
    expect(screen.getByLabelText(/new venture name/i)).toHaveValue("");
    expect(screen.queryByRole("button", { name: /selected drover product folder/i })).toBeNull();
    expect(await screen.findByText(/no repository is available yet/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^start venture$/i })).toBeNull();
  });

  it("chooses a product folder in the desktop shell and derives the venture name", async () => {
    const selectRepository = vi.fn().mockResolvedValue({ path: "/products/chosen", name: "chosen" });
    window.droverDesktop = { selectRepository };
    createVenture.mockResolvedValue({ venture: { id: "v2", name: "chosen", repository: "/products/chosen", createdAt: "now", updatedAt: "now" } });
    render(<FirmApp />);
    await screen.findByRole("heading", { name: /start your first venture/i });

    expect(screen.queryByLabelText(/product repository path/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /choose product folder/i }));
    await waitFor(() => expect(selectRepository).toHaveBeenCalledOnce());
    expect(screen.getByLabelText(/new venture name/i)).toHaveValue("chosen");
    expect(screen.getByText("/products/chosen")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /start venture/i }));
    await waitFor(() => expect(createVenture).toHaveBeenCalledWith("chosen", "/products/chosen"));
  });

  it("keeps direction in the teammate rail and targets the selected canvas teammate", async () => {
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });
    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));
    await screen.findByTestId("firm-lens-stub");

    const composer = screen.getByRole("region", { name: /direction composer: what should change/i });
    expect(composer.closest("header")).toBeNull();
    expect(composer.closest(".firm-app-rail")).toBeTruthy();
    expect(composer.closest(".firm-app-canvas")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /select reed/i }));
    expect(screen.getByRole("region", { name: /direction composer: direct reed/i })).toBeTruthy();
    const submit = screen.getByRole("button", { name: /direct reed/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/what should change/i), { target: { value: "Try a colder subject line" } });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.keyDown(screen.getByLabelText(/what should change/i), { key: "Enter" });

    await waitFor(() => expect(driveTeammate).toHaveBeenCalledWith("v1", {
      teammateRef: "closer",
      teammateRefs: ["closer"],
      goal: "Try a colder subject line",
    }));
  });

  it("lets the founder resize, close, and restore conversation independently of the canvas", async () => {
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });
    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));
    await screen.findByTestId("firm-lens-stub");

    const separator = screen.getByRole("separator", { name: "Resize conversation" });
    expect(separator).toHaveAttribute("aria-valuenow", "440");
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator).toHaveAttribute("aria-valuenow", "464");

    fireEvent.click(screen.getByRole("button", { name: "Hide conversation" }));
    expect(screen.queryByRole("complementary", { name: /firm conversation/i })).toBeNull();
    expect(screen.getByTestId("firm-lens-stub")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Open conversation" }));
    expect(screen.getByRole("complementary", { name: /firm conversation/i })).toBeVisible();
  });

  it("keeps exact direction mounted when the conversation transcript is collapsed", async () => {
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });
    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));
    await screen.findByTestId("firm-lens-stub");

    fireEvent.click(screen.getByRole("button", { name: "Select exact work" }));
    expect(screen.getByRole("region", { name: /direction composer: direct exact work/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide conversation" }));

    expect(screen.queryByRole("complementary", { name: /firm conversation/i })).toBeNull();
    expect(screen.getByRole("complementary", { name: /exact work direction/i })).toBeTruthy();
    expect(screen.getByRole("region", { name: /direction composer: direct exact work/i })).toBeTruthy();
    expect(screen.queryByRole("separator", { name: "Resize conversation" })).toBeNull();
  });

  it("keeps always-on work and real crew connections inside venture settings", async () => {
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });
    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));
    await screen.findByTestId("firm-lens-stub");

    expect(screen.queryByText("Always-on work")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(await screen.findByRole("dialog", { name: "Venture settings" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Real sources and actions" })).toBeTruthy();
    expect(screen.getByText("Always-on work")).toBeTruthy();
    expect(screen.queryByText(/^Heat$/)).toBeNull();
    // This shell test stubs the canvas; venture settings still reads the connected credentials.
    expect(getCredentials).toHaveBeenCalledTimes(1);
  });

  it("keeps the composer available beside the open wall without discarding scope or draft", async () => {
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });
    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));
    await screen.findByTestId("firm-lens-stub");

    fireEvent.click(screen.getByRole("button", { name: /select reed/i }));
    const direction = screen.getByLabelText(/what should change/i);
    fireEvent.change(direction, { target: { value: "Keep this scoped to Reed" } });
    const composerLayer = direction.closest(".firm-app-composer-layer");

    fireEvent.click(screen.getByRole("button", { name: /open wall/i }));
    expect(composerLayer).not.toHaveAttribute("hidden");
    expect(screen.getByRole("region", { name: /direction composer: direct reed/i })).toBeTruthy();
    expect(screen.getByLabelText(/what should change/i)).toHaveValue("Keep this scoped to Reed");

    fireEvent.click(screen.getAllByRole("button", { name: /close wall/i })[0]);
    expect(composerLayer).not.toHaveAttribute("hidden");
    expect(screen.getByRole("region", { name: /direction composer: direct reed/i })).toBeTruthy();
    expect(screen.getByLabelText(/what should change/i)).toHaveValue("Keep this scoped to Reed");
  });

  it("keeps the whole firm as the default even when there is only one teammate", async () => {
    getLens.mockResolvedValue({ lens: { ...fixtureLens, crew: [fixtureLens.crew[0]] } });
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });
    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));
    await waitFor(() => expect(getLens).toHaveBeenCalledWith("v1"));

    expect(screen.getByRole("region", { name: /direction composer: what should change/i })).toBeTruthy();
    expect(screen.getByLabelText("Direction target")).toHaveTextContent("Venture");
    expect(screen.queryByRole("radio", { name: /Sable/i })).toBeNull();

    fireEvent.change(screen.getByLabelText(/tell drover what you want to change/i), { target: { value: "Reach our first ten customers" } });
    const direct = screen.getByRole("button", { name: /direct the venture/i });
    await waitFor(() => expect(direct).toBeEnabled());
    fireEvent.click(direct);

    await waitFor(() => expect(driveTeammate).toHaveBeenCalledWith("v1", {
      goal: "Reach our first ten customers",
    }));
  });

  it("addresses an empty firm without inventing an internal teammate reference", async () => {
    getLens.mockResolvedValue({ lens: { ...fixtureLens, crew: [] } });
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });
    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));
    await screen.findByTestId("firm-lens-stub");
    await waitFor(() => expect(getLens).toHaveBeenCalledWith("v1"));

    expect(screen.getByRole("region", { name: /direction composer: what should change/i })).toBeTruthy();
    expect(screen.getByLabelText("Direction target")).toHaveTextContent("Venture");
    fireEvent.change(screen.getByLabelText(/tell drover what you want to change/i), { target: { value: "Find our first repeatable channel" } });
    const direct = screen.getByRole("button", { name: /direct the venture/i });
    await waitFor(() => expect(direct).toBeEnabled());
    fireEvent.click(direct);

    await waitFor(() => expect(driveTeammate).toHaveBeenCalledWith("v1", {
      goal: "Find our first repeatable channel",
    }));
    expect(await screen.findByText(/direction received.*conversation and canvas/i)).toBeTruthy();
  });

  it("keeps founder-facing progress visible in the teammate line", async () => {
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });
    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));
    await screen.findByTestId("firm-lens-stub");
    await waitFor(() => expect(getLens).toHaveBeenCalledWith("v1"));

    await screen.findAllByText("cold outbound");
    expect(screen.getByText("Work began")).toBeTruthy();
    expect(screen.queryByText("bet_forked")).toBeNull();
    expect(screen.getByRole("complementary", { name: /venture one firm conversation/i })).toBeTruthy();
  });

  it("opens return proof without reviewing unrelated durable work", async () => {
    localStorage.clear();
    advanceReturnCursor("v1", "2026-06-30T00:00:00.000Z");
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });

    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));

    expect(await screen.findByRole("heading", { name: "Since you left" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Kept moving" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open on canvas" }));

    expect(screen.getByTestId("firm-lens-stub")).toHaveAttribute("data-selection", "bet:bet-1");
    expect(readReturnCursor("v1")).toBe("2026-06-30T00:00:00.000Z");
    expect(readUxMetrics().filter((metric) => metric.event === "proof_opened")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(await screen.findByRole("heading", { name: "Since you left" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finish briefing" }));
    expect(readReturnCursor("v1")).toBe("2026-07-01T00:00:00.000Z");
  });

  it("shows active provider work and stops only that run without ending its bet", async () => {
    getActiveDrives.mockResolvedValue({
      drives: [{
        id: "drive-1", ventureId: "v1", teammateRef: "outreach-writer", betId: "bet-1",
        runtime: "codex", startedAt: new Date(Date.now() - 5_000).toISOString(),
        abortSupported: true, abortRequestedAt: null,
      }],
    });
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });

    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));
    const stop = await screen.findByRole("button", { name: "Stop current work" });
    expect(screen.getByLabelText("Current work")).toHaveTextContent(/Work began|Work is active/);
    fireEvent.click(stop);

    await waitFor(() => expect(stopActiveDrive).toHaveBeenCalledWith("v1", "drive-1"));
    expect(screen.queryByRole("button", { name: /end bet/i })).toBeNull();
  });

  it("retries a failed move through the selected bet composer instead of restarting silently", async () => {
    getLens.mockResolvedValue({
      lens: {
        ...fixtureLens,
        bets: [{
          ...fixtureLens.bets[0],
          events: [
            ...(fixtureLens.bets[0].events ?? []),
            { type: "tool_failed", detail: "scan_repository: connection lost", at: "2026-07-01T00:01:00.000Z" },
          ],
        }],
      },
    });
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });

    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));
    fireEvent.click(await screen.findByText("Work log"));
    fireEvent.click(screen.getByRole("button", { name: "Retry current move" }));

    const correction = screen.getByRole("textbox", { name: "What should change here?" });
    expect(correction).toHaveValue("Retry this move from its last durable step.");
    fireEvent.click(screen.getByRole("button", { name: "Direct cold outbound" }));
    await waitFor(() => expect(driveTeammate).toHaveBeenCalledWith("v1", {
      teammateRef: "writer",
      betId: "bet-1",
      goal: "Retry this move from its last durable step.",
    }));
  });

  it("keeps the durable founder and teammate chat in the left rail", async () => {
    getConversation.mockResolvedValue({
      messages: [
        {
          id: "message-1", ventureId: "v1", role: "founder", content: "Find the first buyer",
          teammateRef: "outreach-writer", betId: null, createdAt: "2026-07-01T10:00:00.000Z",
        },
        {
          id: "message-2", ventureId: "v1", role: "teammate", content: "I found three segments worth testing.",
          teammateRef: "outreach-writer", betId: "bet-1", createdAt: "2026-07-01T10:01:00.000Z",
        },
      ],
    });
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });

    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));

    expect(await screen.findByRole("heading", { name: "Conversation" })).toBeTruthy();
    expect(await screen.findByText("Find the first buyer")).toBeTruthy();
    expect(screen.getByText("I found three segments worth testing.")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getAllByText("Sable").length).toBeGreaterThan(0);
    expect(getConversation).toHaveBeenCalledWith("v1");
  });

  it("hands a single new bet from the conversation back to the focused canvas", async () => {
    driveTeammate.mockResolvedValue({
      outcome: { kind: "completed" },
      work: {},
      runtime: { id: "codex", label: "Codex", auth: "chatgpt-login" },
      handoff: {
        id: "handoff-1",
        ventureId: "v1",
        role: "system",
        kind: "handoff",
        content: "Work landed on the canvas — 1 bet opened.",
        teammateRef: "outreach-writer",
        betId: null,
        changes: { openedBetIds: ["bet-1"], stagedBetIds: [], wallBetIds: [] },
        createdAt: "now",
      },
    });
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });
    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));
    const field = await screen.findByRole("textbox", { name: /tell drover what you want to change/i });
    fireEvent.change(field, { target: { value: "Open the strongest next bet" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /direct the venture/i })).toBeEnabled());
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() => expect(screen.getByTestId("firm-lens-stub")).toHaveAttribute("data-selection", "bet:bet-1"));
    expect(screen.getByText("Focused conversation")).toBeTruthy();
    expect(screen.getByRole("button", { name: /return to venture thread/i })).toBeTruthy();
  });

  it("uses the teammate character to orient an empty line", async () => {
    getLens.mockResolvedValue({ lens: { ...fixtureLens, bets: [] } });
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });
    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));
    await waitFor(() => expect(getLens).toHaveBeenCalledWith("v1"));

    expect(screen.getByRole("complementary", { name: /venture one firm conversation/i })).toBeTruthy();
    expect(screen.getByText("Give Drover its first direction")).toBeTruthy();
    expect(screen.getByText(/name what should change for this venture/i)).toBeTruthy();
  });

  it("the back control returns to the venture picker", async () => {
    listVentures.mockResolvedValue({
      ventures: [{ id: "v1", name: "Venture one", repository: "/products/one", createdAt: "now", updatedAt: "now" }],
    });
    render(<FirmApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Venture one/i }));
    await screen.findByTestId("firm-lens-stub");

    fireEvent.click(screen.getByRole("button", { name: /ventures/i }));
    await screen.findByRole("heading", { name: /continue a venture/i });
  });
});
