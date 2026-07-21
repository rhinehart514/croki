import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ThreadTimelineItem } from "@/api";
import { ThreadMessage } from "./ThreadMessage";

const open = vi.fn();
const openThread = vi.fn();
const item = (kind: ThreadTimelineItem["kind"], extra: Record<string, unknown> = {}): ThreadTimelineItem => ({ kind, id: `${kind}:one`, ref: `${kind}:one`, at: null, ...extra });

describe("thread material grammar", () => {
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

  it("shows a live participant beat and elapsed work time", () => {
    render(<ThreadMessage item={item("agent-status", { participantRef: "founding-teammate", participantLabel: "Yara", state: "working", summary: "Searching the repository", startedAt: new Date(Date.now() - 65_000).toISOString() })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Yara")).toBeInTheDocument();
    expect(screen.getByText("Searching the repository")).toBeInTheDocument();
    expect(screen.getByText(/Working · 1m/)).toBeInTheDocument();
  });

  it("keeps Work progress in the response flow without presenting a Drover persona", () => {
    render(<ThreadMessage surface="work" item={item("agent-status", { participantRef: "founding-teammate", participantLabel: "Mara", state: "working", summary: "Reading venture context", startedAt: new Date(Date.now() - 12_000).toISOString() })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Reading venture context")).toBeInTheDocument();
    expect(screen.getByText(/Working · 12s/)).toBeInTheDocument();
    expect(screen.queryByText("Mara")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAccessibleName(/^Reading venture context/);
  });

  it("expands a factual work log without exposing hidden model prose", () => {
    render(<ThreadMessage surface="work" item={item("agent-status", {
      participantRef: "founding-teammate",
      state: "working",
      summary: "Reading source evidence",
      startedAt: new Date(Date.now() - 12_000).toISOString(),
      activitySteps: [
        { id: "event:search", label: "Searched the repository", durationMs: 145 },
        { id: "event:read", label: "Read source evidence", durationMs: 1_420 },
      ],
      hiddenText: "private internal reasoning",
    })} onOpenVisual={open} onOpenThread={openThread} />);
    fireEvent.click(screen.getByText("Show activity"));
    expect(screen.getByText("Searched the repository")).toBeVisible();
    expect(screen.getByText("145ms")).toBeVisible();
    expect(screen.getByText("Read source evidence")).toBeVisible();
    expect(screen.getByText("1.4s")).toBeVisible();
    expect(screen.queryByText("private internal reasoning")).not.toBeInTheDocument();
  });

  it("identifies the participating agent inside Product and GTM chat", () => {
    render(<ThreadMessage surface="work" chatMode="product-gtm" item={item("agent-status", { participantRef: "founding-teammate", participantLabel: "Mara", state: "working", summary: "Shaping the evidence loop", startedAt: new Date(Date.now() - 12_000).toISOString() })} onOpenVisual={open} onOpenThread={openThread} />);
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
});
