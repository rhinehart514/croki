// FirmLens.test.tsx — F6 acceptance for the lens surface itself: a fixture venture's crew/bets render
// as nodes, the wall band shows the honest queue count, opening it renders the Firm wall review over the real
// queue (message + code-diff effects from the same queue), and a drag-stop persists placement via
// compareAndSet. ReactFlow is reduced to a plain div because jsdom has no layout measurement; this
// fixture verifies the lens wiring rather than the library's internals.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import type { FirmLens as FirmLensPayload } from "@/types";
import type { WallQueueItemView } from "@/api";

vi.mock("@xyflow/react/dist/style.css", () => ({}));

const flowHarness = vi.hoisted(() => ({
  fitView: vi.fn(),
  setViewport: vi.fn(),
  getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 0.8 })),
  getNodes: vi.fn(),
  screenToFlowPosition: vi.fn(({ x, y }: { x: number; y: number }) => ({ x, y })),
}));

vi.mock("@xyflow/react", () => ({
  Controls: () => <div data-testid="canvas-controls" />,
  ReactFlow: ({ nodes, children, fitViewOptions, onInit, onMoveEnd, onNodeDragStop, onNodeClick, onPaneClick, ...props }: {
    nodes: Array<{ id: string; type: string; data: unknown }>;
    children?: ReactNode;
    fitViewOptions?: { padding?: unknown };
    onInit?: (instance: unknown) => void;
    onMoveEnd?: (event: null, viewport: { x: number; y: number; zoom: number }) => void;
    onNodeDragStop?: () => void;
    onNodeClick?: (event: unknown, node: { id: string; type: string; data: unknown }) => void;
    onPaneClick?: () => void;
    [key: string]: unknown;
  }) => {
    useEffect(() => { onInit?.(flowHarness); }, [onInit]);
    return (
      <div
        data-testid="react-flow-mock"
        data-fit-padding={JSON.stringify(fitViewOptions?.padding)}
        data-canvas-altitude={String(props["data-canvas-altitude"])}
      >
        <button type="button" data-testid="trigger-drag-stop" onClick={() => onNodeDragStop?.()} />
        <button type="button" data-testid="trigger-pane-click" onClick={() => onPaneClick?.()} />
        <button type="button" data-testid="trigger-far-zoom" onClick={() => onMoveEnd?.(null, { x: 40, y: 20, zoom: 0.3 })} />
        {nodes.map((node) => <button type="button" key={node.id} data-testid={`node-${node.id}`} data-node-type={node.type} data-position={JSON.stringify((node as { position?: unknown }).position)} onClick={(event) => onNodeClick?.(event, node)} />)}
        {children}
      </div>
    );
  },
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
      workspaceId: "workspace-private",
      revisionId: "revision-private",
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
const getProductChangeReadiness = vi.fn();
const reviewProductChange = vi.fn();
const getCredentials = vi.fn();
const proposeCapability = vi.fn();

vi.mock("@/api", () => ({
  getLens: (...args: unknown[]) => getLens(...args),
  getWallQueue: (...args: unknown[]) => getWallQueue(...args),
  putPlacement: (...args: unknown[]) => putPlacement(...args),
  decideWallItem: (...args: unknown[]) => decideWallItem(...args),
  getProductChangeReadiness: (...args: unknown[]) => getProductChangeReadiness(...args),
  reviewProductChange: (...args: unknown[]) => reviewProductChange(...args),
  getCredentials: (...args: unknown[]) => getCredentials(...args),
  proposeCapability: (...args: unknown[]) => proposeCapability(...args),
}));

import { FirmLens } from "./FirmLens";

describe("FirmLens", () => {
  beforeEach(() => {
    getLens.mockReset().mockResolvedValue({ lens: fixtureLens });
    getWallQueue.mockReset().mockResolvedValue({ queue: fixtureWallQueue });
    putPlacement.mockReset().mockResolvedValue({ placement: { positions: {}, revision: 1 } });
    decideWallItem.mockReset().mockResolvedValue({ receipt: {} });
    getProductChangeReadiness.mockReset().mockResolvedValue({
      readiness: { ready: false, status: "proposed", reasons: ["The change set is not approved."] },
    });
    reviewProductChange.mockReset().mockResolvedValue({ revision: { status: "approved" } });
    getCredentials.mockReset().mockResolvedValue({ credentials: [] });
    proposeCapability.mockReset().mockResolvedValue({});
    flowHarness.fitView.mockReset();
    flowHarness.setViewport.mockReset();
    flowHarness.getViewport.mockReset().mockReturnValue({ x: 0, y: 0, zoom: 0.8 });
    flowHarness.screenToFlowPosition.mockReset().mockImplementation(({ x, y }) => ({ x, y }));
    flowHarness.getNodes.mockReset().mockReturnValue([
      { id: "crew:outreach-writer", position: { x: -300, y: 10 }, measured: { width: 220, height: 120 } },
      { id: "crew:closer", position: { x: 280, y: 0 }, measured: { width: 220, height: 120 } },
      { id: "bet:bet-1", position: { x: 0, y: 160 }, measured: { width: 240, height: 140 } },
      { id: "bet:bet-2", position: { x: 280, y: 160 }, measured: { width: 240, height: 140 } },
    ]);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it("renders a node for every crew member and every bet in the fixture venture", async () => {
    render(<FirmLens ventureId="v1" />);
    await screen.findByTestId("node-crew:outreach-writer");
    expect(screen.getByTestId("node-crew:closer")).toBeTruthy();
    expect(screen.getByTestId("node-bet:bet-1")).toBeTruthy();
    expect(screen.getByTestId("node-bet:bet-2")).toBeTruthy();
  });

  it("places crew and real capabilities from the canvas tray through placement only", async () => {
    render(<FirmLens ventureId="v1" repository="/products/one" />);
    await screen.findByTestId("node-crew:outreach-writer");

    const trayToggle = screen.getByRole("button", { name: /Canvas tray/i });
    expect(document.getElementById(trayToggle.getAttribute("aria-controls")!)).toHaveAttribute("hidden");
    fireEvent.click(trayToggle);
    expect(screen.getByRole("region", { name: "Canvas tray" })).toHaveTextContent(/Sable.*Product repository.*Gmail/i);
    fireEvent.click(screen.getByRole("button", { name: "Place Product repository on canvas" }));

    await waitFor(() => expect(putPlacement).toHaveBeenCalledOnce());
    expect(putPlacement).toHaveBeenCalledWith("v1", expect.objectContaining({
      positions: expect.objectContaining({ "capability:product-truth": expect.any(Object) }),
      expectedRevision: 0,
    }));
  });

  it("shows Gmail in the tray as connected only when the real connection exists", async () => {
    getCredentials.mockResolvedValue({ credentials: [{ provider: "gmail" }] });
    render(<FirmLens ventureId="v1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Canvas tray/i }));
    // Gmail is always a real port on the canvas; the tray reflects the honest connection state, so a
    // wired credential reads "Connected" rather than the default "Not connected".
    const gmail = await screen.findByRole("button", { name: "Place Gmail on canvas" });
    await waitFor(() => expect(gmail).toHaveTextContent(/Connected/i));
    expect(gmail).not.toHaveTextContent(/Not connected/i);
  });

  it("lifts only the ephemeral canvas selection and clears it on the pane", async () => {
    const onSelectionChange = vi.fn();
    render(<FirmLens ventureId="v1" onSelectionChange={onSelectionChange} />);
    fireEvent.click(await screen.findByTestId("node-crew:outreach-writer"));
    expect(onSelectionChange).toHaveBeenLastCalledWith({ betId: null, workRef: null, teammateRefs: ["outreach-writer"] });
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("node-bet:bet-1"));
    expect(onSelectionChange).toHaveBeenLastCalledWith({ betId: "bet-1", workRef: null, teammateRefs: [] });
    expect(onSelectionChange).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId("trigger-pane-click"));
    expect(onSelectionChange).toHaveBeenLastCalledWith(null);
    expect(onSelectionChange).toHaveBeenCalledTimes(3);
  });

  it("shows the honest wall count on the band, never a market score or sentiment number", async () => {
    render(<FirmLens ventureId="v1" />);
    await screen.findByText("2 waiting for you");
    // Nothing on the rendered surface should ever show a "score" or "sentiment" label.
    expect(screen.queryByText(/score/i)).toBeNull();
    expect(screen.queryByText(/sentiment/i)).toBeNull();
  });

  it("reports wall visibility without disturbing the selected canvas anchor", async () => {
    const onSelectionChange = vi.fn();
    const onWallOpenChange = vi.fn();
    render(
      <FirmLens
        ventureId="v1"
        onSelectionChange={onSelectionChange}
        onWallOpenChange={onWallOpenChange}
      />,
    );

    fireEvent.click(await screen.findByTestId("node-crew:closer"));
    fireEvent.click(screen.getByRole("button", { name: /waiting for you/i }));
    expect(onWallOpenChange).toHaveBeenLastCalledWith(true);
    expect(onSelectionChange).toHaveBeenLastCalledWith({ betId: null, workRef: null, teammateRefs: ["closer"] });

    fireEvent.click(screen.getByRole("button", { name: /waiting for you/i }));
    expect(onWallOpenChange).toHaveBeenLastCalledWith(false);
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
  });

  it("lets the persistent conversation rail control wall visibility", async () => {
    const view = render(<FirmLens ventureId="v1" wallOpen={false} />);
    const wallToggle = await screen.findByRole("button", { name: /waiting for you/i });
    expect(wallToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Release the message?", { exact: false })).toBeNull();

    view.rerender(<FirmLens ventureId="v1" wallOpen />);
    expect(wallToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Founder decisions" })).toBeTruthy();

    view.rerender(<FirmLens ventureId="v1" wallOpen={false} />);
    expect(wallToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Founder decisions" })).toBeNull();
  });

  it("gives the open wall the foreground and restores the expanded outline afterward", async () => {
    render(<FirmLens ventureId="v1" />);
    const outlineToggle = await screen.findByRole("button", { name: /^outline/i });
    fireEvent.click(outlineToggle);
    expect(outlineToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Venture outline" })).toBeTruthy();

    const wallToggle = screen.getByRole("button", { name: /waiting for you/i });
    fireEvent.click(wallToggle);
    expect(screen.queryByRole("region", { name: "Venture outline" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^outline/i })).toBeNull();

    fireEvent.click(wallToggle);
    expect(screen.getByRole("region", { name: "Venture outline" })).toBeTruthy();
    expect(outlineToggle).toHaveAttribute("aria-expanded", "true");
  });

  it("explains how an empty venture will move without duplicating the canvas composer action", async () => {
    getLens.mockResolvedValue({
      lens: { ...fixtureLens, bets: [], wall: { count: 0, oldestParkedAt: null } },
    });
    getWallQueue.mockResolvedValue({ queue: [] });
    render(<FirmLens ventureId="v1" />);

    expect(await screen.findByRole("heading", { name: "Start with one open direction." })).toBeTruthy();
    expect(screen.getByText(/reads the bound repository, cites what it finds/i)).toBeTruthy();
    expect(screen.getByText(/nothing leaves without your hand/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /give the crew a goal/i })).toBeNull();

    fireEvent.click(screen.getByTestId("node-crew:outreach-writer"));
    expect(screen.queryByRole("heading", { name: "Start with one open direction." })).toBeNull();
  });

  it("fits empty-venture crew into an upper canvas zone instead of under the goal explanation", async () => {
    getLens.mockResolvedValue({
      lens: { ...fixtureLens, bets: [], wall: { count: 0, oldestParkedAt: null } },
    });
    getWallQueue.mockResolvedValue({ queue: [] });

    render(<FirmLens ventureId="v1" />);

    const canvas = await screen.findByTestId("react-flow-mock");
    expect(JSON.parse(canvas.getAttribute("data-fit-padding") ?? "null")).toEqual({
      top: "12%",
      right: "18%",
      bottom: "66%",
      left: "18%",
    });
    expect(screen.getByTestId("node-crew:outreach-writer")).toBeTruthy();
    expect(screen.getByTestId("node-crew:closer")).toBeTruthy();
  });

  it("keeps graph objects clear of the founder wall when bets occupy the canvas", async () => {
    render(<FirmLens ventureId="v1" />);

    const canvas = await screen.findByTestId("react-flow-mock");
    expect(JSON.parse(canvas.getAttribute("data-fit-padding") ?? "null")).toEqual({
      top: "9%",
      right: "9%",
      bottom: "96px",
      left: "9%",
    });
    expect(screen.getByTestId("canvas-controls")).toBeTruthy();
  });

  it("opening a clear wall renders an explicit safe empty state", async () => {
    getLens.mockResolvedValue({
      lens: { ...fixtureLens, wall: { count: 0, oldestParkedAt: null } },
    });
    getWallQueue.mockResolvedValue({ queue: [] });

    render(<FirmLens ventureId="v1" />);
    fireEvent.click(await screen.findByRole("button", { name: /nothing needs you/i }));

    expect(screen.getByText("Outward work still stops here")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Founder decisions" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Release$/i })).toBeNull();
  });

  it("opening the wall band reviews a message effect and a code-diff effect from the same queue", async () => {
    render(<FirmLens ventureId="v1" />);
    const band = await screen.findByText("2 waiting for you");
    fireEvent.click(band);
    await screen.findAllByText(/wanted to reach out about your rollout/i);
    expect(screen.getAllByRole("button", { name: /^Release$/i }).length).toBeGreaterThanOrEqual(1);
  });

  it("deciding a wall item posts release/reject to the real wall route, then reloads", async () => {
    render(<FirmLens ventureId="v1" />);
    const band = await screen.findByText("2 waiting for you");
    fireEvent.click(band);
    await screen.findAllByText(/wanted to reach out about your rollout/i);

    const releaseButtons = screen.getAllByRole("button", { name: /^Release$/i });
    fireEvent.click(releaseButtons[0]);

    await waitFor(() => expect(decideWallItem).toHaveBeenCalledWith("v1", "wall-message", { decision: "release", note: undefined }));
  });

  it("requires review approval before a product change can be applied through the wall", async () => {
    getProductChangeReadiness
      .mockResolvedValueOnce({ readiness: { ready: false, status: "proposed", reasons: ["The change set is not approved."] } })
      .mockResolvedValue({ readiness: { ready: true, status: "approved", reasons: [] } });

    render(<FirmLens ventureId="v1" />);
    fireEvent.click(await screen.findByText("2 waiting for you"));

    fireEvent.click(screen.getByRole("button", { name: /Product change/i }));

    const approve = await screen.findByRole("button", { name: "Approve change" });
    expect(screen.queryByRole("button", { name: "Apply change" })).toBeNull();
    fireEvent.click(approve);

    await waitFor(() => expect(reviewProductChange).toHaveBeenCalledWith(
      "v1",
      "workspace-private",
      "revision-private",
      { decision: "approve", note: undefined },
    ));
    const apply = await screen.findByRole("button", { name: "Apply change" });
    expect(decideWallItem).not.toHaveBeenCalledWith("v1", "wall-diff", expect.anything());

    fireEvent.click(apply);
    await waitFor(() => expect(decideWallItem).toHaveBeenCalledWith(
      "v1",
      "wall-diff",
      { decision: "release", note: undefined },
    ));
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

  it("frames a selected bet territory without replacing authored placement", async () => {
    const onSelectionChange = vi.fn();
    render(<FirmLens ventureId="v1" onSelectionChange={onSelectionChange} />);
    fireEvent.click(await screen.findByTestId("node-bet:bet-1"));

    expect(onSelectionChange).toHaveBeenCalledWith({ betId: "bet-1", workRef: null, teammateRefs: [] });
    await waitFor(() => expect(flowHarness.fitView).toHaveBeenCalledWith(expect.objectContaining({
      nodes: expect.arrayContaining([
        expect.objectContaining({ id: "bet:bet-1" }),
      ]),
      duration: 180,
    })));
    expect(screen.getByTestId("node-crew:outreach-writer")).toHaveAttribute(
      "data-position",
      JSON.stringify({ x: 0, y: 0 }),
    );
    expect(putPlacement).not.toHaveBeenCalled();
  });

  it("removes JS camera travel when reduced motion is requested", async () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    render(<FirmLens ventureId="v1" />);
    fireEvent.click(await screen.findByTestId("node-bet:bet-1"));
    await waitFor(() => expect(flowHarness.fitView).toHaveBeenCalledWith(expect.objectContaining({ duration: 0 })));
  });

  it("changes semantic representation at a far camera stop and Escape restores the wider firm", async () => {
    const onSelectionChange = vi.fn();
    render(<FirmLens ventureId="v1" onSelectionChange={onSelectionChange} />);
    const canvas = await screen.findByTestId("react-flow-mock");
    expect(canvas).toHaveAttribute("data-canvas-altitude", "middle");
    fireEvent.click(screen.getByTestId("trigger-far-zoom"));
    expect(canvas).toHaveAttribute("data-canvas-altitude", "far");

    fireEvent.click(screen.getByTestId("node-bet:bet-1"));
    expect(document.querySelector(".firm-lens")).toHaveAttribute("data-focus-active", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onSelectionChange).toHaveBeenLastCalledWith(null);
  });

  it("uses a controlled lens without a duplicate lens or wall poll", async () => {
    render(<FirmLens ventureId="v1" lens={fixtureLens} wallQueue={fixtureWallQueue} />);
    expect(await screen.findByTestId("node-bet:bet-1")).toBeTruthy();
    expect(getLens).not.toHaveBeenCalled();
    expect(getWallQueue).not.toHaveBeenCalled();
  });

  it("keeps stale content inspectable while disabling every consequential lens action", async () => {
    render(<FirmLens ventureId="v1" lens={fixtureLens} wallQueue={fixtureWallQueue} stale />);
    expect(await screen.findByText(/showing the last verified firm/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /waiting for you/i }));
    expect(screen.getByRole("button", { name: "Release" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    fireEvent.click(screen.getByTestId("trigger-drag-stop"));
    expect(putPlacement).not.toHaveBeenCalled();
  });

  it("fails the controlled lens closed when its wall detail refresh is unreachable", async () => {
    getWallQueue.mockRejectedValueOnce(new Error("brain unavailable"));
    render(<FirmLens ventureId="v1" lens={fixtureLens} />);

    expect(await screen.findByTestId("node-bet:bet-1")).toBeTruthy();
    expect(await screen.findByText(/showing the last verified firm/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /founder review is unavailable/i })).toHaveTextContent(/pending outward work could not be verified/i);
    expect(screen.queryByText("Nothing needs you")).toBeNull();
    fireEvent.click(screen.getByTestId("trigger-drag-stop"));
    expect(putPlacement).not.toHaveBeenCalled();
    expect(getLens).not.toHaveBeenCalled();
  });
});
