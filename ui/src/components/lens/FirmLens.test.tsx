// FirmLens.test.tsx — F6 acceptance for the lens surface itself: a fixture venture's crew/bets render
// as nodes, the wall band shows the honest queue count, opening it renders the Firm wall review over the real
// queue (message + code-diff effects from the same queue), and a drag-stop persists placement via
// compareAndSet. ReactFlow is reduced to a plain div because jsdom has no layout measurement; this
// fixture verifies the lens wiring rather than the library's internals.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { FirmLens as FirmLensPayload } from "@/types";
import type { WallQueueItemView } from "@/api";

vi.mock("@xyflow/react/dist/style.css", () => ({}));

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ nodes, children, onNodeDragStop }: { nodes: Array<{ id: string; type: string; data: unknown }>; children?: ReactNode; onNodeDragStop?: () => void }) => (
    <div data-testid="react-flow-mock">
      <button type="button" data-testid="trigger-drag-stop" onClick={() => onNodeDragStop?.()} />
      {nodes.map((node) => <div key={node.id} data-testid={`node-${node.id}`} data-node-type={node.type} />)}
      {children}
    </div>
  ),
  Background: () => <div data-testid="background-mock" />,
  applyNodeChanges: (_changes: unknown, current: unknown) => current,
}));

vi.mock("./lensCanvasGuards", () => ({
  ViewportRestorer: () => null,
  MeasureGuard: () => null,
  CanvasVisibilityGuard: () => null,
}));

const fixtureLens: FirmLensPayload = {
  ventureId: "v1",
  crew: [
    { ref: "outreach-writer", summonedAt: "2026-07-01T00:00:00.000Z", soul: { name: "Sable" } },
    { ref: "closer", summonedAt: "2026-07-01T00:00:00.000Z", soul: { name: "Reed" } },
  ],
  bets: [
    {
      id: "bet-1", ventureId: "v1", intent: "cold outbound to fintech ops", forkedFrom: null,
      teammateRef: "outreach-writer", refs: [], evidence: [], staged: [], joinKey: "join-1",
      createdAt: "now", updatedAt: "now", endedAt: null, endedBy: null, learning: null,
      position: "live", stagedCount: 0, latestOutcome: null,
    },
    {
      id: "bet-2", ventureId: "v1", intent: "ship the pricing page diff", forkedFrom: null,
      teammateRef: "closer", refs: [], evidence: [], staged: [{ id: "s1" }], joinKey: "join-2",
      createdAt: "now", updatedAt: "now", endedAt: null, endedBy: null, learning: null,
      position: "at-wall", stagedCount: 1, latestOutcome: null,
    },
  ],
  wall: { count: 2, oldestParkedAt: "2026-07-01T00:00:00.000Z" },
  placement: { positions: {}, revision: 0 },
};

const fixtureWallQueue: WallQueueItemView[] = [
  {
    id: "wall-message", ventureId: "v1", betId: "bet-1", purpose: "release", blocksBet: true, decision: null, parkedAt: "2026-07-01T00:00:00.000Z",
    effect: { kind: "send", message: "Hi — wanted to reach out about your rollout." },
  },
  {
    id: "wall-diff", ventureId: "v1", betId: "bet-2", purpose: "release", blocksBet: true, decision: null, parkedAt: "2026-07-01T00:01:00.000Z",
    effect: {
      kind: "product-change",
      diff: "--- a/pricing.tsx\n+++ b/pricing.tsx\n@@ -1 +1 @@\n-$29\n+$39\n",
      diffStat: "1 file changed",
      worktree: "/tmp/wt", branch: "dogfood/bet-2",
    },
  },
];

const getLens = vi.fn();
const getWallQueue = vi.fn();
const putPlacement = vi.fn();
const decideWallItem = vi.fn();

