import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { driveStreamSupported, subscribeDriveStream, type ThreadTimelineItem } from "@/api";
import { ThreadAgentUpdate } from "./ThreadAgentUpdate";

vi.mock("@/api", () => ({
  driveStreamSupported: vi.fn(() => true),
  subscribeDriveStream: vi.fn(),
}));

const subscribeMock = vi.mocked(subscribeDriveStream);
const supportedMock = vi.mocked(driveStreamSupported);

let frame: ((frame: unknown) => void) | null = null;
let state: ((state: "open" | "closed") => void) | null = null;
let frames: FrameRequestCallback[] = [];

const paint = () => act(() => {
  const pending = frames;
  frames = [];
  for (const callback of pending) callback(0);
});

const delta = (value: unknown) => act(() => frame?.({ frame: "delta", delta: value }));

const working: ThreadTimelineItem = {
  kind: "agent-status",
  id: "agent:drive-1:working",
  ref: "run:drive-1",
  at: null,
  participantRef: "claude-code",
  participantLabel: "Claude Code",
  state: "working",
  summary: "Working in this thread",
  startedAt: new Date().toISOString(),
};

describe("ThreadAgentUpdate live stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    supportedMock.mockReturnValue(true);
    subscribeMock.mockImplementation((_ventureId, _driveId, onFrame, onStateChange) => {
      frame = onFrame as (frame: unknown) => void;
      state = onStateChange!;
      return () => {};
    });
    window.localStorage.setItem("drover:active-venture:v1", "venture:one");
  });

  afterEach(() => vi.unstubAllGlobals());

  it("streams the forming reply from the drive named by the agent-status anchor", async () => {
    render(<ThreadAgentUpdate item={working} surface="work" />);
    expect(subscribeMock).toHaveBeenCalledWith("venture:one", "drive-1", expect.any(Function), expect.any(Function), null);
    act(() => state?.("open"));

    delta({ seq: 1, kind: "text", text: "Adding the stream " });
    delta({ seq: 2, kind: "text", text: "hook." });
    paint();

    expect(await screen.findByText("Adding the stream hook.")).toBeVisible();
    expect(document.querySelector("[data-streaming=\"true\"]")).not.toBeNull();
  });

  it("shows thinking as a duration and never as content", () => {
    render(<ThreadAgentUpdate item={working} surface="work" />);
    act(() => state?.("open"));

    delta({ seq: 1, kind: "thinking", state: "start", content: "The founder probably wants…" });
    paint();
    expect(screen.getByText(/^Thinking · \d+s$/)).toBeVisible();
    expect(screen.queryByText(/founder probably wants/)).toBeNull();

    delta({ seq: 2, kind: "thinking", state: "stop", durationMs: 12_000 });
    paint();
    expect(screen.getByText("Thinking · 12s")).toBeVisible();
  });

  it("shows the forming tool call, settled steps, the plan, and a subagent's own call", () => {
    render(<ThreadAgentUpdate item={working} surface="work" />);
    act(() => state?.("open"));

    delta({ seq: 1, kind: "tool", name: "Edit", partialInput: "{\"path\":\"ui/src/api/index.ts\"" });
    delta({ seq: 2, kind: "todo", items: [{ content: "Wire the stream", status: "in_progress" }, { content: "Cover it", status: "pending" }] });
    delta({ seq: 3, kind: "child", parentToolUseId: "toolu_1", delta: { kind: "tool", name: "Grep" } });
    paint();
    expect(screen.getByText("Edit")).toBeVisible();
    expect(screen.getByText("Wire the stream")).toBeVisible();
    expect(screen.getByText("now")).toBeVisible();
    expect(screen.getByText("↳ Grep")).toBeVisible();

    delta({ seq: 4, kind: "tool-result", name: "Edit", target: "ui/src/api/index.ts", status: "ok" });
    paint();
    expect(screen.getByText("Edit ui/src/api/index.ts")).toBeVisible();
  });

  it("stays silent at rest, then shows one compact nested-work summary with details on demand", async () => {
    render(<ThreadAgentUpdate item={working} surface="work" />);
    act(() => state?.("open"));
    expect(screen.queryByRole("button", { name: "Show background work" })).toBeNull();

    delta({
      seq: 1,
      kind: "nested-task",
      task: {
        taskId: "route-audit",
        label: "Checking routes",
        taskKind: "workflow",
        status: "running",
        completedCount: 6,
        totalCount: 18,
        totalTokens: 12_400,
        inputTokens: 99_000,
        costUsd: 0.42,
        elapsedMs: 9_000,
      },
    });
    paint();

    const toggle = await screen.findByRole("button", { name: "Show background work" });
    expect(toggle).toHaveTextContent("Checking routes");
    expect(toggle).toHaveTextContent("6/18");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: "Background jobs" })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const jobs = screen.getByRole("list", { name: "Background jobs" });
    expect(within(jobs).getByText("Checking routes")).toBeVisible();
    expect(within(jobs).getByText("Running · 6/18 · 9.0s · 12k tokens · $0.42")).toBeVisible();

    delta({
      seq: 2,
      kind: "nested-task",
      task: {
        taskId: "permission-review",
        parentTaskId: "route-audit",
        label: "Verify permissions",
        status: "paused",
        error: "Waiting for founder approval",
      },
    });
    paint();

    expect(toggle).toHaveTextContent("Verify permissions");
    expect(toggle).toHaveTextContent("Paused");
    expect(within(jobs).getByText("Waiting for founder approval")).toBeVisible();
  });

  it("bounds an expanded fan-out while keeping the current job visible", async () => {
    render(<ThreadAgentUpdate item={working} surface="work" />);
    act(() => state?.("open"));
    for (let index = 0; index < 14; index += 1) {
      delta({
        seq: index + 1,
        kind: "nested-task",
        task: {
          taskId: `job-${index}`,
          label: `Route ${index}`,
          status: index === 0 ? "running" : "completed",
        },
      });
    }
    paint();

    fireEvent.click(await screen.findByRole("button", { name: "Show background work" }));
    const jobs = screen.getByRole("list", { name: "Background jobs" });
    expect(within(jobs).getAllByRole("listitem")).toHaveLength(13);
    expect(within(jobs).getByText("Route 0")).toBeVisible();
    expect(within(jobs).getByText("2 more jobs")).toBeVisible();
  });

  it("does not open a stream for settled work", () => {
    render(<ThreadAgentUpdate item={{ ...working, id: "agent:drive-1:complete", state: "complete" }} surface="work" />);
    expect(subscribeMock).not.toHaveBeenCalled();
  });
});
