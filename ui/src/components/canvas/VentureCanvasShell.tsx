// VentureCanvasShell — the flag-gated venture canvas (Phase 4/5 Slice 1). The canvas IS the venture
// (Exp Principle 1): one React Flow plane over the single `projectAtlas` scene (folded with the
// atlasSemanticProjection depth layer inside projectAtlas), with two rendered territories. Mounted only
// behind `canvasShellRequested()`; the NowShell default is untouched.
//
// This is additive and reuses the atlas scene + node anatomies verbatim. The one behavioural change
// from the shipped atlas is the founder's hand: nodes are draggable here, and every drop persists
// through the lens placement substrate (useCanvasPlacement → putPlacement, revision + 409 drag-buffer).
// The seed comes from computeAtlasLayout with a territory bias; a stored placement overrides it
// absolutely (DESIGN.md Exp Law 6 — generated layouts never overwrite founder placement).

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlowProvider, useEdgesState, useNodesState, type Node, type NodeChange } from "@xyflow/react";
import { SemanticBandProvider } from "@/components/atlas/SemanticBandProvider";
import type { FirmVenture } from "@/api";
import type { FirmLens } from "@/types";
import { useFirmConnection } from "@/hooks/use-firm-connection";
import { useAtlasProjection } from "@/components/atlas/useAtlasProjection";
import { useCanvasCapabilities } from "@/components/lens/canvasCapabilities";
import { useCanvasPlacement } from "@/components/lens/useCanvasPlacement";
import { projectAtlas } from "@/components/atlas/AtlasProjection";
import { applyFounderPositions, carryMeasuredDimensions } from "@/components/atlas/atlasNodeReconcile";
import { indexContext, epistemicStateForNode, edgeTreatmentForSceneEdge } from "@/components/atlas/epistemicScene";
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import { targetBet, type CanvasSelection } from "@/components/firm/directionTarget";
import { NowComposer } from "@/components/now/NowComposer";
import { VentureCanvasFlow } from "./VentureCanvasFlow";
import { foldPlacement } from "./canvasSeedLayout";
import "@/styles/venture-atlas.css";
import "@/styles/epistemic.css";
import "./venture-canvas.css";

