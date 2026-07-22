import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type DragEvent } from "react";
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, useNodesState,
  type EdgeTypes, type NodeTypes, type ReactFlowInstance, type Viewport,
} from "@xyflow/react";
import { LocateFixed } from "lucide-react";
import { getCurrentModel, getMarketMovement, putPlacement } from "@/api";
import type { SystemIndex, WorkIndex } from "@/api";
import type { FirmPlacement, FirmSemanticModel, MarketMovementIndex } from "@/types";
import { ModelBranchReview } from "./ModelBranchReview";
import { OutwardActionReview } from "./OutwardActionReview";
import { ProductGtmEdge } from "./ProductGtmEdge";
import { ProductGtmNavigator } from "./ProductGtmNavigator";
import { ProductGtmNode } from "./ProductGtmNode";
import { reflowExpandedNeighborhood } from "./productGtmLayout";
import { projectProductGtm, type ProductGtmNode as ProductGtmFlowNode } from "./productGtmProjection";
import { PRODUCT_GTM_READABLE_ZOOM, productGtmMotionDuration, productGtmViewportIsAway } from "./productGtmViewport";
import "@xyflow/react/dist/style.css";
import "./product-gtm.css";

const NODE_TYPES: NodeTypes = { productGtm: ProductGtmNode };
const EDGE_TYPES: EdgeTypes = { productGtmEdge: ProductGtmEdge };
const AGENT_MIME = "application/x-drover-agent";
const CAPABILITY_MIME = "application/x-drover-capability";
const placementKey = (nodeId: string) => `product-gtm-v2:${nodeId}`;

function fallbackModel(ventureId: string, index: SystemIndex | null): FirmSemanticModel | null {
  if (!index) return null;
  return {
    schemaVersion: 3, ventureId, revision: index.revision,
    objects: index.objects.map((object) => ({ id: object.id, type: object.type, name: object.name, statement: object.statement, properties: { ...object.properties, territory: object.territory }, assertion: object.assertion, ...(object.provenance ? { provenance: object.provenance } : {}) })),
    relationships: index.relationships.map((relationship) => ({ ...relationship, type: relationship.type ?? "connected", properties: {}, sourceRefs: relationship.sourceRefs ?? [] })),
    modelBranches: [], modelChanges: [], modelMergeReceipts: [], workScopes: [], outwardActions: [],
  };
}

function selectedNodeId(ref: string | null): string | null {
  if (!ref) return null;
  if (ref.startsWith("model-branch:")) return `branch:${ref.slice("model-branch:".length)}`;
  if (ref.startsWith("outward-action:")) return `action:${ref.slice("outward-action:".length)}`;
  if (ref.startsWith("object:")) return ref.slice("object:".length);
  return ref;
}

function droppedNodeId(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>(".react-flow__node")?.dataset.id ?? null : null;
}

