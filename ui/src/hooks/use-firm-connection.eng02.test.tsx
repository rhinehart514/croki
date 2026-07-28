import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActiveDrives,
  getConversation,
  getHealth,
  getLens,
  getWorkIndex,
  subscribeVentureEvents,
  type FirmStreamEvent,
} from "@/api";
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

function lens(ventureId: string, count = 0) {
  return {
    ventureId,
    crew: [],
    bets: [],
    outcomes: [],
    wallItems: [],
    wall: { count, oldestParkedAt: null },
    placement: { positions: {}, revision: 0 },
  };
}

function workIndex(ventureId: string) {
  return {
    ventureId,
    revision: 1,
    items: [],
    counts: { total: 0, attention: 0, active: 0, unread: 0, matchCount: 0 },
    legacy: { unindexedRunCount: 0 },
  };
}

describe("ENG-02 connection adversarial receipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    delete window.droverDesktop;
    getLensMock.mockImplementation(async (ventureId) => ({ lens: lens(ventureId) }));
    getConversationMock.mockResolvedValue({ messages: [] });
    getActiveDrivesMock.mockResolvedValue({ drives: [] });
    getWorkIndexMock.mockImplementation(async (ventureId) => ({ workIndex: workIndex(ventureId) }));
    getHealthMock.mockResolvedValue({
      ok: true,
      instanceId: "brain-eng02",
      startedAt: "2026-07-25T12:00:00.000Z",
      now: "2026-07-25T12:00:01.000Z",
      founderAuthority: {
        available: true,
        transport: "desktop-host",
        header: "x-drover-founder-capability",
        replayWindowMs: 30_000,
      },
    });
  });

  it("never lets a delayed Project A read paint after the founder switches to Project B", async () => {
    let resolveProjectA: ((value: { lens: ReturnType<typeof lens> }) => void) | null = null;
    getLensMock.mockImplementation((ventureId) => {
      if (ventureId === "project-a") {
        return new Promise((resolve) => { resolveProjectA = resolve; });
      }
      return Promise.resolve({ lens: lens(ventureId, 2) });
    });

    const hook = renderHook(
      ({ ventureId }) => useFirmConnection(ventureId),
      { initialProps: { ventureId: "project-a" } },
    );
    await waitFor(() => expect(getLensMock).toHaveBeenCalledWith("project-a"));

    hook.rerender({ ventureId: "project-b" });
    await waitFor(() => expect(hook.result.current.lens?.ventureId).toBe("project-b"));
    expect(hook.result.current.lens?.wall.count).toBe(2);

    await act(async () => {
      resolveProjectA?.({ lens: lens("project-a", 99) });
      await Promise.resolve();
    });
    expect(hook.result.current.lens?.ventureId).toBe("project-b");
    expect(hook.result.current.lens?.wall.count).toBe(2);
    hook.unmount();
  });

  it("does not turn a provider token delta into a full venture-lens refetch", async () => {
    let emit: ((event: FirmStreamEvent) => void) | null = null;
    subscribeVentureEventsMock.mockImplementation((_ventureId, onEvent) => {
      emit = onEvent;
      return () => {};
    });

    const hook = renderHook(() => useFirmConnection("project-a"));
    await waitFor(() => expect(hook.result.current.connection.phase).toBe("fresh"));
    const readsBeforeToken = getLensMock.mock.calls.length;
    const workReadsBeforeEvents = getWorkIndexMock.mock.calls.length;

    act(() => emit?.({
      ventureId: "project-a",
      kind: "work-delta",
      at: "2026-07-25T12:00:02.000Z",
      threadRef: "thread:one",
      delta: { type: "step-started", stepId: "provider-token", label: "Provider token" },
    }));
    await act(async () => { await Promise.resolve(); });
    expect(getLensMock).toHaveBeenCalledTimes(readsBeforeToken);

    act(() => emit?.({
      ventureId: "project-a",
      kind: "conversation",
      at: "2026-07-25T12:00:03.000Z",
      threadRef: "thread:one",
    }));
    await waitFor(() => expect(getLensMock.mock.calls.length).toBeGreaterThan(readsBeforeToken));
    expect(getWorkIndexMock).toHaveBeenCalledTimes(workReadsBeforeEvents);
    hook.unmount();
  });

  it("leaves WorkIndex entirely to the authoritative desktop handshake and pushes", async () => {
    let emit: ((event: FirmStreamEvent) => void) | null = null;
    window.droverDesktop = {
      api: { subscribeWork: vi.fn(async () => () => {}) },
    } as unknown as DroverDesktopBridge;
    subscribeVentureEventsMock.mockImplementation((_ventureId, onEvent, onStateChange) => {
      emit = onEvent;
      onStateChange?.("open");
      return () => {};
    });

    const hook = renderHook(() => useFirmConnection("project-a"));
    await waitFor(() => expect(hook.result.current.connection.phase).toBe("fresh"));
    expect(getWorkIndexMock).not.toHaveBeenCalled();

    act(() => emit?.({
      ventureId: "project-a",
      kind: "conversation",
      at: "2026-07-25T12:00:04.000Z",
      threadRef: "thread:one",
    }));
    await act(async () => { await Promise.resolve(); });
    expect(getWorkIndexMock).not.toHaveBeenCalled();
    hook.unmount();
    delete window.droverDesktop;
  });
});
