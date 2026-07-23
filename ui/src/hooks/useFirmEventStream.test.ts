import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeVentureEvents, type FirmStreamEvent } from "@/api";
import { useFirmEventStream } from "./useFirmEventStream";

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
});
