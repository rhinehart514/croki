// VentureCanvasStage — the venture canvas plane, extracted from VentureCanvasShell so the surrounding
// workspace frame (VentureWorkspace) can own the single lens connection and pass it in. This is the
// SAME stage Slice 1 shipped: one React Flow plane over the projectAtlas scene with the founder's
// drag-placement hand and the epistemic fold. Nothing about the plane changed — it simply no longer
// polls the lens itself, so the frame can mount a rail and conversation beside it without a second poll.
//
// The one connection lives above (VentureWorkspace); `useAtlasProjection` stays here because only the
// stage reads the architecture projection (its own 1.5s cadence, independent of the lens poll).

import { useCallback, useEffect, useMemo } from "react";
import { ReactFlowProvider, useEdgesState, useNodesState, type Node, type NodeChange } from "@xyflow/react";
import { SemanticBandProvider } from "@/components/atlas/SemanticBandProvider";
import type { FirmVenture } from "@/api";
import type { FirmLens } from "@/types";
import { useAtlasProjection } from "@/components/atlas/useAtlasProjection";
import { useCanvasCapabilities } from "@/components/lens/canvasCapabilities";
import { useCanvasPlacement } from "@/components/lens/useCanvasPlacement";
import { projectAtlas } from "@/components/atlas/AtlasProjection";
import { applyFounderPositions, carryMeasuredDimensions } from "@/components/atlas/atlasNodeReconcile";
import { indexContext, epistemicStateForNode, edgeTreatmentForSceneEdge } from "@/components/atlas/epistemicScene";
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import { targetArchitecture, targetBet, targetTeammates, targetTheory, targetWork, type CanvasSelection } from "@/components/firm/directionTarget";
import { VentureCanvasFlow } from "./VentureCanvasFlow";
import { foldPlacement } from "./canvasSeedLayout";
import "@/styles/venture-atlas.css";
import "@/styles/epistemic.css";
import "./venture-canvas.css";

type VentureCanvasStageProps = {
  venture: FirmVenture;
  lens: FirmLens | null;
  readOnly: boolean;
  selection: CanvasSelection;
  onSelect: (selection: CanvasSelection) => void;
  onDescend?: (selection: CanvasSelection) => void;
  onLensChange: (lens: FirmLens) => void;
  refresh: () => void;
  dimmed?: boolean;
};

