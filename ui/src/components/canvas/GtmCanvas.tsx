import { GraphCanvas, type OperatorCursorState } from "@/components/GraphCanvas";
import type { NodeEditorBridge } from "@/components/nodeEditorBridge";
import { CanvasShell, type LensDef, type LensProps } from "@/components/canvas/CanvasShell";
import { EngineLens } from "@/components/lenses/EngineLens";
import { GtmBoardLens } from "@/components/lenses/GtmBoard";
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
  onApproveGate?: (nodeId: string) => void;
  onAddNode?: (spec: Partial<GTMNode> & { label: string }) => void;
  onConnectNodes?: (source: string, target: string) => void;
  onDeleteEdges?: (edgeIds: string[]) => void;
  onLoadRecipe?: () => void;
  onNodePositionChange?: (nodeId: string, position: { x: number; y: number }) => void;
  onOpenLibrary?: () => void;
  nodeEditor?: NodeEditorBridge | null;
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
};

type GtmLensProps = LensProps<GtmCanvasModel, never>;

// ── channel-flow: GraphCanvas, unchanged. Forwards App's prop bag straight through. ──
function ChannelFlowLens({ model: m }: GtmLensProps) {
  if (!m.graph) {
    return (
      <div className="canvas-empty">
        <strong>No pipeline open</strong>
        <span>Pick a pipeline from the overview to open its flow.</span>
      </div>
    );
  }
  return (
    <>
      <GraphCanvas
        connectors={m.connectors}
        contractAudits={m.contractAudits}
        graph={m.graph}
        proposedNodeIds={m.proposedNodeIds}
        proposedEdgeIds={m.proposedEdgeIds}
        revealedNodeIds={m.revealedNodeIds}
        proposalActive={m.proposalActive}
        onResolveProposal={m.onResolveProposal}
        onSubmitReview={m.onSubmitReview}
        onApproveGate={m.onApproveGate}
        onAddNode={m.onAddNode}
        onConnectNodes={m.onConnectNodes}
        onDeleteEdges={m.onDeleteEdges}
        onLoadRecipe={m.onLoadRecipe}
        onNodePositionChange={m.onNodePositionChange}
        onOpenLibrary={m.onOpenLibrary}
        onSelect={m.onSelect}
        onPaneClick={m.onPaneClick}
        operatorCursor={m.operatorCursor}
        nodeEditor={m.nodeEditor}
        people={m.people}
        panelOpen={false}
        result={m.result}
        running={m.running}
        runningNodeId={m.runningNodeId}
        selection={m.selection}
        subsystemHealth={m.subsystemHealth}
      />
      {m.graph.nodes.length === 0 ? (
        <div className="blank-channel-guide">
          <strong>Shape this pipeline from the outcome backward</strong>
          <span>Tell Claude what this motion should accomplish, or add the first node yourself. Nothing has been chosen for you.</span>
        </div>
      ) : null}
    </>
  );
}

// Pull a readable line out of the loosely-typed shared ICP / claim bags so a tile shows real words,
// never "[object Object]". Tries the common label keys in priority order; returns null if nothing fits.
function readable(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const k of ["label", "name", "segment", "title", "who", "summary", "statement", "claim", "text", "description"]) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

// ── engine: the whole go-to-market as one canvas — channels as nodes, feeds between them, and the
// shared ICP/claim context header folded in. The single GTM overview (a former channel-grid tile
// view was merged in: its only unique value was this context header). ──
function EngineLensWrapper({ model: m }: GtmLensProps) {
  return (
    <EngineLens
      channels={m.channels}
      channelFeeds={m.channelFeeds}
      directedFeeds={m.directedFeeds}
      activeChannelId={m.activeChannelId}
      onDeriveChannel={m.onDeriveChannel}
      onOpenChannel={m.onOpenChannel}
      icpLabel={readable(m.icp)}
      claimLabel={readable(m.claims[0])}
    />
  );
}

const LENSES: LensDef<GtmCanvasModel, never>[] = [
  // The board is the LANDING surface — semantic-zoom home of the nine belief layers. The other GTM
  // lenses stay reachable (channel state still drives channel-flow); full tab removal lands later.
  { id: "board", label: "Board", Component: GtmBoardLens },
  { id: "channel-flow", label: "Pipeline flow", Component: ChannelFlowLens },
  { id: "engine", label: "Engine", Component: EngineLensWrapper },
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
  activeLensId: "board" | "channel-flow" | "engine";
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
