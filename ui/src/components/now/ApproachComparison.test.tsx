import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FirmBet } from "@/types";
import type { DirectionRenderContext } from "./projectDirection";
import { ApproachComparison } from "./ApproachComparison";

const DIFF = [
  "diff --git a/src/signal.ts b/src/signal.ts",
  "--- a/src/signal.ts",
  "+++ b/src/signal.ts",
  "@@ -1 +1 @@",
  "-export const signal = false",
  "+export const signal = true",
].join("\n");

function bet(partial: Partial<FirmBet> & Pick<FirmBet, "id" | "intent">): FirmBet {
  return {
    ventureId: "v1", forkedFrom: null, teammateRef: "t1", refs: [], evidence: [], staged: [],
    joinKey: `join-${partial.id}`, createdAt: "2026-01-01", updatedAt: "2026-01-01",
    endedAt: null, endedBy: null, learning: null, position: "live", stagedCount: 0, latestOutcome: null,
    ...partial,
  } as FirmBet;
}

function context(memberBets: FirmBet[]): DirectionRenderContext {
  return { memberBets } as DirectionRenderContext;
}

describe("ApproachComparison", () => {
  it("reviews real staged work without silently changing composer scope", () => {
    const onScopePick = vi.fn();
    const ctx = context([
      bet({ id: "draft", intent: "Draft the buyer-signal brief", staged: [{ id: "w1", title: "Buyer signal brief", content: "A reviewable Reddit signal brief." }] }),
      bet({ id: "change", intent: "Build the signal collector", position: "at-wall", staged: [{ id: "w2", content: DIFF }] }),
    ]);

    render(<ApproachComparison ctx={ctx} onScopePick={onScopePick} />);

    expect(screen.getByText("2 approaches · compare their work")).toBeTruthy();
    expect(screen.getByText("1 draft ready to review")).toBeTruthy();
    expect(screen.getByText("1 product change ready to review")).toBeTruthy();
    expect(screen.queryByText(/Produced a draft/)).toBeNull();

    fireEvent.click(screen.getAllByText("Review this approach")[0]);
    expect(screen.getByText("Buyer signal brief")).toBeTruthy();
    expect(screen.getByText("A reviewable Reddit signal brief.")).toBeTruthy();
    expect(onScopePick).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByText("Review this approach")[1]);
    expect(screen.getAllByText("src/signal.ts").length).toBeGreaterThan(0);
    expect(onScopePick).not.toHaveBeenCalled();
  });

  it("scopes steering only from the explicitly labelled action", () => {
    const onScopePick = vi.fn();
    render(<ApproachComparison ctx={context([bet({ id: "one", intent: "First path" }), bet({ id: "two", intent: "Second path" })])} onScopePick={onScopePick} />);

    expect(screen.getAllByText("Nothing reviewable yet")).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Steer this approach" })[1]);
    expect(onScopePick).toHaveBeenCalledTimes(1);
    expect(onScopePick).toHaveBeenCalledWith({ betId: "two", workRef: null, teammateRefs: [] });
  });

  it("exposes a captured market outcome as reviewable consequence", () => {
    const withOutcome = bet({
      id: "outcome", intent: "Test the positioning", position: "ended",
      latestOutcome: {
        type: "outcome", id: "o1", outcomeKind: "reply", from: "buyer", body: "This solves the monitoring gap.",
        source: "reddit", channel: "reply", observedAt: "2026-01-02", joined: true,
      },
    });
    render(<ApproachComparison ctx={context([withOutcome])} />);

    expect(screen.getByText("1 market result ready to review")).toBeTruthy();
    fireEvent.click(screen.getByText("Review this approach"));
    expect(screen.getByText("This solves the monitoring gap.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Steer this approach" })).toBeNull();
  });
});
