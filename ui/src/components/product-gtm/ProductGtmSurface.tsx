import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, useNodesState,
  type EdgeTypes, type NodeTypes, type ReactFlowInstance, type Viewport,
} from "@xyflow/react";
import { LocateFixed } from "lucide-react";
import { getCurrentModel, getMarketMovement } from "@/api";
import type { SystemIndex, WorkIndex } from "@/api";
import type { FirmPlacement, FirmSemanticModel, MarketMovementIndex } from "@/types";
import { ModelBranchReview } from "./ModelBranchReview";
import { OutwardActionReview } from "./OutwardActionReview";
import { ProductGtmEdge } from "./ProductGtmEdge";
import { ProductGtmNavigator } from "./ProductGtmNavigator";
import { ProductGtmNode } from "./ProductGtmNode";
import { ProductPagePanel } from "./ProductPagePanel";
import { useProductGtmDrop } from "./productGtmDrop";
import { reflowExpandedNeighborhood } from "./productGtmLayout";
import { projectAdaptiveProductGtm } from "./productGtmAdaptiveProjection";
import { applyJourneyObservation, journeyObservationByRef, type ProductGtmJourneyObservation } from "./productGtmJourney";
import { type ProductGtmNode as ProductGtmFlowNode } from "./productGtmProjection";
import { PRODUCT_GTM_MIN_ZOOM, PRODUCT_GTM_READABLE_ZOOM, productGtmMotionDuration, productGtmViewportIsAway } from "./productGtmViewport";
import "@xyflow/react/dist/style.css";
import "./product-gtm.css";

const NODE_TYPES: NodeTypes = { productGtm: ProductGtmNode };
const EDGE_TYPES: EdgeTypes = { productGtmEdge: ProductGtmEdge };
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

