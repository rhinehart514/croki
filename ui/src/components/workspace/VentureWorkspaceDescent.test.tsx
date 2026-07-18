// The adaptive center: selecting a direction opens the best representation for its durable truth (a staged
// product change resolves to the diff/tests/preview body), all without a node map. The graph is summonable,
// and descending from the map hands the founder back to the work. Escape climbs the broaden ladder
// (map → work, scoped → home). The stubbed ReactFlow exposes each node as a button and forwards
// double-click, so a map descend is drivable from the test.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  useStore: (selector: (state: { transform: [number, number, number]; nodeLookup: Map<string, unknown> }) => unknown) => selector({ transform: [0, 0, 0.6], nodeLookup: new Map() }),
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
    replyInConversation: vi.fn(),
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

describe("VentureWorkspace — the center adapts to the selected work", () => {
  beforeEach(() => {
    getLens.mockReset().mockResolvedValue({ lens });
    getConversation.mockReset().mockResolvedValue({ messages });
    getActiveDrives.mockReset().mockResolvedValue({ drives: [] });
    getHealth.mockReset().mockResolvedValue({ founderAuthority: { available: true } });
    getArchitectureProjection.mockReset().mockResolvedValue({ projection: null, revision: 0 });
    getCredentials.mockReset().mockResolvedValue({ credentials: [] });
    listVentures.mockReset().mockResolvedValue({ ventures: [venture] });
  });

  it("selecting a direction with a staged change opens the product representation in place — no node map", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    const workbench = await screen.findByTestId("venture-workbench");

    // At rest: Home, no selected-work region, no graph.
    expect(screen.queryByTestId("stage-workspace")).toBeNull();
    expect(screen.queryByTestId("canvas-flow")).toBeNull();

    fireEvent.click(await within(workbench).findByRole("button", { name: /Reach the first buyers/ }));

    // The center now shows the direction's own representation — its pinned identity head, not a bigger card.
    expect(await screen.findByTestId("stage-workspace")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Reach the first buyers/ })).toBeTruthy();
    // The exact staged change is first-class: the changed file is shown, never a summary.
    expect(screen.getAllByText("x.ts").length).toBeGreaterThan(0);
    // Still no graph — the workbench, not a canvas, is the host.
    expect(screen.queryByTestId("canvas-flow")).toBeNull();
  });

  it("summons the map, and descending from a node returns to the selected work", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByTestId("venture-workbench");

    fireEvent.click(screen.getByRole("button", { name: /^Map$/ }));
    const node = await screen.findByTestId("node-bet:bet-1");

    // Double-click (descend) hands the founder back to the work surface, scoped to that node.
    fireEvent.doubleClick(node);
    await waitFor(() => expect(screen.queryByTestId("canvas-flow")).toBeNull());
    expect(await screen.findByTestId("stage-workspace")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Reach the first buyers/ })).toBeTruthy();
  });

  it("clears the prior direction highlight when descending to a non-direction map object", async () => {
    const { container } = render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByTestId("venture-workbench");
    const railDirection = await waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>(".now-rail-dir");
      expect(button).toBeTruthy();
      return button!;
    });

    fireEvent.click(railDirection);
    expect(railDirection.getAttribute("aria-current")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^Map$/ }));
    fireEvent.doubleClick(await screen.findByTestId("node-crew:sable"));

    await waitFor(() => expect(screen.queryByTestId("canvas-flow")).toBeNull());
    expect(railDirection.getAttribute("aria-current")).toBe("false");
  });

  it("Escape broadens a scoped selection back to Home", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    const workbench = await screen.findByTestId("venture-workbench");
    fireEvent.click(await within(workbench).findByRole("button", { name: /Reach the first buyers/ }));
    await screen.findByTestId("stage-workspace");

    // Escape clears the scope: back to Home (the venture name heading, the unscoped composer).
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("stage-workspace")).toBeNull());
    expect(screen.getByRole("heading", { name: "RodentRadar" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Direct the venture")).toBeTruthy();
  });
});
