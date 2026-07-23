import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, useNodesState,
  type EdgeTypes, type NodeTypes, type ReactFlowInstance, type Viewport,
} from "@xyflow/react";
import { LocateFixed, Route } from "lucide-react";
import { getCurrentModel, getMarketMovement, putPlacement } from "@/api";
import type { SystemIndex, WorkIndex } from "@/api";
import type { FirmPlacement, FirmSemanticModel, MarketMovementIndex } from "@/types";
import { ModelBranchReview } from "./ModelBranchReview";
import { OutwardActionReview } from "./OutwardActionReview";
import { ProductGtmEdge } from "./ProductGtmEdge";
import { ProductGtmNavigator } from "./ProductGtmNavigator";
import { ProductGtmNode } from "./ProductGtmNode";
import { ProductPagePanel } from "./ProductPagePanel";
import { useProductGtmDrop } from "./productGtmDrop";
import { productGtmTerritoryFor, reflowExpandedNeighborhood } from "./productGtmLayout";
import { productGtmWorkflowGraph } from "./productGtmWorkflow";
import { projectProductGtm, type ProductGtmNode as ProductGtmFlowNode } from "./productGtmProjection";
import { PRODUCT_GTM_MIN_ZOOM, PRODUCT_GTM_READABLE_ZOOM, PRODUCT_GTM_WHOLE_ZOOM, productGtmMotionDuration, productGtmViewportIsAway } from "./productGtmViewport";
import "@xyflow/react/dist/style.css";
import "./product-gtm.css";

const NODE_TYPES: NodeTypes = { productGtm: ProductGtmNode };
const EDGE_TYPES: EdgeTypes = { productGtmEdge: ProductGtmEdge };
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

