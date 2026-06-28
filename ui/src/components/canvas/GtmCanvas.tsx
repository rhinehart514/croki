import { GraphCanvas, type OperatorCursorState } from "@/components/GraphCanvas";
import type { NodeEditorBridge } from "@/components/ProgramCanvas";
import { CanvasShell, type LensDef, type LensProps } from "@/components/canvas/CanvasShell";
import { ObjectCard } from "@/components/lenses/shared";
import { PeopleLens } from "@/components/lenses/PeopleLens";
import { ExperimentMatrixLens } from "@/components/lenses/ExperimentMatrixLens";
import { EngineLens } from "@/components/lenses/EngineLens";
import type {
  ChannelFeed, ChannelMeta, Claim, ConnectorMeta, DirectedFeed, GateDecision, GtmExperiment, GTMContractAudit, GTMGraph, GTMNode,
  GTMRunResult, NodeSelection, Person, ProductModelProvenance,
} from "@/types";

// GtmCanvas — GTM mode's instance of the generic CanvasShell. It projects the GTM operational object
// model through two lenses today:
//   - "channel-flow" IS the existing GraphCanvas (one channel's Source → … → Gate → Measure). Single-
//     channel behavior is unchanged — this lens just forwards the same prop bag App used to mount the
//     bare GraphCanvas with.
//   - "portfolio-map" draws every built channel as a tile (status + the shared ICP + the headline
//     claim it inherits), replacing the swimlane OVERVIEW. Clicking a tile opens that channel's flow.
//
// Both lenses live in one shell so the founder switches altitude without leaving the surface. The
// shell's layoutId is "gtm-lens" — distinct from Product mode's "product-lens" so the SlidingTabs
// pills never spring into each other across modes. The People and Experiment-matrix lenses, and
// retiring the swimlane RENDERER inside GraphCanvas, wait for the Person backend (P10.3 steps 4–5).

