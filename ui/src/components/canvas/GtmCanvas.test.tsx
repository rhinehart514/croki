import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GtmCanvas, type GtmCanvasModel } from "./GtmCanvas";

vi.mock("@/components/GraphCanvas", () => ({
  GraphCanvas: ({ multiPipeline, woven, panTo, initialViewport, onWovenAxisChange }: {
    multiPipeline?: unknown;
    woven?: unknown;
    panTo?: { channelId: string } | null;
    initialViewport?: { x: number; y: number; zoom: number } | null;
    onWovenAxisChange?: unknown;
  }) => (
    <div
      data-testid="graph-canvas"
      data-complete-fleet={multiPipeline ? "true" : "false"}
      data-woven={woven ? "true" : "false"}
      data-pan-to={panTo?.channelId ?? ""}
      data-viewport={initialViewport ? `${initialViewport.x},${initialViewport.y},${initialViewport.zoom}` : ""}
      data-axis-controls={onWovenAxisChange ? "unified" : "absent"}
    />
  ),
}));

vi.mock("@/components/canvas/FocusedPipelineReadout", () => ({
  FocusedPipelineReadout: ({ graph }: { graph: { id: string } }) => <div data-testid="pipeline-readout" data-graph-id={graph.id} />,
}));

const graph = {
  id: "pipeline-1",
  name: "Find the first design partners",
  version: "1",
  nodes: [{ id: "source", label: "Product truth", category: "source", position: { x: 0, y: 0 }, config: {} }],
  edges: [],
} as GtmCanvasModel["graph"];

function model(overrides: Partial<GtmCanvasModel> = {}): GtmCanvasModel {
  const channel = { id: "pipeline-1", name: "Design partners", nodeCount: 1 };
  return {
    projectId: "project-1",
    graph,
    connectors: [],
    result: null,
    running: false,
    runningNodeId: null,
    selection: null,
    selectionDescriptor: { kind: "lane", channelId: "pipeline-1", source: "focus" },
    composerAltitude: "pipeline",
    onSelect: vi.fn(),
    multiPipeline: {
      channels: [channel],
      channelGraphs: new Map([["pipeline-1", graph!]]),
      channelRunResults: new Map([["pipeline-1", null]]),
    },
    panTo: { channelId: "pipeline-1", token: 1 },
    channels: [channel],
    activeChannelId: "pipeline-1",
    subsystemHealth: {},
    icp: {},
    claims: [],
    people: [],
    channelFeeds: [],
    directedFeeds: [],
    onDeriveChannel: vi.fn(),
    onOpenChannel: vi.fn(),
    woven: { objectNodes: [], kindClusters: [] },
    ...overrides,
  } as unknown as GtmCanvasModel;
}

describe("GtmCanvas continuous surface", () => {
  it("renders full pipeline graphs and woven work together", () => {
    render(<GtmCanvas model={model({ onWovenAxisChange: vi.fn() })} />);
    const canvas = screen.getByTestId("graph-canvas");
    expect(canvas).toHaveAttribute("data-complete-fleet", "true");
    expect(canvas).toHaveAttribute("data-woven", "true");
    expect(canvas).toHaveAttribute("data-pan-to", "pipeline-1");
    expect(canvas).toHaveAttribute("data-axis-controls", "unified");
    expect(screen.getByTestId("pipeline-readout")).toHaveAttribute("data-graph-id", "pipeline-1");
    expect(screen.queryByRole("button", { name: "Operator" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Engineer" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Arrange canvas" })).toBeNull();
  });

  it("keeps the same canvas mounted when focus clears", () => {
    const { rerender } = render(<GtmCanvas model={model()} />);
    const before = screen.getByTestId("graph-canvas");

    rerender(<GtmCanvas model={model({ activeChannelId: null, panTo: null })} />);

    expect(screen.getByTestId("graph-canvas")).toBe(before);
    expect(screen.queryByTestId("pipeline-readout")).toBeNull();
    expect(screen.getByTestId("unified-canvas")).toHaveAttribute("data-channel-id", "");
  });

  it("hides the remembered pipeline brief while another canvas object owns focus", () => {
    render(<GtmCanvas model={model({
      selectionDescriptor: { kind: "anchor", anchorId: "canchor:goal:goal-1", ref: { type: "goal", id: "goal-1" } },
      wovenFocus: { kind: "anchor", anchorId: "canchor:goal:goal-1", ref: { type: "goal", id: "goal-1" } },
    })} />);

    expect(screen.queryByTestId("pipeline-readout")).toBeNull();
    expect(screen.getByTestId("unified-canvas")).not.toHaveClass("has-pipeline-focus");
  });

  it("restores the saved founder viewport on the same canvas", () => {
    render(<GtmCanvas model={model({ initialViewport: { x: -120, y: 44, zoom: 0.72 } })} />);
    expect(screen.getByTestId("graph-canvas")).toHaveAttribute("data-viewport", "-120,44,0.72");
  });

  it("does not cover grounded canvas material with an empty-terrain prompt", () => {
    render(<GtmCanvas model={model({
      graph: null,
      multiPipeline: { channels: [], channelGraphs: new Map(), channelRunResults: new Map() },
      activeChannelId: null,
      panTo: null,
      woven: {
        objectNodes: [],
        kindClusters: [],
        canvas: { anchors: [{ id: "truth-1" }], regions: [] },
      },
    } as Partial<GtmCanvasModel>)} />);
    expect(screen.queryByText("Your product-market terrain")).toBeNull();
  });

  it("uses one prioritized status surface for partial and narrow-width guidance", () => {
    render(<GtmCanvas model={model({ terrainState: {
      loading: false,
      stale: false,
      partial: true,
      hypothesisCount: 1,
      runtimeConnected: true,
      error: null,
    } })} />);
    const status = screen.getByRole("status");
    expect(status).toHaveClass("canvas-status-surface", "has-terrain-status");
    expect(status).toHaveTextContent("Read complete for the available evidence");
    expect(status).toHaveTextContent("Tap work to inspect it");
    expect(status).toHaveTextContent("dense wiring is easier on a wider screen");
  });
});
