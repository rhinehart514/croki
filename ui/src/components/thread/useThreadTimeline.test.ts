import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getThreadTimeline, type FirmStreamEvent } from "@/api";
import { useFirmEventStream } from "@/hooks/useFirmEventStream";
import { useWorkProtocol } from "@/hooks/useWorkProtocol";
import { useThreadTimeline } from "./useThreadTimeline";

vi.mock("@/api", () => ({ getThreadTimeline: vi.fn() }));

vi.mock("@/hooks/useFirmEventStream", () => ({ useFirmEventStream: vi.fn() }));
vi.mock("@/hooks/useWorkProtocol", () => ({ useWorkProtocol: vi.fn() }));

const timelineMock = vi.mocked(getThreadTimeline);
const streamMock = vi.mocked(useFirmEventStream);
const workProtocolMock = vi.mocked(useWorkProtocol);
const seedThread = vi.fn();

let emit: (event: FirmStreamEvent) => void = () => {};
let streaming = true;
let pushedThreads: Record<string, { revision: number; value: unknown }> = {};
let orderedTransport: "offline" | "live" = "offline";
let orderedRevision = 0;

const ping = (kind: FirmStreamEvent["kind"]) => act(() => emit({ ventureId: "venture:one", kind, at: "now" }));

describe("useThreadTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streaming = true;
    pushedThreads = {};
    orderedTransport = "offline";
    orderedRevision = 0;
    workProtocolMock.mockImplementation(() => ({
      threads: pushedThreads,
      projectionRevision: orderedRevision,
      seedThread,
      transportSync: orderedTransport,
      threadSync: "offline",
      workSync: "offline",
      canvasSync: "offline",
    }) as unknown as ReturnType<typeof useWorkProtocol>);
    timelineMock.mockResolvedValue({
      timeline: { ventureId: "venture:one", revision: 1, thread: { threadRef: "thread:one" }, items: [], agents: [], visuals: [] },
    } as unknown as Awaited<ReturnType<typeof getThreadTimeline>>);
    streamMock.mockImplementation((_ventureId, onEvent) => {
      emit = onEvent;
      return { streaming };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.droverDesktop;
  });

  const open = async () => {
    const hook = renderHook(() => useThreadTimeline("venture:one", "thread:one", null));
    await waitFor(() => expect(hook.result.current.timeline?.thread.threadRef).toBe("thread:one"));
    return hook;
  };

  it("does not refetch the timeline while a reply streams", async () => {
    await open();
    ping("drive");
    ping("drive");
    ping("drive");
    expect(timelineMock).toHaveBeenCalledTimes(2);
  });

  it("refetches when something durable changed", async () => {
    await open();
    ping("conversation");
    await waitFor(() => expect(timelineMock).toHaveBeenCalledTimes(3));
    ping("wall");
    await waitFor(() => expect(timelineMock).toHaveBeenCalledTimes(4));
    ping("system");
    expect(timelineMock).toHaveBeenCalledTimes(4);
  });

  it("keeps the slow refresh as the degraded path when no stream is open at all", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    streaming = false;
    await open();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(timelineMock).toHaveBeenCalledTimes(2);
  });

  it("re-reads once when the live stream opens to close the snapshot handoff window", async () => {
    streaming = false;
    const hook = await open();
    expect(timelineMock).toHaveBeenCalledTimes(1);

    streaming = true;
    hook.rerender();
    await waitFor(() => expect(timelineMock).toHaveBeenCalledTimes(2));
  });

  it("rejects a mismatched response and keeps the coherent timeline for the requested thread", async () => {
    const { result } = await open();
    expect(result.current.timeline?.thread.threadRef).toBe("thread:one");
    timelineMock.mockResolvedValue({
      timeline: { ventureId: "venture:one", revision: 2, thread: { threadRef: "thread:other" }, items: [], agents: [], visuals: [] },
    } as unknown as Awaited<ReturnType<typeof getThreadTimeline>>);
    ping("timeline");
    await waitFor(() => expect(result.current.error).toBe("Thread sync could not verify this destination."));
    expect(result.current.timeline?.thread.threadRef).toBe("thread:one");
  });

  it("cannot let a delayed prior-Thread response overwrite the destination", async () => {
    streaming = false;
    let settleOld: ((value: Awaited<ReturnType<typeof getThreadTimeline>>) => void) | null = null;
    timelineMock.mockImplementationOnce(() => new Promise((resolve) => { settleOld = resolve; }));
    const hook = renderHook(
      ({ threadRef }) => useThreadTimeline("venture:one", threadRef, null),
      { initialProps: { threadRef: "thread:old" } },
    );
    await waitFor(() => expect(timelineMock).toHaveBeenCalledTimes(1));

    timelineMock.mockResolvedValue({
      timeline: { ventureId: "venture:one", revision: 2, thread: { threadRef: "thread:new" }, items: [], agents: [], visuals: [] },
    } as unknown as Awaited<ReturnType<typeof getThreadTimeline>>);
    hook.rerender({ threadRef: "thread:new" });
    await waitFor(() => expect(hook.result.current.timeline?.thread.threadRef).toBe("thread:new"));

    act(() => settleOld?.({
      timeline: { ventureId: "venture:one", revision: 1, thread: { threadRef: "thread:old" }, items: [], agents: [], visuals: [] },
    } as unknown as Awaited<ReturnType<typeof getThreadTimeline>>));
    await act(async () => { await Promise.resolve(); });
    expect(hook.result.current.timeline?.thread.threadRef).toBe("thread:new");
  });

  it("does not refetch a Thread projection for broad durable events when ordered Work is available", async () => {
    orderedTransport = "live";
    window.droverDesktop = {
      api: { subscribeWork: vi.fn(async () => () => {}) },
    } as unknown as DroverDesktopBridge;
    const hook = renderHook(() => useThreadTimeline("venture:ordered", "thread:one", null));
    await waitFor(() => expect(timelineMock).toHaveBeenCalledTimes(1));

    ping("conversation");
    ping("timeline");
    await act(async () => { await Promise.resolve(); });
    expect(timelineMock).toHaveBeenCalledTimes(1);
    hook.unmount();
    delete window.droverDesktop;
  });

  it("lets a direct refresh win at the same ordered revision, then yields to a later push", async () => {
    orderedTransport = "live";
    window.droverDesktop = {
      api: { subscribeWork: vi.fn(async () => () => {}) },
    } as unknown as DroverDesktopBridge;
    pushedThreads = {
      "thread:one": {
        revision: 7,
        value: {
          ventureId: "venture:one",
          revision: 1,
          thread: { threadRef: "thread:one" },
          items: [{ id: "review", consequence: { review: null } }],
          agents: [],
          visuals: [],
        },
      },
    };
    orderedRevision = 7;
    timelineMock.mockResolvedValue({
      timeline: {
        ventureId: "venture:one",
        revision: 1,
        thread: { threadRef: "thread:one" },
        items: [{ id: "review", consequence: { review: "approved" } }],
        agents: [],
        visuals: [],
      },
    } as unknown as Awaited<ReturnType<typeof getThreadTimeline>>);

    const hook = renderHook(() => useThreadTimeline("venture:one", "thread:one", null));
    await waitFor(() => expect(hook.result.current.timeline?.items[0]).toMatchObject({
      consequence: { review: "approved" },
    }));
    pushedThreads = {
      "thread:one": {
        revision: 8,
        value: {
          ventureId: "venture:one",
          revision: 1,
          thread: { threadRef: "thread:one" },
          items: [{ id: "review", consequence: { review: "rejected" } }],
          agents: [],
          visuals: [],
        },
      },
    };
    orderedRevision = 8;
    hook.rerender();
    await waitFor(() => expect(hook.result.current.timeline?.items[0]).toMatchObject({
      consequence: { review: "rejected" },
    }));
    hook.unmount();
  });
});
