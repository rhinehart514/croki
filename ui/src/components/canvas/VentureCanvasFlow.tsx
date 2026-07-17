// The React Flow host for the venture canvas. A thin controlled wrapper that renders the atlas node
// anatomies (NODE_TYPES) over the placement substrate, so the cards read as Drover's cartographic
// instrument rather than a generic whiteboard. Drag persistence is the lens substrate's job
// (useCanvasPlacement, wired by the shell); this host only renders and forwards events.
//
// Spec flags (Slice 1): zoomOnDoubleClick disabled so a background double-click never zooms;
// nodesFocusable / edgesFocusable enabled for keyboard reach. The TerritoryLayer mounts inside so it can
// read the flow store (ViewportPortal + zoom).

import { useEffect, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useStore,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnMoveEnd,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { EpistemicEdge } from "@/components/atlas/EpistemicEdge";
import { altitudeForZoom } from "@/components/atlas/useAtlasCamera";
import { ArchitectureElement } from "@/components/atlas/ArchitectureElement";
import { ArchitectureGroup } from "@/components/atlas/ArchitectureGroup";
import { FounderWall } from "@/components/atlas/FounderWall";
import { AtlasIntentNode } from "@/components/atlas/AtlasIntentNode";
import { AtlasBetNode } from "@/components/atlas/AtlasBetNode";
import { AtlasCrewNode } from "@/components/atlas/AtlasCrewNode";
import { AtlasCapabilityNode } from "@/components/atlas/AtlasCapabilityNode";
import { TerritoryLayer } from "./TerritoryLayer";

const NODE_TYPES: NodeTypes = {
  architectureElement: ArchitectureElement,
  architectureGroup: ArchitectureGroup,
  founderWall: FounderWall,
  atlasIntent: AtlasIntentNode,
  atlasBet: AtlasBetNode,
  atlasCrew: AtlasCrewNode,
  atlasCapability: AtlasCapabilityNode,
};

// Slice 3: the epistemic edge carries join truth on the line (Law 10). Scene edges that resolve to an
// epistemic treatment are stamped type:"epistemic" upstream; everything else keeps the default edge.
const EDGE_TYPES: EdgeTypes = {
  epistemic: EpistemicEdge,
};

type AtlasAltitude = ReturnType<typeof altitudeForZoom>;

// Lifts the live zoom-derived altitude out of the flow store so the host can stamp data-atlas-altitude.
// Without this the venture-atlas semantic-zoom CSS (the rules that enlarge the surviving landmark title as
// the founder zooms out) never fires on this surface, and a simplified card's one remaining word shrinks
// geometrically to tiny text — the Law 4 tell this surface forbids.
function AltitudeWatch({ onAltitude }: { onAltitude: (altitude: AtlasAltitude) => void }) {
  const altitude = useStore((state) => altitudeForZoom(state.transform[2]));
  useEffect(() => { onAltitude(altitude); }, [altitude, onAltitude]);
  return null;
}

export function VentureCanvasFlow({
  nodes,
  edges,
  onInit,
  onNodesChange,
  onNodeDragStop,
  onNodeClick,
  onPaneClick,
  onMoveEnd,
}: {
  nodes: Node[];
  edges: Edge[];
  onInit: (instance: ReactFlowInstance) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onNodeDragStop: (event: unknown, node?: Node) => void;
  onNodeClick: (id: string) => void;
  onPaneClick: () => void;
  onMoveEnd: OnMoveEnd;
}) {
  // Structure-band altitude on arrival ("venture") so the territory kickers show; updated live as the
  // founder zooms so the card anatomy and title sizing track altitude (never tiny text on zoom-out).
  const [altitude, setAltitude] = useState<AtlasAltitude>("venture");
  return (
    <ReactFlow
      className="venture-canvas-flow atlas-canvas"
      data-atlas-altitude={altitude}
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onInit={onInit}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      onNodeClick={(_, node) => onNodeClick(node.id)}
      onPaneClick={(event) => {
        const target = event.target;
        if (target instanceof Element && target.classList.contains("react-flow__pane")) onPaneClick();
      }}
      onMoveEnd={onMoveEnd}
      fitView
      // Open in the STRUCTURE band (<= ORBIT_MAX_ZOOM 0.78) so a sparse/empty venture arrives as the named
      // map — both territory kickers visible — instead of a zoom where the cartography is hidden.
      fitViewOptions={{ padding: 0.22, maxZoom: 0.7 }}
      minZoom={0.15}
      maxZoom={1.8}
      nodesConnectable={false}
      zoomOnDoubleClick={false}
      nodesFocusable
      edgesFocusable
      panOnDrag
      proOptions={{ hideAttribution: true }}
      aria-label="Your venture: its product and go-to-market territories, the work under way, and your decisions."
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
      <Controls showInteractive={false} position="bottom-right" />
      <AltitudeWatch onAltitude={setAltitude} />
      <TerritoryLayer nodes={nodes} edges={edges as Edge[]} />
    </ReactFlow>
  );
}
