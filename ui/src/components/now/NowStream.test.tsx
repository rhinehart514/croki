import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NowStream } from "./NowStream";
import type { NowSection } from "./nowModel";

const sections: NowSection[] = [
  {
    key: "needs-you", label: "Needs you", tone: "needs-you",
    rows: [{
      id: "w1", source: "record", title: "Approve the outreach to 12 operators", detail: "Held safely.",
      attribution: "Sable · cold outbound", stateLabel: "Needs you", state: "needs-you", needsYou: true,
      occurredAt: "2026-07-15T10:00:00Z", startedAt: null, actionLabel: "Review", provenance: null,
      target: { kind: "wall" },
    }],
  },
  {
    key: "moving", label: "Moving", tone: "working",
    rows: [{
      id: "d1", source: "drive", title: "Find the first 20 customers", detail: "2 drafts ready to inspect",
      attribution: null, stateLabel: "Working", state: "working", needsYou: false,
      occurredAt: "2026-07-15T09:00:00Z", startedAt: "2026-07-15T09:00:00Z", actionLabel: "Open", provenance: null,
      target: { kind: "drive", driveId: "d1", betId: "b1" },
    }],
  },
];

describe("NowStream", () => {
  it("renders sections with their real row content and marks the needs-you tone", () => {
    render(<NowStream sections={sections} now={Date.parse("2026-07-15T10:05:00Z")} onSelectRow={() => {}} />);
    expect(screen.getByRole("button", { name: /Approve the outreach to 12 operators/ })).toHaveAttribute("data-tone", "needs-you");
    expect(screen.getByText("2 drafts ready to inspect")).toBeTruthy();
    expect(screen.getByLabelText("Needs you")).toBeTruthy();
    expect(screen.getByLabelText("Moving")).toBeTruthy();
  });

  it("calls back with the row when selected", () => {
    const onSelect = vi.fn();
    render(<NowStream sections={sections} now={Date.now()} onSelectRow={onSelect} />);
    screen.getByRole("button", { name: /Find the first 20 customers/ }).click();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }));
  });

  it("shows the quiet first-run state when the venture is silent", () => {
    render(<NowStream sections={[]} now={Date.now()} onSelectRow={() => {}} />);
    expect(screen.getByText(/This is your venture\. Tell it what to do\./)).toBeTruthy();
  });
});
