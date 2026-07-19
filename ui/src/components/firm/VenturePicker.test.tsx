import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPortfolioWall,
  listRepositoryChoices,
  listVentures,
  type FirmVenture,
} from "@/api";
import { VenturePicker } from "./VenturePicker";

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    createVenture: vi.fn(),
    getPortfolioWall: vi.fn(),
    listRepositoryChoices: vi.fn(),
    listVentures: vi.fn(),
  };
});

const venture: FirmVenture = {
  id: "venture-a",
  name: "Venture A",
  repository: "/products/a",
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
};

describe("VenturePicker portfolio gate", () => {
  beforeEach(() => {
    vi.mocked(listRepositoryChoices).mockResolvedValue({ repositories: [] });
    vi.mocked(getPortfolioWall).mockResolvedValue({
      eligibility: {
        status: "proof-required",
        proofDate: null,
        requirement: "Dated Batch 8 outside-founder evidence recorded in docs/STATE.md",
        activation: "Attest only after evidence exists.",
      },
      groups: [],
    });
  });

  it("does not request or mention the portfolio frontier during first-venture onboarding", async () => {
    vi.mocked(listVentures).mockResolvedValue({ ventures: [] });
    render(<VenturePicker onOpen={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Start your first venture" })).toBeTruthy();
    expect(getPortfolioWall).not.toHaveBeenCalled();
    expect(screen.queryByText(/portfolio|one wall/i)).toBeNull();
  });

  it("keeps the portfolio frontier absent until outside-founder proof is earned", async () => {
    vi.mocked(listVentures).mockResolvedValue({ ventures: [venture] });
    render(<VenturePicker onOpen={vi.fn()} />);
    await waitFor(() => expect(getPortfolioWall).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/portfolio return|your ventures, one wall|proof-gated frontier/i)).toBeNull();
    expect(screen.queryByText("Move a venture")).toBeNull();
  });

  it("makes existing ventures the primary path back to work", async () => {
    vi.mocked(listVentures).mockResolvedValue({ ventures: [venture] });
    const onOpen = vi.fn();

    render(<VenturePicker onOpen={onOpen} />);

    expect(await screen.findByRole("heading", { name: "Resume work" })).toBeTruthy();
    expect(screen.queryByText(/one-person holding company/i)).toBeNull();
    expect(screen.queryByText(/open (the live )?canvas/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /venture a.*resume work/i }));
    expect(onOpen).toHaveBeenCalledWith(venture);
  });

  it("keeps creating another venture behind an explicit disclosure", async () => {
    vi.mocked(listVentures).mockResolvedValue({ ventures: [venture] });

    render(<VenturePicker onOpen={vi.fn()} />);

    const toggle = await screen.findByRole("button", { name: /start another venture/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("form", { name: "Start a venture" })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("form", { name: "Start a venture" })).toBeTruthy();
  });
});
