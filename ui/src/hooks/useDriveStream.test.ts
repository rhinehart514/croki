import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { driveStreamSupported, subscribeDriveStream } from "@/api";
import { useDriveStream } from "./useDriveStream";

vi.mock("@/api", () => ({
  driveStreamSupported: vi.fn(() => true),
  subscribeDriveStream: vi.fn(),
}));

const subscribeMock = vi.mocked(subscribeDriveStream);
const supportedMock = vi.mocked(driveStreamSupported);

type Connection = {
  since: number | null;
  frame: (frame: unknown) => void;
  state: (state: "open" | "closed") => void;
  stop: ReturnType<typeof vi.fn>;
};

const connections: Connection[] = [];
let frames: FrameRequestCallback[] = [];

// One rAF flush publishes a whole burst. Holding the callbacks here proves the coalescing instead of
// assuming it: a hundred deltas may only ever schedule one frame.
const paint = () => act(() => {
  const pending = frames;
  frames = [];
  for (const callback of pending) callback(0);
});

describe("useDriveStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connections.length = 0;
    frames = [];
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    supportedMock.mockReturnValue(true);
    subscribeMock.mockImplementation((_ventureId, _driveId, onFrame, onStateChange, since) => {
      const stop = vi.fn();
      connections.push({ since: since ?? null, frame: onFrame as (frame: unknown) => void, state: onStateChange!, stop });
      return stop;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const open = () => {
    const hook = renderHook(() => useDriveStream("venture:one", "drive-1"));
    act(() => connections[0].state("open"));
    return hook;
  };

  const delta = (connection: Connection, value: unknown) => act(() => connection.frame({ frame: "delta", delta: value }));

  it("appends text deltas in sequence and repaints once per frame", () => {
    const { result } = open();
    expect(result.current.connected).toBe(true);

    delta(connections[0], { seq: 1, kind: "text", text: "Reading " });
    delta(connections[0], { seq: 2, kind: "text", text: "the " });
    delta(connections[0], { seq: 3, kind: "text", text: "repository." });
    expect(frames).toHaveLength(1);
    expect(result.current.text).toBe("");

    paint();
    expect(result.current.text).toBe("Reading the repository.");
  });

  it("drops a duplicate or already-applied sequence instead of repeating text", () => {
    const { result } = open();
    delta(connections[0], { seq: 1, kind: "text", text: "one " });
    delta(connections[0], { seq: 2, kind: "text", text: "two" });
    delta(connections[0], { seq: 2, kind: "text", text: "two" });
    delta(connections[0], { seq: 1, kind: "text", text: "one " });
    paint();
    expect(result.current.text).toBe("one two");
  });

  it("reconnects from the sequence it reached and never duplicates the painted reply", () => {
    const { result } = open();
    delta(connections[0], { seq: 1, kind: "text", text: "Half a " });
    delta(connections[0], { seq: 2, kind: "text", text: "sentence" });
    paint();

    act(() => connections[0].state("closed"));
    expect(result.current.connected).toBe(false);
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(connections).toHaveLength(2);
    expect(connections[1].since).toBe(2);

    // A server that answers `?since=` with the full forming state must not double the reply…
    act(() => connections[1].state("open"));
    act(() => connections[1].frame({ frame: "snapshot", snapshot: { seq: 2, text: "Half a sentence" } }));
    paint();
    expect(result.current.text).toBe("Half a sentence");

    // …and one that answers with only the part produced since that sequence must not lose it.
    act(() => connections[1].state("closed"));
    act(() => { vi.advanceTimersByTime(3_000); });
    act(() => connections[2].frame({ frame: "snapshot", snapshot: { seq: 2, text: " and the rest." } }));
    paint();
    expect(result.current.text).toBe("Half a sentence and the rest.");
  });

  it("resumes from replayed deltas when the server answers `since` without a snapshot", () => {
    const { result } = open();
    delta(connections[0], { seq: 1, kind: "text", text: "Half a " });
    paint();

    act(() => connections[0].state("closed"));
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(connections[1].since).toBe(1);
    act(() => connections[1].state("open"));
    // The replay window still held seq 1, so only what was missed arrives — no snapshot frame at all.
    delta(connections[1], { seq: 2, kind: "text", text: "sentence." });
    paint();
    expect(result.current.text).toBe("Half a sentence.");
  });

  it("reads a snapshot's thinking as shape only, in the same start/stop vocabulary as the deltas", () => {
    const { result } = open();
    act(() => connections[0].frame({
      frame: "snapshot",
      snapshot: {
        seq: 4,
        text: "so far",
        thinking: { state: "start", durationMs: null },
        tool: { name: "Read", partialInput: "{" },
        todos: [{ content: "Ship it", status: "pending" }],
        children: { toolu_1: { text: "child text", tool: null, todos: [], children: {} } },
        nestedTasks: { audit: { taskId: "audit", label: "Checking routes", status: "running", completedCount: 6, totalCount: 18 } },
      },
    }));
    paint();
    expect(result.current.thinking?.active).toBe(true);
    expect(result.current.tool).toEqual({ name: "Read", partialInput: "{" });
    expect(result.current.todos).toEqual([{ content: "Ship it", status: "pending" }]);
    expect(result.current.children).toEqual([{ parentToolUseId: "toolu_1", text: "child text", tool: null, steps: [] }]);
    expect(result.current.nestedTasks).toEqual([{ taskId: "audit", label: "Checking routes", status: "running", completedCount: 6, totalCount: 18 }]);
  });

  it("folds partial nested-work updates by task id without erasing earlier facts", () => {
    const { result } = open();
    delta(connections[0], {
      seq: 1,
      kind: "nested-task",
      task: { taskId: "audit", label: "Checking routes", taskKind: "workflow", status: "running", completedCount: 0, totalCount: 18 },
    });
    delta(connections[0], {
      seq: 2,
      kind: "nested-task",
      task: { taskId: "audit", completedCount: 6, totalTokens: 12_400, elapsedMs: 9_000 },
    });
    delta(connections[0], {
      seq: 3,
      kind: "nested-task",
      task: { taskId: "review", parentToolUseId: "audit", label: "Verify permissions", status: "paused", error: "Waiting for approval", hidden: true },
    });
    paint();

    expect(result.current.nestedTasks).toEqual([
      {
        taskId: "audit",
        label: "Checking routes",
        taskKind: "workflow",
        status: "running",
        completedCount: 6,
        totalCount: 18,
        totalTokens: 12_400,
        elapsedMs: 9_000,
      },
      {
        taskId: "review",
        parentTaskId: "audit",
        label: "Verify permissions",
        status: "paused",
        error: "Waiting for approval",
        skipTranscript: true,
      },
    ]);
  });

  it("carries thinking as shape only, a forming tool call, settled steps, a plan, and subagent work", () => {
    const { result } = open();
    delta(connections[0], { seq: 1, kind: "thinking", state: "start" });
    delta(connections[0], { seq: 2, kind: "tool", name: "Read", partialInput: "{\"path\":\"ui/src" });
    paint();
    expect(result.current.thinking).toMatchObject({ active: true, durationMs: null });
    expect(result.current.tool).toEqual({ name: "Read", partialInput: "{\"path\":\"ui/src" });

    delta(connections[0], { seq: 3, kind: "thinking", state: "stop", durationMs: 12_000 });
    delta(connections[0], { seq: 4, kind: "tool-result", name: "Read", target: "ui/src/api/index.ts", status: "ok", detail: "9 lines" });
    delta(connections[0], { seq: 5, kind: "todo", items: [{ content: "Wire the stream", status: "in_progress" }] });
    delta(connections[0], { seq: 6, kind: "child", parentToolUseId: "toolu_1", delta: { kind: "text", text: "scanning" } });
    delta(connections[0], { seq: 7, kind: "child", parentToolUseId: "toolu_1", delta: { kind: "tool", name: "Grep" } });
    paint();

    expect(result.current.thinking).toEqual({ active: false, durationMs: 12_000, startedAt: null });
    expect(result.current.tool).toBeNull();
    expect(result.current.steps).toEqual([{ id: "0:Read", name: "Read", target: "ui/src/api/index.ts", status: "ok", detail: "9 lines" }]);
    expect(result.current.todos).toEqual([{ content: "Wire the stream", status: "in_progress" }]);
    expect(result.current.children).toEqual([{ parentToolUseId: "toolu_1", text: "scanning", tool: { name: "Grep", partialInput: "" }, steps: [] }]);
  });

  it("stays idle without a drive and in a runtime that cannot carry stream payload", () => {
    const { result: idle } = renderHook(() => useDriveStream("venture:one", null));
    expect(subscribeMock).not.toHaveBeenCalled();
    expect(idle.current.connected).toBe(false);

    supportedMock.mockReturnValue(false);
    const { result: unsupported } = renderHook(() => useDriveStream("venture:one", "drive-1"));
    expect(subscribeMock).not.toHaveBeenCalled();
    expect(unsupported.current.connected).toBe(false);
  });

  it("drops the painted reply when the status moves to another drive", () => {
    const { result, rerender } = renderHook(({ driveId }) => useDriveStream("venture:one", driveId), {
      initialProps: { driveId: "drive-1" },
    });
    act(() => connections[0].state("open"));
    delta(connections[0], { seq: 1, kind: "text", text: "first drive" });
    paint();
    expect(result.current.text).toBe("first drive");

    rerender({ driveId: "drive-2" });
    expect(result.current.text).toBe("");
    expect(connections[0].stop).toHaveBeenCalled();
    expect(connections[1].since).toBeNull();
  });
});