export function ProductGtmSurface({
  ventureId, index, workIndex, selectedRef, camera, readOnlyReason,
  journeyObservations = [], selectedJourneyOverlayRef, onJourneyOverlayChange,
  onCameraChange, onFocus, onOpenWork, onAskAgent, onUseAgent, onChanged,
}: {
  ventureId: string; index: SystemIndex | null; workIndex: WorkIndex | null; selectedRef: string | null; camera: Viewport | null; placement: FirmPlacement; readOnlyReason: string | null;
  organizeRequest?: number;
  journeyObservations?: ProductGtmJourneyObservation[];
  selectedJourneyOverlayRef?: string | null;
  onJourneyOverlayChange?: (ref: string | null) => void;
  onCameraChange: (camera: Viewport) => void; onFocus: (ref: string | null) => void; onOpenWork: (threadRef: string) => void;
  onAskAgent: (subjectRef?: string, relatedRefs?: string[]) => void; onUseAgent: (agentRef: string, subjectRef?: string) => void; onChanged: () => void;
}) {
  const [model, setModel] = useState<FirmSemanticModel | null>(() => fallbackModel(ventureId, index));
  const [movement, setMovement] = useState<MarketMovementIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [journeyOverlayRef, setJourneyOverlayRef] = useState<string | null>(selectedJourneyOverlayRef ?? null);
  const [refreshKey, setRefreshKey] = useState(0);
  const flowInstance = useRef<ReactFlowInstance<ProductGtmFlowNode> | null>(null);
  const journeyRestore = useRef<{ camera: Viewport | null; selectedRef: string | null } | null>(null);
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
    // index.revision advances when the shell reloads after live work (SSE-driven). Refetch the model so a
    // Product / GTM action that runs on the canvas — mapping the product, a landing branch — surfaces here
    // as it lands, without navigating the founder into Work.
  }, [refreshKey, ventureId, index?.revision]);
  const visibleModel = model ?? fallbackModel(ventureId, index);
  const selected = selectedNodeId(selectedRef);
  const projectionContext = useMemo(() => ({
    unreadSubjectRefs: (workIndex?.items ?? []).filter((item) => item.unread).flatMap((item) => item.subjectRefs),
    unreadThreadRefs: (workIndex?.items ?? []).filter((item) => item.unread).map((item) => item.threadRef),
  }), [workIndex]);
  const baseGraph = useMemo(() => visibleModel
    ? projectAdaptiveProductGtm(visibleModel, movement, selected, projectionContext)
    : null,
  [visibleModel, movement, projectionContext, selected]);
  const selectedJourney = useMemo(
    () => journeyObservationByRef(
      journeyObservations,
      selectedJourneyOverlayRef === undefined ? journeyOverlayRef : selectedJourneyOverlayRef,
    ),
    [journeyObservations, journeyOverlayRef, selectedJourneyOverlayRef],
  );
  const graph = useMemo(
    () => baseGraph ? applyJourneyObservation(baseGraph, selectedJourney) : null,
    [baseGraph, selectedJourney],
  );
  const projectedNodes = useMemo(() => graph?.nodes ?? [], [graph]);
  const projectedEdges = useMemo(() => graph?.edges ?? [], [graph]);
  const { dropNotice, dropActive, dropHandlers } = useProductGtmDrop({ targets: projectedNodes, readOnlyReason, onUseAgent, onAskAgent });
  const selectedNode = projectedNodes.find((node) => node.id === selected) ?? null;
  const branchId = selectedNode?.data.kind === "branch" ? selectedNode.data.ref.replace(/^model-branch:/, "") : null;

  const select = useCallback((id: string | null) => {
    const node = projectedNodes.find((entry) => entry.id === id);
    onFocus(node?.data.ref ?? null);
  }, [onFocus, projectedNodes]);

  const showProductWalk = useCallback(() => {
    onFocus(null);
  }, [onFocus]);

  const interactiveNodes = useMemo(() => projectedNodes.map((node) => {
    const expanded = node.id === selected;
    const isWork = node.data.kind === "work";
    const isWorkflowStep = node.data.kind === "workflow";
    const content = !expanded ? undefined
      : node.data.kind === "branch" && branchId
        ? <ModelBranchReview inline ventureId={ventureId} branchId={branchId} readOnly={Boolean(readOnlyReason)} onClose={() => select(null)} onContinue={(ref) => onAskAgent(ref)} onChanged={() => { refresh(); onChanged(); }} />
        : node.data.action
          ? <OutwardActionReview ventureId={ventureId} action={node.data.action} readOnly={Boolean(readOnlyReason)} onChanged={() => { refresh(); onChanged(); }} />
          : node.data.role === "page" && node.data.page
            ? <ProductPagePanel ventureId={ventureId} name={node.data.name} summary={node.data.detail} pageRef={node.data.ref} page={node.data.page} readOnly={Boolean(readOnlyReason)} onOpenWork={onOpenWork} />
            : undefined;
    return {
      ...node,
      zIndex: expanded ? 20 : node.zIndex,
      data: {
        ...node.data, expanded, expandedContent: content,
        actionLabel: node.data.kind === "branch" || node.data.action || node.data.role === "page" ? undefined : isWork ? "Open work" : isWorkflowStep ? "Work on this step" : "Work on this",
        onAction: isWork ? () => onOpenWork(node.data.ref) : () => onAskAgent(node.data.workRef ?? node.data.ref),
        onCollapse: () => select(null),
      },
    };
  }), [branchId, projectedNodes, onAskAgent, onChanged, onOpenWork, readOnlyReason, refresh, select, selected, ventureId]);

  const [nodes, setNodes, onNodesChange] = useNodesState<ProductGtmFlowNode>([]);
  const reconcileKey = `${selected ?? ""}:${interactiveNodes.map((node) => `${node.id}:${node.position.x}:${node.position.y}:${node.data.name}:${node.data.detail}:${node.data.meta}:${node.data.focus}:${node.data.active}:${node.data.journeyCountLabel}`).join("|")}`;
  const reconcileNodes = useEffectEvent(() => {
    setNodes(reflowExpandedNeighborhood(interactiveNodes, selected));
  });
  useEffect(() => { reconcileNodes(); }, [reconcileKey]);
  const frameSignature = `${ventureId}:${visibleModel?.revision ?? "fallback"}:${graph?.projection.kind ?? "empty"}:${graph?.chapterAnchorId ?? "product-walk"}:${graph?.initialFrameIds.join(",") ?? ""}`;
  const framedSignature = useRef<string | null>(null);
  const frameCurrent = useCallback(async (duration = 180) => {
    const instance = flowInstance.current;
    if (!instance || nodes.length === 0) return;
    if (!graph) return;
    const frameIds = new Set(graph.initialFrameIds);
    const currentSelection = selected ? nodes.find((node) => node.id === selected) : null;
    const framingNodes = currentSelection?.data.kind === "workflow"
      ? [currentSelection]
      : graph.projection.kind === "play"
        ? nodes.filter((node) => frameIds.has(node.id))
        : currentSelection ? [currentSelection] : nodes.filter((node) => frameIds.has(node.id));
    const targets = framingNodes.length ? framingNodes : nodes.slice(0, 1);
    await instance.fitView({
      nodes: targets,
      padding: 0.2,
      minZoom: PRODUCT_GTM_READABLE_ZOOM,
      maxZoom: 0.98,
      duration: productGtmMotionDuration(duration),
    });
    if (instance.getViewport().zoom < PRODUCT_GTM_READABLE_ZOOM - 0.001) {
      const bounds = instance.getNodesBounds(targets);
      await instance.setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, {
        zoom: PRODUCT_GTM_READABLE_ZOOM,
        duration: productGtmMotionDuration(duration),
      });
    }
    focalViewport.current = instance.getViewport();
    window.requestAnimationFrame(() => setCameraAway(false));
  }, [graph, nodes, selected]);
  useEffect(() => {
    if (!graph || !flowInstance.current || nodes.length === 0 || framedSignature.current === frameSignature) return;
    const presentIds = new Set(nodes.map((node) => node.id));
    if (graph.initialFrameIds.some((id) => !presentIds.has(id))) return;
    framedSignature.current = frameSignature;
    void frameCurrent(graph.projection.kind === "product-walk" && !selected ? 0 : 180);
  }, [flowReady, frameCurrent, frameSignature, graph, nodes, selected]);

  const latestJourney = useMemo(
    () => [...journeyObservations].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null,
    [journeyObservations],
  );
  const openJourney = useCallback(() => {
    if (!latestJourney) return;
    journeyRestore.current = { camera: flowInstance.current?.getViewport() ?? camera, selectedRef };
    setJourneyOverlayRef(latestJourney.id);
    onJourneyOverlayChange?.(latestJourney.id);
  }, [camera, latestJourney, onJourneyOverlayChange, selectedRef]);
  const closeJourney = useCallback(() => {
    setJourneyOverlayRef(null);
    onJourneyOverlayChange?.(null);
    const restore = journeyRestore.current;
    journeyRestore.current = null;
    if (!restore) return;
    onFocus(restore.selectedRef);
    if (restore.camera && flowInstance.current) {
      void flowInstance.current.setViewport(restore.camera, { duration: productGtmMotionDuration(140) });
      onCameraChange(restore.camera);
    }
  }, [onCameraChange, onFocus, onJourneyOverlayChange]);

  if (!visibleModel || !graph || projectedNodes.length === 0) return <main className="product-gtm-empty"><div><span>Product / GTM</span><h1>What are you trying to make true?</h1><p>State the direction once. Claude or Codex can ground the repository, pursue several approaches, and materialize Product and go-to-market alternatives here.</p><button type="button" onClick={() => onAskAgent()}>Begin real work</button>{error ? <small role="status">Croki could not read the local model yet. Your direction is still available.</small> : null}</div></main>;
  return <main className="product-gtm-surface" data-projection={graph.projection.kind} data-has-selection={selectedNode ? "true" : undefined} data-has-focus={graph.projection.kind !== "product-walk" ? "true" : undefined} data-drop-active={dropActive ? "true" : undefined} data-zoom={zoomLevel < 0.78 ? "overview" : "detail"}>
    {readOnlyReason || error ? <div className="product-gtm-state"><span role="status">{readOnlyReason ?? "Showing the last current venture model. Reconnecting locally."}</span>{!readOnlyReason && error ? <button type="button" onClick={refresh}>Try again</button> : null}</div> : null}
    {dropNotice ? <p className="product-gtm-drop-status" role="status">{dropNotice}</p> : null}
    {graph.projection.kind !== "product-walk" ? <aside className="product-gtm-context" aria-live="polite">
      <div><strong>{graph.focusName}</strong><span>{graph.focusSummary}</span></div>
      <button type="button" onClick={showProductWalk}>Product walk</button>
    </aside> : null}
    <ProductGtmNavigator model={visibleModel} movement={movement} selectedRef={selectedRef} onDraftPlay={() => onAskAgent()} onFocus={onFocus}
      journeyAvailable={Boolean(latestJourney)} journeyActive={Boolean(selectedJourney)}
      onToggleJourney={selectedJourney ? closeJourney : openJourney} />
    {selectedJourney ? <aside className="product-gtm-journey-receipt" aria-label="Observed journey source">
      <span>{selectedJourney.sourceRef} · {selectedJourney.window.from} to {selectedJourney.window.to} · {selectedJourney.window.timezone}</span>
      <button type="button" onClick={closeJourney}>Dismiss</button>
    </aside> : null}
    {cameraAway ? <button className="product-gtm-return-current" type="button" onClick={() => void frameCurrent()}>
      <LocateFixed aria-hidden="true" />Return to current
    </button> : null}
    <div className="product-gtm-canvas" {...dropHandlers}><ReactFlow
      nodes={nodes} edges={projectedEdges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
      defaultViewport={camera ?? undefined} onInit={(instance) => { flowInstance.current = instance; setFlowReady(true); }}
      minZoom={PRODUCT_GTM_MIN_ZOOM} maxZoom={1.8} panOnDrag selectionOnDrag={false} nodesConnectable={false} nodesDraggable={false}
      onNodesChange={onNodesChange}
      onNodeClick={(_event, node) => select(node.id === selected ? (node.data.kind === "workflow" ? node.data.workRef?.replace(/^object:/, "") ?? null : null) : node.id)} onPaneClick={() => { if (selected) select(null); }}
      onMoveEnd={(event, viewport) => {
        setZoomLevel(viewport.zoom);
        onCameraChange(viewport);
        if (event && focalViewport.current) setCameraAway(productGtmViewportIsAway(viewport, focalViewport.current));
      }} proOptions={{ hideAttribution: true }}
      aria-label="Product and go-to-market canvas, contextually composed around the current Product walk, consequence, play, or evidence return"
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
      <Controls position="bottom-left" showInteractive={false} />
      <MiniMap position="bottom-right" pannable zoomable nodeStrokeWidth={2} />
    </ReactFlow></div>
  </main>;
}
