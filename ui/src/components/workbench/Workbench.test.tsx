import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FirmVenture, WallQueueItemView } from "@/api";
import type { FirmBet, FirmConversationMessage, FirmLens } from "@/types";
import { targetBet } from "@/components/firm/directionTarget";
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
}];

function lens(wallItems: WallQueueItemView[] = []): FirmLens {
  return {
    ventureId: "v1", crew: [], bets: [bet], outcomes: [], wallItems,
    wall: { count: wallItems.length, oldestParkedAt: wallItems[0]?.parkedAt ?? null },
    placement: { positions: {}, revision: 0 },
  } as FirmLens;
}

function props(currentLens: FirmLens) {
  return {
    venture, lens: currentLens, messages, activeDrives: [], projection: null, cursor: null,
    selection: targetBet("b1"), sections: [], now: 0, onSelectDirection: vi.fn(), onDescend: vi.fn(),
    onBroaden: vi.fn(), onScopePick: vi.fn(), onStop: vi.fn(), onChanged: vi.fn(),
    onSummonMap: vi.fn(), readOnlyReason: null,
  };
}

describe("Workbench representation precedence", () => {
  it("returns to a newly available founder gate instead of retaining an older manual view", () => {
    const { rerender } = render(<Workbench {...props(lens())} />);

    fireEvent.click(screen.getByRole("button", { name: /View · Product change/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Direction" }));
    expect(screen.getByRole("button", { name: /View · Direction/ })).toBeTruthy();

    const wallItem = {
      id: "wall-1", ventureId: "v1", betId: "b1", purpose: "release", blocksBet: true,
      parkedAt: "2026-01-01T01:00:00Z", decision: null,
      effect: { kind: "product-change", title: "Ship x.ts", diff: DIFF },
    } as WallQueueItemView;
    rerender(<Workbench {...props(lens([wallItem]))} />);

    expect(screen.getByRole("button", { name: /View · The exact effect/ })).toBeTruthy();
    expect(screen.getByTestId("stage-workspace").querySelector(".now-gate")).toBeTruthy();
  });
});
