import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReturnBrief } from "./ReturnBrief";
import { projectReturnBrief, type ReturnBriefRecord } from "./returnBriefProjection";

const records: ReturnBriefRecord[] = [
  {
    id: "wall-1", group: "needs-you", truth: "A customer reply needs your answer.",
    whyNow: "The bet cannot answer for you.", attribution: "Sable · Pricing reply", occurredAt: "2026-07-14T12:03:00.000Z",
    provenance: "Wall receipt", actionLabel: "Answer at the wall", target: { kind: "wall" },
  },
  {
    id: "outcome-1", group: "market-spoke", truth: "A buyer rejected annual billing.",
    attribution: "Joined market return", occurredAt: "2026-07-14T12:02:00.000Z",
    actionLabel: "Open the bet", target: { kind: "bet", betId: "bet-1" },
  },
  {
    id: "work-1", group: "kept-moving", truth: "A revised product page is staged.",
    occurredAt: "2026-07-14T12:01:00.000Z", actionLabel: "Review the bet", target: { kind: "bet", betId: "bet-2" },
  },
  {
    id: "held-1", group: "held-safely", truth: "The outbound send stopped at the wall.",
    occurredAt: "2026-07-14T12:00:00.000Z", actionLabel: "Inspect the hold", target: { kind: "wall" },
  },
];

describe("ReturnBrief", () => {
  it("groups durable truth without turning evidence navigation into review", () => {
    const onOpenBet = vi.fn();
    const onOpenWall = vi.fn();
    const onShowWiderFirm = vi.fn();
    const onFinishBriefing = vi.fn();
    render(
      <ReturnBrief
        projection={projectReturnBrief(records)}
        onOpenBet={onOpenBet}
        onOpenWall={onOpenWall}
        onShowWiderFirm={onShowWiderFirm}
        onFinishBriefing={onFinishBriefing}
      />,
    );

    expect(screen.getByRole("heading", { name: "Needs you" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "The market spoke" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Kept moving" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Held safely" })).toBeTruthy();
    const summary = screen.getByRole("list", { name: "Return briefing summary" });
    expect(summary).toHaveTextContent("1 Needs you");
    expect(summary).toHaveTextContent("1 Held safely");
    expect(screen.getByText(/prioritizes consequential records/i)).toBeTruthy();
    expect(screen.queryByText("2026-07-14T12:03:00.000Z")).toBeNull();
    expect(screen.getAllByRole("time")[0]).toHaveAttribute("dateTime", "2026-07-14T12:03:00.000Z");

    fireEvent.click(screen.getByRole("button", { name: "Open the bet" }));
    expect(onOpenBet).toHaveBeenCalledWith("bet-1");
    expect(screen.getByText("A revised product page is staged.")).toBeTruthy();
    expect(onFinishBriefing).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Answer at the wall" }));
    expect(onOpenWall).toHaveBeenCalledOnce();
    expect(onFinishBriefing).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /show the wider firm/i }));
    expect(onShowWiderFirm).toHaveBeenCalledOnce();
    expect(onFinishBriefing).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Finish briefing" }));
    expect(onFinishBriefing).toHaveBeenCalledOnce();
  });

  it("caps presentation without hiding that records were omitted", () => {
    const projection = projectReturnBrief([
      records[1],
      { ...records[1], id: "outcome-2", occurredAt: "2026-07-14T12:04:00.000Z" },
    ], { limitPerGroup: 1 });

    expect(projection.records).toHaveLength(1);
    expect(projection.records[0].id).toBe("outcome-2");
    expect(projection.omission).toMatch(/1 more durable record is available/i);
  });

  it("keeps every persistent record visible even when a group is capped", () => {
    const projection = projectReturnBrief([
      { ...records[0], id: "wall-2", persistent: true },
      { ...records[0], id: "wall-3", persistent: true },
      { ...records[0], id: "wall-4", occurredAt: "2026-07-14T12:05:00.000Z" },
    ], { limitPerGroup: 1 });

    expect(projection.records.map((record) => record.id)).toEqual(["wall-4", "wall-2", "wall-3"]);
    expect(projection.omittedCount).toBe(0);
  });
});
