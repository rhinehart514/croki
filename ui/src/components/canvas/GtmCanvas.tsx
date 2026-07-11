import { GraphCanvas, type OperatorCursorState } from "@/components/GraphCanvas";
import { FocusedPipelineReadout } from "@/components/canvas/FocusedPipelineReadout";
import type { NodeEditorBridge } from "@/components/nodeEditorBridge";
import type { GatePromote } from "@/lib/gateItem";
import type { WovenAxis, WovenFocus } from "@/lib/wovenOverlay";
import type {
  ChannelFeed, ChannelMeta, Claim, ConnectorMeta, DirectedFeed, GateDecision, GateDeltaDecision, GtmExperiment, GTMContractAudit, GTMGraph, GTMItem, GTMNode,
  GTMRunResult, NodeSelection, OperatingView, Person, WovenGraph,
} from "@/types";
import type { RunSummary } from "@/api";
import type { CanvasCreateRequest, CanvasRegionCreateRequest, CanvasRelationshipRequest } from "@/lib/canvasNativeActions";
import type { Viewport } from "@xyflow/react";

// GtmCanvas is one continuous coordinate space. Goals, work, shared objects, regions, executable
// pipeline steps, founder gates, and outcomes coexist in one React Flow surface. Focusing a pipeline
// changes camera emphasis and the contextual readout only; it never swaps the founder into a different
// renderer or product mode.

