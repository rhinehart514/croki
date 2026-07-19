// FirmApp.test.tsx — the firm shell: reopen the active venture, use the picker only for first connection,
// and mount the venture workspace. VentureWorkspace itself is stubbed here;
// its own composition is proven in VentureWorkspace.test.tsx and the canvas browser journey. This file
// proves FirmApp's OWN shell responsibilities: the picker, and open → mount the workspace keyed for
// venture isolation.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const listVentures = vi.fn();
const listRepositoryChoices = vi.fn();
const createVenture = vi.fn();
const getLens = vi.fn();
const getArchitectureProjection = vi.fn();
const getConversation = vi.fn();
const getActiveDrives = vi.fn();
const getHealth = vi.fn();
const stopActiveDrive = vi.fn();
const getWallQueue = vi.fn();
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
  getWallQueue: (...args: unknown[]) => getWallQueue(...args),
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

// VentureWorkspace is the sole default surface. Its composition (index, canvas, dock composer, descent,
// lens overlays) has its own component and browser-journey coverage; here we stub it so this test proves
// only FirmApp's routing responsibility — open a venture → mount the workspace, keyed for isolation —
// without dragging in ReactFlow.
vi.mock("@/components/workspace/VentureWorkspace", () => ({
  VentureWorkspace: ({ venture }: { venture: { id: string; name: string } }) => (
    <div data-testid="venture-canvas-stub" data-venture={venture.id} data-venture-name={venture.name} />
  ),
}));

import FirmApp from "./FirmApp";

describe("FirmApp", () => {
  beforeEach(() => {
    delete window.droverDesktop;
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    listVentures.mockReset().mockResolvedValue({ ventures: [] });
    listRepositoryChoices.mockReset().mockResolvedValue({
      repositories: [{ name: "new", path: "/products/new", source: "workspace" }],
    });
    createVenture.mockReset();
    getLens.mockReset().mockResolvedValue({ lens: null });
    getArchitectureProjection.mockReset().mockRejectedValue(new Error("Architecture fixture not supplied by this shell test."));
    getConversation.mockReset().mockResolvedValue({ messages: [] });
    getActiveDrives.mockReset().mockResolvedValue({ drives: [] });
    getWallQueue.mockReset().mockResolvedValue({ queue: [] });
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

  it("reopens the last active venture without showing a resume chooser", async () => {
    listVentures.mockResolvedValue({
      ventures: [
        { id: "v1", name: "LocalSeoData pipeline", repository: "/products/lsd", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "now" },
        { id: "v2", name: "Newer venture", repository: "/products/newer", createdAt: "2026-07-02T00:00:00.000Z", updatedAt: "now" },
      ],
    });
    localStorage.setItem("drover:active-venture:v1", "v1");
    render(<FirmApp />);
    expect(await screen.findByTestId("venture-canvas-stub")).toHaveAttribute(
      "data-venture-name",
      "LocalSeoData pipeline",
    );
    expect(screen.queryByRole("heading", { name: /resume work/i })).toBeNull();
  });

  it("opens the newest venture when no prior venture is remembered", async () => {
    listVentures.mockResolvedValue({
      ventures: [
        { id: "v1", name: "Venture one", repository: "/products/one", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "now" },
        { id: "v2", name: "Venture two", repository: "/products/two", createdAt: "2026-07-02T00:00:00.000Z", updatedAt: "now" },
      ],
    });
    const { container } = render(<FirmApp />);

    // The venture workspace is the default founder surface, keyed for venture isolation.
    expect(await screen.findByTestId("venture-canvas-stub")).toHaveAttribute("data-venture", "v2");
    expect(localStorage.getItem("drover:active-venture:v1")).toBe("v2");
    // The retired triptych presentation is absent from the shipped DOM.
    expect(container.querySelector(".firm-app-rail")).toBeNull();
    expect(container.querySelector(".firm-app-inspector")).toBeNull();
    expect(container.querySelector(".firm-app-body")).toBeNull();
    expect(container.querySelector(".firm-app-workbench-bar")).toBeNull();
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
    await screen.findByTestId("venture-canvas-stub");
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
});
