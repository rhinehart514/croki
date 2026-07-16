import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WallQueueItemView } from "@/api";
import type { FirmBet } from "@/types";
import { DiveSurface } from "./DiveSurface";

const bet: FirmBet = {
  id: "bet-1", ventureId: "venture-1", intent: "Test a founder-signed note.", forkedFrom: null,
  teammateRef: null, refs: [], evidence: [], staged: [{ id: "note-1", title: "Founder-signed note", content: "Exact held message", stagedAt: "2026-07-15T14:02:00Z" }],
  joinKey: "join-1", createdAt: "2026-07-15T14:00:00Z", updatedAt: "2026-07-15T14:02:00Z",
  endedAt: null, endedBy: null, learning: null, position: "at-wall", stagedCount: 1, latestOutcome: null,
  events: [{ id: "event-1", type: "started", detail: "Read the cited product truth", at: "2026-07-15T14:01:00Z" }],
  workflow: [
    { id: "bet-1:opened:opened", label: "Opened", kind: "opened", state: "done", at: "2026-07-15T14:00:00Z" },
    { id: "bet-1:event:event-1", label: "Read the cited product truth", kind: "event", state: "done", at: "2026-07-15T14:01:00Z", eventId: "event-1", durationMs: 18 },
    { id: "bet-1:staged:note-1", label: "Founder-signed note", kind: "staged", state: "done", at: "2026-07-15T14:02:00Z", workRef: "note-1" },
    { id: "bet-1:wall:wall-1", label: "Release", kind: "gate", state: "gate", at: "2026-07-15T14:03:00Z", workRef: "note-1" },
  ],
  workflowMeasurementWindow: "14 days",
};

const wall: WallQueueItemView = {
  id: "wall-1", ventureId: "venture-1", betId: "bet-1", workRef: "note-1", purpose: "release",
  blocksBet: true, effect: { kind: "send", subject: "A useful note", body: "Exact held message", to: "buyer@example.com" },
  parkedAt: "2026-07-15T14:03:00Z", decision: null,
};

describe("DiveSurface", () => {
  it("keeps orientation and the honest data gap visible", () => {
    const onReturnToOrbit = vi.fn();
    render(<DiveSurface bet={bet} wallItems={[]} outcomes={[]} onReturnToOrbit={onReturnToOrbit} onReviewWallItem={vi.fn()} onHoldWallItem={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: "Work breadcrumb" })).toHaveTextContent("Venture/The orbit/Test a founder-signed note.");
    expect(screen.getByRole("navigation", { name: "Canvas altitude" })).toHaveTextContent("VentureInside this work");
    expect(screen.getByRole("heading", { name: "Gaps" })).toBeInTheDocument();
    expect(screen.queryByText(/^running$/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Fold back to orbit/i }));
    expect(onReturnToOrbit).toHaveBeenCalledTimes(1);
  });

  it("shows the exact held act and routes review and hold without releasing", () => {
    const onReviewWallItem = vi.fn();
    const onHoldWallItem = vi.fn();
    render(<DiveSurface bet={bet} wallItems={[wall]} outcomes={[]} onReturnToOrbit={vi.fn()} onReviewWallItem={onReviewWallItem} onHoldWallItem={onHoldWallItem} />);
    expect(screen.queryByRole("dialog", { name: /A useful note/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Inspect held act/i }));
    expect(screen.getByRole("dialog", { name: /A useful note/i })).toHaveTextContent("Exact held message");
    expect(screen.getByRole("dialog", { name: /A useful note/i })).toHaveTextContent("Release performs this one outward act.");
    expect(screen.queryByRole("button", { name: /^Release$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Review this act/i }));
    expect(onReviewWallItem).toHaveBeenCalledWith(wall);
    expect(onHoldWallItem).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Hold here/i }));
    expect(onHoldWallItem).toHaveBeenCalledWith(wall);
    expect(screen.queryByRole("dialog", { name: /A useful note/i })).not.toBeInTheDocument();
  });
});
