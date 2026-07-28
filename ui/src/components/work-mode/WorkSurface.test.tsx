import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CodingWorkspace, ThreadTimeline } from "@/api";
import { WorkSurface } from "./WorkSurface";
import { requestRepositoryReview, requestWorkReview } from "./previewPresentation";

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
  return { ventureId: "venture-one", revision: 2, thread: { threadRef: "thread:one" } as ThreadTimeline["thread"], agents: [], visuals: [], items: [
    { kind: "artifact", id: "older", ref: "work:older", at: older.updatedAt, artifact: older },
    { kind: "artifact", id: "latest", ref: "work:latest", at: latest.updatedAt, artifact: latest },
  ] };
};

function chooseMaterial(name: "Code changes" | "Running preview" | "Checkpoint history") {
  fireEvent.click(screen.getByLabelText("Choose Review material"));
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name}`) }));
}

describe("Work surface", () => {
  beforeEach(() => localStorage.clear());

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
    expect(screen.getByTitle("Production ADE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve checkpoint" })).toBeInTheDocument();

    expect(screen.getByLabelText("Review: Production ADE")).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize workbench" })).toHaveAttribute("aria-valuenow", "720");
    expect(screen.getByRole("separator", { name: "Resize workbench" })).toHaveAttribute("aria-valuetext", "720 pixel Review pane");
    expect(screen.queryByRole("button", { name: /^changes$/i })).not.toBeInTheDocument();
    chooseMaterial("Running preview");
    expect(screen.getByText("Preview latest")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));
    expect(screen.getByText("Terminal latest")).toBeInTheDocument();
  });

  it("lets the founder inspect an earlier attempt without losing the workbench", () => {
    render(<WorkSurface ventureId="venture-one" timeline={timeline()} conversation={<div />} readOnlyReason={null} onWorkspaceChanged={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Coding attempt" }), { target: { value: "older" } });
    expect(screen.getByTitle("Earlier approach")).toBeInTheDocument();
    expect(screen.getByText("drover/older")).toBeInTheDocument();
  });

  it("opens the reviewable return before a newer interrupted attempt", () => {
    const value = timeline();
    const newest = (value.items[1].artifact as CodingWorkspace);
    newest.status = "interrupted";

    render(<WorkSurface ventureId="venture-one" timeline={value} conversation={<div />} readOnlyReason={null} onWorkspaceChanged={vi.fn()} />);

    expect(screen.getByTitle("Earlier approach")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Coding attempt" })).toHaveValue("older");
  });

  it("states the native capability boundary instead of simulating desktop behavior", () => {
    render(<WorkSurface ventureId="venture-one" timeline={timeline()} conversation={<div />} readOnlyReason={null} onWorkspaceChanged={vi.fn()} />);
    chooseMaterial("Running preview");
    expect(screen.getByText("Preview requires the desktop app.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));
    expect(screen.getByText("Terminal requires the desktop app.")).toBeInTheDocument();
  });

  it("returns to the Thread's selected Preview material instead of resetting to Changes", () => {
    const props = {
      ventureId: "venture-one",
      timeline: timeline(),
      conversation: <div>Founder conversation</div>,
      readOnlyReason: null,
      renderPreview: (workspace: CodingWorkspace) => <div>Preview {workspace.id}</div>,
      onWorkspaceChanged: vi.fn(),
    };
    const first = render(<WorkSurface {...props} />);
    chooseMaterial("Running preview");
    expect(screen.getByText("Preview latest")).toBeInTheDocument();
    first.unmount();

    render(<WorkSurface {...props} />);
    expect(screen.getByText("Preview latest")).toBeInTheDocument();
  });

  it("compares two attempts side by side and focuses the founder's pick", async () => {
    render(<WorkSurface ventureId="venture-one" timeline={timeline()} conversation={<div />} readOnlyReason={null} onWorkspaceChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Compare attempts" }));
    const comparison = await screen.findByLabelText("Compare coding attempts");
    expect(comparison).toBeInTheDocument();
    fireEvent.click(within(screen.getByLabelText("Right attempt")).getByRole("button", { name: "Focus" }));
    expect(screen.getByRole("combobox", { name: "Coding attempt" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Compare coding attempts")).not.toBeInTheDocument();
  });

  it("restores the exact attempt and comparison pair, ignoring unavailable stored ids", async () => {
    localStorage.setItem("drover:work-attempt-review:v1:venture-one:thread:one", JSON.stringify({
      selectedId: "missing",
      comparing: true,
      leftId: "latest",
      rightId: "older",
    }));
    const first = render(<WorkSurface ventureId="venture-one" timeline={timeline()} conversation={<div />} readOnlyReason={null} onWorkspaceChanged={vi.fn()} />);
    await screen.findByLabelText("Compare coding attempts");
    expect(within(screen.getByLabelText("Left attempt")).getByRole("combobox")).toHaveValue("latest");
    expect(within(screen.getByLabelText("Right attempt")).getByRole("combobox")).toHaveValue("older");
    fireEvent.click(screen.getByRole("button", { name: "Done comparing" }));
    expect(screen.getByRole("combobox", { name: "Coding attempt" })).toHaveValue("latest");
    first.unmount();

    render(<WorkSurface ventureId="venture-one" timeline={timeline()} conversation={<div />} readOnlyReason={null} onWorkspaceChanged={vi.fn()} />);
    expect(screen.queryByLabelText("Compare coding attempts")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Coding attempt" })).toHaveValue("latest");
  });

  it("does not offer compare with a single attempt", () => {
    const value = timeline();
    value.items = [value.items[1]];
    render(<WorkSurface ventureId="venture-one" timeline={value} conversation={<div />} readOnlyReason={null} onWorkspaceChanged={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Compare attempts" })).not.toBeInTheDocument();
  });

  it("does not reserve an empty workbench before repository work begins", () => {
    render(<WorkSurface ventureId="venture-one" timeline={null} conversation={<div>New direction</div>} readOnlyReason={null} onWorkspaceChanged={vi.fn()} />);
    expect(screen.getByText("New direction")).toBeInTheDocument();
    expect(screen.queryByLabelText("Coding workbench")).not.toBeInTheDocument();
  });

  it("opens exact cited source beside a historic Thread with no coding attempt and returns to it", async () => {
    const value = timeline();
    value.items = [];
    const view = render(<WorkSurface
      ventureId="venture-one"
      timeline={value}
      conversation={<label>Direction draft<input aria-label="Direction draft" defaultValue="Keep this context" /></label>}
      readOnlyReason={null}
      onWorkspaceChanged={vi.fn()}
    />);

    const opener = document.createElement("a");
    opener.focus = vi.fn();
    act(() => requestRepositoryReview(
      { path: "docs/STATE.md", startLine: 37, endLine: 37 },
      { threadRef: "thread:one", source: opener },
    ));

    expect(await screen.findByLabelText("Review source: docs/STATE.md")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Direction draft" })).toHaveValue("Keep this context");
    fireEvent.click(screen.getByRole("button", { name: "Hide the workbench" }));
    expect(screen.queryByLabelText("Review source: docs/STATE.md")).not.toBeInTheDocument();
    await waitFor(() => expect(opener.focus).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByLabelText("Review source: docs/STATE.md")).toBeInTheDocument();

    const otherThread = timeline();
    otherThread.thread = { ...otherThread.thread, threadRef: "thread:two" };
    otherThread.items = [];
    view.rerender(<WorkSurface ventureId="venture-one" timeline={otherThread} conversation={<div>Other Thread</div>} readOnlyReason={null} onWorkspaceChanged={vi.fn()} />);
    expect(screen.queryByLabelText("Review source: docs/STATE.md")).not.toBeInTheDocument();
    view.rerender(<WorkSurface ventureId="venture-one" timeline={value} conversation={<div>Returned Thread</div>} readOnlyReason={null} onWorkspaceChanged={vi.fn()} />);
    expect(await screen.findByLabelText("Review source: docs/STATE.md")).toBeInTheDocument();
  });

  it("opens the exact attempt and material requested by a transcript reference", () => {
    render(<WorkSurface ventureId="venture-one" timeline={timeline()} conversation={<div>Founder conversation</div>} readOnlyReason={null} onWorkspaceChanged={vi.fn()} />);

    act(() => requestWorkReview({ threadRef: "thread:one", workspaceId: "older", target: "changes" }));

    expect(screen.getByLabelText("Review: Earlier approach")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Coding attempt" })).toHaveValue("older");
    expect(screen.getByText("Review · Code changes")).toBeInTheDocument();
  });

  it("hides and reopens Review without unmounting the Thread or losing its draft", () => {
    render(<WorkSurface
      ventureId="venture-one"
      timeline={timeline()}
      conversation={<label>Direction draft<input aria-label="Direction draft" defaultValue="Keep this exact wording" /></label>}
      readOnlyReason={null}
      onWorkspaceChanged={vi.fn()}
    />);
    const draft = screen.getByRole("textbox", { name: "Direction draft" });
    fireEvent.change(draft, { target: { value: "Preserve the same Thread and repo" } });

    fireEvent.click(screen.getByRole("button", { name: "Hide the workbench" }));
    expect(screen.queryByLabelText("Review: Production ADE")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Direction draft" })).toHaveValue("Preserve the same Thread and repo");
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByLabelText("Review: Production ADE")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Direction draft" })).toHaveValue("Preserve the same Thread and repo");
  });

  it("opens exact attempt comparison from the contextual Review request", async () => {
    render(<WorkSurface ventureId="venture-one" timeline={timeline()} conversation={<div />} readOnlyReason={null} onWorkspaceChanged={vi.fn()} />);
    act(() => requestWorkReview({ threadRef: "thread:one", target: "comparison" }));
    expect(await screen.findByLabelText("Compare coding attempts")).toBeInTheDocument();
  });
});