export function ProductGtmSurface({
  ventureId, index, workIndex, selectedRef, camera, placement, readOnlyReason,
  organizeRequest = 0, onCameraChange, onFocus, onOpenWork, onAskAgent, onUseAgent, onChanged,
}: {
  ventureId: string; index: SystemIndex | null; workIndex: WorkIndex | null; selectedRef: string | null; camera: Viewport | null; placement: FirmPlacement; readOnlyReason: string | null;
  organizeRequest?: number;
  onCameraChange: (camera: Viewport) => void; onFocus: (ref: string | null) => void; onOpenWork: (threadRef: string) => void;
  onAskAgent: (subjectRef?: string, relatedRefs?: string[]) => void; onUseAgent: (agentRef: string, subjectRef?: string) => void; onChanged: () => void;
}) {
  const [model, setModel] = useState<FirmSemanticModel | null>(() => fallbackModel(ventureId, index));
  const [movement, setMovement] = useState<MarketMovementIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wholeVentureFor, setWholeVentureFor] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
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
    // index.revision advances when the shell reloads after live work (SSE-driven). Refetch the model so a
    // Product / GTM action that runs on the canvas — mapping the product, a landing branch — surfaces here
    // as it lands, without navigating the founder into Work.
  }, [refreshKey, ventureId, index?.revision]);
  const visibleModel = model ?? fallbackModel(ventureId, index);
  // The territory legend advertises a GTM territory; when no play exists yet the GTM band is honestly
  // empty rather than missing. A play is a workflow graph on a gtm or shared object.
  const gtmEmpty = useMemo(() => !(visibleModel?.objects ?? []).some((object) =>
    ["gtm", "shared"].includes(productGtmTerritoryFor(object.type, object.properties))
    && Boolean(productGtmWorkflowGraph(object.properties))
  ), [visibleModel]);
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
  const { dropNotice, setDropNotice, dropActive, dropHandlers } = useProductGtmDrop({ targets: graph.nodes, readOnlyReason, onUseAgent, onAskAgent });
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
        actionLabel: node.data.kind === "branch" || node.data.action || node.data.role === "page" ? undefined : isWork ? "Open exact work" : isWorkflowStep ? "Work on this step" : "Work on this",
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
    // The whole venture frames every node so entry lands composed in view — never a subset that leaves
    // the rest scattered off-screen. A selected play frames its FULL step chain — the length of a long
    // play is information, never cropped to its opening steps — so like the whole venture it may drop to
    // the map floor. A focused chapter neighborhood holds the readable floor.
    const wholeVenture = graph.chapterKind === "whole" && !currentSelection;
    const playFocus = workflowFocus && currentSelection?.data.kind !== "workflow";
    const floor = wholeVenture || playFocus ? PRODUCT_GTM_MIN_ZOOM : PRODUCT_GTM_READABLE_ZOOM;
    const workflowNodes = nodes.filter((node) => focusIds.has(node.id)).sort((left, right) => left.position.x - right.position.x || left.position.y - right.position.y);
    const framingNodes = wholeVenture
      ? nodes
      : currentSelection?.data.kind === "workflow"
        ? [currentSelection]
        : workflowFocus
          ? workflowNodes
          : currentSelection ? [currentSelection] : nodes.filter((node) => focusIds.has(node.id));
    const targets = framingNodes.length ? framingNodes : nodes.slice(0, 1);
    await instance.fitView({
      nodes: targets,
      padding: 0.2,
      minZoom: floor,
      maxZoom: 0.98,
      duration: productGtmMotionDuration(duration),
    });
    // React Flow can resolve an early fit before its internal measurements have caught up with
    // controlled nodes, leaving a persisted overview camera untouched. Center the exact chapter at
    // the framing floor so an old session can never defeat the default composition. The whole venture
    // is exempt: fitView already overrides the persisted camera, and forcing the floor there would crop
    // a wide venture the fit deliberately zoomed out to compose.
    if (!wholeVenture && instance.getViewport().zoom < floor - 0.001) {
      const bounds = instance.getNodesBounds(targets);
      await instance.setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, {
        zoom: floor,
        duration: productGtmMotionDuration(duration),
      });
    }
    focalViewport.current = instance.getViewport();
    window.requestAnimationFrame(() => setCameraAway(false));
  }, [graph.chapterKind, graph.initialFocusIds, nodes, selected]);
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
  }, [onChanged, setDropNotice, ventureId]);

  const organizedRequest = useRef(0);
  useEffect(() => {
    if (!organizeRequest || organizeRequest === organizedRequest.current || readOnlyReason) return;
    organizedRequest.current = organizeRequest;
    const organized = reflowExpandedNeighborhood(interactiveNodes, selected);
    setNodes(organized);
    const nextPositions = { ...placementPositions.current };
    for (const node of organized) delete nextPositions[placementKey(node.id)];
    placementPositions.current = nextPositions;
    saveQueue.current = saveQueue.current.then(async () => {
      const response = await putPlacement(ventureId, { positions: nextPositions, expectedRevision: placementRevision.current });
      placementRevision.current = response.placement.revision;
      placementPositions.current = { ...response.placement.positions };
      setDropNotice("Canvas organized. Product and GTM truth was not changed.");
      onChanged();
      window.requestAnimationFrame(() => {
        const instance = flowInstance.current;
        if (!instance || !organized.length) return;
        const focusIds = new Set(graph.initialFocusIds);
        const targets = organized.filter((node) => focusIds.has(node.id));
        void instance.fitView({ nodes: targets.length ? targets : organized, padding: .16, minZoom: PRODUCT_GTM_WHOLE_ZOOM, maxZoom: .98, duration: productGtmMotionDuration(220) });
      });
    }).catch(() => {
      setDropNotice("The canvas could not be organized. Its prior placement remains available.");
      onChanged();
    });
  }, [graph.initialFocusIds, interactiveNodes, onChanged, organizeRequest, readOnlyReason, selected, setDropNotice, setNodes, ventureId]);

  if (!visibleModel || graph.nodes.length === 0) return <main className="product-gtm-empty"><div><span>Product / GTM</span><h1>What are you trying to make true?</h1><p>State the direction once. Claude or Codex can ground the repository, pursue several approaches, and materialize Product and go-to-market alternatives here.</p><button type="button" onClick={() => onAskAgent()}>Begin real work</button>{error ? <small role="status">Drover could not read the local model yet. Your direction is still available.</small> : null}</div></main>;
  return <main className="product-gtm-surface" data-has-selection={selectedNode ? "true" : undefined} data-has-focus={graph.chapterKind !== "whole" ? "true" : undefined} data-drop-active={dropActive ? "true" : undefined} data-zoom={zoomLevel < 0.78 ? "overview" : "detail"}>
    {readOnlyReason || error ? <div className="product-gtm-state"><span role="status">{readOnlyReason ?? "Showing the last current venture model. Reconnecting locally."}</span>{!readOnlyReason && error ? <button type="button" onClick={refresh}>Try again</button> : null}</div> : null}
    {dropNotice ? <p className="product-gtm-drop-status" role="status">{dropNotice}</p> : null}
    {graph.chapterKind !== "whole" ? <aside className="product-gtm-context" aria-live="polite">
      {graph.chapterKind === "selection" ? null : <div><strong>{graph.focusName}</strong><span>{graph.focusSummary}</span></div>}
      <button type="button" onClick={showWholeVenture}>Whole venture</button>
    </aside> : null}
    <ProductGtmNavigator model={visibleModel} movement={movement} selectedRef={selectedRef} onDraftPlay={() => onAskAgent()} onFocus={(ref) => {
      setWholeVentureFor(null);
      onFocus(ref);
    }} />
    {cameraAway ? <button className="product-gtm-return-current" type="button" onClick={() => void frameCurrent()}>
      <LocateFixed aria-hidden="true" />Return to current
    </button> : null}
    {gtmEmpty ? <p className="product-gtm-empty-gtm" role="note">
      <Route aria-hidden="true" />
      No GTM plays yet — a play appears here once you draft or run one.
    </p> : null}
    <div className="product-gtm-canvas" {...dropHandlers}><ReactFlow
      nodes={nodes} edges={graph.edges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
      defaultViewport={camera ?? undefined} onInit={(instance) => { flowInstance.current = instance; setFlowReady(true); }}
      minZoom={PRODUCT_GTM_MIN_ZOOM} maxZoom={1.8} panOnDrag selectionOnDrag={false} nodesConnectable={false} nodesDraggable={!readOnlyReason}
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
