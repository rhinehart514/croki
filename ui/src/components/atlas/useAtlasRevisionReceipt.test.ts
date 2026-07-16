import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useAtlasRevisionReceipt } from "./useAtlasRevisionReceipt";

describe("useAtlasRevisionReceipt", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("keeps the exact Undo receipt across a same-venture remount", () => {
    const first = renderHook(() => useAtlasRevisionReceipt("venture-1"));
    act(() => first.result.current.keep(
      { revision: 5, reason: "Placed a thought", affectedContexts: [] },
      { operations: [{ op: "remove-element", elementId: "thought-1" }], reason: "Undo: Placed a thought" },
    ));
    first.unmount();

    const second = renderHook(() => useAtlasRevisionReceipt("venture-1"));
    expect(second.result.current.value?.receipt.revision).toBe(5);
    expect(second.result.current.value?.undo?.operations).toEqual([{ op: "remove-element", elementId: "thought-1" }]);

    act(() => second.result.current.clear());
    second.unmount();
    expect(renderHook(() => useAtlasRevisionReceipt("venture-1")).result.current.value).toBeNull();
  });
});
