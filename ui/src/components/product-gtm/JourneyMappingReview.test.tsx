import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JourneyMappingProposalRecord } from "@/api";
import { JourneyMappingReview } from "./JourneyMappingReview";

const adoptJourneyImport = vi.fn();
vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api")>()),
  adoptJourneyImport: (...args: unknown[]) => adoptJourneyImport(...args),
}));

const proposal: JourneyMappingProposalRecord = {
  id: "mapping-one",
  ventureId: "venture-one",
  importRef: "import-one",
  revision: 1,
  status: "proposed",
  mapping: {
    inputKind: "event-rows",
    fields: { sequenceKey: "sid", timestamp: "at", route: "path" },
    timezone: "UTC",
    sourceRef: "source:product-analytics",
  },
  pageModelRevision: 4,
  preview: {
    window: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-02T00:00:00.000Z", timezone: "UTC" },
    pageCounts: [{ pageRef: "object:home", count: 17 }],
    transitions: [{ fromPageRef: "object:home", toPageRef: "object:pricing", count: 9 }],
    dropOffs: [{ pageRef: "object:pricing", count: 3 }],
    unmatchedRoutes: [{ route: "route-opaque", count: 2 }],
    rejectedRows: { count: 1, reasons: [{ reason: "invalid-timestamp", count: 1 }] },
  },
  threadRef: "thread:journey",
  messageRef: "conversation:proposal",
  proposedBy: { authority: "agent", id: "codex" },
  createdAt: "2026-07-23T12:00:00.000Z",
  updatedAt: "2026-07-23T12:00:00.000Z",
};

describe("JourneyMappingReview", () => {
  beforeEach(() => {
    adoptJourneyImport.mockReset().mockResolvedValue({
      snapshot: { id: "observation-one" },
      receipt: { id: "receipt-one" },
    });
  });

  it("keeps the proposal provisional until the founder adopts the exact mapping", async () => {
    const onAdopted = vi.fn();
    render(<JourneyMappingReview ventureId="venture-one" proposal={proposal} readOnlyReason={null} onAdopted={onAdopted} />);

    expect(screen.getByText("Product truth remains unchanged", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText(/1 unmatched route token remains/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Adopt observations" }));
    await waitFor(() => expect(adoptJourneyImport).toHaveBeenCalledWith(
      "venture-one",
      "import-one",
      proposal.mapping,
      {
        expectedPageModelRevision: 4,
        threadRef: "thread:journey",
        messageRef: "conversation:proposal",
        sourceRef: "source:product-analytics",
      },
    ));
    expect(onAdopted).toHaveBeenCalledWith({ id: "observation-one" });
  });

  it("disables adoption with the exact recovery reason while offline", () => {
    render(<JourneyMappingReview ventureId="venture-one" proposal={proposal} readOnlyReason="Offline. Reconnect first." onAdopted={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Adopt observations" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Adopt observations" })).toHaveAttribute("title", "Offline. Reconnect first.");
  });
});
