// The edge-to-edge immersive world: a full-viewport ReactFlow stage with no docked chrome frame.
// Mirrors VentureAtlas's data flow exactly — projectAtlas → canvasArchetypeScene → layoutAtlasNodes →
// useAtlasMaterialization → wrapped useAtlasCamera — but renders the warm-paper immersive node
// archetypes instead of the triptych composition. The kinetic bloom is the SAME polled projection
// burst the legacy shell sequences; this only re-skins presentation.
//
// Wrapped in <ReactFlowProvider> so the semantic-zoom hook (useStore) can run inside the store context
// even though the world composes its own toolbar/chrome outside <ReactFlow>. React Flow's own
// <ReactFlow> establishes a provider, but wrapping explicitly lets later phases read the store from
// sibling chrome (⌘K teleport) without threading an instance ref.
import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useReducedMotion } from "motion/react";
import { projectAtlas } from "@/components/atlas/AtlasProjection";
import { canvasArchetypeScene } from "@/components/atlas/ventureAtlasModel";
import { layoutAtlasNodes } from "@/lib/atlasLayoutEngine";
import { useAtlasMaterialization } from "@/components/atlas/useAtlasMaterialization";
import { useImmersiveCamera } from "../camera/useImmersiveCamera";
import { WORLD_NODE_TYPES } from "./worldNodeTypes";
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import type { FirmArchitectureProjection, FirmConversationMessage, FirmLens } from "@/types";
import { useShellState } from "../state/shellState";
import { useDescent } from "../descend/useDescent";
import { InWorldReceipts } from "../conversation/InWorldReceipts";
import { ZoomControls } from "../chrome/ZoomControls";
import { targetArchitecture, targetBet, targetTheory, targetWork, type CanvasSelection } from "@/components/firm/directionTarget";

type Capability = { id: string; name: string; description: string; authority: "read" | "wall"; connected?: boolean };

