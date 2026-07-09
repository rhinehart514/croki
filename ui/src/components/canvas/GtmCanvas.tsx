import { GraphCanvas, type OperatorCursorState } from "@/components/GraphCanvas";
import type { NodeEditorBridge } from "@/components/nodeEditorBridge";
import type { GatePromote } from "@/lib/gateItem";
import type { WovenAxis, WovenFocus } from "@/lib/wovenOverlay";
import { CanvasShell, type LensDef, type LensProps } from "@/components/canvas/CanvasShell";
import type {
  ChannelFeed, ChannelMeta, Claim, ConnectorMeta, DirectedFeed, GateDecision, GateDeltaDecision, GtmExperiment, GTMContractAudit, GTMGraph, GTMItem, GTMNode,
  GTMRunResult, NodeSelection, OperatingView, Person, WovenGraph,
} from "@/types";
import type { RunSummary } from "@/api";

// GtmCanvas — GTM mode's instance of the generic CanvasShell. It projects the GTM operational object
// model through two lenses, chosen by channel state alone (no in-canvas switcher):
//   - "channel-flow" IS the existing GraphCanvas (one channel's Source → … → Gate → Measure). Single-
//     channel behavior is unchanged — this lens just forwards the same prop bag App used to mount the
//     bare GraphCanvas with.
//   - "engine" is the single GTM OVERVIEW: every built channel as a node in one network, the feeds
//     between them, and the shared ICP/claim context header. An earlier separate channel-grid
//     tile view was merged into this lens (its only unique value was the context header), so there is
//     one overview altitude, not two near-identical ones.
//
// People and Experiments are reached as summoned cards in App, not as lenses here. The shell's
// layoutId is "gtm-lens" — distinct from Product mode's "product-lens" so the SlidingTabs pills never
// spring into each other across modes.

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
  // The outcome door on an approved gate card — record what came back on a sent item. Both lenses use
  // it: the Engineer lens threads it into GraphCanvas, the Move lens rides it on the gate bag.
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
  // ── Operator lens: the ONE operating view over the whole fleet (Area 6) ──
  // The cross-fleet read the Operator lens renders. Null before the first read resolves. This lens is the
  // default many-motion view; the Engineer lens stays the single-motion editor.
  operatingView?: OperatingView | null;
  // Fly to a parked run's real gate — the one click that opens the founder gate for a pulsing lane.
  onFlyToGate?: (target: { decisionId: string; sessionId: string | null; pipelineId: string | null; channelId: string }) => void;
  // Open a lane's pipeline in the Engineer lens (the single-motion editor) — a quiet route, never forced.
  onOpenLane?: (channelId: string) => void;
  // ── The intertwined canvas (docs/INTERTWINED-CANVAS.md) — the Operator lens IS the woven canvas ──
  // The woven projection over the same lanes + objects (object chips, tie edges, kind clusters), attached to
  // the operating view by the backend. The Operator lens renders it as one GraphCanvas over the merged lanes.
  woven?: WovenGraph | null;
  // The projection axis (objects = the moat view, type = the spread/forms view) and the focus-to-trace
  // selection — pure view state the host owns so the toggle persists across renders.
  wovenAxis?: WovenAxis;
  wovenFocus?: WovenFocus;
  onWovenAxisChange?: (axis: WovenAxis) => void;
  onWovenSelect?: (focus: WovenFocus) => void;
  // Drag-to-wire a step onto an object chip / kind region — a composer steer, filled in by the crew.
  onWireObject?: (sourceStepId: string, targetId: string) => void;
  // Candidate lanes folded into the woven graph (docs/INTERTWINED-CANVAS.md decision 4) — the retired
  // candidate board. Synthetic channel ids in multiPipeline rendered as dashed proposed lanes; picking one
  // commits it live.
  candidateLaneIds?: Set<string>;
  onPickCandidate?: (channelId: string) => void;
};

type GtmLensProps = LensProps<GtmCanvasModel, never>;

// The left gutter the product-entry column occupies, published by ProductEntryColumn as --pentry-gutter
// (0 when that column isn't mounted). Both lens panes pad their left edge by it so the canvas starts to
// the RIGHT of the column — no node renders under it, and the column can't intercept a node's click.
const GUTTER_STYLE = { paddingLeft: "var(--pentry-gutter, 0px)", transition: "padding-left 180ms ease" } as const;

