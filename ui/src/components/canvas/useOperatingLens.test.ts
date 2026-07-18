import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { nextLens, useOperatingLens } from "./useOperatingLens";

// The lens cycle: L steps forward through null → understand → design → execute → learn → null; Shift+L
// steps back. null is the free arrangement at both ends of the ring.
describe("nextLens — the L / Shift+L cycle", () => {
  it("cycles forward null → understand → design → execute → learn → null", () => {
    expect(nextLens(null, 1)).toBe("understand");
    expect(nextLens("understand", 1)).toBe("design");
    expect(nextLens("design", 1)).toBe("execute");
    expect(nextLens("execute", 1)).toBe("learn");
    expect(nextLens("learn", 1)).toBe(null);
  });

  it("cycles backward (Shift+L) null → learn → execute → design → understand → null", () => {
    expect(nextLens(null, -1)).toBe("learn");
    expect(nextLens("learn", -1)).toBe("execute");
    expect(nextLens("execute", -1)).toBe("design");
    expect(nextLens("design", -1)).toBe("understand");
    expect(nextLens("understand", -1)).toBe(null);
  });
});

// Mutual exclusion (the review's must-fix #3): a lens and a generated answer both drive the ONE node array
// through a FLIP, so they must never coexist. Entering a lens while an answer is open must dismiss the
// answer and SWALLOW that entry — the next press enters cleanly from the restored free frame.
describe("useOperatingLens — lens/answer mutual-exclusion preempt", () => {
  function pressL() {
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "l" })); });
  }

  it("pressing L while an answer is open dismisses the answer and does NOT enter a lens", () => {
    let answerOpen = true;
    const dismissAnswer = vi.fn(() => { answerOpen = false; });
    const { result } = renderHook(() =>
      useOperatingLens({ isAnswerOpen: () => answerOpen, dismissAnswer }),
    );

    pressL(); // answer open → preempt: dismiss, swallow the entry
    expect(dismissAnswer).toHaveBeenCalledTimes(1);
    expect(result.current.lensId).toBe(null);

    pressL(); // answer now closed → enter the first lens from the free frame
    expect(result.current.lensId).toBe("understand");
    expect(dismissAnswer).toHaveBeenCalledTimes(1); // no second dismiss once free
  });

  it("setLens(word) while an answer is open preempts too; exit (→null) is never guarded", () => {
    let answerOpen = true;
    const dismissAnswer = vi.fn(() => { answerOpen = false; });
    const { result } = renderHook(() =>
      useOperatingLens({ isAnswerOpen: () => answerOpen, dismissAnswer }),
    );

    act(() => { result.current.setLens("execute"); }); // picking a lens word: preempt
    expect(dismissAnswer).toHaveBeenCalledTimes(1);
    expect(result.current.lensId).toBe(null);

    act(() => { result.current.setLens("execute"); }); // answer closed: enters
    expect(result.current.lensId).toBe("execute");

    act(() => { result.current.setLens(null); }); // an EXIT is never preempted
    expect(result.current.lensId).toBe(null);
  });

  it("with no answer open, L cycles normally", () => {
    const { result } = renderHook(() => useOperatingLens({ isAnswerOpen: () => false }));
    pressL();
    expect(result.current.lensId).toBe("understand");
  });
});
