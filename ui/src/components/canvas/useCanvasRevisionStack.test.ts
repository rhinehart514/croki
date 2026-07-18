import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useCanvasRevisionStack, canUndoStack, topUndo, type CanvasRevisionEntry } from "./useCanvasRevisionStack";

type NewEntry = Omit<CanvasRevisionEntry, "id">;

function placement(reason: string): NewEntry {
  return { forward: { moved: {} }, inverse: { prior: {} }, reason, revision: null, kind: "placement", worldBoundary: false };
}
function rename(reason: string, revision: number): NewEntry {
  return {
    forward: [{ op: "update-element" }],
    inverse: [{ op: "update-element" }],
    reason,
    revision,
    kind: "rename",
    worldBoundary: false,
  };
}
function release(reason: string): NewEntry {
  return { forward: null, inverse: null, reason, revision: null, kind: "promote", worldBoundary: true };
}

describe("useCanvasRevisionStack (SPEC B)", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("undo then redo walks a bounded multi-level stack", () => {
    const { result } = renderHook(() => useCanvasRevisionStack("v1"));
    act(() => result.current.push(placement("Moved 3 directions")));
    act(() => result.current.push(rename("Named the offer", 7)));

    expect(result.current.canUndo).toBe(true);
    expect(result.current.peekUndo?.reason).toBe("Named the offer");

    let popped: CanvasRevisionEntry | null = null;
    act(() => { popped = result.current.popUndo(); });
    expect(popped!.reason).toBe("Named the offer");
    expect(result.current.peekUndo?.reason).toBe("Moved 3 directions");
    expect(result.current.canRedo).toBe(true);

    let redone: CanvasRevisionEntry | null = null;
    act(() => { redone = result.current.popRedo(); });
    expect(redone!.reason).toBe("Named the offer");
    expect(result.current.peekUndo?.reason).toBe("Named the offer");
  });

  it("a new forward act clears the redo future", () => {
    const { result } = renderHook(() => useCanvasRevisionStack("v1"));
    act(() => result.current.push(rename("A", 1)));
    act(() => { result.current.popUndo(); });
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.push(rename("B", 2)));
    expect(result.current.canRedo).toBe(false);
  });

  // THE SINGLE MOST IMPORTANT CORRECTNESS GATE.
  it("HARD-STOPS at the first worldBoundary entry — nothing at or below it may be undone", () => {
    const { result } = renderHook(() => useCanvasRevisionStack("v1"));
    act(() => result.current.push(placement("Moved 3 directions")));
    act(() => result.current.push(rename("Named the offer", 7)));
    // A release ran in the world — an effect-executor acted. This entry is a world boundary.
    act(() => result.current.push(release("Released the pricing page")));

    // The gate: the moment a world-boundary entry is at the top, undo is impossible.
    expect(result.current.peekUndo?.worldBoundary).toBe(true);
    expect(result.current.canUndo).toBe(false);

    // popUndo must refuse — it returns null and NEVER pops across the boundary, so the two undoable acts
    // beneath the release stay unreachable.
    let popped: CanvasRevisionEntry | null | undefined = undefined;
    act(() => { popped = result.current.popUndo(); });
    expect(popped).toBeNull();
    // The stack is unchanged — the boundary and everything below it survive intact.
    expect(result.current.entries).toHaveLength(3);
    expect(result.current.peekUndo?.reason).toBe("Released the pricing page");
    expect(result.current.canUndo).toBe(false);
  });

  it("exposes the gate as a pure helper the rail reads the same way", () => {
    const worldTop = { undo: [{ ...release("R"), id: "x" } as CanvasRevisionEntry] };
    expect(canUndoStack(worldTop)).toBe(false);
    expect(topUndo(worldTop)?.worldBoundary).toBe(true);

    const undoableTop = { undo: [{ ...rename("A", 1), id: "y" } as CanvasRevisionEntry] };
    expect(canUndoStack(undoableTop)).toBe(true);
    expect(canUndoStack({ undo: [] })).toBe(false);
  });

  it("persists the stack across a same-venture remount", () => {
    const first = renderHook(() => useCanvasRevisionStack("v1"));
    act(() => first.result.current.push(rename("Named the offer", 7)));
    first.unmount();
    const second = renderHook(() => useCanvasRevisionStack("v1"));
    expect(second.result.current.peekUndo?.reason).toBe("Named the offer");
    expect(second.result.current.canUndo).toBe(true);
  });
});
