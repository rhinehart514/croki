import { GraphCanvas, type OperatorCursorState } from "@/components/GraphCanvas";
import type { NodeEditorBridge } from "@/components/nodeEditorBridge";
import type { GatePromote } from "@/lib/gateItem";
import { CanvasShell, type LensDef, type LensProps } from "@/components/canvas/CanvasShell";
import { ObjectGraphCanvas } from "@/components/ObjectGraphCanvas";
import type { GateBag } from "@/lib/gateItem";
import { GroundLens } from "@/components/lenses/GroundLens";
import { BeliefSpine } from "@/components/lenses/BeliefSpine";
import { useGround, type IcpGrouping } from "@/lib/groundModel";
import { useBoard } from "@/lib/boardModel";
import type {
  ChannelFeed, ChannelMeta, Claim, ConnectorMeta, DirectedFeed, GateDecision, GtmExperiment, GTMContractAudit, GTMGraph, GTMNode,
  GTMRunResult, NodeSelection, Person,
} from "@/types";

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
  onAskClaude?: (node: GTMNode) => void;
  onApproveGate?: (nodeId: string) => void;
  onAddNode?: (spec: Partial<GTMNode> & { label: string }) => void;
  onConnectNodes?: (source: string, target: string) => void;
  onDeleteEdges?: (edgeIds: string[]) => void;
  onNodePositionChange?: (nodeId: string, position: { x: number; y: number }) => void;
  onOpenLibrary?: () => void;
  nodeEditor?: NodeEditorBridge | null;
  // The literal one-coordinate-space unification: every other pipeline's graph, so channel-flow
  // renders ALL of them as lanes in one canvas instead of swapping which one is on screen. Absent
  // (or a single channel) behaves exactly like today's single-pipeline canvas.
  multiPipeline?: { channels: ChannelMeta[]; channelGraphs: Map<string, GTMGraph>; channelRunResults: Map<string, GTMRunResult | null> } | null;
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
  // A run paused at its founder gate — its decidable items bloom on the gate node in the object graph.
  gate?: GateBag | null;
};

type GtmLensProps = LensProps<GtmCanvasModel, never>;

function ObjectGraphLens({ model: m }: GtmLensProps) {
  return <ObjectGraphCanvas projectId={m.projectId} gate={m.gate} />;
}

// ── channel-flow: GraphCanvas, unchanged. Forwards App's prop bag straight through. ──
// The ground overview's Channels cluster and the direct top-level pipeline entry both mount this SAME
// merged canvas — either path lands you in the identical component, never a different page.
// A stable empty graph for the landing of a product with nothing wired yet: the same node canvas
// renders its dotted ground so the founder never lands on a separate page — just an empty flow with a
// compose invitation. A fixed id keeps GraphCanvas's layout memo from thrashing.
const LANDING_EMPTY_GRAPH: GTMGraph = { id: "__landing-empty__", name: "New pipeline", version: "0", nodes: [], edges: [] };

export function ChannelFlowLens({ model: m }: GtmLensProps) {
  // No pipeline wired yet (the landing/overview of a fresh product) → render the empty node canvas with
  // a compose invitation, NOT a ranked-bets page. Once anything is built, the real graph takes over.
  const landing = !m.graph;
  const graph = m.graph ?? LANDING_EMPTY_GRAPH;
  // L1 above L2 in one column: the pipeline's belief spine (the folded-in board, scoped to this one
  // pipeline) rides above its executable flow. The spine is a pure read; it only mounts when a project
  // and a focused channel exist. This is the interim composition until the continuous-zoom LOD backbone
  // replaces the stack with a true altitude transition.
  return (
    <div className="channel-flow-stack" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {m.projectId && m.activeChannelId ? (
        <div className="l1-spine-band" style={{ flex: "0 0 auto", borderBottom: "1px solid var(--line)", overflow: "auto", maxHeight: "42%" }}>
          <BeliefSpine projectId={m.projectId} channelId={m.activeChannelId} />
        </div>
      ) : null}
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
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
          onAskClaude={m.onAskClaude}
          onApproveGate={m.onApproveGate}
          onAddNode={m.onAddNode}
          onConnectNodes={m.onConnectNodes}
          onDeleteEdges={m.onDeleteEdges}
          onNodePositionChange={m.onNodePositionChange}
          onOpenLibrary={m.onOpenLibrary}
          onSelect={m.onSelect}
          onPaneClick={m.onPaneClick}
          operatorCursor={m.operatorCursor}
          nodeEditor={m.nodeEditor}
          multiPipeline={m.multiPipeline}
          panTo={m.panTo}
          people={m.people}
          panelOpen={false}
          result={m.result}
          running={m.running}
          runningNodeId={m.runningNodeId}
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
    </div>
  );
}

// ── L0 ground: the overview landing. The former nine-layer belief board folds INTO the flow — its
// beliefs now surface as each pipeline's state here (L0) and as the per-pipeline spine when a pipeline
// opens (L1, BeliefSpine in ChannelFlowLens). Pipelines are grouped under the ICP they test (one honest
// primary ground today; the ICPs[] shape is already plural for real per-ICP experiments). Conviction is
// ink weight, never hue; the only accent is the amber needs-you pill. ──
function GroundLensWrapper({ model: m }: GtmLensProps) {
  // Read the board for its ICP grouping (the backend embeds icpGrouping on the board payload); this is
  // what splits the ground into real per-ICP bands + arm races instead of one flat primary ground.
  const board = useBoard(m.projectId);
  const boardView = board.status === "ready" ? board.board : null;
  const icpGrouping = (boardView as { icpGrouping?: IcpGrouping } | null)?.icpGrouping ?? null;
  const ground = useGround(m.projectId, m.channels, m.people, m.claims, boardView, icpGrouping);
  return <GroundLens model={ground.model} onOpenChannel={m.onOpenChannel} />;
}

const LENSES: LensDef<GtmCanvasModel, never>[] = [
  { id: "object-graph", label: "GTM graph", Component: ObjectGraphLens },
  // The ground is the LANDING surface (id kept as "board" so the host's controlled altitude prop is
  // unchanged). The former nine-layer belief board is gone as a surface; its confidence signal survives
  // only as the plain per-pipeline state the ground shows.
  { id: "board", label: "Ground", Component: GroundLensWrapper },
  { id: "channel-flow", label: "Pipeline flow", Component: ChannelFlowLens },
];

// Lens metadata (id + label) for the command dock's switcher lives in the sibling `lens-meta.ts`
// (a non-component module) so this file only exports components and fast-refresh stays intact.

export function GtmCanvas({
  model, activeLensId, chromeless,
}: {
  model: GtmCanvasModel;
  // The altitude is CONTROLLED by channel state, derived inline by the host (board on the overview,
  // channel-flow with a channel open) — not stored. App reuses ONE GtmCanvas instance across both
  // branches, so the lens must be a controlled prop: an uncontrolled default only seeds the shell's
  // state once and would strand the reused instance on the stale lens when the branch flips.
  activeLensId: "object-graph" | "board" | "channel-flow";
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
