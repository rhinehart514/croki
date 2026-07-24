import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeVentureEvents, type FirmStreamEvent, type FirmWorkDelta } from "@/api";
import { useFirmEventStream, useWorkDeltaStream } from "./useFirmEventStream";

vi.mock("@/api", () => ({
  subscribeVentureEvents: vi.fn(),
}));

const subscribeMock = vi.mocked(subscribeVentureEvents);

describe("useFirmEventStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not subscribe when there is no venture, and reports not streaming", () => {
    const { result } = renderHook(() => useFirmEventStream(null, () => {}));
    expect(subscribeMock).not.toHaveBeenCalled();
    expect(result.current.streaming).toBe(false);
  });

  it("subscribes for a venture, relays events, and reflects the open/closed stream state", () => {
    let emit: (event: FirmStreamEvent) => void = () => {};
    let setState: (state: "open" | "closed") => void = () => {};
    const unsubscribe = vi.fn();
    subscribeMock.mockImplementation((_ventureId, onEvent, onStateChange) => {
      emit = onEvent;
      setState = onStateChange!;
      return unsubscribe;
    });

    const received: FirmStreamEvent[] = [];
    const { result, unmount } = renderHook(() => useFirmEventStream("v1", (e) => received.push(e)));
    expect(subscribeMock).toHaveBeenCalledWith("v1", expect.any(Function), expect.any(Function));
    expect(result.current.streaming).toBe(false);

    act(() => setState("open"));
    expect(result.current.streaming).toBe(true);

    act(() => emit({ ventureId: "v1", kind: "conversation", at: "now" }));
    expect(received).toHaveLength(1);
    expect(received[0].kind).toBe("conversation");

    act(() => setState("closed"));
    expect(result.current.streaming).toBe(false);

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("uses the latest callback without resubscribing on rerender", () => {
    let emit: (event: FirmStreamEvent) => void = () => {};
    subscribeMock.mockImplementation((_v, onEvent) => { emit = onEvent; return () => {}; });

    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(({ cb }) => useFirmEventStream("v1", cb), {
      initialProps: { cb: first },
    });
    expect(subscribeMock).toHaveBeenCalledTimes(1);

    rerender({ cb: second });
    expect(subscribeMock).toHaveBeenCalledTimes(1); // no resubscribe

    act(() => emit({ ventureId: "v1", kind: "lens", at: "now" }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("shares one venture connection and cleans up consumers independently", async () => {
    let emit: (event: FirmStreamEvent) => void = () => {};
    let setState: (state: "open" | "closed") => void = () => {};
    const unsubscribe = vi.fn();
    subscribeMock.mockImplementation((_ventureId, onEvent, onStateChange) => {
      emit = onEvent;
      setState = onStateChange!;
      return unsubscribe;
    });

    const first = vi.fn();
    const second = vi.fn();
    const firstHook = renderHook(() => useFirmEventStream("v1", first));
    const secondHook = renderHook(() => useFirmEventStream("v1", second));

    expect(subscribeMock).toHaveBeenCalledTimes(1);
    await act(async () => {});
    act(() => setState("open"));
    expect(firstHook.result.current.streaming).toBe(true);
    expect(secondHook.result.current.streaming).toBe(true);

    act(() => emit({ ventureId: "v1", kind: "timeline", at: "now" }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    firstHook.unmount();
    expect(unsubscribe).not.toHaveBeenCalled();
    act(() => setState("closed"));
    expect(secondHook.result.current.streaming).toBe(false);

    act(() => emit({ ventureId: "v1", kind: "drive", at: "later" }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    secondHook.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not forward the additive work-delta kind to invalidation consumers", () => {
    let emit: (event: FirmStreamEvent) => void = () => {};
    subscribeMock.mockImplementation((_v, onEvent) => { emit = onEvent; return () => {}; });

    const refetch = vi.fn();
    const { unmount } = renderHook(() => useFirmEventStream("v1", refetch));

    act(() => emit({ ventureId: "v1", kind: "lens", at: "now" }));
    expect(refetch).toHaveBeenCalledTimes(1);

    // A work-delta must NOT reach a refetch consumer — otherwise every tool step becomes a full refetch.
    act(() => emit({ ventureId: "v1", kind: "work-delta", at: "now", delta: { type: "status-changed", status: "working", previous: "idle" } }));
    expect(refetch).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe("useWorkDeltaStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not subscribe without a venture", () => {
    const { result } = renderHook(() => useWorkDeltaStream(null, null, () => {}));
    expect(subscribeMock).not.toHaveBeenCalled();
    expect(result.current.streaming).toBe(false);
  });

  it("forwards typed deltas for the focused subject and ignores everything else", () => {
    let emit: (event: FirmStreamEvent) => void = () => {};
    let setState: (state: "open" | "closed") => void = () => {};
    subscribeMock.mockImplementation((_v, onEvent, onStateChange) => {
      emit = onEvent;
      setState = onStateChange!;
      return () => {};
    });

    const received: FirmWorkDelta[] = [];
    const { result, unmount } = renderHook(() =>
      useWorkDeltaStream("v1", { betId: "bet-9" }, (delta) => received.push(delta)),
    );

    act(() => setState("open"));
    expect(result.current.streaming).toBe(true);

    // An invalidation is not a delta.
    act(() => emit({ ventureId: "v1", kind: "drive", at: "t", betId: "bet-9" }));
    // A delta for another node is filtered out by subject.
    act(() => emit({ ventureId: "v1", kind: "work-delta", at: "t", betId: "bet-other", delta: { type: "status-changed", status: "working", previous: "idle" } }));
    // A delta for the focused node is forwarded, payload only.
    act(() => emit({ ventureId: "v1", kind: "work-delta", at: "t", betId: "bet-9", delta: { type: "step-started", stepId: "d:1", label: "Read" } }));

    expect(received).toEqual([{ type: "step-started", stepId: "d:1", label: "Read" }]);
    unmount();
  });

  it("with a null subject hears every delta in the venture", () => {
    let emit: (event: FirmStreamEvent) => void = () => {};
    subscribeMock.mockImplementation((_v, onEvent) => { emit = onEvent; return () => {}; });

    const received: FirmWorkDelta[] = [];
    const { unmount } = renderHook(() => useWorkDeltaStream("v1", null, (delta) => received.push(delta)));

    act(() => emit({ ventureId: "v1", kind: "work-delta", at: "t", threadRef: "thread:1", delta: { type: "step-finished", stepId: "d:1", label: "Bash", status: "ok", durationMs: 12 } }));
    expect(received).toEqual([{ type: "step-finished", stepId: "d:1", label: "Bash", status: "ok", durationMs: 12 }]);
    unmount();
  });

  it("shares the one venture connection with useFirmEventStream", async () => {
    const unsubscribe = vi.fn();
    subscribeMock.mockImplementation(() => unsubscribe);

    const invalidation = renderHook(() => useFirmEventStream("v1", () => {}));
    const delta = renderHook(() => useWorkDeltaStream("v1", null, () => {}));
    await act(async () => {});

    // Both views ride ONE EventSource/bridge subscription for the venture.
    expect(subscribeMock).toHaveBeenCalledTimes(1);

    invalidation.unmount();
    expect(unsubscribe).not.toHaveBeenCalled();
    delta.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