export type GtmCanvasModel = {
  // The active project — the board lens reads GET /api/projects/:id/board with it. Null before a
  // project is open (the board then shows its honest loading/empty state).
  projectId: string | null;
  // ── channel-flow: the GraphCanvas prop bag (null graph → no channel open) ──
  graph: GTMGraph | null;
  connectors: ConnectorMeta[];
  contractAudits?: Record<string, GTMContractAudit>;
  result: GTMRunResult | null;
  running: boolean;
  runningNodeId: string | null;
  // The live per-node narrator beats: nodeId → the crew's newest first-person heartbeat on that step.
  // A running node shows this instead of an anonymous spinner. Absent/empty → the spinner fallback.
  nodeBeats?: Record<string, string>;
  selection: NodeSelection;
  onSelect: (id: string) => void;
  onPaneClick?: () => void;
  proposedNodeIds?: Set<string>;
  proposedEdgeIds?: Set<string>;
  revealedNodeIds?: Set<string>;
  proposalActive?: boolean;
  operatorCursor?: OperatorCursorState | null;
  onResolveProposal?: (accept: boolean) => void;
  onSubmitReview?: (nodeId: string, decisions: Record<string, GateDecision>) => void;
  // Promote-by-Replay on the focused pipeline's gate — the autonomy ladder, relocated onto the canvas
  // gate bloom. Absent when no pipeline is focused.
  gatePromote?: GatePromote;
  // The deal the focused pipeline's staged work carries, in plain words — its own offer, or the
  // project's standing one. Shown on the gate's inline review.
  gateOffer?: string | null;
  // Whether a real sender is connected. The action-altitude readout uses it to state the EXACT gate
  // consequence honestly ("sends to real recipients" vs "stages locally, nothing sends until you
  // connect a sender"). App already passes it; declaring it here makes the readout's derivation real.
  transportConnected?: boolean;
  // The outcome door on an approved gate card records what came back on a sent item in place.
  onRecordOutcome?: (item: GTMItem, outcome: { outcomeKind: string; value?: number }) => void | Promise<void>;
  // Veto-as-loop on the gate: send a staged item back to the crew to rework in the Composer.
  onRefineItem?: (item: GTMItem, note: string) => void | Promise<void>;
  // Area 5 MOVE 1 — the code-native gate delta decision: approve stages a microproduct/in-repo change;
  // ship carries deployConfirmed:true (the second authorization the deploy connector requires).
  onDecideDelta?: (item: GTMItem, itemKey: string, decision: GateDeltaDecision) => void | Promise<void>;
  onAskClaude?: (node: GTMNode) => void;
  // Open an agent's profile sheet from its monogram face on a step — the home of the deleted crew strip.
  onOpenAgentProfile?: (ref: string) => void;
  // The project's latest run numbers (real, from the run ledger), drawn on the focused pipeline's
  // Measure node instead of a separate floating strip. Null when no run has been recorded.
  runSummary?: RunSummary | null;
  onApproveGate?: (nodeId: string) => void;
  onAddNode?: (spec: Partial<GTMNode> & { label: string }) => void;
  onConnectNodes?: (source: string, target: string) => void;
  onCreateCanvasObject?: (request: CanvasCreateRequest) => void | Promise<void>;
  onConnectCanvasObjects?: (request: CanvasRelationshipRequest) => void | Promise<void>;
  onCreateCanvasRegion?: (request: CanvasRegionCreateRequest) => void | Promise<void>;
  onDeleteEdges?: (edgeIds: string[]) => void;
  onNodePositionChange?: (nodeId: string, position: { x: number; y: number }, origin?: "drag" | "layout") => void;
  nodeEditor?: NodeEditorBridge | null;
  // The literal one-coordinate-space unification: every other pipeline's graph, so channel-flow
  // renders ALL of them as lanes in one canvas instead of swapping which one is on screen. Absent
  // (or a single channel) behaves exactly like today's single-pipeline canvas.
  multiPipeline?: { channels: ChannelMeta[]; channelGraphs: Map<string, GTMGraph>; channelRunResults: Map<string, GTMRunResult | null>; draggedByNode?: Map<string, { x: number; y: number }> } | null;
  // "Open this pipeline" (ChannelSwitcher, a board tile) pans the merged canvas to that lane without
  // touching node selection. A fresh token still re-pans even to the SAME channel.
  panTo?: { channelId: string; token: number; nodeId?: string } | null;
  // ── engine overview + summoned cards: the channels + the shared objects they inherit ──
  channels: ChannelMeta[];
  activeChannelId: string | null;
  subsystemHealth: Record<string, { health: number; issue?: string }>;
  icp: Record<string, unknown>;
  // Structured claims (sharedContext.claims) — the source of truth the experiment matrix grids by and
  // the engine overview reads its headline claim from.
  claims: Claim[];
  // The shared People object (promoted from real runs) and the live experiments — the data App's
  // summoned People and Experiment-matrix cards project (and that channel-flow reads people from).
  people: Person[];
  experiments: GtmExperiment[];
  // Undirected links between channels that share real entities — the feeds the engine view draws.
  channelFeeds: ChannelFeed[];
  // Directional, founder-drawn feeds (one channel pulls another's output) — drawn as arrows.
  directedFeeds: DirectedFeed[];
  // Drag-to-connect on the engine canvas: wire toChannel to pull fromChannel's output.
  onDeriveChannel: (toChannelId: string, fromChannelId: string) => void;
  onOpenChannel: (channelId: string) => void;
  // A product with nothing wired yet lands on this same canvas — an empty node ground with a compose
  // invitation instead of a separate ranked-bets page. This focuses the goal composer so the founder
  // states the outcome and Claude composes the first pipeline.
  onComposeFirst?: () => void;
  // The cross-fleet operating read. Null before the first read resolves.
  operatingView?: OperatingView | null;
  // Fly to a parked run's real gate — the one click that opens the founder gate for a pulsing lane.
  onFlyToGate?: (target: { decisionId: string; sessionId: string | null; pipelineId: string | null; channelId: string }) => void;
  // The woven projection over the same lanes and objects: object chips, tie edges, and kind clusters.
  woven?: WovenGraph | null;
  // The projection axis (objects = the moat view, type = the spread/forms view) and the focus-to-trace
  // selection — pure view state the host owns so the toggle persists across renders.
  wovenAxis?: WovenAxis;
  wovenFocus?: WovenFocus;
  onWovenAxisChange?: (axis: WovenAxis) => void;
  onWovenSelect?: (focus: WovenFocus) => void;
  onCanvasAnchorPositionChange?: (nodeId: string, position: { x: number; y: number }) => void;
  onCanvasAuthorityChanged?: () => void | Promise<void>;
  onCanvasRegionChange?: (regionId: string, patch: { position?: { x: number; y: number }; size?: { width: number; height: number }; collapsed?: boolean }) => void;
  onCanvasRegionArchive?: (regionId: string) => void;
  initialViewport?: Viewport | null;
  onViewportChange?: (viewport: Viewport) => void;
  // Drag-to-wire a step onto an object chip / kind region — a composer steer, filled in by the crew.
  onWireObject?: (sourceStepId: string, targetId: string) => void;
  // Candidate lanes folded into the woven graph (docs/INTERTWINED-CANVAS.md decision 4) — the retired
  // candidate board. Synthetic channel ids in multiPipeline rendered as dashed proposed lanes; picking one
  // commits it live.
  candidateLaneIds?: Set<string>;
  onPickCandidate?: (channelId: string) => void;
  terrainState?: {
    loading: boolean;
    stale: boolean;
    partial: boolean;
    hypothesisCount: number;
    runtimeConnected: boolean;
    error: string | null;
  };
};

