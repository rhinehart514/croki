import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkIndex, WorkIndexItem } from "@/api";
import { ThreadList } from "./ThreadList";

function item(threadRef: string, attention: WorkIndexItem["attention"]): WorkIndexItem {
  return {
    threadRef,
    founderIntent: threadRef.replace("thread:", ""),
    activity: "idle",
    attention,
    unread: attention === "none",
    lifecycle: "open",
    pinnedAt: null,
    updatedAt: new Date().toISOString(),
  } as WorkIndexItem;
}

function index(items: WorkIndexItem[]): WorkIndex {
  return { items, counts: { matchCount: items.length } } as WorkIndex;
}

describe("ThreadList", () => {
  it("lets a large review queue own the rail until Recent is disclosed", () => {
    const workIndex = index([
      ...Array.from({ length: 5 }, (_, position) => item(`thread:review-${position + 1}`, "decision")),
      item("thread:quiet", "none"),
    ]);
    render(<ThreadList workIndex={workIndex} search="" selected="thread:review-1" onSelect={vi.fn()} />);

    const recent = screen.getByText("Recent").closest("details");
    expect(recent).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Recent"));
    expect(recent).toHaveAttribute("open");
    expect(screen.getByText("quiet")).toBeVisible();
  });

  it("flattens scoped search into one results list", () => {
    render(<ThreadList workIndex={index([item("thread:match", "decision")])} search="match" selected={null} onSelect={vi.fn()} />);

    expect(screen.getByText("Results")).toBeVisible();
    expect(screen.queryByText("Needs review")).not.toBeInTheDocument();
    expect(screen.getByText("match")).toBeVisible();
  });
});
