import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkIndex, WorkIndexItem } from "@/api";
import { ThreadList } from "./ThreadList";

function item(threadRef: string, overrides: Partial<WorkIndexItem> = {}): WorkIndexItem {
  return {
    threadRef,
    founderIntent: threadRef.replace("thread:", ""),
    activity: "idle",
    attention: "none",
    unread: false,
    settled: false,
    lifecycle: "open",
    pinnedAt: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as WorkIndexItem;
}

function index(items: WorkIndexItem[]): WorkIndex {
  return { items, counts: { matchCount: items.length } } as WorkIndex;
}

describe("ThreadList", () => {
  it("keeps unsettled work above the divider and rests settled threads under Earlier", () => {
    const workIndex = index([
      item("thread:deciding", { attention: "decision" }),
      item("thread:running", { activity: "running" }),
      item("thread:done-long-ago", { settled: true, unread: true }),
    ]);
    render(<ThreadList workIndex={workIndex} search="" selected="thread:done-long-ago" onSelect={vi.fn()} />);

    const active = screen.getByLabelText("Threads in motion");
    expect(active).toHaveTextContent("deciding");
    expect(active).toHaveTextContent("running");
    expect(active).not.toHaveTextContent("done-long-ago");

    const earlier = screen.getByLabelText("Earlier threads");
    expect(earlier).toHaveTextContent("Earlier");
    expect(earlier).toHaveTextContent("done-long-ago");
    // Selection and the unread treatment survive settling.
    expect(screen.getByText("done-long-ago").closest("button")).toHaveAttribute("data-selected", "true");
    expect(screen.getByText("Unread result")).toBeInTheDocument();
  });

  it("omits the divider when nothing has settled and stays honest when everything has", () => {
    const { rerender } = render(<ThreadList workIndex={index([item("thread:only-active")])} search="" selected={null} onSelect={vi.fn()} />);
    expect(screen.queryByText("Earlier")).not.toBeInTheDocument();

    rerender(<ThreadList workIndex={index([item("thread:resting", { settled: true })])} search="" selected={null} onSelect={vi.fn()} />);
    expect(screen.getByText("Earlier")).toBeVisible();
    expect(screen.getByText("Nothing needs you right now")).toBeVisible();

    rerender(<ThreadList workIndex={index([])} search="" selected={null} onSelect={vi.fn()} />);
    expect(screen.getByText("Start with a direction")).toBeVisible();
  });

  it("keeps pinned threads in their own section regardless of settling", () => {
    const workIndex = index([item("thread:kept-close", { settled: true, pinnedAt: "2026-07-20T10:00:00.000Z" })]);
    render(<ThreadList workIndex={workIndex} search="" selected={null} onSelect={vi.fn()} />);

    expect(screen.getByText("Pinned")).toBeVisible();
    expect(screen.queryByText("Earlier")).not.toBeInTheDocument();
  });

  it("flattens scoped search into one results list", () => {
    render(<ThreadList workIndex={index([item("thread:match", { attention: "decision" })])} search="match" selected={null} onSelect={vi.fn()} />);

    expect(screen.getByText("Results")).toBeVisible();
    expect(screen.queryByText("Earlier")).not.toBeInTheDocument();
    expect(screen.getByText("match")).toBeVisible();
  });
});
