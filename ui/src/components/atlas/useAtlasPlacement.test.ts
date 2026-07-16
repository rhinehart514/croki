import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { putPlacement } from "@/api";
import type { FirmLens } from "@/types";
import { useAtlasPlacement } from "./useAtlasPlacement";

vi.mock("@/api", () => ({ putPlacement: vi.fn() }));
const putPlacementMock = vi.mocked(putPlacement);

const lens = {
  ventureId: "venture-1",
  crew: [], bets: [], outcomes: [], wallItems: [],
  wall: { count: 0, oldestParkedAt: null },
  placement: { positions: {}, revision: 0 },
} as FirmLens;

describe("useAtlasPlacement", () => {
  beforeEach(() => putPlacementMock.mockReset());

  it("serializes create and drag placement writes through returned revisions", async () => {
    putPlacementMock
      .mockResolvedValueOnce({ placement: { positions: { "architecture:new": { x: 10, y: 20 } }, revision: 1 } })
      .mockResolvedValueOnce({ placement: { positions: { "architecture:new": { x: 10, y: 20 }, "architecture:system": { x: 80, y: 90 } }, revision: 2 } });
    const onLensChange = vi.fn();
    const { result } = renderHook(() => useAtlasPlacement({ ventureId: "venture-1", lens, readOnly: false, onLensChange, onRefresh: vi.fn() }));

    await act(async () => {
      const create = result.current.commitPosition("architecture:new", { x: 10, y: 20 });
      const drag = result.current.commitPosition("architecture:system", { x: 80, y: 90 });
      await Promise.all([create, drag]);
    });

    expect(putPlacementMock.mock.calls.map(([, body]) => body.expectedRevision)).toEqual([0, 1]);
    expect(putPlacementMock.mock.calls[1]?.[1].positions).toMatchObject({
      "architecture:new": { x: 10, y: 20 },
      "architecture:system": { x: 80, y: 90 },
    });
    expect(onLensChange).toHaveBeenCalledTimes(1);
    expect(onLensChange.mock.calls[0]?.[0].placement.revision).toBe(2);
  });
});
