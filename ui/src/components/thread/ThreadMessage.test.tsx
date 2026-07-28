import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ThreadTimelineItem } from "@/api";
import { ThreadMessage } from "./ThreadMessage";
import { OPEN_TERMINAL_REFERENCE_EVENT, formatTerminalReference } from "@/components/work-mode/terminalReference";
import { WORK_REVIEW_REQUEST_EVENT, type WorkReviewRequest } from "@/components/work-mode/previewPresentation";

const open = vi.fn();
const openThread = vi.fn();
const item = (kind: ThreadTimelineItem["kind"], extra: Record<string, unknown> = {}): ThreadTimelineItem => ({ kind, id: `${kind}:one`, ref: `${kind}:one`, at: null, ...extra });

describe("thread material grammar", () => {
  it("opens a historic repository citation in contextual Review while leaving web links to Streamdown safety", async () => {
    const requested = vi.fn();
    window.addEventListener(WORK_REVIEW_REQUEST_EVENT, requested);
    render(<ThreadMessage
      surface="work"
      repository="/Users/jacob/Projects/drover"
      threadRef="thread:one"
      item={item("message", {
        role: "teammate",
        participantRef: "codex",
        content: "Read [the exact state](/Users/jacob/Projects/drover/docs/STATE.md:37) and [the website](https://example.com).",
      })}
      onOpenVisual={open}
      onOpenThread={openThread}
    />);

    const citation = await screen.findByRole("link", { name: "the exact state" });
    fireEvent.click(citation);
    const detail = (requested.mock.calls[0]?.[0] as CustomEvent<WorkReviewRequest>).detail;
    expect(detail).toMatchObject({
      threadRef: "thread:one",
      target: "repository",
      repository: { path: "docs/STATE.md", startLine: 37, endLine: 37 },
    });

    fireEvent.click(screen.getByRole("link", { name: "the website" }));
    expect(requested).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Open external link?")).toBeVisible();
    window.removeEventListener(WORK_REVIEW_REQUEST_EVENT, requested);
  });

  it("renders an observed journey attachment as exact Thread context, never as an image", () => {
    render(<ThreadMessage
      item={item("message", {
        role: "founder",
        content: "Map this observed journey.",
        ventureId: "venture:one",
        attachments: [{ kind: "journey-import", importRef: "journey-import:one", name: "observed.csv", mediaType: "text/csv", byteSize: 42, digest: "abc" }],
      })}
      surface="work"
      onOpenVisual={open}
      onOpenThread={openThread}
    />);
    expect(screen.getByText("observed.csv")).toBeVisible();
    expect(screen.getByText("Observed journey source · mapping in this Thread")).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("keeps returned material compact while preserving honest state and exact open actions", () => {
    const { rerender } = render(<ThreadMessage item={item("artifact", { title: "Live proposal", artifact: {}, ownerLabels: ["Yara"] })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Live proposal")).toBeInTheDocument();
    expect(screen.getByText("Yara")).toBeInTheDocument();
    rerender(<ThreadMessage item={item("artifact", { title: "Working preview", artifact: { content: "PREVIEW\n\nThe real work starts here." } })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Working preview")).toBeInTheDocument();
    expect(screen.queryByText("The real work starts here.")).not.toBeInTheDocument();
    rerender(<ThreadMessage item={item("comparison", { title: "Before and after", alternatives: [] })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("No alternatives recorded")).toBeInTheDocument();
    rerender(<ThreadMessage item={item("artifact", { title: "Setup flow", artifact: { content: { kind: "flow", steps: [{ id: "one", label: "Start with the job" }], edges: [] } } })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("1 step")).toBeInTheDocument();
    expect(screen.queryByText("Start with the job")).not.toBeInTheDocument();
    rerender(<ThreadMessage item={item("comparison", { title: "Alternatives", alternatives: [{ id: "a", title: "Job first" }, { id: "b", title: "Guided setup" }] })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("2 approaches")).toBeInTheDocument();
    rerender(<ThreadMessage item={item("evidence", { title: "Evidence returned", evidence: [{}] })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Source details unavailable")).toBeInTheDocument();
    rerender(<ThreadMessage item={item("consequence", { title: "Ready for approval", decision: {} })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText("No external action until you decide")).toBeInTheDocument();
  });

  it("keeps internal activity out of the transcript and long model prose inside the primary conversation", () => {
    const { rerender } = render(<ThreadMessage item={item("activity-summary", { summary: "Codex inspected 18 files." })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.queryByText("Codex inspected 18 files.")).not.toBeInTheDocument();
    const prose = "Material finding ".repeat(120);
    rerender(<ThreadMessage item={item("message", { role: "teammate", participantRef: "codex", content: prose })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText(prose.trim())).toBeInTheDocument();
  });

  it("animates only the arriving text in a streaming teammate turn", async () => {
    const { container, rerender } = render(<ThreadMessage item={item("message", { role: "teammate", participantRef: "codex", content: "Tracing the setup flow", streaming: true })} surface="work" onOpenVisual={open} onOpenThread={openThread} />);
    await waitFor(() => expect(container.querySelector("[data-sd-animate]")).not.toBeNull());
    expect(container.querySelector(".firm-app-message-response")).toHaveTextContent("Tracing the setup flow");
    expect(container.querySelector('.thread-message[data-streaming="true"]')).not.toBeNull();
    expect(container.querySelector(".thread-message-caret")).not.toBeNull();
    rerender(<ThreadMessage item={item("message", { role: "teammate", participantRef: "codex", content: "Done." })} surface="work" onOpenVisual={open} onOpenThread={openThread} />);
    expect(container.querySelector(".thread-message-caret")).toBeNull();
    expect(container.querySelector("[data-sd-animate]")).toBeNull();
    rerender(<ThreadMessage item={item("message", { role: "founder", content: "Do it", streaming: true })} surface="work" onOpenVisual={open} onOpenThread={openThread} />);
    expect(container.querySelector('.thread-message[data-streaming="true"]')).toBeNull();
    expect(container.querySelector("[data-sd-animate]")).toBeNull();
  });

  it("animates the forming reply carried by an active drive", async () => {
    const { container } = render(<ThreadMessage surface="work" item={item("agent-status", {
      participantRef: "codex",
      state: "working",
      summary: "Answering in this Thread",
      startedAt: new Date().toISOString(),
      liveText: "The response is forming here.",
    })} onOpenVisual={open} onOpenThread={openThread} />);
    await waitFor(() => expect(container.querySelector("[data-sd-animate]")).not.toBeNull());
    expect(container.querySelector('.thread-message[data-streaming="true"]')).toHaveTextContent("The response is forming here.");
  });

  it("shows a live participant beat and elapsed work time", () => {
    render(<ThreadMessage item={item("agent-status", { participantRef: "founding-teammate", participantLabel: "Yara", state: "working", summary: "Searching the repository", startedAt: new Date(Date.now() - 65_000).toISOString() })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Yara")).toBeInTheDocument();
    expect(screen.getByText("Searching the repository")).toBeInTheDocument();
    expect(screen.getByText(/Working · 1m/)).toBeInTheDocument();
  });

  it("acknowledges a long wait without pretending the work has stalled", () => {
    render(<ThreadMessage surface="work" item={item("agent-status", { participantRef: "codex", state: "working", summary: "Thinking through the direction", startedAt: new Date(Date.now() - 4 * 60_000).toISOString() })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText(/Taking longer than usual · 4m/)).toBeInTheDocument();
    expect(screen.getByText("The work is still active. You can leave this thread and return when it finishes.")).toBeInTheDocument();
  });

  it("settles an invalid Canvas return with retained context and a frozen duration", () => {
    render(<ThreadMessage surface="work" item={item("agent-status", {
      participantRef: "codex",
      state: "failed",
      recoveryLayer: "canvas",
      startedAt: "2026-07-19T10:04:00.000Z",
      updatedAt: "2026-07-19T10:05:29.000Z",
      recovery: "The provider return was not usable as a Canvas view. Send the direction again from this Thread.",
    })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Canvas return needs another pass")).toBeVisible();
    expect(screen.getByText(/Failed · 1m 29s/)).toBeVisible();
    expect(screen.getByText(/Your Thread and last Canvas were kept/)).toBeVisible();
    expect(screen.queryByText(/The work is still active/)).toBeNull();
  });

  it("keeps Work progress in the response flow without presenting a Croki persona", () => {
    render(<ThreadMessage surface="work" item={item("agent-status", { participantRef: "founding-teammate", participantLabel: "Mara", state: "working", summary: "Reading venture context", startedAt: new Date(Date.now() - 12_000).toISOString() })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Reading venture context")).toBeInTheDocument();
    expect(screen.getByText(/Working · 12s/)).toBeInTheDocument();
    expect(screen.queryByText("Mara")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAccessibleName(/^Reading venture context/);
  });

  it("keeps the latest factual steps visible and folds earlier ones without exposing hidden model prose", () => {
    render(<ThreadMessage surface="work" item={item("agent-status", {
      participantRef: "founding-teammate",
      state: "working",
      summary: "Reading source evidence",
      startedAt: new Date(Date.now() - 12_000).toISOString(),
      activitySteps: [
        { id: "event:truth", label: "Read venture truth", durationMs: 90 },
        { id: "event:config", label: "Checked venture configuration", durationMs: 60 },
        { id: "event:search", label: "Searched the repository", durationMs: 145 },
        { id: "event:read", label: "Read source evidence", durationMs: 1_420 },
        { id: "event:theory", label: "Updated venture understanding", tone: "thinking", durationMs: 300 },
      ],
      hiddenText: "private internal reasoning",
    })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Searched the repository")).toBeVisible();
    expect(screen.getByText("145ms")).toBeVisible();
    expect(screen.getByText("Read source evidence")).toBeVisible();
    expect(screen.getByText("1.4s")).toBeVisible();
    expect(screen.queryByText("Read venture truth")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+2 earlier steps" }));
    expect(screen.getByText("Read venture truth")).toBeVisible();
    expect(screen.getByText("Checked venture configuration")).toBeVisible();
    expect(screen.getByText("Updated venture understanding").closest("li")).toHaveAttribute("data-tone", "thinking");
    fireEvent.click(screen.getByRole("button", { name: "Hide earlier steps" }));
    expect(screen.queryByText("Read venture truth")).not.toBeInTheDocument();
    expect(screen.queryByText("private internal reasoning")).not.toBeInTheDocument();
  });

  it("renders reasoning beats quietly and the forming tool call factually while work is live", () => {
    const { container, rerender } = render(<ThreadMessage surface="work" item={item("agent-status", {
      participantRef: "founding-teammate",
      state: "working",
      summary: "Thinking through the direction",
      summaryTone: "thinking",
      startedAt: new Date(Date.now() - 5_000).toISOString(),
      liveTool: { name: "search_repository", partialInput: '{"query": "onboarding fl' },
    })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Thinking through the direction")).toHaveAttribute("data-tone", "thinking");
    expect(screen.getByText("search_repository")).toBeVisible();
    expect(screen.getByText('{"query": "onboarding fl')).toBeVisible();
    rerender(<ThreadMessage surface="work" item={item("agent-status", {
      participantRef: "founding-teammate",
      state: "working",
      summary: "Searched the repository",
      startedAt: new Date(Date.now() - 5_000).toISOString(),
      liveTool: null,
    })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(container.querySelector(".thread-agent-live-tool")).toBeNull();
    expect(screen.getByText("Searched the repository")).not.toHaveAttribute("data-tone");
  });

  it("collapses a long founder message behind an expand control without truncating the record", () => {
    const longDirection = "The onboarding flow needs a rethink. ".repeat(30).trim();
    render(<ThreadMessage surface="work" item={item("message", { role: "founder", content: longDirection })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText(longDirection)).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Show full message" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps short founder messages plain and offers copy only on settled turns", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { rerender } = render(<ThreadMessage surface="work" item={item("message", { role: "founder", content: "Ship it" })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.queryByRole("button", { name: "Show full message" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy message as Markdown" }));
    await screen.findByRole("button", { name: "Copied" });
    expect(writeText).toHaveBeenCalledWith("Ship it");
    rerender(<ThreadMessage surface="work" item={item("message", { role: "teammate", participantRef: "codex", content: "Still forming", streaming: true })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.queryByRole("button", { name: "Copy message as Markdown" })).not.toBeInTheDocument();
  });

  it("reopens the exact selected terminal range from the founder turn", () => {
    const reference = {
      ref: "terminal:workspace-one:tests:range",
      ventureId: "v1", workspaceId: "workspace-one", threadRef: "thread:one",
      terminalId: "tests", terminalName: "Tests", text: "FAIL src/client.test.ts:42",
      start: { x: 0, y: 4 }, end: { x: 26, y: 4 },
    };
    const reopened = vi.fn();
    window.addEventListener(OPEN_TERMINAL_REFERENCE_EVENT, reopened, { once: true });
    render(<ThreadMessage surface="work" item={item("message", {
      role: "founder",
      content: `${formatTerminalReference(reference)}\nFix this failure`,
    })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.queryByText(/terminal-ref:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tests · selected terminal output" }));
    expect(reopened).toHaveBeenCalledTimes(1);
  });

  it("identifies an explicitly invoked specialist in contextual conversation", () => {
    render(<ThreadMessage surface="context" item={item("agent-status", { participantRef: "founding-teammate", participantLabel: "Mara", state: "working", summary: "Shaping the evidence loop", startedAt: new Date(Date.now() - 12_000).toISOString() })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Mara")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAccessibleName(/^Mara: Shaping the evidence loop/);
  });

  it("renders a routing handoff as a compact participant beat", () => {
    render(<ThreadMessage item={item("message", { role: "system", messageKind: "handoff", participantRef: "founding-teammate", participantLabel: "Yara", content: "Yara is taking this one." })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByLabelText("Yara accepted this direction")).toHaveClass("thread-handoff");
    expect(screen.getByText("is taking this one.")).toBeInTheDocument();
  });

  it("removes redundant participant assignment prose from the Work transcript", () => {
    const { container } = render(<ThreadMessage surface="work" item={item("message", { role: "teammate", participantLabel: "Yara", content: "Yara is taking this one." })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("removes legacy direct-provider continuation prose from existing Work transcripts", () => {
    const { container, rerender } = render(<ThreadMessage surface="work" item={item("message", { role: "teammate", participantRef: "claude-code", participantLabel: "claude-code", content: "Continuing with Claude Code." })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ThreadMessage surface="work" item={item("message", { role: "teammate", participantRef: "codex", participantLabel: "codex", content: "Continuing with Codex." })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("presents native coding as exact work rather than provider completion", () => {
    render(<ThreadMessage item={item("artifact", {
      title: "Implement native coding",
      artifact: { kind: "native-code", status: "needs-verification", verification: [{ status: "passed" }], content: { kind: "diff", diff: "diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n-a\n+b" } },
      ownerLabels: ["Codex"], visual: { kind: "diff", ref: "work:code-one", threadRef: "thread:one", title: "Implement native coding" },
    })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Code")).toBeInTheDocument();
    expect(screen.getByText(/needs verification · 1 check passed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show changes: Implement native coding" })).toBeInTheDocument();
  });

  it("renders returned code changes as a changed-files card with exact counts", () => {
    render(<ThreadMessage item={item("artifact", {
      title: "Implement native coding",
      artifact: {
        kind: "native-code", status: "reviewable",
        changedFiles: [{ status: "M", path: "src/app.ts" }, { status: "A", path: "src/new.ts" }, { status: "D", path: "src/old.ts" }],
        diffStat: " 3 files changed, 120 insertions(+), 45 deletions(-)",
      },
      visual: { kind: "diff", ref: "work:code-one", threadRef: "thread:one", title: "Implement native coding" },
    })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("3 changed files")).toBeInTheDocument();
    expect(screen.getByText("+120")).toBeInTheDocument();
    expect(screen.getByText("−45")).toBeInTheDocument();
    expect(screen.getByText("src/new.ts")).toBeInTheDocument();
    expect(screen.getByText("View diff")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show changes: Implement native coding" }));
    expect(open).toHaveBeenCalled();
  });
});
