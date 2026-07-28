import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CodingWorkspace } from "@/api";
import { readUxMetrics } from "@/lib/ux-metrics";
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
  beforeEach(() => localStorage.clear());

  const attempts = [attempt("latest", "ui/a.tsx"), attempt("older", "ui/b.tsx")];
  const props = (overrides = {}) => ({
    attempts,
    primaryId: "latest",
    leftId: "latest",
    rightId: "older",
    onPairChange: vi.fn(),
    onFocusAttempt: vi.fn(),
    onContinueAttempt: vi.fn(),
    onCarryComment: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  });

  it("renders two attempts side by side and focuses the chosen one", () => {
    const onFocusAttempt = vi.fn();
    render(<WorkAttemptsCompare {...props({ onFocusAttempt })} />);

    const left = screen.getByLabelText("Left attempt");
    const right = screen.getByLabelText("Right attempt");
    expect(within(left).getAllByText("ui/a.tsx").length).toBeGreaterThan(0);
    expect(within(right).getAllByText("ui/b.tsx").length).toBeGreaterThan(0);

    fireEvent.click(within(right).getByRole("button", { name: "Focus" }));
    expect(onFocusAttempt).toHaveBeenCalledWith("older");
  });

  it("lets the founder repoint a column at any attempt", () => {
    const onPairChange = vi.fn();
    render(<WorkAttemptsCompare {...props({ onPairChange })} />);
    const left = screen.getByLabelText("Left attempt");
    fireEvent.change(within(left).getByRole("combobox"), { target: { value: "older" } });
    expect(onPairChange).toHaveBeenCalledWith("older", "latest");
  });

  it("exits comparison through Done comparing", () => {
    const onExit = vi.fn();
    render(<WorkAttemptsCompare {...props({ onExit })} />);
    fireEvent.click(screen.getByRole("button", { name: "Done comparing" }));
    expect(onExit).toHaveBeenCalled();
  });

  it("keeps comparison read-only until a concrete continue action", () => {
    const onContinueAttempt = vi.fn();
    render(<WorkAttemptsCompare {...props({ onContinueAttempt })} />);
    expect(screen.getByText(/Read-only until/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByLabelText("Right attempt")).getByRole("button", { name: "Continue" }));
    expect(onContinueAttempt).toHaveBeenCalledWith("older");
  });

  it("keeps materially different proof states visible without a winner score", () => {
    const verified = attempt("verified", "ui/same.tsx");
    verified.providerSessions = [{
      runRef: "run:verified",
      provider: "codex",
      sessionId: "session:verified",
      startedAt: "2026-07-19T12:00:00.000Z",
      completedAt: "2026-07-19T12:00:02.000Z",
      model: "gpt-5.6",
      effort: "high",
    }];
    verified.checkpoints = [{
      id: "turn-verified",
      ref: "refs/verified",
      commit: "abc",
      capturedAt: "2026-07-19T12:00:02.000Z",
      runRef: "run:verified",
      direction: "Preserve pending state",
    }];
    verified.verification = [{
      command: "npm test",
      kind: "verification",
      status: "passed",
      exitCode: 0,
      completedAt: "2026-07-19T12:00:02.000Z",
    }];
    const uncertain = attempt("uncertain", "ui/same.tsx");
    uncertain.verification = [{
      command: "npm test",
      kind: "verification",
      status: "failed",
      exitCode: 1,
      completedAt: "2026-07-19T12:00:02.000Z",
    }];
    render(<WorkAttemptsCompare {...props({
      attempts: [verified, uncertain],
      primaryId: "verified",
      leftId: "verified",
      rightId: "uncertain",
    })} />);

    expect(within(screen.getByLabelText("Left attempt")).getByText("verified")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Right attempt")).getByText("uncertain")).toBeInTheDocument();
    expect(screen.getByText("session:verified")).toBeInTheDocument();
    expect(screen.queryByText(/winner|score/i)).not.toBeInTheDocument();
    expect(readUxMetrics().map((entry) => entry.event)).toEqual([
      "first_exact_reviewable_material",
      "first_verified_result",
    ]);
  });
});
