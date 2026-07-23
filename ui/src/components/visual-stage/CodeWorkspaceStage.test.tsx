import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CodingWorkspace } from "@/api";
import { CodeWorkspaceStage } from "./CodeWorkspaceStage";

const review = vi.fn(async () => ({}));
const apply = vi.fn(async () => ({}));
const reviewProductConsequence = vi.fn(async () => ({}));
vi.mock("@/api", async (original) => ({
  ...await original<typeof import("@/api")>(),
  reviewCodingWorkspace: (...args: unknown[]) => review(...args),
  reviewCodingProductConsequence: (...args: unknown[]) => reviewProductConsequence(...args),
  applyCodingWorkspace: (...args: unknown[]) => apply(...args),
  commitCodingWorkspace: vi.fn(async () => ({})),
  discardCodingWorkspace: vi.fn(async () => ({})),
  restoreCodingCheckpoint: vi.fn(async () => ({})),
  getCodingWorkspaceShip: vi.fn(async () => ({
    workspace: {}, readiness: null,
    ship: {
      drafts: { branch: "feature/implement-native-coding", commitSubject: "Implement native coding", commitBody: "", commitMessage: "Implement native coding", prTitle: "Implement native coding", prBody: "## Summary" },
      drift: null, baseBranch: "main",
      gh: { available: true, authenticated: true, reason: null },
      attempt: null, receipts: [],
    },
  })),
  shipCodingWorkspace: vi.fn(async () => ({ workspace: {}, readiness: null, ship: null })),
}));

const workspace = (approved = false): CodingWorkspace => ({
  id: "code-one", kind: "native-code", ventureId: "v1", threadRef: "thread:one", betId: null,
  goal: "Implement native coding", repository: "/repo", sourceHead: "abc", branch: "drover/code-one",
  worktree: "/repo/.drover-worktrees/code-one", runRefs: ["run:one"], participantRefs: ["codex"],
  providerSessions: [{ runRef: "run:one", provider: "codex", sessionId: "session-one", startedAt: "2026-01-01", completedAt: "2026-01-02" }],
  checkpoints: [{ id: "baseline", ref: "refs/drover/checkpoints/code-one/baseline", commit: "base", capturedAt: "2026-01-01" }, { id: "turn-1", ref: "refs/drover/checkpoints/code-one/turn-1", commit: "change", capturedAt: "2026-01-02" }],
  commands: [{ command: "rg native-code", kind: "provider-command", status: "passed", exitCode: 0, completedAt: "2026-01-02", output: "found" }],
  verification: [{ command: "npm test", kind: "provider-command", status: "passed", exitCode: 0, completedAt: "2026-01-02", output: "810 tests passed" }],
  changedFiles: [{ status: "M", path: "ui/src/App.tsx" }],
  diff: "diff --git a/ui/src/App.tsx b/ui/src/App.tsx\n@@ -1 +1 @@\n-old\n+new",
  diffStat: "1 file changed", patchHash: "hash", status: "reviewable", currentActivity: null,
  consequence: approved ? { review: "approved" } : null,
  productConsequence: { capability: "Implement native coding", system: ["ui/src/App.tsx"], claims: [{ status: "needs-founder-review", statement: "Customer impact is not yet evidenced." }], releaseQuestion: "Which release carries this?" },
  createdAt: "2026-01-01", updatedAt: "2026-01-02",
});

describe("native coding stage", () => {
  it("shows exact implementation, attributed proof, and the Product/release consequence", () => {
    render(<CodeWorkspaceStage ventureId="v1" workspace={workspace()} readOnlyReason={null} onChanged={vi.fn()} />);
    expect(screen.getAllByText("ui/src/App.tsx")).toHaveLength(2);
    expect(screen.getByText("npm test")).toBeInTheDocument();
    expect(screen.getByText("Which release carries this?")).toBeInTheDocument();
    expect(screen.getByText(/does not alter Product \/ GTM truth until you adopt it/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve checkpoint" })).toBeInTheDocument();
  });

  it("lets the founder edit and adopt the provisional Product consequence", async () => {
    const changed = vi.fn();
    render(<CodeWorkspaceStage ventureId="v1" workspace={workspace()} readOnlyReason={null} onChanged={changed} />);
    fireEvent.change(screen.getByLabelText("What became possible"), { target: { value: "Founders keep coding context in Croki" } });
    fireEvent.change(screen.getByLabelText("Distribution question"), { target: { value: "Which founders should receive it first?" } });
    fireEvent.click(screen.getByRole("button", { name: "Adopt Product consequence" }));
    await waitFor(() => expect(reviewProductConsequence).toHaveBeenCalledWith("v1", "code-one", {
      decision: "adopt",
      capability: "Founders keep coding context in Croki",
      releaseQuestion: "Which founders should receive it first?",
    }));
    expect(changed).toHaveBeenCalled();
  });

  it("offers the single gated Ship decision with the exact prepared branch once approved", async () => {
    render(<CodeWorkspaceStage ventureId="v1" workspace={workspace(true)} readOnlyReason={null} onChanged={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Ship" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("feature/implement-native-coding")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prepare branch / PR" })).not.toBeInTheDocument();
  });

  it("requires a distinct confirmation before applying an approved checkpoint", async () => {
    render(<CodeWorkspaceStage ventureId="v1" workspace={workspace(true)} readOnlyReason={null} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply to source workspace" }));
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm apply to source workspace" }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith("v1", "code-one"));
  });
});
