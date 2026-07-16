import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FirmBet } from "@/types";
import type { WorkyardCard } from "./workyardProjection";

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Top: "top", Bottom: "bottom" },
}));
vi.mock("@/components/crew/CrewFace", () => ({
  CrewFace: ({ agentRef }: { agentRef: string }) => <span data-testid={`face-${agentRef}`} />,
}));

import { BetTerritory } from "./BetTerritory";

const bet: FirmBet = {
  id: "bet-1", ventureId: "v1", intent: "Earn a real buyer signal", forkedFrom: null,
  teammateRef: "yara", refs: [], evidence: [], staged: [], joinKey: "join-1",
  createdAt: "2026-07-14T00:00:00.000Z", updatedAt: "2026-07-14T00:00:00.000Z",
  endedAt: null, endedBy: null, learning: null, position: "at-wall", stagedCount: 2, latestOutcome: null,
};

const cards: WorkyardCard[] = [{
  key: "work:offer", workRef: "offer", title: "Paid pilot offer", body: "A small paid commitment.",
  preview: "A small paid commitment.",
  presentation: "prose", ownerRefs: ["yara"], contributorRefs: ["reed"], configurationRevision: 2,
  updatedAt: "2026-07-14T01:00:00.000Z", source: "staged",
  wallItems: [{
    id: "wall-offer", ventureId: "v1", betId: "bet-1", workRef: "offer", purpose: "release",
    blocksBet: true, effect: { kind: "message" }, parkedAt: "2026-07-14T01:00:00.000Z", decision: null,
  }],
  outcomes: [],
}, {
  key: "work:proof", workRef: "proof", title: "Buyer interview proof", body: "Three buyers named the same pain.",
  preview: "Three buyers named the same pain.",
  presentation: "prose", ownerRefs: ["reed"], contributorRefs: [], configurationRevision: 2,
  updatedAt: "2026-07-14T02:00:00.000Z", wallItems: [], outcomes: [], source: "evidence",
}];

function territory(overrides: Record<string, unknown> = {}) {
  const data = {
    bet,
    cards,
    crew: [
      { ref: "yara", summonedAt: "now", soul: { name: "Yara" } },
      { ref: "reed", summonedAt: "now", soul: { name: "Reed" } },
    ],
    altitude: "near" as const,
    ...overrides,
  };
  return render(<BetTerritory {...({ data } as Parameters<typeof BetTerritory>[0])} />);
}

describe("BetTerritory", () => {
  it("turns one bet into a bounded region of independently targetable work", () => {
    const onSelectWork = vi.fn();
    territory({ onSelectWork });

    expect(screen.getByRole("region", { name: /work area: earn a real buyer signal/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Target Paid pilot offer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Target Buyer interview proof" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Target Paid pilot offer" }));
    expect(onSelectWork).toHaveBeenCalledWith("bet-1", "offer");
  });

  it("exposes each workpiece's concise body evidence and recorded provenance", () => {
    territory();

    expect(screen.getByText("A small paid commitment.")).toBeTruthy();
    expect(screen.getByText("Three buyers named the same pain.")).toBeTruthy();
    expect(screen.getByText("Prepared work · Firm definition v2")).toBeTruthy();
    expect(screen.getByText("Evidence · Firm definition v2")).toBeTruthy();
  });

  it("shows owners and contributors on work and supports multi-teammate direction", () => {
    const onToggleTeammate = vi.fn();
    territory({ onToggleTeammate, selectedTeammateRefs: ["yara"] });

    expect(screen.getAllByTestId("face-yara").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("face-reed").length).toBeGreaterThan(0);
    const yara = screen.getAllByRole("button", { name: /remove yara from this direction/i })[0];
    expect(yara).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getAllByRole("button", { name: /add reed to this direction/i })[0]);
    expect(onToggleTeammate).toHaveBeenCalledWith("reed");
  });

  it("opens the exact wall act attached to a workpiece", () => {
    const onOpenWall = vi.fn();
    territory({ onOpenWall });
    fireEvent.click(screen.getByRole("button", { name: /review exact act/i }));
    expect(onOpenWall).toHaveBeenCalledWith("wall-offer");
  });

  it("compresses to territorial signal at far altitude", () => {
    territory({ altitude: "far" });
    expect(screen.getByRole("region", { name: /needs your hand: earn a real buyer signal/i })).toHaveTextContent("2 workpieces");
    expect(screen.queryByRole("button", { name: "Target Paid pilot offer" })).toBeNull();
  });
});
