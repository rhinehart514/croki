import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportVentureTransfer,
  importVentureTransfer,
  listRepositoryChoices,
  type FirmVenture,
  type VentureTransferFile,
} from "@/api";
import { PortfolioWall } from "./PortfolioWall";
import { VentureTransfer } from "./VentureTransfer";

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return { ...actual, exportVentureTransfer: vi.fn(), importVentureTransfer: vi.fn(), listRepositoryChoices: vi.fn() };
});

const venture: FirmVenture = {
  id: "venture-a", name: "Venture A", repository: "/products/a",
  createdAt: "2026-07-10T00:00:00.000Z", updatedAt: "2026-07-10T00:00:00.000Z",
};
const transfer: VentureTransferFile = {
  format: "drover-venture-transfer", version: 1, exportedAt: "2026-07-14T12:00:00.000Z",
  venture: {
    manifest: { id: "venture-moved", name: "Moved venture", createdAt: venture.createdAt, updatedAt: venture.updatedAt },
    documents: {}, souls: [],
  },
  resume: { provider: "cold", productChanges: "refork-required", destinationRepository: "rebind-required" },
};

describe("portfolio wall and venture transfer", () => {
  beforeEach(() => {
    vi.mocked(listRepositoryChoices).mockResolvedValue({ repositories: [{ name: "moved", path: "/products/moved", source: "workspace" }] });
    vi.mocked(exportVentureTransfer).mockResolvedValue({ transfer });
    vi.mocked(importVentureTransfer).mockResolvedValue({
      venture: { ...venture, id: "venture-moved", name: "Moved venture", repository: "/products/moved" },
      receipt: {
        id: "transfer", receiptId: "transfer-1", importedAt: "2026-07-14T12:05:00.000Z",
        sourceExportedAt: transfer.exportedAt, repository: "/products/moved", providerResume: "cold",
        productChangeWorktrees: "refork-required", reforkWorkspaceIds: ["workspace-a"],
      },
    });
  });

  it("opens a wall item through its owning venture and canonical context", () => {
    const onOpen = vi.fn();
    render(<PortfolioWall ventures={[venture]} onOpen={onOpen} groups={[{
      venture: { id: venture.id, name: venture.name },
      items: [{
        id: "wall-a", ventureId: venture.id, betId: "bet-a", purpose: "review-outcome", blocksBet: false,
        effect: { outcome: { id: "outcome-a", body: "Send the export first" } },
        parkedAt: transfer.exportedAt, decision: null,
        context: { ventureId: venture.id, betId: "bet-a", outcomeId: "outcome-a" },
      }],
    }]} />);
    fireEvent.click(screen.getByRole("button", { name: /send the export first/i }));
    expect(onOpen).toHaveBeenCalledWith(venture, { ventureId: venture.id, betId: "bet-a", outcomeId: "outcome-a" });
  });

  it("exports an explicit portable JSON file", async () => {
    const createObjectURL = vi.fn(() => "blob:venture-transfer");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<VentureTransfer ventures={[venture]} onImported={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /venture a.*export/i }));
    await waitFor(() => expect(exportVentureTransfer).toHaveBeenCalledWith(venture.id));
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:venture-transfer");
  });

  it("imports only after explicit file choice and destination rebind, then shows the receipt", async () => {
    const onImported = vi.fn();
    render(<VentureTransfer ventures={[venture]} onImported={onImported} />);
    await screen.findByRole("option", { name: /moved/i });
    const file = { size: 200, text: async () => JSON.stringify(transfer) } as File;
    fireEvent.change(screen.getByLabelText("Choose a Croki venture transfer file"), { target: { files: [file] } });
    await screen.findByRole("button", { name: "Moved venture" });
    fireEvent.click(screen.getByRole("button", { name: "Import and rebind" }));
    await waitFor(() => expect(importVentureTransfer).toHaveBeenCalledWith(transfer, "/products/moved"));
    expect(onImported).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/provider resume is cold.*new worktree/i);
  });
});