function VentureCanvasStageInner({
  venture,
  lens,
  readOnly,
  selection,
  onSelect,
  onDescend,
  onLensChange,
  refresh,
  dimmed = false,
}: VentureCanvasStageProps) {
  const { projection } = useAtlasProjection(venture.id);
  const capabilities = useCanvasCapabilities(venture.repository);

  const scene = useMemo(
    () => (lens ? projectAtlas(projection, lens, { capabilities }) : null),
    [capabilities, lens, projection],
  );

  const emptyVenture = Boolean(lens && lens.bets.length === 0 && !scene?.nodes.some((node) => node.data.kind === "bet"));

  const positioned = useMemo<AtlasNode[]>(() => {
    if (!scene || !lens) return [];
    const positions = foldPlacement(scene.nodes, lens.placement.positions);
    return scene.nodes.map((node) => ({
      ...node,
      position: positions[node.id] ?? node.position,
      draggable: node.type !== "architectureGroup" && node.id !== "atlas:intent",
      selectable: node.data.kind !== "intent",
      data: node.id === "atlas:intent" && emptyVenture && !node.data.intentNamed
        ? { ...node.data, title: venture.name }
        : node.data,
    }));
  }, [emptyVenture, scene, lens, venture.name]);

  const [nodes, setNodes, onNodesChange] = useNodesState<AtlasNode>(positioned);
  const [edges, setEdges] = useEdgesState(scene?.edges ?? []);

  const reload = useCallback(async () => { refresh(); }, [refresh]);
  const handleLensChange = useCallback((next: FirmLens) => { onLensChange(next); }, [onLensChange]);

  const { onNodeDragStop, onInit, founderPositions, committedDrop } = useCanvasPlacement({
    ventureId: venture.id,
    lens,
    nodes: nodes as unknown as Node[],
    actionsDisabled: readOnly,
    onNodesChange: onNodesChange as unknown as (changes: NodeChange[]) => void,
    onLensChange: handleLensChange,
    onCanvasInit: () => undefined,
    reload,
  });

  useEffect(() => {
    setNodes((previous) => applyFounderPositions(carryMeasuredDimensions(previous, positioned), founderPositions()));
    setEdges(scene?.edges ?? []);
  }, [positioned, scene, setEdges, setNodes, founderPositions, committedDrop]);

  const epistemicIndex = useMemo(() => (projection ? indexContext(projection) : null), [projection]);

  const selectedNodeId = selection?.betId ? `bet:${selection.betId}` : null;
  const decorated = useMemo<AtlasNode[]>(() => nodes.map((node) => ({
    ...node,
    selected: node.id === selectedNodeId,
    data: {
      ...node.data,
      readOnly,
      epistemic: epistemicStateForNode(node, projection, epistemicIndex),
    },
  })), [nodes, readOnly, selectedNodeId, projection, epistemicIndex]);

  const epistemicEdges = useMemo(() => edges.map((edge) => {
    const treatment = edgeTreatmentForSceneEdge(edge, projection);
    if (!treatment) return edge;
    return { ...edge, type: "epistemic", data: { ...(edge.data ?? {}), treatment, label: edge.label } };
  }), [edges, projection]);

  // Resolve any canvas node id into the typed selection target it scopes to. Ported from the full
  // VentureAtlas mapping so clicking a NON-bet node scopes the environment to that object (workRef /
  // teammate / architecture / theory / outcome→owning bet) instead of silently clearing the scope.
  // Returns null only for a node that carries no selectable truth (e.g. the intent hub).
  const resolveTarget = useCallback((id: string): CanvasSelection => {
    if (id.startsWith("bet:")) return targetBet(id.slice("bet:".length));
    if (id.startsWith("work:")) {
      const workRef = id.slice("work:".length);
      const join = projection?.joins.work.find((candidate) => candidate.id === workRef || candidate.workRef === workRef);
      const betId = join?.betId ?? lens?.bets.find((bet) => (bet.staged ?? []).some((staged) => staged.id === workRef))?.id;
      return betId ? targetWork(betId, workRef) : null;
    }
    if (id.startsWith("outcome:")) {
      const outcomeId = id.slice("outcome:".length);
      const join = projection?.joins.outcomes.find((candidate) => candidate.outcomeId === outcomeId || candidate.id === outcomeId);
      const betId = join?.betId ?? (lens?.outcomes ?? []).find((outcome) => outcome.id === outcomeId)?.betId;
      return betId ? targetBet(betId) : null;
    }
    if (id.startsWith("crew:")) return targetTeammates([id.slice("crew:".length)]);
    if (id.startsWith("architecture:")) {
      return projection ? targetArchitecture(id.slice("architecture:".length), projection.revision) : null;
    }
    if (id.startsWith("theory:")) {
      const theory = projection?.workingTheory;
      const subject = theory?.subjects.find((candidate) => candidate.id === id.slice("theory:".length));
      return theory && subject ? targetTheory(theory.id, subject.id, theory.baseRevision, subject.name) : null;
    }
    return null;
  }, [lens, projection]);

  // One click SELECTS + SCOPES: a non-bet node no longer clears the scope. Only genuinely empty nodes
  // (the intent hub) fall through to null.
  const selectNode = useCallback((id: string) => {
    if (id === "atlas:intent") { onSelect(null); return; }
    const target = resolveTarget(id);
    if (target) onSelect(target); else onSelect(null);
  }, [onSelect, resolveTarget]);

  // Double-click / Enter DESCENDS: sets the same selection AND opens the adaptive workspace.
  const descendNode = useCallback((id: string) => {
    if (id === "atlas:intent") return;
    const target = resolveTarget(id);
    if (target && onDescend) onDescend(target);
  }, [onDescend, resolveTarget]);

  return (
    <div className="venture-canvas-stage" data-dimmed={dimmed ? "true" : "false"}>
      {lens && scene ? (
        <VentureCanvasFlow
          nodes={decorated as unknown as Node[]}
          edges={epistemicEdges}
          onInit={onInit}
          onNodesChange={onNodesChange as unknown as (changes: NodeChange[]) => void}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={selectNode}
          onNodeDoubleClick={onDescend ? descendNode : undefined}
          onPaneClick={() => onSelect(null)}
          onMoveEnd={() => undefined}
        />
      ) : (
        <div className="venture-canvas-loading" role="status">Opening {venture.name}…</div>
      )}
    </div>
  );
}

// The stage carries its own ReactFlow store and band provider so it stays a drop-in plane the frame can
// place in its centre column. The lens connection is owned above; only presentation lives here.
export type { VentureCanvasStageProps };

export function VentureCanvasStage(props: VentureCanvasStageProps) {
  return (
    <ReactFlowProvider>
      <SemanticBandProvider>
        <VentureCanvasStageInner {...props} />
      </SemanticBandProvider>
    </ReactFlowProvider>
  );
}
