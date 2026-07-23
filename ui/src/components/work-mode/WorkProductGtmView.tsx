import { ChevronDown, ChevronUp, Maximize2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Background, BackgroundVariant, MarkerType, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import type { VisualReference } from "@/api";
import type { ProductGtmView, ProductGtmViewNode } from "./productGtmView";

const KIND_LABEL: Record<ProductGtmViewNode["kind"], string> = {
  question: "Question", truth: "Current truth", proposal: "Proposed change", alternative: "Alternative",
  unknown: "Unresolved", evidence: "Evidence", action: "Possible action", gate: "Founder gate", outcome: "Outcome",
};

const COLUMN: Record<ProductGtmViewNode["kind"], number> = {
  truth: 0, evidence: 0, question: 1, proposal: 2, alternative: 2, unknown: 2, action: 3, gate: 3, outcome: 4,
};

function productGtmViewGraph(view: ProductGtmView) {
  const known = new Set(view.nodes.map((node) => node.id));
  const groups = new Map<number, ProductGtmViewNode[]>();
  for (const node of view.nodes) {
    const column = COLUMN[node.kind];
    groups.set(column, [...(groups.get(column) ?? []), node]);
  }
  const maxRows = Math.max(1, ...[...groups.values()].map((group) => group.length));
  const nodes: Node[] = view.nodes.map((node) => {
    const column = COLUMN[node.kind];
    const group = groups.get(column) ?? [node];
    const row = group.findIndex((candidate) => candidate.id === node.id);
    const y = (row - (group.length - 1) / 2) * 96 + (maxRows - 1) * 48;
    return {
      id: node.id,
      position: { x: column * 226, y },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      className: `work-graph-node is-${node.kind} is-${node.state}`,
      data: { label: <><small>{KIND_LABEL[node.kind]}</small><strong>{node.label}</strong>{node.detail ? <span>{node.detail}</span> : null}</> },
    };
  });
  const edges: Edge[] = view.edges.filter((edge) => known.has(edge.from) && known.has(edge.to)).map((edge, index) => ({
    id: `${edge.from}-${edge.to}-${index}`,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
    className: `work-graph-edge is-${edge.kind ?? "relationship"}`,
  }));
  return { nodes, edges };
}

export function ProductGtmViewGraph({ view, full = false }: { view: ProductGtmView; full?: boolean }) {
  const graph = useMemo(() => productGtmViewGraph(view), [view]);
  return <div className={full ? "visual-flow" : "work-graph-sketch-canvas"} aria-label={`${view.title} provisional Product and GTM view`}>
    <ReactFlow nodes={graph.nodes} edges={graph.edges} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} fitView fitViewOptions={{ padding: 0.14, minZoom: 0.25, maxZoom: 1 }} minZoom={0.2} maxZoom={full ? 1.5 : 1.2} panOnDrag zoomOnScroll={full} zoomOnPinch={full} proOptions={{ hideAttribution: true }}>
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--canvas-dot)" />
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
  return <section className="work-graph-sketch" data-kind="model-view" data-collapsed={collapsed ? "true" : undefined} aria-label="Provisional local Product and GTM view">
    <header>
      <div><span>Provisional Product / GTM view</span><strong>{view.title}</strong><small>{detail} · correct it in this conversation</small></div>
      <div>
        {view.item.visual ? <button type="button" onClick={(event) => onOpen(view.item.visual!, event.currentTarget)}><Maximize2 aria-hidden="true" />Review full view</button> : null}
        {view.branchRef ? <button type="button" className="work-graph-adopt" onClick={() => onReview(view.branchRef)}>Review changes</button> : null}
        <button type="button" className="work-graph-collapse" aria-label={collapsed ? "Expand Product and GTM view" : "Collapse Product and GTM view"} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}</button>
      </div>
    </header>
    {!collapsed ? <ProductGtmViewGraph view={view} /> : null}
  </section>;
}
