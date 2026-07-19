// VentureCanvasShell — Slice 1 acceptance: the flag-gated venture canvas renders the SPECIFIED empty
// state before the first direction — the intent hub carrying the venture's name, the two territory
// kickers as named empty geography, and the composer focused with the "Direct the venture" placeholder.
// ReactFlow is reduced to a passthrough because jsdom has no layout measurement; ViewportPortal renders
// its children inline so the territory kickers are assertable.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import type { FirmLens as FirmLensPayload } from "@/types";

vi.mock("@xyflow/react/dist/style.css", () => ({}));

vi.mock("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ReactFlow: ({ nodes, children }: { nodes: Array<{ id: string; type?: string; data: { title?: string } }>; children?: ReactNode }) => (
    <div data-testid="canvas-flow">
      {nodes.map((node) => (
        <div key={node.id} data-testid={`node-${node.id}`} data-node-type={node.type}>{node.data.title}</div>
      ))}
      {children}
    </div>
  ),
  Background: () => <div data-testid="background" />,
  Controls: () => <div data-testid="controls" />,
  BackgroundVariant: { Dots: "dots" },
  ViewportPortal: ({ children }: { children: ReactNode }) => <div data-testid="viewport-portal">{children}</div>,
  useStore: (selector: (state: { transform: [number, number, number]; nodeLookup: Map<string, unknown> }) => unknown) => selector({ transform: [0, 0, 0.6], nodeLookup: new Map() }),
  useNodesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()],
  useEdgesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()],
}));

const getLens = vi.fn();
const getConversation = vi.fn();
const getActiveDrives = vi.fn();
const getWorkIndex = vi.fn();
const getHealth = vi.fn();
const getArchitectureProjection = vi.fn();
const getCredentials = vi.fn();

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
    putPlacement: vi.fn(),
    driveTeammate: vi.fn(),
    markFounderPresent: vi.fn().mockResolvedValue({ present: true }),
    subscribeVentureEvents: vi.fn(() => vi.fn()),
  };
});

import { VentureCanvasShell } from "./VentureCanvasShell";

const emptyLens: FirmLensPayload = {
  ventureId: "v1", crew: [], bets: [], wall: { count: 0, oldestParkedAt: null },
  placement: { positions: {}, revision: 0 },
} as FirmLensPayload;

const venture = { id: "v1", name: "RodentRadar", repository: "/products/rr", createdAt: "now", updatedAt: "now" };

describe("VentureCanvasShell — the specified empty state", () => {
  beforeEach(() => {
    getLens.mockReset().mockResolvedValue({ lens: emptyLens });
    getConversation.mockReset().mockResolvedValue({ messages: [] });
    getActiveDrives.mockReset().mockResolvedValue({ drives: [] });
    getWorkIndex.mockReset().mockResolvedValue({ workIndex: { ventureId: "v1", revision: 0, items: [], counts: { total: 0, attention: 0, active: 0, unread: 0 }, legacy: { unindexedRunCount: 0 } } });
    getHealth.mockReset().mockResolvedValue({ founderAuthority: { available: true } });
    getArchitectureProjection.mockReset().mockResolvedValue({ projection: null, revision: 0 });
    getCredentials.mockReset().mockResolvedValue({ credentials: [] });
  });

  it("shows the intent hub carrying the venture's name, both named territories, and the composer", async () => {
    render(<VentureCanvasShell venture={venture} />);

    // The intent hub sits at the origin carrying the venture's name (not lorem, not a tutorial).
    const hub = await screen.findByTestId("node-atlas:intent");
    expect(hub).toHaveTextContent("RodentRadar");

    // The two territory kickers render as named empty geography.
    expect(screen.getByText("Product")).toBeTruthy();
    expect(screen.getByText("Go-to-market")).toBeTruthy();

    // The composer is present with the spec's single placeholder.
    await waitFor(() => expect(screen.getByPlaceholderText("Direct the venture")).toBeTruthy());
  });
});
