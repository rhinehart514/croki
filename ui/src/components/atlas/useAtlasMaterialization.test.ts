import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAtlasMaterialization } from "./useAtlasMaterialization";
import type { AtlasNode } from "./atlasTypes";

function node(id: string): AtlasNode {
  return { id, position: { x: 0, y: 0 }, data: {} } as AtlasNode;
}

// Kinetic materialization (contract §3): a composer direction unfolds the working theory node-by-node.
// The hook stages a *burst* of new stage nodes but leaves a settled field (and small increments) alone,
// so it never re-animates a whole venture on open or hides live cards on every projection poll.
describe("useAtlasMaterialization", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("does not stage the first settle — opening an existing venture reveals everything at once", () => {
    const nodes = [node("atlas:intent"), node("bet:a"), node("bet:b"), node("bet:c"), node("bet:d")];
    const { result } = renderHook(({ n }) => useAtlasMaterialization(n, false), { initialProps: { n: nodes } });
    expect(result.current.revealedIds).toBeNull();
    expect(result.current.materializingIds.size).toBe(0);
  });

  it("unfolds a burst of newly-arrived nodes over time, holding them back then revealing in sequence", () => {
    const initial = [node("atlas:intent")];
    const { result, rerender } = renderHook(({ n }) => useAtlasMaterialization(n, false), { initialProps: { n: initial } });
    // A composer direction lands the working theory: four new efforts arrive at once against the hub.
    const burst = [node("atlas:intent"), node("bet:a"), node("bet:b"), node("bet:c"), node("bet:d")];
    act(() => rerender({ n: burst }));
    // The four arrived efforts are held back; the already-known hub stays visible.
    expect(result.current.materializingIds.has("atlas:intent")).toBe(false);
    expect(result.current.materializingIds.size).toBe(4);
    // The unfold reveals them one at a time.
    act(() => { vi.advanceTimersByTime(220); });
    expect(result.current.materializingIds.size).toBe(3);
    act(() => { vi.advanceTimersByTime(220 * 3); });
    expect(result.current.materializingIds.size).toBe(0);
    expect(result.current.revealedIds).toBeNull();
  });

  it("treats a single new node as an increment, not a materialization — no holdback", () => {
    const settled = [node("atlas:intent"), node("bet:a"), node("bet:b")];
    const { result, rerender } = renderHook(({ n }) => useAtlasMaterialization(n, false), { initialProps: { n: settled } });
    act(() => rerender({ n: [...settled, node("bet:c")] }));
    expect(result.current.materializingIds.size).toBe(0);
  });

  it("reveals the whole burst instantly under reduced motion", () => {
    const initial = [node("atlas:intent")];
    const { result, rerender } = renderHook(({ n }) => useAtlasMaterialization(n, true), { initialProps: { n: initial } });
    act(() => rerender({ n: [node("atlas:intent"), node("bet:a"), node("bet:b"), node("bet:c")] }));
    expect(result.current.materializingIds.size).toBe(0);
    expect(result.current.revealedIds).toBeNull();
  });
});