export function ProductGtmSurface({
  ventureId, index, workIndex, selectedRef, camera, placement, readOnlyReason,
  onCameraChange, onFocus, onOpenWork, onAskAgent, onUseAgent, onChanged,
}: {
  ventureId: string; index: SystemIndex | null; workIndex: WorkIndex | null; selectedRef: string | null; camera: Viewport | null; placement: FirmPlacement; readOnlyReason: string | null;
  onCameraChange: (camera: Viewport) => void; onFocus: (ref: string | null) => void; onOpenWork: (threadRef: string) => void;
  onAskAgent: (subjectRef?: string, relatedRefs?: string[]) => void; onUseAgent: (agentRef: string, subjectRef?: string) => void; onChanged: () => void;
}) {
  const [model, setModel] = useState<FirmSemanticModel | null>(() => fallbackModel(ventureId, index));
  const [movement, setMovement] = useState<MarketMovementIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropNotice, setDropNotice] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [wholeVentureFor, setWholeVentureFor] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const dragDepth = useRef(0);
  const flowInstance = useRef<ReactFlowInstance<ProductGtmFlowNode> | null>(null);
  const placementPositions = useRef({ ...placement.positions });
  const placementRevision = useRef(placement.revision);
  const saveQueue = useRef(Promise.resolve());
  const [zoomLevel, setZoomLevel] = useState(camera?.zoom ?? 1);
  const [flowReady, setFlowReady] = useState(false);
  const [cameraAway, setCameraAway] = useState(false);
  const focalViewport = useRef<Viewport | null>(null);
  const refresh = useCallback(() => { setError(null); setRefreshKey((value) => value + 1); }, []);

  useEffect(() => {
    let live = true;
    void Promise.all([getCurrentModel(ventureId), getMarketMovement(ventureId)]).then(([current, market]) => {
      if (!live) return;
      setModel(current.model); setMovement(market.marketMovement);
    }).catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : "The living venture model could not load."); });
    return () => { live = false; };
  }, [refreshKey, ventureId]);
  useEffect(() => {
    if (!dropNotice) return;
    const timer = window.setTimeout(() => setDropNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [dropNotice]);

  const visibleModel = model ?? fallbackModel(ventureId, index);
  const selected = selectedNodeId(selectedRef);
  const wholeVenture = wholeVentureFor === ventureId && !selected;
  const projectionContext = useMemo(() => ({
    wholeVenture,
    unreadSubjectRefs: (workIndex?.items ?? []).filter((item) => item.unread).flatMap((item) => item.subjectRefs),
    unreadThreadRefs: (workIndex?.items ?? []).filter((item) => item.unread).map((item) => item.threadRef),
  }), [wholeVenture, workIndex]);
  const graph = useMemo(() => visibleModel
    ? projectProductGtm(visibleModel, movement, selected, projectionContext)
    : { nodes: [], edges: [], focusName: "", focusSummary: "", initialFocusIds: [], chapterKind: "whole" as const, chapterAnchorId: null },
  [visibleModel, movement, projectionContext, selected]);
  const selectedNode = graph.nodes.find((node) => node.id === selected) ?? null;
  const branchId = selectedNode?.data.kind === "branch" ? selectedNode.data.ref.replace(/^model-branch:/, "") : null;

  const select = useCallback((id: string | null) => {
    const node = graph.nodes.find((entry) => entry.id === id);
    if (node) setWholeVentureFor(null);
    onFocus(node?.data.ref ?? null);
  }, [graph.nodes, onFocus]);

  const showWholeVenture = useCallback(() => {
    setWholeVentureFor(ventureId);
    onFocus(null);
  }, [onFocus, ventureId]);

  const interactiveNodes = useMemo(() => graph.nodes.map((node) => {
    const expanded = node.id === selected;
    const isWork = node.data.kind === "work";
    const isWorkflowStep = node.data.kind === "workflow";
    const content = expanded
      ? node.data.kind === "branch" && branchId
        ? <ModelBranchReview inline ventureId={ventureId} branchId={branchId} readOnly={Boolean(readOnlyReason)} onClose={() => select(null)} onContinue={(ref) => onAskAgent(ref)} onChanged={() => { refresh(); onChanged(); }} />
        : node.data.action
          ? <OutwardActionReview ventureId={ventureId} action={node.data.action} readOnly={Boolean(readOnlyReason)} onChanged={() => { refresh(); onChanged(); }} />
          : undefined
      : undefined;
    return {
      ...node,
      zIndex: expanded ? 20 : node.zIndex,
      data: {
        ...node.data, expanded, expandedContent: content,
        actionLabel: node.data.kind === "branch" || node.data.action ? undefined : isWork ? "Open exact work" : isWorkflowStep ? "Work on this step" : "Work on this",
        onAction: isWork ? () => onOpenWork(node.data.ref) : () => onAskAgent(node.data.workRef ?? node.data.ref),
        onCollapse: () => select(null),
      },
    };
  }), [branchId, graph.nodes, onAskAgent, onChanged, onOpenWork, readOnlyReason, refresh, select, selected, ventureId]);

  const [nodes, setNodes, onNodesChange] = useNodesState<ProductGtmFlowNode>([]);
  const reconcileKey = `${placement.revision}:${selected ?? ""}:${graph.nodes.map((node) => `${node.id}:${node.position.x}:${node.position.y}:${node.data.name}:${node.data.detail}:${node.data.meta}:${node.data.focus}:${node.data.active}`).join("|")}`;
  const reconcileNodes = useEffectEvent(() => {
    if (placement.revision >= placementRevision.current) {
      placementRevision.current = placement.revision;
      placementPositions.current = { ...placementPositions.current, ...placement.positions };
    }
    setNodes(() => {
      const workflowOwner = interactiveNodes.find((node) => node.data.workflowGraph && graph.initialFocusIds.includes(node.id));
      const placedOwner = workflowOwner ? placementPositions.current[placementKey(workflowOwner.id)] ?? workflowOwner.position : null;
      const workflowOffset = workflowOwner && placedOwner
        ? { x: placedOwner.x - workflowOwner.position.x, y: placedOwner.y - workflowOwner.position.y }
        : { x: 0, y: 0 };
      const composed = interactiveNodes.map((node) => ({
        ...node,
        position: placementPositions.current[placementKey(node.id)] ?? (node.data.kind === "workflow"
          ? { x: node.position.x + workflowOffset.x, y: node.position.y + workflowOffset.y }
          : node.position),
      }));
      return reflowExpandedNeighborhood(composed, selected);
    });
  });
  useEffect(() => { reconcileNodes(); }, [reconcileKey]);
  const frameSignature = `${ventureId}:${visibleModel?.revision ?? "fallback"}:${graph.chapterKind}:${graph.chapterAnchorId ?? "whole"}:${graph.initialFocusIds.join(",")}`;
  const framedSignature = useRef<string | null>(null);
  const frameCurrent = useCallback(async (duration = 180) => {
    const instance = flowInstance.current;
    if (!instance || nodes.length === 0) return;
    const focusIds = new Set(graph.initialFocusIds);
    const currentSelection = selected ? nodes.find((node) => node.id === selected) : null;
    const workflowFocus = Boolean(currentSelection?.data.workflowGraph) || currentSelection?.data.kind === "workflow";
    const presentIds = new Set(nodes.map((node) => node.id));
    if (workflowFocus && [...focusIds].some((id) => !presentIds.has(id))) return;
    const framingNodes = workflowFocus
      ? nodes.filter((node) => focusIds.has(node.id))
      : currentSelection ? [currentSelection] : nodes.filter((node) => focusIds.has(node.id));
    const targets = framingNodes.length ? framingNodes : nodes.slice(0, 1);
    await instance.fitView({
      nodes: targets,
      padding: 0.2,
      minZoom: PRODUCT_GTM_READABLE_ZOOM,
      maxZoom: 0.98,
      duration: productGtmMotionDuration(duration),
    });
    // React Flow can resolve an early fit before its internal measurements have caught up with
    // controlled nodes, leaving a persisted overview camera untouched. Center the exact chapter at
    // the readability floor so an old session can never defeat the default composition.
    if (instance.getViewport().zoom < PRODUCT_GTM_READABLE_ZOOM - 0.001) {
      const bounds = instance.getNodesBounds(targets);
      await instance.setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, {
        zoom: PRODUCT_GTM_READABLE_ZOOM,
        duration: productGtmMotionDuration(duration),
      });
    }
    focalViewport.current = instance.getViewport();
    window.requestAnimationFrame(() => setCameraAway(false));
  }, [graph.initialFocusIds, nodes, selected]);
  useEffect(() => {
    if (!flowInstance.current || nodes.length === 0 || framedSignature.current === frameSignature) return;
    const focusIds = new Set(graph.initialFocusIds);
    const selectedNode = selected ? nodes.find((node) => node.id === selected) : null;
    const workflowFocus = Boolean(selectedNode?.data.workflowGraph) || selectedNode?.data.kind === "workflow";
    const presentIds = new Set(nodes.map((node) => node.id));
    if (workflowFocus && [...focusIds].some((id) => !presentIds.has(id))) return;
    framedSignature.current = frameSignature;
    void frameCurrent(graph.chapterKind === "whole" ? 0 : 180);
  }, [flowReady, frameCurrent, frameSignature, graph.chapterKind, graph.initialFocusIds, nodes, selected]);

  const savePlacement = useCallback((node: ProductGtmFlowNode) => {
    placementPositions.current = { ...placementPositions.current, [placementKey(node.id)]: node.position };
    saveQueue.current = saveQueue.current.then(async () => {
      const response = await putPlacement(ventureId, { positions: placementPositions.current, expectedRevision: placementRevision.current });
      placementRevision.current = response.placement.revision;
      placementPositions.current = { ...response.placement.positions };
      setDropNotice("Layout saved. Placement does not change Product truth.");
      onChanged();
    }).catch(() => {
      setDropNotice("That position could not be saved. The venture model was not changed.");
      onChanged();
    });
  }, [onChanged, ventureId]);

  const handleDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0; setDropActive(false);
    if (readOnlyReason) { setDropNotice("Drover is not current enough to begin new work."); return; }
    const target = graph.nodes.find((node) => node.id === droppedNodeId(event.target));
    const agentRef = event.dataTransfer.getData(AGENT_MIME);
    if (agentRef) {
      onUseAgent(agentRef, target?.data.ref);
      setDropNotice(target ? `Agent directed at ${target.data.name}.` : "Agent directed at the current focus.");
      return;
    }
    const capabilityData = event.dataTransfer.getData(CAPABILITY_MIME);
    if (capabilityData) {
      if (!target) { setDropNotice("Drop a tool or source on the exact Product or GTM node it should affect."); return; }
      try {
        const capability = JSON.parse(capabilityData) as { id?: string; label?: string };
        if (!capability.id) throw new Error("missing capability");
        onAskAgent(target.data.ref, [`capability:${capability.id}`]);
        setDropNotice(`${capability.label ?? "Capability"} attached to exact work on ${target.data.name}.`);
      } catch { setDropNotice("Drover could not identify that tool or source. Nothing was attached."); }
      return;
    }
    setDropNotice("That item has no supported Product / GTM effect.");
  }, [graph.nodes, onAskAgent, onUseAgent, readOnlyReason]);

  if (!visibleModel || graph.nodes.length === 0) return <main className="product-gtm-empty"><div><span>Product / GTM</span><h1>What are you trying to make true?</h1><p>State the direction once. Claude or Codex can ground the repository, pursue several approaches, and materialize Product and go-to-market alternatives here.</p><button type="button" onClick={() => onAskAgent()}>Begin real work</button>{error ? <small role="status">Drover could not read the local model yet. Your direction is still available.</small> : null}</div></main>;
  return <main className="product-gtm-surface" data-has-selection={selectedNode ? "true" : undefined} data-has-focus={graph.chapterKind !== "whole" ? "true" : undefined} data-drop-active={dropActive ? "true" : undefined} data-zoom={zoomLevel < 0.78 ? "overview" : "detail"}>
    {readOnlyReason || error ? <div className="product-gtm-state"><span role="status">{readOnlyReason ?? "Showing the last current venture model. Reconnecting locally."}</span>{!readOnlyReason && error ? <button type="button" onClick={refresh}>Try again</button> : null}</div> : null}
    {dropNotice ? <p className="product-gtm-drop-status" role="status">{dropNotice}</p> : null}
    {graph.chapterKind !== "whole" ? <aside className="product-gtm-context" aria-live="polite">
      <div><strong>{graph.focusName}</strong><span>{graph.focusSummary}</span></div>
      <button type="button" onClick={showWholeVenture}>Whole venture</button>
    </aside> : null}
    <ProductGtmNavigator model={visibleModel} selectedRef={selectedRef} onFocus={(ref) => {
      setWholeVentureFor(null);
      onFocus(ref);
    }} />
    {cameraAway ? <button className="product-gtm-return-current" type="button" onClick={() => void frameCurrent()}>
      <LocateFixed aria-hidden="true" />Return to current
    </button> : null}
    <div className="product-gtm-canvas"
      onDragEnter={(event) => { if (event.dataTransfer.types.includes(AGENT_MIME) || event.dataTransfer.types.includes(CAPABILITY_MIME)) { dragDepth.current += 1; setDropActive(true); } }}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDropActive(false); }}
      onDragOver={(event) => { if (event.dataTransfer.types.includes(AGENT_MIME) || event.dataTransfer.types.includes(CAPABILITY_MIME)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
      onDrop={handleDrop}
    ><ReactFlow
      nodes={nodes} edges={graph.edges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
      defaultViewport={camera ?? undefined} onInit={(instance) => { flowInstance.current = instance; setFlowReady(true); }}
      minZoom={0.2} maxZoom={1.8} panOnDrag selectionOnDrag={false} nodesConnectable={false} nodesDraggable={!readOnlyReason}
      onNodesChange={onNodesChange} onNodeDragStop={(_event, node) => savePlacement(node)}
      onNodeClick={(_event, node) => select(node.id === selected ? (node.data.kind === "workflow" ? node.data.workRef?.replace(/^object:/, "") ?? null : null) : node.id)} onPaneClick={() => { if (selected) select(null); }}
      onMoveEnd={(event, viewport) => {
        setZoomLevel(viewport.zoom);
        onCameraChange(viewport);
        if (event && focalViewport.current) setCameraAway(productGtmViewportIsAway(viewport, focalViewport.current));
      }} proOptions={{ hideAttribution: true }}
      aria-label="Living Product and go-to-market model, organized left to right with current truth, provisional alternatives, work, outward actions, and returned evidence"
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
      <Controls position="bottom-left" showInteractive={false} />
      <MiniMap position="bottom-right" pannable zoomable nodeStrokeWidth={2} />
    </ReactFlow></div>
  </main>;
}
