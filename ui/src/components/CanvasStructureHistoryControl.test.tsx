import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasStructureHistoryEntry, CanvasStructureHistoryResponse } from "@/openCanvasTypes";

const api = vi.hoisted(() => ({
  getCanvasStructureHistory: vi.fn(),
  undoCanvasStructure: vi.fn(),
  redoCanvasStructure: vi.fn(),
}));

vi.mock("@/api", () => api);
vi.mock("@/lib/identity", () => ({ getIdentity: () => ({ userId: "founder", name: "Founder" }) }));

import { CanvasStructureHistoryControl } from "@/components/CanvasStructureHistoryControl";

function entry(over: Partial<CanvasStructureHistoryEntry> = {}): CanvasStructureHistoryEntry {
  return {
    id: "structure-1", sequence: 1, projectId: "p1", scope: "region", operation: "revise",
    targetRef: { type: "work-region", id: "activation" }, actor: "founder",
    summary: "Moved, collapsed region “Fix activation”", status: "applied",
    createdAt: "2026-07-11T12:00:00.000Z", updatedAt: "2026-07-11T12:00:01.000Z", ...over,
  };
}

function history(over: Partial<CanvasStructureHistoryResponse> = {}): CanvasStructureHistoryResponse {
  return { projectId: "p1", revision: 7, entries: [entry()], ...over };
}

describe("CanvasStructureHistoryControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getCanvasStructureHistory.mockResolvedValue(history());
    api.undoCanvasStructure.mockResolvedValue({
      history: history({ revision: 9, entries: [entry({ status: "undone" })] }),
      receipt: entry({ status: "undone" }),
    });
    api.redoCanvasStructure.mockResolvedValue({ history: history({ revision: 11 }), receipt: entry() });
  });

  it("shows durable human-readable receipts and names its narrow structural scope", async () => {
    render(<CanvasStructureHistoryControl projectId="p1" structureSignal="2|activation:2" onCanvasChanged={vi.fn()} />);
    await waitFor(() => expect(api.getCanvasStructureHistory).toHaveBeenCalledWith("p1"));
    fireEvent.click(screen.getByRole("button", { name: "Show canvas arrangement history" }));

    expect(screen.getByText("Moved, collapsed region “Fix activation”")).toBeInTheDocument();
    expect(screen.getByText(/Moves, regions, and view layout only/)).toBeInTheDocument();
    expect(screen.getByText(/Content and real-world actions stay unchanged/)).toBeInTheDocument();
    expect(screen.getByText("Region")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo the last canvas arrangement change" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Redo the next canvas arrangement change" })).toBeDisabled();
  });

  it("undoes through the typed CAS API and refreshes canonical canvas truth", async () => {
    const changed = vi.fn();
    render(<CanvasStructureHistoryControl projectId="p1" onCanvasChanged={changed} />);
    const undo = await screen.findByRole("button", { name: "Undo the last canvas arrangement change" });
    await waitFor(() => expect(undo).toBeEnabled());
    fireEvent.click(undo);

    await waitFor(() => expect(api.undoCanvasStructure).toHaveBeenCalledTimes(1));
    expect(api.undoCanvasStructure.mock.calls[0][0]).toBe("p1");
    expect(api.undoCanvasStructure.mock.calls[0][1]).toMatchObject({
      expectedHistoryRevision: 7,
      revisionAuthor: "founder",
      idempotencyKey: expect.stringMatching(/^ui:canvas-structure:undo:/),
    });
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Undo the last canvas arrangement change" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo the next canvas arrangement change" })).toBeEnabled();
  });

  it("redoes the next durable structure receipt with the current history revision", async () => {
    api.getCanvasStructureHistory.mockResolvedValue(history({ entries: [entry({ status: "undone" })] }));
    render(<CanvasStructureHistoryControl projectId="p1" onCanvasChanged={vi.fn()} />);
    const redo = await screen.findByRole("button", { name: "Redo the next canvas arrangement change" });
    await waitFor(() => expect(redo).toBeEnabled());
    fireEvent.click(redo);

    await waitFor(() => expect(api.redoCanvasStructure).toHaveBeenCalledWith("p1", expect.objectContaining({
      expectedHistoryRevision: 7,
      revisionAuthor: "founder",
      idempotencyKey: expect.stringMatching(/^ui:canvas-structure:redo:/),
    })));
  });

  it("fails closed when authority truth diverged after the receipt", async () => {
    api.undoCanvasStructure.mockRejectedValueOnce(new Error("Region “Fix activation” changed after this history receipt. Undo newer work first."));
    render(<CanvasStructureHistoryControl projectId="p1" onCanvasChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Show canvas arrangement history" }));
    const undo = screen.getByRole("button", { name: "Undo the last canvas arrangement change" });
    await waitFor(() => expect(undo).toBeEnabled());
    fireEvent.click(undo);

    expect(await screen.findByRole("alert")).toHaveTextContent("changed after this history receipt");
    expect(screen.getByRole("button", { name: "Undo the last canvas arrangement change" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo the next canvas arrangement change" })).toBeDisabled();
  });
});
