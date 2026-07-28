import { ChevronDown, ChevronUp, Maximize2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, BackgroundVariant, MarkerType, Panel, Position, ReactFlow, type Edge, type Node, type ReactFlowInstance } from "@xyflow/react";
import type { VisualReference } from "@/api";
import type { ArtifactSectionFocus } from "@/components/review/artifactSectionFocus";
import { productGtmViewNodeFocus, type ProductGtmView, type ProductGtmViewNode } from "./productGtmView";
import { productGtmTopologyLayout } from "./productGtmViewLayout";

const KIND_LABEL: Record<ProductGtmViewNode["kind"], string> = {
  question: "Question", truth: "Current truth", proposal: "Proposed change", alternative: "Alternative",
  unknown: "Unresolved", evidence: "Evidence", action: "Possible action", gate: "Founder gate", outcome: "Outcome",
};

function productGtmViewGraph(view: ProductGtmView, selectedId: string | null) {
  const known = new Set(view.nodes.map((node) => node.id));
  const positions = productGtmTopologyLayout(view.nodes, view.edges, selectedId);
  const selectedNeighbors = new Set(view.edges.flatMap((edge) => (
    edge.from === selectedId ? [edge.to] : edge.to === selectedId ? [edge.from] : []
  )));
  const nodes: Node[] = view.nodes.map((node) => {
    const selected = node.id === selectedId;
    const dimmed = Boolean(selectedId && !selected && !selectedNeighbors.has(node.id));
    return {
      id: node.id,
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      selected,
      zIndex: selected ? 4 : 1,
      className: `work-graph-node is-${node.kind} is-${node.state}${dimmed ? " is-dimmed" : ""}`,
      data: { label: <><small>{KIND_LABEL[node.kind]}</small><strong>{node.label}</strong>{selected && node.detail ? <span>{node.detail}</span> : null}{selected && node.sourceRef ? <em>{node.sourceRef}</em> : null}</> },
    };
  });
  const edges: Edge[] = view.edges.filter((edge) => known.has(edge.from) && known.has(edge.to)).map((edge, index) => ({
    ...(selectedId && edge.from !== selectedId && edge.to !== selectedId ? { className: `work-graph-edge is-${edge.kind ?? "relationship"} is-dimmed` } : { className: `work-graph-edge is-${edge.kind ?? "relationship"}` }),
    id: `${edge.from}-${edge.to}-${index}`,
    source: edge.from,
    target: edge.to,
    label: edge.from === selectedId || edge.to === selectedId ? edge.label : undefined,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
  }));
  return { nodes, edges };
}

export function ProductGtmViewGraph({ view, full = false, artifactFocus, onArtifactFocus }: {
  view: ProductGtmView;
  full?: boolean;
  artifactFocus?: ArtifactSectionFocus | null;
  onArtifactFocus?: (focus: ArtifactSectionFocus | null) => void;
}) {
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const flowInstance = useRef<ReactFlowInstance | null>(null);
  const selectedId = artifactFocus === undefined
    ? localSelectedId
    : artifactFocus?.artifactRef === view.workRef ? artifactFocus.sectionId : null;
  const graph = useMemo(() => productGtmViewGraph(view, full ? selectedId : null), [full, selectedId, view]);
  const selectedNode = selectedId ? view.nodes.find((node) => node.id === selectedId) ?? null : null;
  const frame = useCallback((nodeId: string | null, instance = flowInstance.current) => {
    if (!full || !instance) return;
    requestAnimationFrame(() => {
      const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 140;
      const node = nodeId ? instance.getNode(nodeId) : null;
      if (node) {
        const width = node.measured?.width ?? node.width ?? 292;
        const height = node.measured?.height ?? node.height ?? 142;
        void instance.setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: 0.82, duration });
        return;
      }
      void instance.fitView({ nodes: instance.getNodes(), padding: 0.14, minZoom: 0.25, maxZoom: 1, duration });
    });
  }, [full]);
  useEffect(() => {
    frame(selectedId);
  }, [frame, selectedId]);
  const select = (nodeId: string | null) => {
    setLocalSelectedId(nodeId);
    onArtifactFocus?.(nodeId ? productGtmViewNodeFocus(view, nodeId) : null);
    frame(nodeId);
  };
  return <div className={full ? "visual-flow" : "work-graph-sketch-canvas"} data-kind="model-view" aria-label={`${view.title} provisional Canvas view`}>
    <ReactFlow nodes={graph.nodes} edges={graph.edges} nodesDraggable={false} nodesConnectable={false} elementsSelectable={full} fitView fitViewOptions={{ padding: 0.14, minZoom: 0.25, maxZoom: 1 }} minZoom={0.2} maxZoom={full ? 1.5 : 1.2} panOnDrag zoomOnScroll={full} zoomOnPinch={full} onInit={(instance) => { flowInstance.current = instance; if (selectedId) frame(selectedId, instance); }} onNodeClick={full ? (_, node) => select(selectedId === node.id ? null : node.id) : undefined} onPaneClick={full ? () => select(null) : undefined} proOptions={{ hideAttribution: true }}>
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--canvas-dot)" />
      {full ? <Panel position="top-left" className="visual-flow-intent" onClick={(event) => event.stopPropagation()}>
        <span>Intent</span>
        <strong>{view.question}</strong>
        {selectedNode ? <small>Now clarifying <b>{selectedNode.label}</b>. Direct the correction in this Thread.</small> : <small>Select any part to inspect and direct it more precisely.</small>}
      </Panel> : null}
    </ReactFlow>
  </div>;
}

export function WorkProductGtmView({ view, onOpen, onReview }: {
  view: ProductGtmView;
  onOpen: (visual: VisualReference, source: HTMLElement) => void;
  onReview: (branchRef: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const proposed = view.nodes.filter((node) => node.state === "provisional").length;
  const unresolved = view.nodes.filter((node) => node.state === "unresolved").length;
  const detail = [proposed ? `${proposed} proposed` : null, unresolved ? `${unresolved} unresolved` : null].filter(Boolean).join(" · ") || `${view.nodes.length} connected ${view.nodes.length === 1 ? "item" : "items"}`;
  return <section className="work-graph-sketch" data-kind="model-view" data-collapsed={collapsed ? "true" : undefined} aria-label="Provisional Canvas view">
    <header>
      <div><span>Provisional Canvas view</span><strong>{view.title}</strong><small>{detail} · correct it in this conversation</small></div>
      <div>
        {view.item.visual ? <button type="button" onClick={(event) => onOpen(view.item.visual!, event.currentTarget)}><Maximize2 aria-hidden="true" />Review full view</button> : null}
        {view.branchRef ? <button type="button" className="work-graph-adopt" onClick={() => onReview(view.branchRef)}>Review changes</button> : null}
        <button type="button" className="work-graph-collapse" aria-label={collapsed ? "Expand Canvas view" : "Collapse Canvas view"} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}</button>
      </div>
    </header>
    {!collapsed ? <>
      <p className="work-graph-intent"><span>Intent</span>{view.question}</p>
      <ProductGtmViewGraph view={view} />
    </> : null}
  </section>;
}
