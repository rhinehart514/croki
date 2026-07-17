import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkDetail } from "./WorkDetail";
import type { Direction } from "./directionModel";
import type { FirmBet, FirmLens } from "@/types";
import type { WallQueueItemView } from "@/api";

const DIFF = [
  "diff --git a/src/App.tsx b/src/App.tsx",
  "--- a/src/App.tsx",
  "+++ b/src/App.tsx",
  "@@ -1,2 +1,2 @@",
  " import React from 'react'",
  "-const banner = null",
  "+const banner = <FirstRunBanner />",
].join("\n");

function bet(): FirmBet {
  return {
    id: "b1", ventureId: "v1", intent: "internal phrasing", forkedFrom: null, teammateRef: "writer",
    refs: [], evidence: [], staged: [{ title: "First-run banner", content: DIFF }], joinKey: "j1",
    createdAt: "now", updatedAt: "now", endedAt: null, endedBy: null, learning: null,
    position: "at-wall", stagedCount: 1, latestOutcome: null,
  } as FirmBet;
}

const lens = { ventureId: "v1", crew: [], bets: [bet()], outcomes: [], wallItems: [], wall: { count: 0, oldestParkedAt: null }, placement: { positions: {}, revision: 0 } } as FirmLens;

const direction: Direction = {
  id: "f1", sentence: "Fix why signups stalled", createdAt: "now", updatedAt: "now",
  betIds: ["b1"], primaryBetId: "b1", waitingWallItemIds: ["w1", "w2"], activeDriveIds: [], outcomeIds: [],
  proofCount: 1, approaches: 1, state: "needs-you", needsYou: true,
  understanding: "The landing page promises value the product delays.", attribution: null,
};

const wallItems: WallQueueItemView[] = [
  { id: "w1", ventureId: "v1", betId: "b1", purpose: "release", blocksBet: false, decision: null, parkedAt: "now",
    effect: { kind: "product-change", title: "Apply the first-run banner", diff: DIFF, diffStat: "1 file · +1 −1" } },
  { id: "w2", ventureId: "v1", betId: "b1", purpose: "release", blocksBet: false, decision: null, parkedAt: "now",
    effect: { kind: "message", to: "roofers@acme.com", body: "Revised outreach that matches the new flow." } },
];

describe("WorkDetail", () => {
  it("leads with the exact repository change and holds each decision independently", () => {
    render(
      <WorkDetail
        ventureId="v1" ventureName="Buffalo Projects" direction={direction} lens={lens}
        wallItems={wallItems} activeDrives={[]} projection={null}
        onBack={() => {}} onChanged={() => {}} onSteered={() => {}} onStop={() => {}}
      />,
    );
    // The exact change is first-class, titled by the direction sentence.
    expect(screen.getByRole("heading", { name: "Fix why signups stalled" })).toBeTruthy();
    expect(screen.getByText("Exact changes")).toBeTruthy();
    // Two independent decisions, not one.
    expect(screen.getByText("Your decisions")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Approve & send/ })).toHaveLength(2);
    // The diff is shown once (Exact changes: FilesChanged + DiffView), not duplicated inside its gate.
    expect(screen.getAllByText(/src\/App\.tsx/)).toHaveLength(2);
    // The message decision keeps its own proof.
    expect(screen.getAllByText(/Revised outreach that matches the new flow/).length).toBeGreaterThan(0);
  });
});
