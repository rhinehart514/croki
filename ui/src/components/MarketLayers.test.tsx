import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock the API seam — these tests are about the component's behavior, not the network. The mocked
// functions are grabbed back below so we can drive their resolution and assert the calls.
vi.mock("@/api", () => ({
  researchMarketLayer: vi.fn(),
  saveMarketObject: vi.fn(),
}));

import { MarketLayers } from "./MarketLayers";
import { researchMarketLayer, saveMarketObject } from "@/api";

const mockedResearch = vi.mocked(researchMarketLayer);
const mockedSave = vi.mocked(saveMarketObject);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MarketLayers", () => {
  it("shows the researching state while the first layer loads", () => {
    // A pending research call keeps the component in its loading state.
    mockedResearch.mockReturnValue(new Promise(() => {}) as ReturnType<typeof researchMarketLayer>);
    render(<MarketLayers projectId="proj-1" />);

    expect(mockedResearch).toHaveBeenCalledWith("proj-1", null, []);
    expect(screen.getByText(/Researching/i)).toBeInTheDocument();
  });

  it("renders the researched candidates once the layer resolves", async () => {
    mockedResearch.mockResolvedValue({
      projectId: "proj-1",
      ok: true,
      kind: "buyer",
      candidates: [
        { kind: "buyer", statement: "Solo founders shipping dev tools", solidity: "researched", evidence: [] },
      ],
      count: 1,
      meta: { connected: true },
    });
    render(<MarketLayers projectId="proj-1" />);

    await waitFor(() =>
      expect(screen.getByText("Solo founders shipping dev tools")).toBeInTheDocument(),
    );
  });

  it("commits the founder's own words via saveMarketObject", async () => {
    mockedResearch.mockResolvedValue({
      projectId: "proj-1",
      ok: true,
      kind: "buyer",
      candidates: [],
      count: 0,
      meta: { connected: true },
    });
    mockedSave.mockResolvedValue({
      projectId: "proj-1",
      object: { kind: "buyer", statement: "Multi-product founders", declaredSolidity: "founder", solidity: "founder", evidence: [] },
    });
    render(<MarketLayers projectId="proj-1" />);

    // Wait for the first layer to settle so the own-words input is enabled.
    const input = await screen.findByPlaceholderText(/Your take on the/i);
    fireEvent.change(input, { target: { value: "Multi-product founders" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1));
    expect(mockedSave).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({ kind: "buyer", statement: "Multi-product founders", solidity: "founder" }),
    );
  });

  it("surfaces a research failure with a retry affordance", async () => {
    mockedResearch.mockRejectedValue(new Error("model offline"));
    render(<MarketLayers projectId="proj-1" />);

    await waitFor(() => expect(screen.getByText(/model offline/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });
});
