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
    nodes: Array<{ id: string; data: { title?: string; object?: { name: string }; onSelect?: (id: string) => void } }>;
    children?: ReactNode;
    onNodeClick?: (event: unknown, node: { id: string }) => void;
    onPaneClick?: (event: unknown) => void;
  }) => (
    <div data-testid="canvas-flow">
      {nodes.map((node) => (
        <button key={node.id} type="button" data-testid={`node-${node.id}`} aria-label={node.data.object ? `Inspect ${node.data.object.name}` : undefined} onClick={(event) => onNodeClick ? onNodeClick(event, node) : node.data.onSelect?.(node.id)}>
          {node.data.object?.name ?? node.data.title}
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
  MarkerType: { ArrowClosed: "arrowclosed" },
  Position: { Left: "left", Right: "right" },
  ViewportPortal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useStore: (selector: (state: { transform: [number, number, number]; nodeLookup: Map<string, unknown> }) => unknown) => selector({ transform: [0, 0, 0.6], nodeLookup: new Map() }),
  useNodesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()],
  useEdgesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()],
}));

const getLens = vi.fn();
const getConversation = vi.fn();
const getActiveDrives = vi.fn();
const getWorkIndex = vi.fn();
const markWorkIndexReviewed = vi.fn();
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
    getWorkIndex: (...args: unknown[]) => getWorkIndex(...args),
    getHealth: (...args: unknown[]) => getHealth(...args),
    getArchitectureProjection: (...args: unknown[]) => getArchitectureProjection(...args),
    getCredentials: (...args: unknown[]) => getCredentials(...args),
    listVentures: (...args: unknown[]) => listVentures(...args),
    putPlacement: vi.fn(),
    driveTeammate: vi.fn(),
    replyInConversation: vi.fn(),
    stopActiveDrive: vi.fn(),
    markWorkIndexReviewed: (...args: unknown[]) => markWorkIndexReviewed(...args),
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
    window.localStorage.clear();
    getLens.mockReset().mockResolvedValue({ lens });
    getConversation.mockReset().mockResolvedValue({ messages });
    getActiveDrives.mockReset().mockResolvedValue({ drives: [] });
    getWorkIndex.mockReset().mockResolvedValue({ workIndex: { ventureId: "v1", revision: 0, items: [], counts: { total: 0, attention: 0, active: 0, unread: 0 }, legacy: { unindexedRunCount: 0 } } });
    markWorkIndexReviewed.mockReset();
    getHealth.mockReset().mockResolvedValue({ founderAuthority: { available: true } });
    getArchitectureProjection.mockReset().mockResolvedValue({ projection: null, revision: 0 });
    getCredentials.mockReset().mockResolvedValue({ credentials: [] });
    listVentures.mockReset().mockResolvedValue({ ventures: [venture] });
  });

  it("opens on the adaptive workbench (where things stand), not an always-visible node map", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);

    // LEFT index — search and a compact conversation context are present; the transcript belongs to
    // selected work in the center, not the navigation rail.
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

  it("opens a venture object as the shared workbench and composer scope", async () => {
    getWorkIndex.mockResolvedValue({
      workIndex: {
        ventureId: "v1", revision: 4, items: [], counts: { total: 0, attention: 0, active: 0, unread: 0 },
        legacy: { unindexedRunCount: 0 },
        outline: {
          architectureRevision: 4, unplacedThreadRefs: [],
          objects: [{
            id: "onboarding", objectRef: "object:onboarding", name: "Onboarding", statement: "Reach useful work before asking for setup.",
            type: "experience", territory: "product", sectionId: "experiences", parentRef: null, assertion: "founder-asserted",
            provenance: null, threadRefs: [], targetable: true, architectureRole: "product-loop", updatedAt: null,
          }],
        },
      },
    });

    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    const rail = await screen.findByRole("navigation", { name: "Venture outline" });
    fireEvent.click(within(rail).getByRole("button", { name: "Onboarding" }));

    const workbench = screen.getByTestId("venture-workbench");
    expect(within(workbench).getByRole("heading", { name: "Onboarding" })).toBeTruthy();
    expect(within(workbench).getByText("Reach useful work before asking for setup.")).toBeTruthy();
    const composer = screen.getByLabelText("Direct this venture");
    expect(within(composer).getByText("Onboarding")).toBeTruthy();
  });

  it("restores the venture's last scope and center mode on return", async () => {
    window.localStorage.setItem("drover:workspace-session:v1:v1", JSON.stringify({
      mode: "map",
      focus: {
        directionId: null,
        target: { betId: "bet-1", workRef: null, teammateRefs: [] },
      },
    }));

    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Whole system" })).toBeTruthy();
    expect(screen.queryByTestId("venture-workbench")).toBeNull();
    expect(screen.getByRole("button", { name: /Back to work/ })).toBeTruthy();
  });

  it("selecting a direction from Home scopes the composer AND the conversation branch, and opens its work", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);

    const workbench = await screen.findByTestId("venture-workbench");
    await waitFor(() => expect(within(workbench).getByRole("button", { name: /Find the first buyers/ })).toBeTruthy());

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

  it("uses the durable thread row and marks its exact returned consequence reviewed", async () => {
    const item = {
      threadRef: "thread:direction-stable",
      ventureRef: "venture:v1",
      parentThreadRef: "thread:venture-root",
      originMessageRef: "conversation:m1",
      subjectRefs: ["bet:bet-1"],
      focusRef: "bet:bet-1",
      founderIntent: "Find the first buyers.",
      lifecycle: "open",
      activity: "idle",
      attention: "review",
      terminal: "completed",
      unread: true,
      reviewedThrough: null,
      latestMeaningfulEvent: { kind: "completed", ref: "run:run-1#terminal", at: "2026-07-01T10:02:00.000Z", summary: "Three reachable segments returned" },
      runRefs: ["run:run-1"],
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-01T10:02:00.000Z",
    } as const;
    const canonical = { ventureId: "v1", revision: 4, items: [item], counts: { total: 1, attention: 1, active: 0, unread: 1 }, legacy: { unindexedRunCount: 0 } };
    getWorkIndex.mockResolvedValue({ workIndex: canonical });
    markWorkIndexReviewed.mockResolvedValue({
      item: { ...item, attention: "none", unread: false, reviewedThrough: item.latestMeaningfulEvent.ref },
      workIndex: { ...canonical, items: [{ ...item, attention: "none", unread: false, reviewedThrough: item.latestMeaningfulEvent.ref }], counts: { ...canonical.counts, attention: 0, unread: 0 } },
    });

    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    const rail = await screen.findByRole("navigation", { name: "Venture outline" });
    fireEvent.click(within(rail).getByRole("button", { name: "Venture context" }));
    const row = await within(rail).findByRole("button", { name: /Find the first buyers/ });
    expect(screen.getAllByRole("button", { name: /Needs you/ }).length).toBeGreaterThan(0);
    fireEvent.click(row);

    await waitFor(() => expect(markWorkIndexReviewed).toHaveBeenCalledWith("v1", item));
    expect(screen.getByText("Segment A looks reachable now.")).toBeTruthy();
  });

  it("summons generated venture maps when the founder asks for the map", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    await screen.findByTestId("venture-workbench");

    // The graph is one action away — not the resting center.
    expect(screen.queryByTestId("canvas-flow")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Map$/ }));

    // The generated map surface is mounted; no editable graph is required.
    expect(await screen.findByRole("heading", { name: "Whole system" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Go-to-market" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Product" })).toBeTruthy();

    // Escape returns to the work surface; the graph unmounts again.
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Whole system" })).toBeNull());
    expect(screen.getByTestId("venture-workbench")).toBeTruthy();
  });

  it("restores whole-venture Home and conversation context when the scope is cleared", async () => {
    render(<VentureWorkspace venture={venture} onOpenVenture={vi.fn()} />);
    const workbench = await screen.findByTestId("venture-workbench");
    await waitFor(() => expect(within(workbench).getByRole("button", { name: /Find the first buyers/ })).toBeTruthy());

    fireEvent.click(within(workbench).getByRole("button", { name: /Find the first buyers/ }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Work stream" })).toBeTruthy());

    // "Whole venture" broadens to Home. The left edge reports the venture conversation without
    // duplicating its transcript; selecting work restores the relevant branch in the center.
    fireEvent.click(screen.getByRole("button", { name: "Whole venture" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Work stream" })).toBeNull());
    expect(screen.getByText("Venture conversation")).toBeTruthy();
    expect(screen.queryByText("Segment A looks reachable now.")).toBeNull();
    expect(screen.getByRole("heading", { name: "RodentRadar" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Direct the venture")).toBeTruthy();
  });
});
