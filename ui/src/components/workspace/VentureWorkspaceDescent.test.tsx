// The adaptive center-stage: descent swaps the CENTER to a purpose-built workspace over the still-mounted
// canvas; a non-bet selection scopes rather than clears; Escape returns AND broadens. The stubbed ReactFlow
// exposes each node as a button and forwards double-click, so a founder descend is drivable from the test.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import type { FirmConversationMessage, FirmLens as FirmLensPayload } from "@/types";

vi.mock("@xyflow/react/dist/style.css", () => ({}));

vi.mock("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ReactFlow: ({
    nodes, children, onNodeClick, onNodeDoubleClick, onPaneClick,
  }: {
    nodes: Array<{ id: string; data: { title?: string } }>;
    children?: ReactNode;
    onNodeClick?: (event: unknown, node: { id: string }) => void;
    onNodeDoubleClick?: (event: unknown, node: { id: string }) => void;
    onPaneClick?: (event: unknown) => void;
  }) => (
    <div data-testid="canvas-flow">
      {nodes.map((node) => (
        <button
          key={node.id}
          type="button"
          data-testid={`node-${node.id}`}
          onClick={(event) => onNodeClick?.(event, node)}
          onDoubleClick={(event) => onNodeDoubleClick?.(event, node)}
        >
          {node.data.title}
        </button>
      ))}
      <button type="button" data-testid="pane" onClick={() => onPaneClick?.({ target: { classList: { contains: () => true } } })} />
      {children}
    </div>
  ),
  Background: () => <div data-testid="background" />,
  Controls: () => <div data-testid="controls" />,
  BackgroundVariant: { Dots: "dots" },
  ViewportPortal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useStore: (selector: (state: { transform: [number, number, number] }) => unknown) => selector({ transform: [0, 0, 0.6] }),
  useNodesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()],
  useEdgesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()],
}));

const getLens = vi.fn();
const getConversation = vi.fn();
const getActiveDrives = vi.fn();
const getHealth = vi.fn();
const getArchitectureProjection = vi.fn();
const getCredentials = vi.fn();
const listVentures = vi.fn();

vi.mock("@/api", async () => {
  const actual = await vi.importActual<typeof import("@/api")>("@/api");
  return {
    ApiError: actual.ApiError,
    getLens: (...a: unknown[]) => getLens(...a),
    getConversation: (...a: unknown[]) => getConversation(...a),
    getActiveDrives: (...a: unknown[]) => getActiveDrives(...a),
    getHealth: (...a: unknown[]) => getHealth(...a),
    getArchitectureProjection: (...a: unknown[]) => getArchitectureProjection(...a),
    getCredentials: (...a: unknown[]) => getCredentials(...a),
    listVentures: (...a: unknown[]) => listVentures(...a),
    putPlacement: vi.fn(),
    driveTeammate: vi.fn(),
    stopActiveDrive: vi.fn(),
    markFounderPresent: vi.fn().mockResolvedValue({ present: true }),
  };
});

import { VentureWorkspace } from "./VentureWorkspace";

const DIFF = ["diff --git a/x.ts b/x.ts", "@@ -1 +1 @@", "-a", "+b"].join("\n");

const lens: FirmLensPayload = {
  ventureId: "v1",
  crew: [{ ref: "sable", summonedAt: "2026-07-01T09:00:00.000Z", soul: { name: "Sable" } }],
  bets: [{
    id: "bet-1", ventureId: "v1", intent: "Reach the first buyers", forkedFrom: null, teammateRef: "sable",
    refs: [], evidence: [], staged: [{ id: "staged-diff", content: DIFF }], joinKey: "j1",
    createdAt: "2026-07-01T09:30:00.000Z", updatedAt: "2026-07-01T09:30:00.000Z", endedAt: null, endedBy: null,
    learning: null, position: "live", stagedCount: 1, latestOutcome: null, events: [],
  }],
  wall: { count: 0, oldestParkedAt: null },
  placement: { positions: {}, revision: 0 },
} as FirmLensPayload;

const messages: FirmConversationMessage[] = [
  { id: "m1", ventureId: "v1", role: "founder", content: "Reach the first buyers.", teammateRef: null, betId: "bet-1", createdAt: "2026-07-01T10:00:00.000Z" },
];

const venture = { id: "v1", name: "RodentRadar", repository: "/products/rr", createdAt: "now", updatedAt: "now" };

describe("VentureWorkspace — the center adapts on descent", () => {
  beforeEach(() => {
    getLens.mockReset().mockResolvedValue({ lens });
    getConversation.mockReset().mockResolvedValue({ messages });
    getActiveDrives.mockReset().mockResolvedValue({ drives: [] });
    getHealth.mockReset().mockResolvedValue({ founderAuthority: { available: true } });
    getArchitectureProjection.mockReset().mockResolvedValue({ projection: null, revision: 0 });
    getCredentials.mockReset().mockResolvedValue({ credentials: [] });
    listVentures.mockReset().mockResolvedValue({ ventures: [venture] });
  });

  it("double-clicking a bet DESCENDS into a purpose-built workspace over the still-mounted canvas", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    const node = await screen.findByTestId("node-bet:bet-1");

    // No workspace yet — the canvas is the resting surface.
    expect(screen.queryByTestId("stage-workspace")).toBeNull();

    fireEvent.doubleClick(node);

    // The center now shows the adaptive workspace — the direction's own head, not a bigger atlas card.
    const workspace = await screen.findByTestId("stage-workspace");
    expect(workspace).toBeTruthy();
    // The direction identity is pinned (the venture→direction operating context).
    expect(screen.getByRole("heading", { name: /Reach the first buyers/ })).toBeTruthy();
    // The canvas NEVER unmounts — it is dimmed beneath the workspace (the bench contract).
    expect(screen.getByTestId("canvas-flow")).toBeTruthy();
    expect(screen.getByTestId("node-bet:bet-1")).toBeTruthy();
  });

  it("clicking a NON-bet work node SCOPES the environment to that object instead of clearing the scope", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    // The staged diff on bet-1 projects a work: node on the canvas.
    const workNode = await screen.findByTestId("node-work:staged-diff");

    fireEvent.click(workNode);

    // Scoped, not cleared: the composer is no longer the unscoped whole-venture placeholder.
    await waitFor(() => expect(screen.queryByPlaceholderText("Direct the venture")).toBeNull());
    // No workspace opened on a single click — descent is a separate gesture.
    expect(screen.queryByTestId("stage-workspace")).toBeNull();
  });

  it("Escape RETURNS from the workspace and the selection SURVIVES, then a second Escape broadens", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    const node = await screen.findByTestId("node-bet:bet-1");
    fireEvent.doubleClick(node);
    await screen.findByTestId("stage-workspace");

    // First Escape closes the workspace; the selection survives (composer still scoped to the bet intent).
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("stage-workspace")).toBeNull());
    expect(screen.getByTestId("canvas-flow")).toBeTruthy();
    // Still scoped: the scoped composer label shows the bet intent, not "Direct the venture".
    expect(screen.queryByPlaceholderText("Direct the venture")).toBeNull();

    // Second Escape broadens to whole-venture: the composer returns to the unscoped placeholder.
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.getByPlaceholderText("Direct the venture")).toBeTruthy());
  });
});
