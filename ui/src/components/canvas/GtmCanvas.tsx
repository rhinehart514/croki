import { useState } from "react";
import { GraphCanvas, type OperatorCursorState } from "@/components/GraphCanvas";
import type { NodeEditorBridge } from "@/components/nodeEditorBridge";
import type { GatePromote } from "@/lib/gateItem";
import { CanvasShell, type LensDef, type LensProps } from "@/components/canvas/CanvasShell";
import { ObjectGraphCanvas } from "@/components/ObjectGraphCanvas";
import type { GateBag } from "@/lib/gateItem";
import type { CanvasSubject } from "@/lib/cardDetail";
import { BeliefSpine } from "@/components/lenses/BeliefSpine";
import type { CockpitState } from "@/api";
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
  // The five-primitive founder state (goal, beliefs, last run, learnings). Retained on the model for
  // reuse; no lens mounts it now that Learn is retired as a mode (the host reads the same cockpit for
  // its floating Best Next Move hero and the "log what happened" chip). Null before a product is open.
  cockpit?: CockpitState | null;
};

type GtmLensProps = LensProps<GtmCanvasModel, never>;

function ObjectGraphLens({ model: m }: GtmLensProps) {
  return <ObjectGraphCanvas projectId={m.projectId} gate={m.gate} onSubjectChange={m.onObjectSelect} subjectId={m.subjectId ?? null} desiredArrange={m.desiredArrange} modeControlled={m.modeControlled} onIdeateObject={m.onIdeateObject} ideatingNodeId={m.ideatingNodeId ?? null} ideatingTarget={m.ideatingTarget ?? null} reloadSignal={m.objectGraphReload ?? 0} />;
}

// ENGINEER — the deeper of the two founder modes. Its primary face is the causal reasoning graph: the
// same object graph in its free "flow" arrangement (driven by the mode's desiredArrange="flow"), where
// the founder reads WHY the recommended move follows from the product and market picture, with each
// connection labelled by its verb so a stroke reads as a claim. A quiet Reasoning / Steps switch reveals
// the same work as its executable step chain (the old top-level "Flow" view, the cleanest per the
// audit) folded in here — so the runnable machinery lives one click from the reasoning instead of in a
// third redundant tab.
function EngineerLens(props: GtmLensProps) {
  const [face, setFace] = useState<"reasoning" | "steps">("reasoning");
  return (
    <div className="engineer-lens">
      <div className="engineer-face-switch" role="group" aria-label="Engineer view">
        <button type="button" className={face === "reasoning" ? "active" : ""} onClick={() => setFace("reasoning")}>
          Reasoning
        </button>
        <button type="button" className={face === "steps" ? "active" : ""} onClick={() => setFace("steps")}>
          Steps
        </button>
      </div>
      {face === "reasoning" ? <ObjectGraphLens {...props} /> : <ChannelFlowLens {...props} />}
    </div>
  );
}

// ── channel-flow: GraphCanvas, unchanged. Forwards App's prop bag straight through. ──
// The ground overview's Channels cluster and the direct top-level pipeline entry both mount this SAME
// merged canvas — either path lands you in the identical component, never a different page.
// A stable empty graph for the landing of a product with nothing wired yet: the same node canvas
// renders its dotted ground so the founder never lands on a separate page — just an empty flow with a
// compose invitation. A fixed id keeps GraphCanvas's layout memo from thrashing.
const LANDING_EMPTY_GRAPH: GTMGraph = { id: "__landing-empty__", name: "New pipeline", version: "0", nodes: [], edges: [] };

function ChannelFlowLens({ model: m }: GtmLensProps) {
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

// Two founder modes, not four: MOVE (the object graph in its story bands, the doing surface) and
// ENGINEER (the causal reasoning graph, with the executable step chain folded in behind a Reasoning /
// Steps switch). The former "Trace" and "Flow" tabs are subsumed into Engineer; "Learn" is retired as a
// selectable mode (it re-rendered the cockpit read-only and could contradict Move on confidence — the
// LearningsLens component is left in the tree for reuse, just not mounted here). The old "Ground"
// overview lens was likewise retired from the pill; GroundLens.tsx is kept in the tree for reuse.
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
