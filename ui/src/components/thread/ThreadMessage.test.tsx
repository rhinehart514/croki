import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ThreadTimelineItem } from "@/api";
import { ThreadMessage } from "./ThreadMessage";

const open = vi.fn();
const openThread = vi.fn();
const item = (kind: ThreadTimelineItem["kind"], extra: Record<string, unknown> = {}): ThreadTimelineItem => ({ kind, id: `${kind}:one`, ref: `${kind}:one`, at: null, ...extra });

describe("thread rich-message grammar", () => {
  it("renders all six rich forms honestly when their canonical payload is partial", () => {
    const { rerender } = render(<ThreadMessage item={item("artifact", { title: "Live proposal", artifact: {}, ownerLabels: ["Yara"] })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("This visual is ready for inspection.")).toBeInTheDocument();
    expect(screen.getByText(/Owned by Yara/)).toBeInTheDocument();
    rerender(<ThreadMessage item={item("comparison", { title: "Before and after", alternatives: [] })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Before and after")).toBeInTheDocument();
    rerender(<ThreadMessage item={item("artifact", { title: "Setup flow", artifact: { content: { kind: "flow", steps: [{ id: "one", label: "Start with the job" }], edges: [] } } })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Start with the job")).toBeInTheDocument();
    rerender(<ThreadMessage item={item("comparison", { title: "Alternatives", alternatives: [{ id: "a", title: "Job first" }, { id: "b", title: "Guided setup" }] })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Guided setup")).toBeInTheDocument();
    rerender(<ThreadMessage item={item("evidence", { title: "Evidence returned", evidence: [{}] })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Evidence record returned")).toBeInTheDocument();
    rerender(<ThreadMessage item={item("consequence", { title: "Ready for approval", decision: {} })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("None until a founder action")).toBeInTheDocument();
  });

  it("keeps activity collapsed and long model prose inside the primary conversation", () => {
    const { rerender } = render(<ThreadMessage item={item("activity-summary", { summary: "Codex inspected 18 files." })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Codex inspected 18 files.").closest("details")).not.toHaveAttribute("open");
    const prose = "Material finding ".repeat(120);
    rerender(<ThreadMessage item={item("message", { role: "teammate", participantRef: "codex", content: prose })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText(prose.trim())).toBeInTheDocument();
  });

  it("shows a live participant beat and elapsed work time", () => {
    render(<ThreadMessage item={item("agent-status", { participantRef: "founding-teammate", participantLabel: "Yara", state: "working", summary: "Searching the repository", startedAt: new Date(Date.now() - 65_000).toISOString() })} onOpenVisual={open} onOpenThread={openThread} />);
    expect(screen.getByText("Yara")).toBeInTheDocument();
    expect(screen.getByText("Searching the repository")).toBeInTheDocument();
    expect(screen.getByText(/working · 1m/)).toBeInTheDocument();
  });
});
