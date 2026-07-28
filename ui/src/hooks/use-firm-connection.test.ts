import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActiveDrives, getConversation, getHealth, getLens, getWorkIndex, subscribeVentureEvents } from "@/api";
import { requireFreshConnection } from "@/lib/freshness";
import { useFirmConnection } from "./use-firm-connection";

vi.mock("@/api", () => ({
  getConversation: vi.fn(),
  getActiveDrives: vi.fn(),
  getHealth: vi.fn(),
  getLens: vi.fn(),
  getWorkIndex: vi.fn(),
  subscribeVentureEvents: vi.fn(() => vi.fn()),
}));

const getLensMock = vi.mocked(getLens);
const getConversationMock = vi.mocked(getConversation);
const getActiveDrivesMock = vi.mocked(getActiveDrives);
const getHealthMock = vi.mocked(getHealth);
const getWorkIndexMock = vi.mocked(getWorkIndex);
const subscribeVentureEventsMock = vi.mocked(subscribeVentureEvents);

const lens = {
  ventureId: "v1", crew: [], bets: [], outcomes: [], wallItems: [],
  wall: { count: 0, oldestParkedAt: null }, placement: { positions: {}, revision: 0 },
};

describe("firm connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    delete window.droverDesktop;
    getLensMock.mockResolvedValue({ lens });
    getConversationMock.mockResolvedValue({ messages: [] });
    getActiveDrivesMock.mockResolvedValue({ drives: [] });
    getWorkIndexMock.mockResolvedValue({ workIndex: { ventureId: "v1", revision: 0, items: [], counts: { total: 0, attention: 0, active: 0, unread: 0 }, legacy: { unindexedRunCount: 0 } } });
    getHealthMock.mockResolvedValue({
      ok: true,
      instanceId: "brain-1",
      startedAt: "2026-07-14T10:00:00.000Z",
      now: "2026-07-14T10:00:01.000Z",
      founderAuthority: {
        available: true,
        transport: "desktop-host",
        header: "x-drover-founder-capability",
        replayWindowMs: 30_000,
      },
    });
  });

  it("preserves the last verified view, blocks writes while stale, and recovers in place", async () => {
    const { result, unmount } = renderHook(() => useFirmConnection("v1"));
    await waitFor(() => expect(result.current.connection.phase).toBe("fresh"));
    expect(result.current.lens).toEqual(lens);
    expect(() => requireFreshConnection()).not.toThrow();

    getLensMock.mockRejectedValueOnce(new Error("brain unavailable"));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.connection.phase).toBe("stale"));
    expect(result.current.lens).toEqual(lens);
    expect(() => requireFreshConnection()).toThrow(/reconnecting/i);

    getLensMock.mockResolvedValue({ lens: { ...lens, wall: { count: 1, oldestParkedAt: "now" } } });
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.connection.phase).toBe("fresh"));
    expect(result.current.lens?.wall.count).toBe(1);
    unmount();
  });

  it("marks the shell offline immediately without erasing verified content", async () => {
    const { result } = renderHook(() => useFirmConnection("v1"));
    await waitFor(() => expect(result.current.connection.phase).toBe("fresh"));
    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current.connection.phase).toBe("offline");
    expect(result.current.lens).toEqual(lens);
  });

  it("holds the last coherent view while the desktop engine restarts, then refreshes", async () => {
    let emitEngineState: ((state: DroverEngineState) => void) | null = null;
    Object.assign(window, {
      droverDesktop: {
        engine: {
          status: vi.fn().mockResolvedValue({
            phase: "engine-ready",
            at: "2026-07-25T12:00:00.000Z",
            attempt: 1,
            message: null,
          }),
          onState: (listener: (state: DroverEngineState) => void) => {
            emitEngineState = listener;
            return () => { emitEngineState = null; };
          },
        },
      },
    });
    const { result } = renderHook(() => useFirmConnection("v1"));
    await waitFor(() => expect(result.current.connection.phase).toBe("fresh"));
    const readsBeforeRestart = getLensMock.mock.calls.length;

    act(() => emitEngineState?.({
      phase: "degraded",
      at: "2026-07-25T12:00:01.000Z",
      attempt: 2,
      message: "The work engine is reconnecting.",
    }));
    expect(result.current.connection.phase).toBe("stale");
    expect(result.current.lens).toEqual(lens);
    expect(() => requireFreshConnection()).toThrow(/reconnecting/i);

    act(() => emitEngineState?.({
      phase: "engine-ready",
      at: "2026-07-25T12:00:02.000Z",
      attempt: 2,
      message: null,
    }));
    await waitFor(() => expect(getLensMock.mock.calls.length).toBeGreaterThan(readsBeforeRestart));
    await waitFor(() => expect(result.current.connection.phase).toBe("fresh"));
  });

  it("queues one authoritative refresh when the live stream opens during the initial read", async () => {
    let openStream: ((state: "open" | "closed") => void) | undefined;
    let finishInitialRead: ((value: { lens: typeof lens }) => void) | undefined;
    getLensMock
      .mockImplementationOnce(() => new Promise((resolve) => { finishInitialRead = resolve; }))
      .mockResolvedValue({ lens: { ...lens, wall: { count: 1, oldestParkedAt: "now" } } });
    subscribeVentureEventsMock.mockImplementation((_ventureId, _onEvent, onStateChange) => {
      openStream = onStateChange;
      return () => {};
    });

    const { result } = renderHook(() => useFirmConnection("v1"));
    await waitFor(() => expect(getLensMock).toHaveBeenCalledTimes(1));
    act(() => openStream?.("open"));
    act(() => finishInitialRead?.({ lens }));

    await waitFor(() => expect(getLensMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.lens?.wall.count).toBe(1));
  });

  it("keeps reads current but holds writes outside the desktop host", async () => {
    getHealthMock.mockResolvedValueOnce({
      ok: true,
      instanceId: "brain-1",
      startedAt: "2026-07-14T10:00:00.000Z",
      now: "2026-07-14T10:00:01.000Z",
      founderAuthority: {
        available: false,
        transport: "desktop-host",
        header: "x-drover-founder-capability",
        replayWindowMs: 30_000,
      },
    });
    const { result } = renderHook(() => useFirmConnection("v1"));
    await waitFor(() => expect(result.current.connection.phase).toBe("read-only"));
    expect(result.current.lens).toEqual(lens);
    expect(() => requireFreshConnection()).toThrow(/reconnecting/i);
  });
});
