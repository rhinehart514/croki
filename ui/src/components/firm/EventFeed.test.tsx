import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FirmLens } from "@/types";
import { EventFeed } from "./EventFeed";
import { hasVisibleActivity } from "./event-feed-model";

function lensWithEvents(events: NonNullable<FirmLens["bets"][number]["events"]>): FirmLens {
  return {
    ventureId: "venture-1",
    crew: [],
    bets: [{
      id: "bet-1",
      ventureId: "venture-1",
      intent: "Find a repeatable outbound motion",
      forkedFrom: null,
      teammateRef: "sable",
      refs: [],
      evidence: [],
      staged: [],
      joinKey: "join-1",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      endedAt: null,
      endedBy: null,
      learning: null,
      events,
      position: "live",
      stagedCount: 0,
      latestOutcome: null,
    }],
    wall: { count: 0, oldestParkedAt: null },
    placement: { positions: {}, revision: 0 },
  };
}

function event(type: string, detail: string | null = null) {
  return { type, detail, at: "2026-07-01T00:00:00.000Z" };
}

describe("EventFeed", () => {
  it("turns stable runtime events into a founder-facing account of the bet", () => {
    render(<EventFeed lens={lensWithEvents([
      event("bet_forked", "Find a repeatable outbound motion"),
      event("tool_started", "scan_repository"),
      event("speak", "I found three customer segments worth testing."),
      event("staged", null),
      event("parked", null),
      event("asked", "Which segment should get the first send?"),
      event("tool_failed", "stage_artifact: /tmp/internal-worktree failed"),
    ])} />);

    expect(screen.getByText("Work began")).toBeTruthy();
    expect(screen.getByText("Reviewing the product")).toBeTruthy();
    expect(screen.getByText("I found three customer segments worth testing.")).toBeTruthy();
    expect(screen.getByText("Work ready")).toBeTruthy();
    expect(screen.getByText("Needs your hand")).toBeTruthy();
    expect(screen.getByText("Needs your input")).toBeTruthy();
    expect(screen.getByText("Which segment should get the first send?")).toBeTruthy();
    expect(screen.getByText("Couldn’t prepare the work")).toBeTruthy();

    expect(screen.queryByText("bet_forked")).toBeNull();
    expect(screen.queryByText("scan_repository")).toBeNull();
    expect(screen.queryByText(/stage_artifact|internal-worktree/)).toBeNull();
  });

  it("omits internal-only and unknown machinery without leaking fallback slugs", () => {
    const lens = lensWithEvents([
      event("stage_outward_classified", '{"lane":"FOUNDER_WALL"}'),
      event("tool_started", "vendor_specific_secret_tool"),
      event("runtime_cache_checkpoint", "opaque-runtime-detail"),
    ]);
    render(<EventFeed lens={lens} />);

    expect(hasVisibleActivity(lens)).toBe(false);
    expect(screen.getByText("Your first teammate is ready")).toBeTruthy();
    expect(screen.getByText(/say what this venture should accomplish/i)).toBeTruthy();
    expect(screen.queryByText(/stage_outward|vendor_specific|runtime_cache|opaque-runtime/i)).toBeNull();
  });

  it("reports an unknown tool failure without exposing its identifier or error payload", () => {
    render(<EventFeed lens={lensWithEvents([
      event("tool_failed", "private_vendor_step: token abc failed"),
    ])} />);

    expect(screen.getByText("A work step stopped")).toBeTruthy();
    expect(screen.queryByText(/private_vendor|token abc/i)).toBeNull();
  });

  it("keeps meaningful progress even when newer machine traces fill the raw log", () => {
    const hiddenEvents = Array.from({ length: 8 }, (_, index) => (
      event("runtime_checkpoint", `checkpoint-${index}`)
    ));
    render(<EventFeed lens={lensWithEvents([
      event("speak", "The first interview pattern is clear."),
      ...hiddenEvents,
    ])} />);

    expect(screen.getByText("The first interview pattern is clear.")).toBeTruthy();
    expect(screen.queryByText(/checkpoint-/)).toBeNull();
  });

  it("offers explicit local recovery after stopped work without ending the bet", () => {
    const onRetryBet = vi.fn();
    const onRedirectBet = vi.fn();
    render(<EventFeed
      lens={lensWithEvents([event("work_stopped", "Stopped by the founder")])}
      onRetryBet={onRetryBet}
      onRedirectBet={onRedirectBet}
    />);

    expect(screen.getByText("Work stopped")).toBeTruthy();
    expect(screen.getByText(/everything already prepared was kept/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry current move" }));
    fireEvent.click(screen.getByRole("button", { name: "Redirect this work" }));
    expect(onRetryBet).toHaveBeenCalledWith("bet-1");
    expect(onRedirectBet).toHaveBeenCalledWith("bet-1");
    expect(screen.queryByRole("button", { name: /end this work/i })).toBeNull();
  });
});
