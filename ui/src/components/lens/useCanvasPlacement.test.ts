import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Node } from "@xyflow/react";
import { ApiError, getLens, putPlacement } from "@/api";
import type { FirmLens } from "@/types";
import { useCanvasPlacement } from "./useCanvasPlacement";

// Keep the real ApiError class (the 409 discrimination in the hook is `instanceof ApiError`), mock the
// two calls the placement path makes.
vi.mock("@/api", async () => {
  const actual = await vi.importActual<typeof import("@/api")>("@/api");
  return { ApiError: actual.ApiError, getLens: vi.fn(), putPlacement: vi.fn() };
});

const putMock = vi.mocked(putPlacement);
const getLensMock = vi.mocked(getLens);

function lensAt(revision: number, positions: Record<string, { x: number; y: number }> = {}): FirmLens {
  return {
    ventureId: "v1", crew: [], bets: [], wall: { count: 0, oldestParkedAt: null },
    placement: { positions, revision },
  } as FirmLens;
}

// Two nodes: the founder will drag `bet:a` only. `bet:b` sits at its seed and must never be persisted as
// founder placement (Law 6: a seed position is a DIFFERENT epistemic state from founder placement).
const nodeA: Node = { id: "bet:a", position: { x: 40, y: 90 }, data: {} } as Node;
const nodeB: Node = { id: "bet:b", position: { x: 500, y: 500 }, data: {} } as Node;
const nodes: Node[] = [nodeA, nodeB];

describe("useCanvasPlacement — the 409 drag-buffer never discards the founder's latest drop", () => {
  beforeEach(() => {
    putMock.mockReset();
    getLensMock.mockReset();
  });

  it("re-applies the just-dropped positions over the reloaded revision after a 409", async () => {
    // First PUT (expectedRevision 0) races and loses → 409. The authoritative revision has moved to 4.
    putMock
      .mockRejectedValueOnce(new ApiError("stale placement", 409, "revision_conflict"))
      .mockResolvedValueOnce({ placement: { positions: { "bet:a": { x: 40, y: 90 } }, revision: 5 } });
    getLensMock.mockResolvedValue({ lens: lensAt(4) });

    const onLensChange = vi.fn();
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useCanvasPlacement({
      ventureId: "v1", lens: lensAt(0), nodes: [nodeA], actionsDisabled: false,
      onNodesChange: vi.fn(), onLensChange, onCanvasInit: vi.fn(), reload,
    }));

    // React Flow passes (event, node) to onNodeDragStop.
    await act(async () => { result.current.onNodeDragStop({}, nodeA); });

    // The retry re-issued THIS drop's positions over the reloaded (authoritative) revision 4, not the
    // stale 0, so the founder's placement survives the race.
    expect(putMock).toHaveBeenCalledTimes(2);
    expect(putMock.mock.calls[0][1].expectedRevision).toBe(0);
    expect(putMock.mock.calls[1][1]).toEqual({ positions: { "bet:a": { x: 40, y: 90 } }, expectedRevision: 4 });
    // The adopted placement (revision 5) is pushed back optimistically.
    expect(onLensChange).toHaveBeenLastCalledWith(expect.objectContaining({
      placement: { positions: { "bet:a": { x: 40, y: 90 } }, revision: 5 },
    }));
  });

  it("does not retry a non-409 failure (a stale-connection throw genuinely cannot send)", async () => {
    putMock.mockRejectedValueOnce(new Error("Drover is reconnecting."));
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useCanvasPlacement({
      ventureId: "v1", lens: lensAt(0), nodes: [nodeA], actionsDisabled: false,
      onNodesChange: vi.fn(), onLensChange: vi.fn(), onCanvasInit: vi.fn(), reload,
    }));

    await act(async () => { result.current.onNodeDragStop({}, nodeA); });

    expect(putMock).toHaveBeenCalledTimes(1);
    expect(getLensMock).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });
});

describe("useCanvasPlacement — persists ONLY founder-moved nodes (Law 6 epistemic separation)", () => {
  beforeEach(() => {
    putMock.mockReset();
    getLensMock.mockReset();
  });

  it("writes only the dragged node's position; an untouched seed node is never persisted", async () => {
    putMock.mockResolvedValue({ placement: { positions: { "bet:a": { x: 40, y: 90 } }, revision: 1 } });
    const onLensChange = vi.fn();
    const { result } = renderHook(() => useCanvasPlacement({
      ventureId: "v1", lens: lensAt(0), nodes, actionsDisabled: false,
      onNodesChange: vi.fn(), onLensChange, onCanvasInit: vi.fn(), reload: vi.fn().mockResolvedValue(undefined),
    }));

    // The founder drags ONLY bet:a. bet:b is a seed the founder never touched.
    await act(async () => { result.current.onNodeDragStop({}, nodeA); });

    // The PUT payload carries bet:a alone — bet:b's seed position is NOT frozen into founder placement.
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock.mock.calls[0][1].positions).toEqual({ "bet:a": { x: 40, y: 90 } });
    expect(putMock.mock.calls[0][1].positions).not.toHaveProperty("bet:b");
  });

  it("keeps previously-stored founder positions and adds the newly-dragged node", async () => {
    // bet:b already has a stored founder placement; the founder now drags bet:a. Both must persist.
    putMock.mockResolvedValue({ placement: { positions: {}, revision: 4 } });
    const stored = { "bet:b": { x: 12, y: 34 } };
    const { result } = renderHook(() => useCanvasPlacement({
      ventureId: "v1", lens: lensAt(3, stored), nodes, actionsDisabled: false,
      onNodesChange: vi.fn(), onLensChange: vi.fn(), onCanvasInit: vi.fn(), reload: vi.fn().mockResolvedValue(undefined),
    }));

    await act(async () => { result.current.onNodeDragStop({}, nodeA); });

    // The stored bet:b survives untouched; the newly-dragged bet:a is folded in.
    expect(putMock.mock.calls[0][1].positions).toEqual({
      "bet:b": { x: 12, y: 34 },
      "bet:a": { x: 40, y: 90 },
    });
  });
});

describe("useCanvasPlacement — 409 merges, never clobbers a second window's independent drop", () => {
  beforeEach(() => {
    putMock.mockReset();
    getLensMock.mockReset();
  });

  it("a second window's authoritative position for a DIFFERENT node survives the merge", async () => {
    // This window drags bet:a (expectedRevision 0) and loses the 409 race. Meanwhile a second window has
    // authoritatively placed bet:b at revision 4. The merge must keep bet:b AND add bet:a.
    putMock
      .mockRejectedValueOnce(new ApiError("stale placement", 409, "revision_conflict"))
      .mockResolvedValueOnce({ placement: { positions: {}, revision: 5 } });
    getLensMock.mockResolvedValue({ lens: lensAt(4, { "bet:b": { x: 777, y: 888 } }) });

    const { result } = renderHook(() => useCanvasPlacement({
      ventureId: "v1", lens: lensAt(0), nodes, actionsDisabled: false,
      onNodesChange: vi.fn(), onLensChange: vi.fn(), onCanvasInit: vi.fn(), reload: vi.fn().mockResolvedValue(undefined),
    }));

    await act(async () => { result.current.onNodeDragStop({}, nodeA); });

    // The retry PUT merged founder intent (bet:a) OVER the fresh authoritative map (bet:b) — it did not
    // re-PUT this window's stale full field, so the other window's independent drop is not clobbered.
    expect(putMock.mock.calls[1][1]).toEqual({
      positions: { "bet:b": { x: 777, y: 888 }, "bet:a": { x: 40, y: 90 } },
      expectedRevision: 4,
    });
  });
});
