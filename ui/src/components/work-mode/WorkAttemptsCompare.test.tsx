import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CodingWorkspace } from "@/api";
import { WorkAttemptsCompare } from "./WorkAttemptsCompare";

const attempt = (id: string, path: string): CodingWorkspace => ({
  id, kind: "native-code", ventureId: "venture-one", threadRef: "thread:one", betId: null,
  goal: `Goal ${id}`, repository: "/repo", sourceHead: "abc", branch: `drover/${id}`, worktree: `/worktrees/${id}`,
  runRefs: [`run:${id}`], participantRefs: ["codex"], providerSessions: [], checkpoints: [],
  commands: [], verification: [],
  changedFiles: [{ status: "M", path }],
  diff: `diff --git a/${path} b/${path}\n@@ -1 +1 @@\n-old\n+new-${id}`,
  diffStat: `${id} stat`, patchHash: id, status: "reviewable", currentActivity: null,
  consequence: null, createdAt: "2026-07-19T12:00:00.000Z", updatedAt: "2026-07-19T12:00:00.000Z",
});

describe("Work attempts compare", () => {
  const attempts = [attempt("latest", "ui/a.tsx"), attempt("older", "ui/b.tsx")];

  it("renders two attempts side by side and focuses the chosen one", () => {
    const onFocusAttempt = vi.fn();
    render(<WorkAttemptsCompare attempts={attempts} primaryId="latest" onFocusAttempt={onFocusAttempt} onExit={vi.fn()} />);

    const left = screen.getByLabelText("Left attempt");
    const right = screen.getByLabelText("Right attempt");
    expect(within(left).getByText("latest stat")).toBeInTheDocument();
    expect(within(right).getByText("older stat")).toBeInTheDocument();

    fireEvent.click(within(right).getByRole("button", { name: "Focus this attempt" }));
    expect(onFocusAttempt).toHaveBeenCalledWith("older");
  });

  it("lets the founder repoint a column at any attempt", () => {
    render(<WorkAttemptsCompare attempts={attempts} primaryId="latest" onFocusAttempt={vi.fn()} onExit={vi.fn()} />);
    const left = screen.getByLabelText("Left attempt");
    fireEvent.change(within(left).getByRole("combobox"), { target: { value: "older" } });
    expect(within(left).getByText("older stat")).toBeInTheDocument();
  });

  it("exits comparison through Done comparing", () => {
    const onExit = vi.fn();
    render(<WorkAttemptsCompare attempts={attempts} primaryId="latest" onFocusAttempt={vi.fn()} onExit={onExit} />);
    fireEvent.click(screen.getByRole("button", { name: "Done comparing" }));
    expect(onExit).toHaveBeenCalled();
  });
});
