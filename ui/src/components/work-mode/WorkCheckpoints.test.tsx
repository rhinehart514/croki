import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CodingWorkspace } from "@/api";
import { WorkCheckpoints } from "./WorkCheckpoints";

const restoreCodingCheckpoint = vi.fn(async () => ({ workspace: {} as CodingWorkspace, readiness: null }));
vi.mock("@/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api")>()), restoreCodingCheckpoint: (...args: unknown[]) => restoreCodingCheckpoint(...args) }));

const workspace = (): CodingWorkspace => ({
  id: "ws-one", kind: "native-code", ventureId: "venture-one", threadRef: "thread:one", betId: null,
  goal: "Goal", repository: "/repo", sourceHead: "abc", branch: "drover/ws-one", worktree: "/worktrees/ws-one",
  runRefs: ["run:one"], participantRefs: ["codex"], providerSessions: [],
  checkpoints: [
    { id: "baseline", ref: "refs/ws-one/baseline", commit: "aaaaaaaa1111", capturedAt: "2026-07-19T12:00:00.000Z" },
    { id: "turn-1", ref: "refs/ws-one/turn-1", commit: "bbbbbbbb2222", capturedAt: "2026-07-19T12:05:00.000Z", runRef: "run:one" },
    { id: "turn-2", ref: "refs/ws-one/turn-2", commit: "cccccccc3333", capturedAt: "2026-07-19T12:10:00.000Z", runRef: "run:one" },
  ],
  commands: [], verification: [], changedFiles: [{ status: "M", path: "ui/a.tsx" }],
  diff: "diff", diffStat: "1 file", patchHash: "h", status: "reviewable", currentActivity: null,
  consequence: null, createdAt: "2026-07-19T12:00:00.000Z", updatedAt: "2026-07-19T12:10:00.000Z",
});

describe("Work checkpoints", () => {
  it("marks the latest checkpoint current and rewinds an earlier one on two-step confirm", async () => {
    const onChanged = vi.fn();
    render(<WorkCheckpoints ventureId="venture-one" workspace={workspace()} readOnlyReason={null} onChanged={onChanged} />);

    expect(screen.getByText("Turn 2").closest("li")).toHaveTextContent("Current state");
    expect(screen.getByText("Baseline")).toBeInTheDocument();

    const turnOne = screen.getByText("Turn 1").closest("li")!;
    fireEvent.click(turnOne.querySelector("button")!);
    fireEvent.click(turnOne.querySelector("button")!);
    await waitFor(() => expect(restoreCodingCheckpoint).toHaveBeenCalledWith("venture-one", "ws-one", "turn-1"));
    expect(onChanged).toHaveBeenCalled();
  });

  it("hides rewind controls under a read-only reason", () => {
    render(<WorkCheckpoints ventureId="venture-one" workspace={workspace()} readOnlyReason="Browser build is read-only" onChanged={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Rewind here" })).not.toBeInTheDocument();
    expect(screen.getByText("Current state")).toBeInTheDocument();
  });
});