export type GtmCanvasModel = {
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
  // ── portfolio-map / people / experiment-matrix: the channels + the shared objects they inherit ──
  channels: ChannelMeta[];
  activeChannelId: string | null;
  subsystemHealth: Record<string, { health: number; issue?: string }>;
  icp: Record<string, unknown>;
  // Structured claims (sharedContext.claims) — the source of truth the experiment matrix grids by and
  // the portfolio map reads its headline claim from.
  claims: Claim[];
  // The shared People object (promoted from real runs) and the live experiments — the data the
  // People and Experiment-matrix lenses project.
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
        <strong>No channel open</strong>
        <span>Pick a channel from the portfolio map to open its flow.</span>
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
          <strong>Shape this channel from the outcome backward</strong>
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

// A channel's status → the verdict pill the tile carries. A failed or errored channel reads as a
// guess (amber, off the solid ramp); anything else reads as grounded real state (green).
function channelVerdict(ch: ChannelMeta): ProductModelProvenance {
  if (ch.status === "error" || ch.lastRunOk === false) return "speculative";
  return "derived";
}

const STATUS_LABEL: Record<ChannelMeta["status"], string> = {
  idle: "idle",
  error: "error",
  done: "done",
  waiting: "waiting at gate",
};

// ── portfolio-map: every built channel as a tile, the swimlane overview's replacement. ──
function PortfolioMapLens({ model: m }: GtmLensProps) {
  const tiles = m.channels.filter((ch) => ch.nodeCount > 0);
  const icpLabel = readable(m.icp);
  const claimLabel = readable(m.claims[0]);

  // Overall health for the channel currently open, averaged from its real subsystem health. Only the
  // active channel has live engine signal here, so other tiles read their status instead of a number.
  const healthValues = Object.values(m.subsystemHealth).map((s) => s.health).filter((h) => typeof h === "number");
  const activeHealth = healthValues.length
    ? Math.round(healthValues.reduce((a, b) => a + b, 0) / healthValues.length)
    : null;

  if (!tiles.length) {
    return (
      <div className="canvas-empty">
        <strong>No channels yet</strong>
        <span>Build a channel and it shows up here as a tile in the portfolio.</span>
      </div>
    );
  }

  return (
    <div className="portfolio-map">
      {(icpLabel || claimLabel) && (
        <div className="portfolio-head">
          {icpLabel && (
            <div className="portfolio-head-row">
              <span className="portfolio-head-eyebrow">ICP</span>
              <span className="portfolio-head-value">{icpLabel}</span>
            </div>
          )}
          {claimLabel && (
            <div className="portfolio-head-row">
              <span className="portfolio-head-eyebrow">Claim</span>
              <span className="portfolio-head-value">{claimLabel}</span>
            </div>
          )}
        </div>
      )}
      <div className="portfolio-grid">
        {tiles.map((ch) => {
          const active = ch.id === m.activeChannelId;
          const states = [{ id: "status", label: STATUS_LABEL[ch.status] }];
          if (ch.pendingGates > 0) states.push({ id: "gates", label: `${ch.pendingGates} at gate` });
          return (
            <ObjectCard
              key={ch.id}
              kind="channel"
              name={ch.name}
              summary={ch.objective}
              provenance={channelVerdict(ch)}
              states={states}
              hasSignal={ch.runCount > 0}
              selected={active}
              onSelect={() => m.onOpenChannel(ch.id)}
              footer={
                <div className="portfolio-tile-foot">
                  <span>{ch.runCount} run{ch.runCount === 1 ? "" : "s"}</span>
                  {active && activeHealth != null && <span>{activeHealth}% healthy</span>}
                </div>
              }
            />
          );
        })}
      </div>
    </div>
  );
}

// ── engine: the whole go-to-market as one canvas — channels as nodes, feeds between them. ──
function EngineLensWrapper({ model: m }: GtmLensProps) {
  return (
    <EngineLens
      channels={m.channels}
      channelFeeds={m.channelFeeds}
      directedFeeds={m.directedFeeds}
      activeChannelId={m.activeChannelId}
      onDeriveChannel={m.onDeriveChannel}
      onOpenChannel={m.onOpenChannel}
    />
  );
}

// ── people: the shared People object and their cross-channel appearances (find-references). ──
// Uses the shell's cross-lens selection (selected/onSelect) so a person stays lit across lenses.
function PeopleLensWrapper({ model: m, selected, onSelect }: GtmLensProps) {
  return <PeopleLens people={m.people} channels={m.channels} selected={selected} onSelect={onSelect} />;
}

// ── experiment-matrix: ICP × claim × channel grid of live hypotheses. ──
function ExperimentMatrixLensWrapper({ model: m, selected, onSelect }: GtmLensProps) {
  return (
    <ExperimentMatrixLens
      experiments={m.experiments}
      claims={m.claims}
      icp={m.icp}
      channels={m.channels}
      selected={selected}
      onSelect={onSelect}
    />
  );
}

const LENSES: LensDef<GtmCanvasModel, never>[] = [
  { id: "channel-flow", label: "Channel flow", Component: ChannelFlowLens },
  { id: "engine", label: "Engine", Component: EngineLensWrapper },
  { id: "portfolio-map", label: "Portfolio map", Component: PortfolioMapLens },
  { id: "people", label: "People", Component: PeopleLensWrapper },
  { id: "experiment-matrix", label: "Experiment matrix", Component: ExperimentMatrixLensWrapper },
];

// Lightweight lens metadata (id + label) so the single command dock can render the GTM switcher.
export const GTM_LENS_META = LENSES.map((l) => ({ id: l.id, label: l.label }));

export function GtmCanvas({
  model, defaultLensId = "channel-flow", activeLensId, onLensChange, chromeless,
}: {
  model: GtmCanvasModel;
  defaultLensId?: "channel-flow" | "portfolio-map" | "engine";
  activeLensId?: string;
  onLensChange?: (id: string) => void;
  chromeless?: boolean;
}) {
  return (
    <CanvasShell<GtmCanvasModel, never>
      model={model}
      lenses={LENSES}
      defaultLensId={defaultLensId}
      layoutId="gtm-lens"
      isEmpty={false}
      empty={null}
      activeLensId={activeLensId}
      onLensChange={onLensChange}
      chromeless={chromeless}
    />
  );
}
