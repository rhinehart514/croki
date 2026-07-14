// FirmLens.tsx — the canvas as a pure view over crew + bets + wall + market returns (FIRM-SPEC.md
// "The one lens"). Reads brain/src/firm/lens.mjs's projection and renders it; the only thing this
// surface writes back is placement (drag position), through a founder-facing PUT with optimistic
// compareAndSet. No DAG layout, no node-kind registry, no lanes: crew and bets are the only two node
// types, and a bet renders whatever it carries without switching on a closed vocabulary.
//
// Divergence stays below the fold: far zoom shows the crew and their active bet clusters; near zoom
// shows one bet's own card — evidence, staged count, latest outcome. The wall renders as one calm band
// the founder pulls open to review.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, ReactFlow, type Edge, type Node, type NodeTypes, applyNodeChanges } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, ChevronUp } from "lucide-react";
import { decideWallItem, getLens, getWallQueue, putPlacement, type WallDecision, type WallQueueItemView } from "@/api";
import { canvasRenderingPolicy } from "@/lib/canvasPerformance";
import { crewAnchorKey, betAnchorKey, fallbackPositions, type LensAnchorKey } from "@/lib/lensLayout";
import { CanvasVisibilityGuard, MeasureGuard, ViewportRestorer } from "./lensCanvasGuards";
import { CrewNode, type CrewNodeData } from "./CrewNode";
import { BetNode, type BetNodeData } from "./BetNode";
import { FirmLensOutline } from "./FirmLensOutline";
import { FirmWallReview } from "./FirmWallReview";
import type { FirmBet, FirmLens as FirmLensPayload } from "@/types";
import "@/styles/firm-lens.css";

const NODE_TYPES: NodeTypes = { crew: CrewNode, bet: BetNode };
const FIT_OPTIONS = { padding: 0.2, maxZoom: 1.1 };

function buildNodes(lens: FirmLensPayload, positions: Record<string, { x: number; y: number }>): Node[] {
  const nodes: Node[] = [];
  const workingRefs = new Set(
    lens.bets.filter((bet) => bet.position === "live").map((bet) => bet.teammateRef).filter(Boolean),
  );
  for (const member of lens.crew) {
    nodes.push({
      id: crewAnchorKey(member.ref),
      type: "crew",
      position: positions[crewAnchorKey(member.ref)] ?? { x: 0, y: 0 },
      data: { crew: member, working: workingRefs.has(member.ref) } satisfies CrewNodeData,
      draggable: true,
    });
  }
  for (const bet of lens.bets) {
    nodes.push({
      id: betAnchorKey(bet.id),
      type: "bet",
      position: positions[betAnchorKey(bet.id)] ?? { x: 0, y: 0 },
      data: { bet } satisfies BetNodeData,
      draggable: true,
    });
  }
  return nodes;
}

function buildEdges(bets: FirmBet[]): Edge[] {
  const byId = new Map(bets.map((bet) => [bet.id, bet]));
  const edges: Edge[] = [];
  for (const bet of bets) {
    if (bet.teammateRef) {
      edges.push({
        id: `crew-${bet.teammateRef}-${bet.id}`,
        source: crewAnchorKey(bet.teammateRef),
        target: betAnchorKey(bet.id),
        style: { stroke: "var(--line-2)" },
      });
    }
    if (bet.forkedFrom && byId.has(bet.forkedFrom)) {
      edges.push({
        id: `fork-${bet.forkedFrom}-${bet.id}`,
        source: betAnchorKey(bet.forkedFrom),
        target: betAnchorKey(bet.id),
        style: { stroke: "var(--ghost)", strokeDasharray: "3 3" },
      });
    }
  }
  return edges;
}

