import { GraphCanvas, type OperatorCursorState } from "@/components/GraphCanvas";
import type { NodeEditorBridge } from "@/components/nodeEditorBridge";
import type { GatePromote } from "@/lib/gateItem";
import { CanvasShell, type LensDef, type LensProps } from "@/components/canvas/CanvasShell";
import { ObjectGraphCanvas } from "@/components/ObjectGraphCanvas";
import type { GateBag } from "@/lib/gateItem";
import type { CanvasSubject } from "@/lib/cardDetail";
import type {
  ChannelFeed, ChannelMeta, Claim, ConnectorMeta, DirectedFeed, GateDecision, GtmExperiment, GTMContractAudit, GTMGraph, GTMItem, GTMNode,
  GTMRunResult, NodeSelection, Person,
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
  onNodePositionChange?: (nodeId: string, position: { x: number; y: number }) => void;
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
  // The attached-composer tie for the object graph: selecting a block hands its identity — and its full
  // card face (tone, evidence, related, weakness) — up so the composer BECOMES that card. Null on deselect.
  onObjectSelect?: (subject: CanvasSubject | null) => void;
  // The composer's current subject id, fed back so selection and the attached composer clear together.
  subjectId?: string | null;
  // The per-card "+" seam: the object graph hands up which card the founder wants the next move off (and
  // a plain target); the host runs the real ideate and renders the decidable candidates in the composer.
  // `ideatingNodeId` lights that card blue-violet while the call runs; `objectGraphReload` bumps after a
  // candidate is added so the fresh draft card appears joined to its source.
  onIdeateObject?: (source: { id: string; label: string; type: string }, target: string) => void;
  ideatingNodeId?: string | null;
  ideatingTarget?: string | null;
  objectGraphReload?: number;
  // The mode switcher drives the object graph's arrangement: Move → the story bands ("stages"),
  // Engineer → the free causal graph ("flow"). Steers only on change (see ObjectGraphCanvas).
  desiredArrange?: "stages" | "flow";
  // The mode pill owns the arrangement, so the object graph hides its redundant in-header toggle.
  modeControlled?: boolean;
};

type GtmLensProps = LensProps<GtmCanvasModel, never>;

// The left gutter the product-entry column occupies, published by ProductEntryColumn as --pentry-gutter
// (0 when that column isn't mounted). Both lens panes pad their left edge by it so the canvas starts to
// the RIGHT of the column — no node renders under it, and the column can't intercept a node's click.
const GUTTER_STYLE = { paddingLeft: "var(--pentry-gutter, 0px)", transition: "padding-left 180ms ease" } as const;

function ObjectGraphLens({ model: m }: GtmLensProps) {
  return (
    <div style={{ height: "100%", minHeight: 0, ...GUTTER_STYLE }}>
      <ObjectGraphCanvas projectId={m.projectId} gate={m.gate} onRecordOutcome={m.onRecordOutcome} onSubjectChange={m.onObjectSelect} subjectId={m.subjectId ?? null} desiredArrange={m.desiredArrange} modeControlled={m.modeControlled} onIdeateObject={m.onIdeateObject} ideatingNodeId={m.ideatingNodeId ?? null} ideatingTarget={m.ideatingTarget ?? null} reloadSignal={m.objectGraphReload ?? 0} />
    </div>
  );
}

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

// Two founder modes: MOVE (the object graph in its story bands — the reasoning, the doing surface) and
// ENGINEER (the executable pipeline node canvas — where agents, tools, and data sources are dropped,
// wired, and organized). Move answers "why this move"; Engineer is the machinery that runs it. The old
// "Trace"/"Flow" tabs and the reasoning/steps split inside Engineer are gone — Engineer is now just the
// node canvas. "Learn" is retired as a selectable mode (LearningsLens is left in the tree for reuse);
// the old "Ground" overview lens was likewise retired from the pill.
const LENSES: LensDef<GtmCanvasModel, never>[] = [
  { id: "object-graph", label: "Move", Component: ObjectGraphLens },
  { id: "engineer", label: "Engineer", Component: EngineerLens },
];

export function GtmCanvas({
  model, activeLensId, chromeless,
}: {
  model: GtmCanvasModel;
  // The altitude is CONTROLLED by channel state, derived inline by the host. App reuses ONE GtmCanvas
  // instance across both branches, so the lens must be a controlled prop: an uncontrolled default only
  // seeds the shell's state once and would strand the reused instance on the stale lens when it flips.
  activeLensId: "object-graph" | "engineer";
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