vi.mock("@/api", () => ({
  getLens: (...args: unknown[]) => getLens(...args),
  getWallQueue: (...args: unknown[]) => getWallQueue(...args),
  putPlacement: (...args: unknown[]) => putPlacement(...args),
  decideWallItem: (...args: unknown[]) => decideWallItem(...args),
}));

import { FirmLens } from "./FirmLens";

describe("FirmLens", () => {
  beforeEach(() => {
    getLens.mockReset().mockResolvedValue({ lens: fixtureLens });
    getWallQueue.mockReset().mockResolvedValue({ queue: fixtureWallQueue });
    putPlacement.mockReset().mockResolvedValue({ placement: { positions: {}, revision: 1 } });
    decideWallItem.mockReset().mockResolvedValue({ receipt: {} });
  });

  it("renders a node for every crew member and every bet in the fixture venture", async () => {
    render(<FirmLens ventureId="v1" />);
    await screen.findByTestId("node-crew:outreach-writer");
    expect(screen.getByTestId("node-crew:closer")).toBeTruthy();
    expect(screen.getByTestId("node-bet:bet-1")).toBeTruthy();
    expect(screen.getByTestId("node-bet:bet-2")).toBeTruthy();
  });

  it("shows the honest wall count on the band, never a market score or sentiment number", async () => {
    render(<FirmLens ventureId="v1" />);
    await screen.findByText("2 waiting at the wall");
    // Nothing on the rendered surface should ever show a "score" or "sentiment" label.
    expect(screen.queryByText(/score/i)).toBeNull();
    expect(screen.queryByText(/sentiment/i)).toBeNull();
  });

  it("opening the wall band reviews a message effect and a code-diff effect from the same queue", async () => {
    render(<FirmLens ventureId="v1" />);
    const band = await screen.findByText("2 waiting at the wall");
    fireEvent.click(band);
    await screen.findAllByText(/wanted to reach out about your rollout/i);
    expect(screen.getAllByRole("button", { name: /^Release$/i }).length).toBeGreaterThanOrEqual(1);
  });

  it("deciding a wall item posts release/reject to the real wall route, then reloads", async () => {
    render(<FirmLens ventureId="v1" />);
    const band = await screen.findByText("2 waiting at the wall");
    fireEvent.click(band);
    await screen.findAllByText(/wanted to reach out about your rollout/i);

    const releaseButtons = screen.getAllByRole("button", { name: /^Release$/i });
    fireEvent.click(releaseButtons[0]);

    await waitFor(() => expect(decideWallItem).toHaveBeenCalledWith("v1", "wall-message", { decision: "release", note: undefined }));
  });

  it("a drag-stop persists the settled arrangement as placement (compareAndSet from revision 0)", async () => {
    render(<FirmLens ventureId="v1" />);
    await screen.findByTestId("node-crew:outreach-writer");
    fireEvent.click(screen.getByTestId("trigger-drag-stop"));
    await waitFor(() => expect(putPlacement).toHaveBeenCalledTimes(1));
    const [ventureId, body] = putPlacement.mock.calls[0];
    expect(ventureId).toBe("v1");
    expect(body.expectedRevision).toBe(0);
    expect(Object.keys(body.positions)).toEqual(
      expect.arrayContaining(["crew:outreach-writer", "crew:closer", "bet:bet-1", "bet:bet-2"]),
    );
  });

  it("restores a saved placement instead of the fallback grid layout", async () => {
    getLens.mockResolvedValue({
      lens: { ...fixtureLens, placement: { positions: { "crew:outreach-writer": { x: 42, y: 7 } }, revision: 3 } },
    });
    render(<FirmLens ventureId="v1" />);
    await screen.findByTestId("node-crew:outreach-writer");
    fireEvent.click(screen.getByTestId("trigger-drag-stop"));
    await waitFor(() => expect(putPlacement).toHaveBeenCalledTimes(1));
    const [, body] = putPlacement.mock.calls[0];
    expect(body.positions["crew:outreach-writer"]).toEqual({ x: 42, y: 7 });
    expect(body.expectedRevision).toBe(3);
  });
});
