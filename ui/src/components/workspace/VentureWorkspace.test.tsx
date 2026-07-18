// VentureWorkspace — the founder IDE frame acceptance. Proves the inverted hierarchy the rebuild ships:
//   • The DEFAULT center is the adaptive workbench (VentureHome), NOT an always-visible node map. The graph
//     is not even mounted at rest.
//   • Selecting a direction from Home scopes the composer AND filters the conversation to that branch in one
//     state change, and the workbench opens that direction's representation — no details-page detour.
//   • The graph is one action away: "Map" summons it as a mode; it was never the host.
//   • Clearing the scope restores the whole-venture conversation.
//
// ReactFlow is a passthrough (jsdom has no layout); it only matters once the map is summoned. The stubbed
// flow exposes each node as a button so a map selection is drivable exactly as a founder click would drive it.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode } from "react";
import type { FirmConversationMessage, FirmLens as FirmLensPayload } from "@/types";

vi.mock("@xyflow/react/dist/style.css", () => ({}));

vi.mock("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ReactFlow: ({
    nodes, children, onNodeClick, onPaneClick,
  }: {
    nodes: Array<{ id: string; data: { title?: string } }>;
    children?: ReactNode;
    onNodeClick?: (event: unknown, node: { id: string }) => void;
    onPaneClick?: (event: unknown) => void;
  }) => (
    <div data-testid="canvas-flow">
      {nodes.map((node) => (
        <button key={node.id} type="button" data-testid={`node-${node.id}`} onClick={(event) => onNodeClick?.(event, node)}>
          {node.data.title}
        </button>
      ))}
      <button
        type="button"
        data-testid="pane"
        onClick={() => onPaneClick?.({ target: { classList: { contains: () => true } } })}
      />
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
    getLens: (...args: unknown[]) => getLens(...args),
    getConversation: (...args: unknown[]) => getConversation(...args),
    getActiveDrives: (...args: unknown[]) => getActiveDrives(...args),
    getHealth: (...args: unknown[]) => getHealth(...args),
    getArchitectureProjection: (...args: unknown[]) => getArchitectureProjection(...args),
    getCredentials: (...args: unknown[]) => getCredentials(...args),
    listVentures: (...args: unknown[]) => listVentures(...args),
    putPlacement: vi.fn(),
    driveTeammate: vi.fn(),
    replyInConversation: vi.fn(),
    stopActiveDrive: vi.fn(),
    markFounderPresent: vi.fn().mockResolvedValue({ present: true }),
  };
});

import { VentureWorkspace } from "./VentureWorkspace";

// Two live bets, each with a founder sentence that opens it and a teammate reply on that bet — so the
// whole-venture conversation carries both branches and a direction selection narrows to exactly one.
function bet(id: string, intent: string, at: string) {
  return {
    id, ventureId: "v1", intent, forkedFrom: null, teammateRef: "sable", refs: [], evidence: [],
    staged: [], joinKey: `join-${id}`, createdAt: at, updatedAt: at, endedAt: null, endedBy: null,
    learning: null, position: "live" as const, stagedCount: 0, latestOutcome: null, events: [],
  };
}

const lens: FirmLensPayload = {
  ventureId: "v1",
  crew: [{ ref: "sable", summonedAt: "2026-07-01T09:00:00.000Z", soul: { name: "Sable" } }],
  bets: [bet("bet-1", "Find the first buyers", "2026-07-01T09:30:00.000Z"), bet("bet-2", "Sharpen the pitch", "2026-07-01T09:40:00.000Z")],
  wall: { count: 0, oldestParkedAt: null },
  placement: { positions: {}, revision: 0 },
} as FirmLensPayload;

const messages: FirmConversationMessage[] = [
  { id: "m1", ventureId: "v1", role: "founder", content: "Find the first buyers.", teammateRef: null, betId: "bet-1", createdAt: "2026-07-01T10:00:00.000Z" },
  { id: "m2", ventureId: "v1", role: "teammate", content: "Segment A looks reachable now.", teammateRef: "sable", betId: "bet-1", createdAt: "2026-07-01T10:01:00.000Z" },
  { id: "m3", ventureId: "v1", role: "founder", content: "Sharpen the pitch.", teammateRef: null, betId: "bet-2", createdAt: "2026-07-01T10:05:00.000Z" },
  { id: "m4", ventureId: "v1", role: "teammate", content: "Rewrote the value line for pitch.", teammateRef: "sable", betId: "bet-2", createdAt: "2026-07-01T10:06:00.000Z" },
];

