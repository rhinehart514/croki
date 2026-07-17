import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WorkbenchView } from "./WorkbenchView";
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

describe("WorkbenchView", () => {
  it("pins identity + independent decisions, defaults to the result body, and offers one View control", () => {
    render(
      <WorkbenchView
        ventureId="v1" direction={direction} lens={lens}
        wallItems={wallItems} activeDrives={[]} projection={null}
        onBack={() => {}} onChanged={() => {}} onStop={() => {}}
      />,
    );
    // The direction sentence is the pinned identity.
    expect(screen.getByRole("heading", { name: "Fix why signups stalled" })).toBeTruthy();
    // Two independent decisions, pinned by the host, not one.
    expect(screen.getByText("Your decisions")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Approve & send/ })).toHaveLength(2);
    // The message decision keeps its own proof.
    expect(screen.getAllByText(/Revised outreach that matches the new flow/).length).toBeGreaterThan(0);
    // ONE contextual View control (not a tab strip), defaulting to the result body; the exact-change view
    // exists as a disclosed alternate, NOT a persistent chip, and is closed at rest.
    expect(screen.getByRole("button", { name: /View · Result/ })).toBeTruthy();
    expect(screen.queryByRole("menuitemradio", { name: "Exact change" })).toBeNull();
  });

  it("never hides a repository change: the pinned gate shows the diff on the result view, the body on exact-change", () => {
    render(
      <WorkbenchView
        ventureId="v1" direction={direction} lens={lens}
        wallItems={wallItems} activeDrives={[]} projection={null}
        onBack={() => {}} onChanged={() => {}} onStop={() => {}}
      />,
    );
    // Default result view does NOT stack the diff in the body — but the pinned product-change gate renders
    // it, so the founder can never Approve & send a repository change with the diff nowhere on screen.
    expect(screen.getAllByText(/src\/App\.tsx/).length).toBeGreaterThan(0);
    // Disclose the View control and switch to the exact-change view.
    fireEvent.click(screen.getByRole("button", { name: /View · Result/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Exact change" }));
    // The change is now shown in the body (labelled "Exact changes"), and the decisions are still pinned.
    expect(screen.getByText("Exact changes")).toBeTruthy();
    expect(screen.getAllByText(/src\/App\.tsx/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Approve & send/ })).toHaveLength(2);
  });
});