function VentureWorldStage({
  ventureId,
  lens,
  projection,
  capabilities,
  conversation,
  onOpenWall,
}: {
  ventureId: string;
  lens: FirmLens;
  projection: FirmArchitectureProjection | null;
  capabilities: Capability[];
  conversation: FirmConversationMessage[];
  onOpenWall: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const { setSelection, registerCamera, descentOpen, publishWorld } = useShellState();
  const { descend } = useDescent();

  // projection decides *what* exists; the engine decides *where*. Resting stage keeps only the
  // composite archetypes, then the collision-free engine homes them hub-centered.
  const fullScene = useMemo(() => projectAtlas(projection, lens, { capabilities }), [capabilities, lens, projection]);
  const scene = useMemo(() => {
    const stage = canvasArchetypeScene(fullScene);
    const { nodes: placed } = layoutAtlasNodes(stage.nodes);
    return { ...stage, nodes: placed };
  }, [fullScene]);

  const { materializingIds } = useAtlasMaterialization(scene.nodes, Boolean(reducedMotion));
  const [nodes, setNodes, onNodesChange] = useNodesState<AtlasNode>(scene.nodes);
  const [edges, setEdges] = useEdgesState(scene.edges);
  const {
    altitude,
    onInit,
    onMoveEnd,
    reveal,
    broaden,
  } = useImmersiveCamera(nodes, ventureId);

  useEffect(() => {
    setNodes(scene.nodes);
    setEdges(scene.edges);
  }, [scene, setEdges, setNodes]);

  // Lift the two founder-facing camera verbs into shell state so descent chrome (DescendReading,
  // Escape) can drive the fly-in/rise without prop-drilling; the camera engine itself stays here.
  useEffect(() => {
    registerCamera({ reveal, broaden });
    return () => registerCamera(null);
  }, [broaden, registerCamera, reveal]);

  // Resolve a projected node id to its composer scope. Mirrors VentureAtlas.selectNode for the
  // archetypes the resting stage carries; returns null for ids that carry no direction scope.
  const selectionFor = useCallback((id: string): CanvasSelection => {
    if (id.startsWith("bet:")) return targetBet(id.slice("bet:".length));
    if (id.startsWith("theory:")) {
      const subject = projection?.workingTheory?.subjects.find((candidate) => candidate.id === id.slice("theory:".length));
      const theory = projection?.workingTheory;
      if (subject && theory) return targetTheory(theory.id, subject.id, theory.baseRevision, subject.name);
      return null;
    }
    if (id.startsWith("architecture:") && projection) return targetArchitecture(id.slice("architecture:".length), projection.revision);
    if (id.startsWith("work:")) {
      const workRef = id.slice("work:".length);
      const join = projection?.joins.work.find((candidate) => candidate.id === workRef || candidate.workRef === workRef);
      if (join?.betId) return targetWork(join.betId, workRef);
    }
    return null;
  }, [projection]);

  // Selection IS descent (redesign §4): descend pushes the reading rung, sets the composer scope, and
  // flies the camera to the node. The reading renders the exact snapshot carried on this node.
  const selectNode = useCallback((id: string) => {
    const node = nodes.find((candidate) => candidate.id === id) ?? null;
    if (!node) return;
    descend(selectionFor(id), id, node);
  }, [descend, nodes, selectionFor]);

  // The gate object descends into its own reading (the exact staged payload). Route the wall node's
  // click through descent to the aggregate wall node; DescendReading resolves the waiting item.
  const openWall = useCallback(() => {
    selectNode("atlas:wall");
    onOpenWall();
  }, [onOpenWall, selectNode]);

  // Publish a read-only snapshot of the live world so floating glass chrome rendered outside the
  // ReactFlow store (Altimeter, Teleport, NeedsYouPulse) reads altitude + the placed node set and can
  // route ⌘K/pulse jumps through the same descent a node click uses. Cleared on unmount.
  useEffect(() => {
    publishWorld({ altitude, nodes, selectNode });
    return () => publishWorld(null);
  }, [altitude, nodes, publishWorld, selectNode]);

  const decoratedNodes = useMemo<AtlasNode[]>(() => nodes.map((node) => ({
    ...node,
    draggable: false,
    className: materializingIds.has(node.id) ? "iw-materializing" : undefined,
    data: {
      ...node.data,
      altitude,
      materializing: materializingIds.has(node.id),
      onSelect: selectNode,
      onOpenWall: openWall,
    },
  })), [altitude, materializingIds, nodes, openWall, selectNode]);

  const handleInit = useCallback((instance: ReactFlowInstance<AtlasNode>) => { onInit(instance); }, [onInit]);

  return (
    <ReactFlow<AtlasNode>
      className="atlas-canvas"
      nodes={decoratedNodes}
      edges={edges}
      nodeTypes={WORLD_NODE_TYPES}
      onInit={handleInit}
      onMoveEnd={onMoveEnd}
      onNodesChange={onNodesChange}
      onPaneClick={() => { if (!descentOpen) { setSelection(null); broaden(); } }}
      nodesConnectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      panOnDrag
      zoomOnScroll
      zoomOnPinch
      panOnScroll={false}
      minZoom={0.18}
      maxZoom={1.7}
      proOptions={{ hideAttribution: true }}
      aria-label="Living venture world. Pan and zoom the venture; say what you want in the composer below."
      data-atlas-altitude={altitude}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
      {/* Explicit zoom/fit control — rendered inside <ReactFlow> so it can drive the camera directly.
          The guaranteed way to leave Orbit; the passive Altimeter only reads the resulting altitude. */}
      {!descentOpen ? <ZoomControls /> : null}
      {/* Ambient receipts ride inside the store so they track the node they concern as the founder
          pans/zooms (redesign §3). Hidden during a descent so the reading is the one lifted surface. */}
      {!descentOpen ? <InWorldReceipts conversation={conversation} nodes={decoratedNodes} /> : null}
    </ReactFlow>
  );
}

export function VentureWorld(props: {
  ventureId: string;
  lens: FirmLens;
  projection: FirmArchitectureProjection | null;
  capabilities: Capability[];
  conversation: FirmConversationMessage[];
  onOpenWall: () => void;
}) {
  return (
    <div className="immersive-world">
      <ReactFlowProvider>
        <VentureWorldStage {...props} />
      </ReactFlowProvider>
    </div>
  );
}
