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
  it("pins the direction head + independent decisions above the representation pane", () => {
    render(
      <WorkbenchView
        ventureId="v1" direction={direction} lens={lens}
        wallItems={wallItems} activeDrives={[]} projection={null}
        onBack={() => {}} onChanged={() => {}} onStop={() => {}}
      />,
    );
    // The direction sentence is the pinned identity.
    expect(screen.getByRole("heading", { name: "Fix why signups stalled" })).toBeTruthy();
    // The overview representation leads with the exact repository change.
    expect(screen.getByText("Exact changes")).toBeTruthy();
    // Two independent decisions, pinned by the host, not one.
    expect(screen.getByText("Your decisions")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Approve & send/ })).toHaveLength(2);
    // The diff is shown once (Exact changes: FilesChanged + DiffView), not duplicated inside its gate.
    expect(screen.getAllByText(/src\/App\.tsx/)).toHaveLength(2);
    // The message decision keeps its own proof.
    expect(screen.getAllByText(/Revised outreach that matches the new flow/).length).toBeGreaterThan(0);
    // The chip strip offers only representations backed by real truth: overview + exact-change + who's
    // working (one member bet). Not approach-comparison (single attempt), not working-result (no preview).
    expect(screen.getByRole("button", { name: "Exact change" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Compare approaches" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Working result" })).toBeNull();
  });

  it("keeps the exact diff on screen for a product-change decision under a non-diff representation", () => {
    render(
      <WorkbenchView
        ventureId="v1" direction={direction} lens={lens}
        wallItems={wallItems} activeDrives={[]} projection={null}
        onBack={() => {}} onChanged={() => {}} onStop={() => {}}
      />,
    );
    // Switch the pane away from any representation that renders the change (overview / exact-change).
    fireEvent.click(screen.getByRole("button", { name: "Who's working" }));
    // The pane no longer shows the "Exact changes" block…
    expect(screen.queryByText("Exact changes")).toBeNull();
    // …so the pinned product-change gate MUST render the diff itself — a repository change is never
    // released with the diff nowhere on screen. Approve & send stays available only alongside the diff.
    expect(screen.getAllByText(/src\/App\.tsx/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Approve & send/ })).toHaveLength(2);
  });
});