export function FirmLens({ ventureId }: { ventureId: string }) {
  const [lens, setLens] = useState<FirmLensPayload | null>(null);
  const [wallQueue, setWallQueue] = useState<WallQueueItemView[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [wallOpen, setWallOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<LensAnchorKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const placementRevisionRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const [{ lens: payload }, { queue }] = await Promise.all([getLens(ventureId), getWallQueue(ventureId)]);
      setLens(payload);
      setWallQueue(queue);
      placementRevisionRef.current = payload.placement.revision;
      const hasSavedPlacement = Object.keys(payload.placement.positions).length > 0;
      const positions = hasSavedPlacement
        ? { ...fallbackPositions(payload.crew, payload.bets), ...payload.placement.positions }
        : fallbackPositions(payload.crew, payload.bets);
      setNodes(buildNodes(payload, positions));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [ventureId]);

  useEffect(() => {
    // The lens has no running/idle status of its own, so it polls at one calm cadence.
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try { await load(); } finally { inFlight = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 900);
    return () => { window.clearInterval(timer); };
  }, [load]);

  const edges = useMemo(() => (lens ? buildEdges(lens.bets) : []), [lens]);
  const renderingPolicy = useMemo(() => canvasRenderingPolicy(nodes.length, edges.length), [nodes.length, edges.length]);

  // Placement is the ONE thing the lens writes (FIRM-SPEC.md "The one lens"). A drag stages position
  // changes into React Flow's own node state immediately (so the drag feels native); only on drop does
  // the settled arrangement go back to the founder's placement document, once, as a whole compareAndSet
  // write — never one write per intermediate frame.
  const onNodesChange = useCallback((changes: Parameters<typeof applyNodeChanges>[0]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const persistPlacement = useCallback(async (settledNodes: Node[]) => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const node of settledNodes) positions[node.id] = { x: node.position.x, y: node.position.y };
    try {
      const { placement } = await putPlacement(ventureId, { positions, expectedRevision: placementRevisionRef.current });
      placementRevisionRef.current = placement.revision;
    } catch {
      // A stale/conflicting write is refreshed on the next poll tick rather than surfaced as an error —
      // losing a just-made drag to a race is a cosmetic loss (placement is the one thing this surface
      // may lose), never a founder-visible failure.
      void load();
    }
  }, [load, ventureId]);

  const onNodeDragStop = useCallback(() => {
    void persistPlacement(nodes);
  }, [nodes, persistPlacement]);

  // Release and reject decide the queued effect. Killing the underlying bet is a distinct founder act
  // (FIRM-SPEC.md rail 2: "Only the founder kills a bet") — never implied by clearing one queued item —
  // so a plain wall reject never touches bet.end() here.
  const onDecideWallItem = useCallback(async (item: WallQueueItemView, decision: WallDecision, note?: string) => {
    await decideWallItem(ventureId, item.id, { decision, note });
    await load();
  }, [load, ventureId]);

  if (!lens) {
    return error ? <div className="firm-lens-error" role="alert">{error}</div> : <div className="firm-lens-loading">Loading the firm…</div>;
  }

  return (
    <div className="firm-lens">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onlyRenderVisibleElements={renderingPolicy.virtualize}
        data-canvas-node-count={renderingPolicy.nodeCount}
        data-canvas-virtualized={renderingPolicy.virtualize ? "true" : "false"}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_event, node) => setSelectedKey(node.id as LensAnchorKey)}
        onPaneClick={() => setSelectedKey(null)}
        fitView
        fitViewOptions={FIT_OPTIONS}
        minZoom={0.15}
        maxZoom={1.8}
        nodesConnectable={false}
        edgesFocusable={false}
        panOnDrag
        proOptions={{ hideAttribution: true }}
        aria-label="The firm: crew, their bets, and the wall."
      >
        <Background />
        <ViewportRestorer viewport={null} receiptKey={ventureId} fitOptions={FIT_OPTIONS} />
        <MeasureGuard nodeIds={nodes.map((node) => node.id)} />
        <CanvasVisibilityGuard topology={`${nodes.length}:${edges.length}`} fitOptions={FIT_OPTIONS} />
      </ReactFlow>

      <FirmLensOutline crew={lens.crew} bets={lens.bets} selectedKey={selectedKey} onInspect={setSelectedKey} />

      <button
        type="button"
        className={`firm-lens-wall-band ${lens.wall.count > 0 ? "firm-lens-wall-band-active" : ""}`}
        onClick={() => setWallOpen((value) => !value)}
        aria-expanded={wallOpen}
      >
        <AlertTriangle size={14} aria-hidden="true" />
        <span>{lens.wall.count > 0 ? `${lens.wall.count} waiting at the wall` : "The wall is clear"}</span>
        <ChevronUp size={14} aria-hidden="true" className={wallOpen ? "firm-lens-wall-chevron-open" : ""} />
      </button>

      {wallOpen && wallQueue.length > 0 ? (
        <div className="firm-lens-wall-panel">
          <FirmWallReview items={wallQueue} onDecide={onDecideWallItem} />
        </div>
      ) : null}
    </div>
  );
}
