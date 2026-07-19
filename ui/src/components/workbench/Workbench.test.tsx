import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FirmVenture, WallQueueItemView } from "@/api";
import type { FirmBet, FirmConversationMessage, FirmLens } from "@/types";
import { targetBet, type CanvasSelection } from "@/components/firm/directionTarget";
import type { Direction } from "@/components/now/directionModel";
import { Workbench } from "./Workbench";

const DIFF = ["diff --git a/x.ts b/x.ts", "@@ -1 +1 @@", "-a", "+b"].join("\n");
const venture: FirmVenture = {
  id: "v1", name: "Acme", repository: "/acme", createdAt: "2026-01-01", updatedAt: "2026-01-01",
};
const bet = {
  id: "b1", ventureId: "v1", intent: "Ship the first useful change", forkedFrom: null, teammateRef: "t1",
  refs: [], evidence: [], staged: [{ id: "w1", content: DIFF }], joinKey: "j-b1",
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", endedAt: null,
  endedBy: null, learning: null, position: "live", stagedCount: 1, latestOutcome: null,
} as FirmBet;
const messages: FirmConversationMessage[] = [{
  id: "m1", ventureId: "v1", role: "founder", content: bet.intent, teammateRef: null,
  betId: bet.id, createdAt: "2026-01-01T00:00:00Z",
}, {
  id: "m2", ventureId: "v1", role: "teammate", content: "Prepared the exact product change.", teammateRef: "t1",
  betId: bet.id, createdAt: "2026-01-01T00:01:00Z",
}];

function lens(wallItems: WallQueueItemView[] = []): FirmLens {
  return {
    ventureId: "v1", crew: [], bets: [bet], outcomes: [], wallItems,
    wall: { count: wallItems.length, oldestParkedAt: wallItems[0]?.parkedAt ?? null },
    placement: { positions: {}, revision: 0 },
  } as FirmLens;
}

function props(currentLens: FirmLens, selection: CanvasSelection = targetBet("b1")) {
  return {
    venture, lens: currentLens, messages, activeDrives: [], projection: null, cursor: null,
    selection, selectedDirection: null, sections: [], now: 0, onSelectDirection: vi.fn(), onDescend: vi.fn(),
    onBroaden: vi.fn(), onScopePick: vi.fn(), onStop: vi.fn(), onChanged: vi.fn(),
    onSummonMap: vi.fn(), readOnlyReason: null,
  };
}

describe("Workbench representation precedence", () => {
  it("returns to a newly available founder gate instead of retaining an older manual view", () => {
    const { rerender } = render(<Workbench {...props(lens())} />);

    fireEvent.click(screen.getByRole("tab", { name: "Result" }));
    expect(screen.getByRole("tab", { name: "Result" })).toHaveAttribute("aria-selected", "true");

    const wallItem = {
      id: "wall-1", ventureId: "v1", betId: "b1", purpose: "release", blocksBet: true,
      parkedAt: "2026-01-01T01:00:00Z", decision: null,
      effect: { kind: "product-change", title: "Ship x.ts", diff: DIFF },
    } as WallQueueItemView;
    rerender(<Workbench {...props(lens([wallItem]))} />);

    expect(screen.getByRole("tab", { name: "Decision" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("stage-workspace").querySelector(".now-gate")).toBeTruthy();
  });

  it("restores the material surface chosen for a work context", () => {
    const { rerender } = render(<Workbench {...props(lens())} />);

    fireEvent.click(screen.getByRole("tab", { name: "Result" }));
    rerender(<Workbench {...props(lens(), null)} />);
    rerender(<Workbench {...props(lens())} />);

    expect(screen.getByRole("tab", { name: "Result" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "Work stream" })).toBeTruthy();
    expect(screen.getByText("Ship the first useful change")).toBeTruthy();
    expect(screen.getByText("Prepared the exact product change.")).toBeTruthy();
  });

  it("keeps system and handoff machinery behind one run-details disclosure", () => {
    const machinery = [{
      id: "m3", ventureId: "v1", role: "system", content: "Crew configuration changed.",
      teammateRef: null, betId: bet.id, kind: "configuration-receipt",
      createdAt: "2026-01-01T00:02:00Z",
    }] as FirmConversationMessage[];
    render(<Workbench {...props(lens())} messages={[...messages, ...machinery]} />);

    expect(screen.queryByText("Crew configuration changed.")).toBeNull();
    expect(screen.getByText("Run details")).toBeTruthy();
    expect(screen.getByText("Drover")).toBeTruthy();
  });

  it("opens a standalone market return even when it has no bet target", () => {
    const outcome = {
      id: "outcome-1", ventureId: "v1", betId: null, outcomeKind: "reply", from: "buyer",
      body: "The buyer confirmed the monitoring gap.", source: "email", channel: "reply",
      observedAt: "2026-01-02T00:00:00Z", joined: false,
    };
    const standalone: Direction = {
      id: "outcome:outcome-1", sentence: outcome.body, createdAt: outcome.observedAt,
      updatedAt: outcome.observedAt, betIds: [], primaryBetId: null, waitingWallItemIds: [],
      activeDriveIds: [], outcomeIds: [outcome.id], proofCount: 0, approaches: 0,
      state: "from-market", needsYou: false, understanding: outcome.body, attribution: "buyer · reply",
    };
    const currentLens = { ...lens(), outcomes: [outcome] } as FirmLens;

    render(<Workbench {...props(currentLens, null)} selectedDirection={standalone} />);

    expect(screen.getByRole("region", { name: "Work stream" })).toBeTruthy();
    expect(screen.getAllByText(outcome.body).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Venture overview" })).toBeTruthy();
  });
});