// The left gutter the product-entry column occupies, published by ProductEntryColumn as --pentry-gutter
// (0 when that column isn't mounted). The canvas pads its left edge by it so the canvas starts to
// the RIGHT of the column — no node renders under it, and the column can't intercept a node's click.
const GUTTER_STYLE = { paddingLeft: "var(--pentry-gutter, 0px)", transition: "padding-left 180ms ease" } as const;

// A stable empty graph keeps GraphCanvas's layout memo from thrashing before the first pipeline exists.
const LANDING_EMPTY_GRAPH: GTMGraph = { id: "__landing-empty__", name: "New pipeline", version: "0", nodes: [], edges: [] };

function UnifiedCanvas({ model: m }: { model: GtmCanvasModel }) {
  const landing = !m.graph;
  const graph = m.graph ?? LANDING_EMPTY_GRAPH;
  const hasLanes = (m.operatingView?.lanes.length ?? 0) > 0 || m.channels.length > 0;
  const axis = m.wovenAxis ?? "objects";
  const parkedCount = (m.operatingView?.lanes ?? []).filter((lane) => lane.runState === "parked").length;
  const focusedChannel = m.activeChannelId ? m.channels.find((c) => c.id === m.activeChannelId) ?? null : null;
  const focusedLane = m.activeChannelId ? m.operatingView?.lanes.find((l) => l.channelId === m.activeChannelId) ?? null : null;
  const showReadout = !landing && !!m.activeChannelId && graph.nodes.length > 0;

  return (
    <div
      className={`unified-gtm-canvas${showReadout ? " has-pipeline-focus" : ""}`}
      data-testid="unified-canvas"
      data-channel-id={m.activeChannelId ?? ""}
      data-graph-id={graph.id}
      data-run-id={m.result?.runId ?? ""}
      data-pending-gates={m.result?.pendingGates?.join(",") ?? ""}
      style={{ position: "relative", height: "100%", minHeight: 0, ...GUTTER_STYLE }}
    >
      <div className="woven-axisbar">
        <div className="woven-axisseg" role="group" aria-label="Arrange canvas">
          <button type="button" className={axis === "objects" ? "on" : ""} aria-pressed={axis === "objects"} onClick={() => m.onWovenAxisChange?.("objects")}>
            Shared work
          </button>
          <button type="button" className={axis === "type" ? "on" : ""} aria-pressed={axis === "type"} onClick={() => m.onWovenAxisChange?.("type")}>
            Work types
          </button>
        </div>
        {m.wovenFocus ? (
          <button type="button" className="woven-clearfocus" onClick={() => m.onWovenSelect?.(null)}>
            Show everything
          </button>
        ) : null}
        {parkedCount ? <span className="woven-parked"><b>{parkedCount}</b> need you</span> : null}
      </div>
      {showReadout ? (
        <FocusedPipelineReadout
          channel={focusedChannel}
          graph={graph}
          connectors={m.connectors}
          result={m.result}
          lane={focusedLane}
          runSummary={m.runSummary ?? null}
          gateOffer={m.gateOffer}
          transportConnected={m.transportConnected}
          running={m.running}
          onOpenAgentProfile={m.onOpenAgentProfile}
        />
      ) : null}
      {!hasLanes ? (
        <div className="terrain-canvas-hint" role="status">
          <strong>Your product-market terrain</strong>
          <span>Start with what Drover found in the product. A pipeline appears only after you choose a move.</span>
          {m.terrainState?.loading ? <small>Reading possible openings…</small>
            : !m.terrainState?.runtimeConnected ? <small>Grounded truth is ready. Connect a runtime to read possible openings.</small>
              : m.terrainState?.error ? <small>{m.terrainState.error}</small>
                : m.terrainState?.hypothesisCount === 0 ? <small>No credible opening was returned yet. Product truth remains available.</small> : null}
        </div>
      ) : null}
      {m.terrainState?.stale || m.terrainState?.partial ? (
        <div className="terrain-state-note" role="status">
          {m.terrainState.stale ? "Terrain updated; the model read is stale against newer product or market evidence." : "Some terrain sources are unavailable; loaded truth remains usable."}
        </div>
      ) : null}
      <GraphCanvas
        connectors={m.connectors}
        contractAudits={m.contractAudits}
        graph={graph}
        proposedNodeIds={m.proposedNodeIds}
        proposedEdgeIds={m.proposedEdgeIds}
        revealedNodeIds={m.revealedNodeIds}
        proposalActive={m.proposalActive}
        onResolveProposal={m.onResolveProposal}
        onSubmitReview={m.onSubmitReview}
        gatePromote={m.gatePromote}
        gateOffer={m.gateOffer}
        onRecordOutcome={m.onRecordOutcome}
        onRefineItem={m.onRefineItem}
        onDecideDelta={m.onDecideDelta}
        onAskClaude={m.onAskClaude}
        onOpenAgentProfile={m.onOpenAgentProfile}
        runSummary={m.runSummary}
        onApproveGate={m.onApproveGate}
        onAddNode={m.onAddNode}
        onConnectNodes={m.onConnectNodes}
        onCreateCanvasObject={m.onCreateCanvasObject}
        onConnectCanvasObjects={m.onConnectCanvasObjects}
        onCreateCanvasRegion={m.onCreateCanvasRegion}
        onDeleteEdges={m.onDeleteEdges}
        onNodePositionChange={m.onNodePositionChange}
        onSelect={m.onSelect}
        onPaneClick={m.onPaneClick}
        operatorCursor={m.operatorCursor}
        nodeEditor={m.nodeEditor}
        // Always render the complete fleet. ActiveChannelId changes which lane owns live run/editor state;
        // panTo moves the camera to it without unmounting the surrounding canvas.
        multiPipeline={m.multiPipeline}
        panTo={m.panTo}
        people={m.people}
        panelOpen={false}
        result={m.result}
        running={m.running}
        runningNodeId={m.runningNodeId}
        nodeBeats={m.nodeBeats}
        selection={m.selection}
        subsystemHealth={m.subsystemHealth}
        projectId={m.projectId}
        woven={m.woven}
        wovenAxis={axis}
        wovenFocus={m.wovenFocus}
        onWovenSelect={m.onWovenSelect}
        onCanvasAnchorPositionChange={m.onCanvasAnchorPositionChange}
        onCanvasAuthorityChanged={m.onCanvasAuthorityChanged}
        onCanvasRegionChange={m.onCanvasRegionChange}
        onCanvasRegionArchive={m.onCanvasRegionArchive}
        initialViewport={m.initialViewport}
        onViewportChange={m.onViewportChange}
        onWireObject={m.onWireObject}
        candidateLaneIds={m.candidateLaneIds}
        onPickCandidate={m.onPickCandidate}
      />
      {graph.nodes.length === 0 && !hasLanes ? (
        <div className="blank-channel-guide">
          <strong>Start with something you want to understand, change, make, or learn</strong>
          <span>Your work appears here. Add an executable path only when the work needs to run or repeat. Nothing sends without your approval.</span>
          {m.onComposeFirst ? (
            <button type="button" className="blank-channel-compose" onClick={m.onComposeFirst}>
              Start open work
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function GtmCanvas({
  model,
}: {
  model: GtmCanvasModel;
}) {
  return <UnifiedCanvas model={model} />;
}