// ENGINEER — the pipeline builder. This is where the founder drops agents, tools, and data sources and
// wires them into an executable pipeline: the node canvas (GraphCanvas), one pipeline's Source → … →
// Gate → Measure, full-bleed and laid out left-to-right by causal depth. No story bands and no belief
// spine here — the "why" lives in Move; Engineer is the machinery, where every input and data source
// reads as its own node with its own grounding. A focused pipeline fills the canvas so you can build it;
// the All-pipelines overview stacks every pipeline as a lane so you can organize the whole set.
// A stable empty graph for the landing of a product with nothing wired yet: the same node canvas renders
// its dotted ground so the founder never lands on a separate page — just an empty flow with a compose
// invitation. A fixed id keeps GraphCanvas's layout memo from thrashing.
const LANDING_EMPTY_GRAPH: GTMGraph = { id: "__landing-empty__", name: "New pipeline", version: "0", nodes: [], edges: [] };

function EngineerLens({ model: m }: GtmLensProps) {
  // No pipeline wired yet (the landing of a fresh product) → render the empty node canvas with a compose
  // invitation, NOT a ranked-bets page. Once anything is built, the real graph takes over.
  const landing = !m.graph;
  const graph = m.graph ?? LANDING_EMPTY_GRAPH;
  // Merge every pipeline into stacked lanes ONLY at the overview (no pipeline focused). Once a pipeline
  // is focused, drop the merge so that ONE pipeline fills the canvas at a readable size — the old
  // always-merged mount rendered a focused pipeline as a cramped lane crushed among the others.
  const multiPipeline = m.activeChannelId ? null : m.multiPipeline;
  return (
    <div className="engineer-lens" style={{ position: "relative", height: "100%", minHeight: 0, ...GUTTER_STYLE }}>
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
        onDeleteEdges={m.onDeleteEdges}
        onNodePositionChange={m.onNodePositionChange}
        onSelect={m.onSelect}
        onPaneClick={m.onPaneClick}
        operatorCursor={m.operatorCursor}
        nodeEditor={m.nodeEditor}
        multiPipeline={multiPipeline}
        panTo={m.panTo}
        people={m.people}
        panelOpen={false}
        result={m.result}
        running={m.running}
        runningNodeId={m.runningNodeId}
        nodeBeats={m.nodeBeats}
        selection={m.selection}
        subsystemHealth={m.subsystemHealth}
      />
      {graph.nodes.length === 0 ? (
        <div className="blank-channel-guide">
          <strong>{landing ? "Start your first pipeline" : "Tell Claude what this pipeline should accomplish"}</strong>
          <span>Describe the outcome you want and Claude composes the steps that reach it, stopping at your gate. Nothing has been chosen for you, and nothing sends without you.</span>
          {landing && m.onComposeFirst ? (
            <button type="button" className="blank-channel-compose" onClick={m.onComposeFirst}>
              State a go-to-market goal
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// OPERATOR — the INTERTWINED CANVAS (docs/INTERTWINED-CANVAS.md). The whole fleet as ONE woven graph:
// every motion still a lane in one grammar, but now the shared objects are drawn once ON the canvas as
// chips with tie edges converging from the steps that touched them — the intertwining drawn once, where the
// threads meet. The old three-region OperatorLens (stacked lanes + a separate shared-map band + the
// candidate board) collapses into this single surface: candidates are dashed lanes, the shared map is the
// object chips, and the type-axis forms map is one toggle away. It reuses GraphCanvas's React Flow engine,
// the merged-lane layout, the parked-gate pulse + fly-to, and every editing handler — a lane is a real
// editable graph, and every edit re-derives the projection so new touches draw new ties live. The gate is
// absolute through every edit. Two altitudes: the object axis (the moat view) and the type axis (the
// forms/spread view); semantic zoom fans clusters into lanes as you zoom in.
function OperatorLensPane({ model: m }: GtmLensProps) {
  // Nothing wired yet → the compose invitation on the empty node ground, never empty scaffolding. The
  // woven canvas has nothing to weave with no lanes.
  const hasLanes = (m.operatingView?.lanes.length ?? 0) > 0 || m.channels.length > 0;
  if (m.operatingView && !hasLanes) {
    return (
      <div className="operator-lens-pane" style={{ position: "relative", height: "100%", minHeight: 0, ...GUTTER_STYLE }}>
        <div className="blank-channel-guide">
          <strong>Your operation lives here</strong>
          <span>
            Every go-to-market motion you run shows up as a lane on one canvas — outbound, pages minted from
            your data, product changes — with the people, places, and pages they share drawn once where the
            motions cross. State a goal and the first motion appears. Nothing sends without you.
          </span>
          {m.onComposeFirst ? (
            <button type="button" className="blank-channel-compose" onClick={m.onComposeFirst}>
              State a go-to-market goal
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const axis = m.wovenAxis ?? "objects";
  // The parked lane count — surfaced on the axis bar so a waiting decision is never buried under the map.
  const parkedCount = (m.operatingView?.lanes ?? []).filter((l) => l.runState === "parked").length;
  return (
    <div className="operator-lens-pane" style={{ position: "relative", height: "100%", minHeight: 0, ...GUTTER_STYLE }}>
      {/* The one axis toggle — by shared objects (the moat) vs by GTM type (the forms/spread). Pure view
          state; selection persists across it. The parked chip rides here so a needs-you decision is always
          visible above the canvas. Opaque chrome, monochrome — the only color is the parked state. */}
      <div className="woven-axisbar">
        <div className="woven-axisseg" role="group" aria-label="Canvas axis">
          <button type="button" className={axis === "objects" ? "on" : ""} aria-pressed={axis === "objects"} onClick={() => m.onWovenAxisChange?.("objects")}>
            By shared objects
          </button>
          <button type="button" className={axis === "type" ? "on" : ""} aria-pressed={axis === "type"} onClick={() => m.onWovenAxisChange?.("type")}>
            By GTM type
          </button>
        </div>
        {m.wovenFocus ? (
          <button type="button" className="woven-clearfocus" onClick={() => m.onWovenSelect?.(null)}>
            Clear focus
          </button>
        ) : null}
        {parkedCount ? <span className="woven-parked"><b>{parkedCount}</b> need you</span> : null}
      </div>
      <GraphCanvas
        connectors={m.connectors}
        contractAudits={m.contractAudits}
        graph={m.graph ?? LANDING_EMPTY_GRAPH}
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
        onDeleteEdges={m.onDeleteEdges}
        onNodePositionChange={m.onNodePositionChange}
        onSelect={m.onSelect}
        onPaneClick={m.onPaneClick}
        operatorCursor={m.operatorCursor}
        nodeEditor={m.nodeEditor}
        // The whole fleet as merged lanes — the substrate the woven overlay hangs on.
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
        // The intertwining itself.
        woven={m.woven}
        wovenAxis={axis}
        wovenFocus={m.wovenFocus}
        onWovenSelect={m.onWovenSelect}
        onWireObject={m.onWireObject}
        candidateLaneIds={m.candidateLaneIds}
        onPickCandidate={m.onPickCandidate}
      />
    </div>
  );
}

// Two lenses now: OPERATOR (the fleet-wide operating view — the default many-motion view) and ENGINEER
// (the single-motion pipeline builder). The old merged-lane overview retired into the Operator lens; the
// drag-organize it hosted now lives in the Operator lens's lane ordering. App chooses which lens by focus:
// a focused single motion shows Engineer, the whole operation shows Operator.
const LENSES: LensDef<GtmCanvasModel, never>[] = [
  { id: "operator", label: "Operator", Component: OperatorLensPane },
  { id: "engineer", label: "Engineer", Component: EngineerLens },
];

export function GtmCanvas({
  model, activeLensId, chromeless,
}: {
  model: GtmCanvasModel;
  // "operator" = the fleet-wide operating view (default many-motion); "engineer" = the single-motion editor.
  activeLensId: "operator" | "engineer";
  chromeless?: boolean;
}) {
  return (
    <CanvasShell<GtmCanvasModel, never>
      model={model}
      lenses={LENSES}
      defaultLensId={activeLensId}
      activeLensId={activeLensId}
      layoutId="gtm-lens"
      isEmpty={false}
      empty={null}
      chromeless={chromeless}
    />
  );
}