const venture = { id: "v1", name: "RodentRadar", repository: "/products/rr", createdAt: "now", updatedAt: "now" };

describe("VentureWorkspace — the founder IDE frame", () => {
  beforeEach(() => {
    getLens.mockReset().mockResolvedValue({ lens });
    getConversation.mockReset().mockResolvedValue({ messages });
    getActiveDrives.mockReset().mockResolvedValue({ drives: [] });
    getHealth.mockReset().mockResolvedValue({ founderAuthority: { available: true } });
    getArchitectureProjection.mockReset().mockResolvedValue({ projection: null, revision: 0 });
    getCredentials.mockReset().mockResolvedValue({ credentials: [] });
    listVentures.mockReset().mockResolvedValue({ ventures: [venture] });
  });

  it("opens on the adaptive workbench (where things stand), not an always-visible node map", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);

    // LEFT index — the rail's universal search and the venture conversation are both present.
    expect(await screen.findByPlaceholderText("Search")).toBeTruthy();
    expect(screen.getByText("Venture conversation")).toBeTruthy();

    // CENTER — the workbench is the resting surface and shows the venture's operating picture. The GRAPH is
    // not even mounted at rest (it is summoned, not the host).
    const workbench = await screen.findByTestId("venture-workbench");
    expect(within(workbench).getByRole("heading", { name: "RodentRadar" })).toBeTruthy();
    await waitFor(() => expect(within(workbench).getByText("Find the first buyers.")).toBeTruthy());
    expect(screen.queryByTestId("canvas-flow")).toBeNull();

    // COMPOSER — unscoped, it directs the whole venture.
    expect(screen.getByPlaceholderText("Direct the venture")).toBeTruthy();
  });

  it("selecting a direction from Home scopes the composer AND the conversation branch, and opens its work", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);

    const workbench = await screen.findByTestId("venture-workbench");
    await waitFor(() => expect(screen.getByText("Rewrote the value line for pitch.")).toBeTruthy());

    // Click the Home row for the first direction.
    fireEvent.click(within(workbench).getByRole("button", { name: /Find the first buyers/ }));

    // The conversation narrows to the selected direction's branch: bet-1 stays, bet-2 drops.
    await waitFor(() => expect(screen.queryByText("Rewrote the value line for pitch.")).toBeNull());
    expect(screen.getByText("Segment A looks reachable now.")).toBeTruthy();

    // The composer is now scoped to that direction (its intent), not the whole venture.
    const composer = screen.getByLabelText("Direct this venture");
    expect(within(composer).getByText("Find the first buyers")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Direct the venture")).toBeNull();

    // The workbench opened the selected work in place — still no graph, no details page.
    expect(screen.getByTestId("stage-workspace")).toBeTruthy();
    expect(screen.queryByTestId("canvas-flow")).toBeNull();
  });

  it("summons the venture graph as a mode when the founder asks for the map", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByTestId("venture-workbench");

    // The graph is one action away — not the resting center.
    expect(screen.queryByTestId("canvas-flow")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Map$/ }));

    // Now the graph plane is mounted with the venture's nodes.
    expect(await screen.findByTestId("canvas-flow")).toBeTruthy();
    expect(screen.getByTestId("node-bet:bet-1")).toBeTruthy();

    // Escape returns to the work surface; the graph unmounts again.
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("canvas-flow")).toBeNull());
    expect(screen.getByTestId("venture-workbench")).toBeTruthy();
  });

  it("restores the whole-venture conversation when the scope is cleared", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    const workbench = await screen.findByTestId("venture-workbench");
    await waitFor(() => expect(screen.getByText("Rewrote the value line for pitch.")).toBeTruthy());

    fireEvent.click(within(workbench).getByRole("button", { name: /Find the first buyers/ }));
    await waitFor(() => expect(screen.queryByText("Rewrote the value line for pitch.")).toBeNull());

    // "Whole venture" broadens the scope back to the full conversation.
    fireEvent.click(screen.getByRole("button", { name: "Whole venture" }));
    await waitFor(() => expect(screen.getByText("Rewrote the value line for pitch.")).toBeTruthy());
    expect(screen.getByText("Segment A looks reachable now.")).toBeTruthy();
    expect(screen.getByPlaceholderText("Direct the venture")).toBeTruthy();
  });
});
