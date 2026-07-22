import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createVenture,
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
    vi.mocked(createVenture).mockReset();
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
    expect(await screen.findByRole("heading", { name: "Move from the real Product" })).toBeTruthy();
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

    const toggle = await screen.findByRole("button", { name: /add another codebase/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "Add a codebase" })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: "Add a codebase" })).toBeTruthy();
  });

  it("opens a codebase immediately after one repository choice", async () => {
    const next = { ...venture, id: "venture-b", name: "Product B", repository: "/products/b" };
    vi.mocked(listVentures).mockResolvedValue({ ventures: [venture] });
    vi.mocked(listRepositoryChoices).mockResolvedValue({ repositories: [{ name: "Product B", path: "/products/b", source: "workspace" }] });
    vi.mocked(createVenture).mockResolvedValue({ venture: next });
    const onOpen = vi.fn();

    render(<VenturePicker onOpen={onOpen} />);
    fireEvent.click(await screen.findByRole("button", { name: /add another codebase/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Product B codebase" }));

    await waitFor(() => expect(createVenture).toHaveBeenCalledWith("Product B", "/products/b"));
    expect(onOpen).toHaveBeenCalledWith(next);
  });
});
