import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getThreadTimeline, type FirmStreamEvent } from "@/api";
import { useFirmEventStream } from "@/hooks/useFirmEventStream";
import { useThreadTimeline } from "./useThreadTimeline";

vi.mock("@/api", () => ({ getThreadTimeline: vi.fn() }));

vi.mock("@/hooks/useFirmEventStream", () => ({ useFirmEventStream: vi.fn() }));

const timelineMock = vi.mocked(getThreadTimeline);
const streamMock = vi.mocked(useFirmEventStream);

let emit: (event: FirmStreamEvent) => void = () => {};
let streaming = true;

const ping = (kind: FirmStreamEvent["kind"]) => act(() => emit({ ventureId: "venture:one", kind, at: "now" }));

describe("useThreadTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streaming = true;
    timelineMock.mockResolvedValue({
      timeline: { ventureId: "venture:one", revision: 1, thread: { threadRef: "thread:one" }, items: [], agents: [], visuals: [] },
    } as unknown as Awaited<ReturnType<typeof getThreadTimeline>>);
    streamMock.mockImplementation((_ventureId, onEvent) => {
      emit = onEvent;
      return { streaming };
    });
  });

  afterEach(() => vi.useRealTimers());

  const open = async () => {
    const hook = renderHook(() => useThreadTimeline("venture:one", "thread:one", null));
    await waitFor(() => expect(timelineMock).toHaveBeenCalledTimes(1));
    return hook;
  };

  it("does not refetch the timeline while a reply streams", async () => {
    await open();
    ping("drive");
    ping("drive");
    ping("drive");
    expect(timelineMock).toHaveBeenCalledTimes(1);
  });

  it("refetches when something durable changed", async () => {
    await open();
    ping("conversation");
    await waitFor(() => expect(timelineMock).toHaveBeenCalledTimes(2));
    ping("wall");
    await waitFor(() => expect(timelineMock).toHaveBeenCalledTimes(3));
    ping("system");
    expect(timelineMock).toHaveBeenCalledTimes(3);
  });

  it("keeps the slow refresh as the degraded path when no stream is open at all", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    streaming = false;
    await open();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(timelineMock).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale response and keeps the coherent timeline for the requested thread", async () => {
    const { result } = await open();
    expect(result.current.timeline?.thread.threadRef).toBe("thread:one");
    timelineMock.mockResolvedValue({
      timeline: { ventureId: "venture:one", revision: 2, thread: { threadRef: "thread:other" }, items: [], agents: [], visuals: [] },
    } as unknown as Awaited<ReturnType<typeof getThreadTimeline>>);
    ping("timeline");
    await waitFor(() => expect(result.current.timeline).toBeNull());
  });
});
