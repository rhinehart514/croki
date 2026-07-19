import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActiveDrives, getConversation, getHealth, getLens, getWorkIndex } from "@/api";
import { requireFreshConnection } from "@/lib/freshness";
import type { FirmConversationMessage, FirmLens } from "@/types";
import { hasGroundedValue, useFirmConnection } from "./use-firm-connection";

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

const lens = {
  ventureId: "v1", crew: [], bets: [], outcomes: [], wallItems: [],
  wall: { count: 0, oldestParkedAt: null }, placement: { positions: {}, revision: 0 },
};

describe("firm connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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

  it("records grounded value only for repository proof, not generic runtime speech or outcomes", () => {
    const teammateMessage = (content: string) => ({
      role: "teammate",
      content,
    }) as FirmConversationMessage;
    const withEvidence = (evidence: unknown[]) => ({
      ...lens,
      bets: [{ evidence }],
    }) as FirmLens;

    expect(hasGroundedValue(
      withEvidence([{ type: "outcome", id: "market-return" }]),
      [teammateMessage("I read the product and have a direction.")],
    )).toBe(false);
    expect(hasGroundedValue(
      withEvidence([{ type: "repository-citation", path: "src/handoff.ts", excerpt: "prepareWeeklyHandoff" }]),
      [],
    )).toBe(true);
    expect(hasGroundedValue(
      withEvidence([]),
      [teammateMessage("The narrow claim is supported by src/handoff.ts:42.")],
    )).toBe(true);
  });
});
