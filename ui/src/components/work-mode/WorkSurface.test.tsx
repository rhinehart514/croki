import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CodingWorkspace, ThreadTimeline } from "@/api";
import { WorkSurface } from "./WorkSurface";

const attempt = (id: string, goal: string, updatedAt: string): CodingWorkspace => ({
  id, kind: "native-code", ventureId: "venture-one", threadRef: "thread:one", betId: null,
  goal, repository: "/repo", sourceHead: "abc", branch: `drover/${id}`, worktree: `/worktrees/${id}`,
  runRefs: [`run:${id}`], participantRefs: ["codex"], providerSessions: [],
  checkpoints: [{ id: "baseline", ref: `refs/${id}/baseline`, commit: "abc", capturedAt: updatedAt }],
  commands: [], verification: [{ command: "npm test", kind: "verification", status: "passed", exitCode: 0 }],
  changedFiles: [{ status: "M", path: `ui/src/${id}.tsx` }],
  diff: `diff --git a/ui/src/${id}.tsx b/ui/src/${id}.tsx\n@@ -1 +1 @@\n-old\n+new`,
  diffStat: "1 file changed", patchHash: id, status: "reviewable", currentActivity: null,
  consequence: null, createdAt: updatedAt, updatedAt,
});

const timeline = (): ThreadTimeline => {
  const older = attempt("older", "Earlier approach", "2026-07-18T12:00:00.000Z");
  const latest = attempt("latest", "Production ADE", "2026-07-19T12:00:00.000Z");
  return { ventureId: "venture-one", revision: 2, thread: {} as ThreadTimeline["thread"], agents: [], visuals: [], items: [
    { kind: "artifact", id: "older", ref: "work:older", at: older.updatedAt, artifact: older },
    { kind: "artifact", id: "latest", ref: "work:latest", at: latest.updatedAt, artifact: latest },
  ] };
};

describe("Work surface", () => {
  it("keeps conversation beside the latest real coding attempt and exposes native slots", () => {
    render(<WorkSurface
      ventureId="venture-one"
      timeline={timeline()}
      conversation={<div>Founder conversation</div>}
      readOnlyReason={null}
      renderPreview={(workspace) => <div>Preview {workspace.id}</div>}
      renderTerminal={(workspace) => <div>Terminal {workspace.id}</div>}
      onWorkspaceChanged={vi.fn()}
    />);

    expect(screen.getByText("Founder conversation")).toBeInTheDocument();
    expect(screen.getByText("Production ADE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve checkpoint" })).toBeInTheDocument();

    expect(screen.getByRole("tab", { name: "changes" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "preview" }));
    expect(screen.getByText("Preview latest")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));
    expect(screen.getByText("Terminal latest")).toBeInTheDocument();
  });

  it("lets the founder inspect an earlier attempt without losing the workbench", () => {
    render(<WorkSurface ventureId="venture-one" timeline={timeline()} conversation={<div />} readOnlyReason={null} onWorkspaceChanged={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Coding attempt" }), { target: { value: "older" } });
    expect(screen.getByText("Earlier approach")).toBeInTheDocument();
    expect(screen.getByText("drover/older")).toBeInTheDocument();
  });

  it("states the native capability boundary instead of simulating desktop behavior", () => {
    render(<WorkSurface ventureId="venture-one" timeline={timeline()} conversation={<div />} readOnlyReason={null} onWorkspaceChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "preview" }));
    expect(screen.getByText("Preview requires the desktop app.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));
    expect(screen.getByText("Terminal requires the desktop app.")).toBeInTheDocument();
  });

  it("does not reserve an empty workbench before repository work begins", () => {
    render(<WorkSurface ventureId="venture-one" timeline={null} conversation={<div>New direction</div>} readOnlyReason={null} onWorkspaceChanged={vi.fn()} />);
    expect(screen.getByText("New direction")).toBeInTheDocument();
    expect(screen.queryByLabelText("Coding workbench")).not.toBeInTheDocument();
  });
});