function VentureCanvasShellInner({ venture }: { venture: FirmVenture }) {
  const { lens, connection, refresh, setLens } = useFirmConnection(venture.id);
  const { projection } = useAtlasProjection(venture.id);
  const capabilities = useCanvasCapabilities(venture.repository);
  const readOnly = connection.phase === "stale" || connection.phase === "offline";

  const [selection, setSelection] = useState<CanvasSelection>(null);

  // The single scene every surface reads. projectAtlas already folds the semantic depth layer, so the
  // scene is never re-derived here (spec: nothing re-derives it).
  const scene = useMemo(
    () => (lens ? projectAtlas(projection, lens, { capabilities }) : null),
    [capabilities, lens, projection],
  );

  // Before the first direction the hub carries the venture's name (spec empty state: "the intent hub
  // alone at origin carrying the venture's name"). Once a direction names the intent, the projection's
  // own title wins.
  const emptyVenture = Boolean(lens && lens.bets.length === 0 && !scene?.nodes.some((node) => node.data.kind === "bet"));

  // Fold placement over the territory-biased seed: a stored position wins absolutely; everything else
  // takes its seed. Membership → side comes from the facet mirror, never from position.
  const positioned = useMemo<AtlasNode[]>(() => {
    if (!scene || !lens) return [];
    const positions = foldPlacement(scene.nodes, lens.placement.positions);
    return scene.nodes.map((node) => ({
      ...node,
      position: positions[node.id] ?? node.position,
      // The founder's hand is final: every placed card is draggable here (the shared projector's
      // draggable:false is overridden at the mount, not deleted, so the Now/world mounts are untouched).
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
  const onLensChange = useCallback((next: FirmLens) => { setLens(next); }, [setLens]);

  // The placement substrate is base-typed over React Flow's Node; the atlas node array is a structural
  // subtype, so the cast is safe and keeps the substrate reusable by both the lens and this canvas.
  const { onNodeDragStop, onInit, founderPositions, committedDrop } = useCanvasPlacement({
    ventureId: venture.id,
    lens,
    nodes: nodes as unknown as Node[],
    actionsDisabled: readOnly,
    onNodesChange: onNodesChange as unknown as (changes: NodeChange[]) => void,
    onLensChange,
    onCanvasInit: () => undefined,
    reload,
  });

  useEffect(() => {
    // Carry React Flow's measured sizes forward so replacing the array on a poll never drops nodes to
    // visibility:hidden (same guard the atlas uses). Then re-apply the founder's committed positions:
    // a 1.2s poll GET can race a drop and return a lens whose placement has not yet absorbed it, which
    // would otherwise snap the just-dropped card back (Law 6 / feel non-negotiable). committedDrop is a
    // dependency so a fresh drop re-runs this overlay even when `positioned` identity is unchanged.
    setNodes((previous) => applyFounderPositions(carryMeasuredDimensions(previous, positioned), founderPositions()));
    setEdges(scene?.edges ?? []);
  }, [positioned, scene, setEdges, setNodes, founderPositions, committedDrop]);

  // Slice 3: one pure epistemic fold over the SAME projection the scene is built over (spec: nothing
  // re-derives the scene). Called once per node with full projection context so deriveEpistemicState
  // stays pure. The token reads node.data.epistemic; a null state renders the reserved hollow slot.
  const epistemicIndex = useMemo(() => (projection ? indexContext(projection) : null), [projection]);

  const selectedNodeId = selection?.betId ? `bet:${selection.betId}` : null;
  // Historical in the live mount is driven by the brain's per-object live.ended signal (the render stays
  // pure — no render-time clock, which the lint purity rule forbids). Bounds-endsAt comparison needs a
  // clock and so is exercised only in the pure unit test with an injected `now`; here it fails toward
  // visibility (an object with a future/absent bound is never falsely demoted to Historical).
  const decorated = useMemo<AtlasNode[]>(() => nodes.map((node) => ({
    ...node,
    selected: node.id === selectedNodeId,
    data: {
      ...node.data,
      readOnly,
      epistemic: epistemicStateForNode(node, projection, epistemicIndex),
    },
  })), [nodes, readOnly, selectedNodeId, projection, epistemicIndex]);

  // Join truth on the edge line (Law 10): a scene edge that resolves to an epistemic treatment becomes
  // type:"epistemic" carrying its treatment; everything else keeps its default edge unchanged.
  const epistemicEdges = useMemo(() => edges.map((edge) => {
    const treatment = edgeTreatmentForSceneEdge(edge, projection);
    if (!treatment) return edge;
    return { ...edge, type: "epistemic", data: { ...(edge.data ?? {}), treatment, label: edge.label } };
  }), [edges, projection]);

  const selectNode = useCallback((id: string) => {
    if (id.startsWith("bet:")) setSelection(targetBet(id.slice("bet:".length)));
    else setSelection(null);
  }, []);

  const scopeLabel = useMemo(() => {
    if (!selection?.betId || !lens) return null;
    const bet = lens.bets.find((candidate) => candidate.id === selection.betId);
    return bet ? bet.intent : null;
  }, [lens, selection]);

  return (
    <div className="venture-canvas" key={venture.id}>
      <div className="venture-canvas-stage">
        {lens && scene ? (
          <VentureCanvasFlow
            nodes={decorated as unknown as Node[]}
            edges={epistemicEdges}
            onInit={onInit}
            onNodesChange={onNodesChange as unknown as (changes: NodeChange[]) => void}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={selectNode}
            onPaneClick={() => setSelection(null)}
            onMoveEnd={() => undefined}
          />
        ) : (
          <div className="venture-canvas-loading" role="status">Opening {venture.name}…</div>
        )}
      </div>
      {lens ? (
        <div className="venture-canvas-composer">
          <NowComposer
            ventureId={venture.id}
            ventureName={venture.name}
            selection={selection}
            scopeLabel={scopeLabel}
            hasWork={lens.bets.length > 0}
            variant="dock"
            readOnly={readOnly}
            autoFocus
            // Unscoped, the composer directs the whole venture with the spec's single placeholder; a
            // selection lets the composer steer that object with its own scoped prompt.
            placeholder={scopeLabel ? undefined : "Direct the venture"}
            onClearScope={() => setSelection(null)}
            onDriven={() => refresh()}
          />
        </div>
      ) : null}
    </div>
  );
}

export function VentureCanvasShell({ venture }: { venture: FirmVenture }) {
  return (
    <ReactFlowProvider>
      {/* One band state (Slice 2) mounted inside the store and above the nodes, so every card anatomy and
          the altimeter read the same hysteresis-aware band — never a second raw-transform read. */}
      <SemanticBandProvider>
        <VentureCanvasShellInner venture={venture} />
      </SemanticBandProvider>
    </ReactFlowProvider>
  );
}
