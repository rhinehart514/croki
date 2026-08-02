import type {
  CrokiContext,
  CrokiContextEdge,
  CrokiContextReference,
} from "@croki/shared/crokiContext";
import { MarkerType, ReactFlow, useNodesState, type Connection, type Edge } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";

import type { ActivePlanState } from "~/session-logic";
import { Button } from "../ui/button";
import {
  CrokiCanvasEdgeRail,
  CrokiCanvasFieldFooter,
  crokiCanvasEdgeId,
} from "./CrokiCanvasFieldChrome";
import { crokiCanvasObjectTypes, type CrokiCanvasObject } from "./CrokiCanvasObjects";
import { crokiViewEmptyCopy, type CrokiCanvasView } from "./crokiCanvasLanguage";
import { projectCrokiCanvasScene } from "./crokiCanvasScene";
import {
  buildCrokiCanvasObjects,
  loadCrokiCanvasPositions,
  persistCrokiCanvasPositions,
  type CrokiCanvasStoredPositions,
} from "./crokiCanvasWorkflowLayout";

interface CrokiCanvasFieldProps {
  readonly activePlan: ActivePlanState | null;
  readonly context: CrokiContext;
  readonly focusIds: readonly string[];
  readonly layoutKey: string;
  readonly onBuildFromRepository?: () => void;
  readonly onClearSelection: () => void;
  readonly onConnect: (connection: {
    readonly from: string;
    readonly to: string;
  }) => CrokiContextEdge | null;
  readonly onDisconnect: (edge: CrokiContextEdge) => void;
  readonly onReplaceEdge: (
    previous: CrokiContextEdge,
    next: CrokiContextEdge,
  ) => CrokiContextEdge | null;
  readonly onOpenPlan?: () => void;
  readonly onOpenReference?: (reference: CrokiContextReference) => void;
  readonly onSelect: (id: string) => void;
  readonly selectedId?: string | null;
  readonly view: CrokiCanvasView;
}

export function CrokiCanvasField(props: CrokiCanvasFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fieldWidth, setFieldWidth] = useState(540);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const scene = useMemo(
    () =>
      projectCrokiCanvasScene({
        activePlan: props.activePlan,
        context: props.context,
        focusIds: props.focusIds,
        view: props.view,
      }),
    [props.activePlan, props.context, props.focusIds, props.view],
  );
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    setFieldWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setFieldWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [scene.items.length]);
  const layoutBucket = fieldWidth < 640 ? "narrow" : fieldWidth < 1040 ? "medium" : "wide";
  const positionStorageKey = `${props.layoutKey}:${props.view}:${layoutBucket}`;
  const [storedPositions, setStoredPositions] = useState<CrokiCanvasStoredPositions>(() =>
    loadCrokiCanvasPositions(positionStorageKey),
  );
  useEffect(() => {
    setStoredPositions(loadCrokiCanvasPositions(positionStorageKey));
  }, [positionStorageKey]);
  const projectedNodes = useMemo(
    () =>
      buildCrokiCanvasObjects({
        fieldWidth,
        focusId: scene.focusId,
        items: scene.items,
        onSelect: (id) => {
          const item = scene.items.find((candidate) => candidate.id === id);
          if (!item) return;
          if (item.kind === "semantic") props.onSelect(item.node.id);
          else if (item.kind === "plan-step") props.onOpenPlan?.();
          else props.onOpenReference?.(item.reference);
        },
        selectedId: props.selectedId ?? null,
        storedPositions,
        edges: scene.edges,
      }),
    [
      fieldWidth,
      props.onOpenPlan,
      props.onOpenReference,
      props.onSelect,
      props.selectedId,
      scene,
      storedPositions,
    ],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<CrokiCanvasObject>(projectedNodes);
  useEffect(() => setNodes(projectedNodes), [projectedNodes, setNodes]);

  const edges = useMemo<Edge[]>(
    () =>
      scene.edges.map((edge) => {
        const id = crokiCanvasEdgeId(edge, edge.edgeKind);
        const touchesRetiredItem = scene.items.some(
          (item) =>
            item.kind === "semantic" &&
            item.node.status === "retired" &&
            (item.id === edge.from || item.id === edge.to),
        );
        const focusEdge =
          !props.selectedId &&
          !selectedEdgeId &&
          !touchesRetiredItem &&
          Boolean(scene.focusId) &&
          (edge.from === scene.focusId || edge.to === scene.focusId);
        const emphasized =
          id === selectedEdgeId ||
          focusEdge ||
          (Boolean(props.selectedId) &&
            (edge.from === props.selectedId || edge.to === props.selectedId));
        return {
          id,
          className: "croki-canvas-edge",
          source: edge.from,
          target: edge.to,
          reconnectable: edge.mutable,
          selectable: edge.edgeKind !== "plan",
          type: "default",
          label: emphasized ? edge.relation : undefined,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: emphasized ? "#d4d4d8" : "#27272a",
            width: 13,
            height: 13,
          },
          style: {
            stroke: emphasized ? "#d4d4d8" : "#27272a",
            strokeWidth: emphasized ? 1.35 : 1,
          },
          labelStyle: {
            fill: emphasized ? "#d4d4d8" : "#27272a",
            fontSize: 10,
            letterSpacing: "0.04em",
          },
          labelBgStyle: { fill: "#000", fillOpacity: 0.92 },
          labelBgPadding: [5, 2],
          labelBgBorderRadius: 0,
        };
      }),
    [props.selectedId, scene.edges, scene.focusId, selectedEdgeId],
  );

  const selectedEdge =
    scene.edges.find((edge) => crokiCanvasEdgeId(edge, edge.edgeKind) === selectedEdgeId) ?? null;

  if (scene.items.length === 0) return <EmptyCanvas props={props} />;

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-72 flex-1 flex-col overflow-hidden bg-black"
      data-canvas-layout={layoutBucket}
    >
      <div className="relative min-h-0 flex-1">
        <ReactFlow<CrokiCanvasObject>
          key={`${layoutBucket}:${scene.topologyKey}`}
          aria-label="Visual Canvas field"
          colorMode="dark"
          nodes={nodes}
          edges={edges}
          nodeTypes={crokiCanvasObjectTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_, dragged) => {
            const positions = Object.fromEntries(
              nodes.map((node) => [
                node.id,
                node.id === dragged.id ? dragged.position : node.position,
              ]),
            );
            setStoredPositions(positions);
            persistCrokiCanvasPositions(positionStorageKey, positions);
          }}
          onConnect={(connection: Connection) => {
            if (connection.source && connection.target) {
              const created = props.onConnect({ from: connection.source, to: connection.target });
              if (created) setSelectedEdgeId(crokiCanvasEdgeId(created));
            }
          }}
          onEdgeClick={(_, edge) => {
            const semanticEdge = scene.edges.find(
              (candidate) => crokiCanvasEdgeId(candidate, candidate.edgeKind) === edge.id,
            );
            if (semanticEdge?.edgeKind === "reference") {
              setSelectedEdgeId(null);
              props.onSelect(semanticEdge.from);
              return;
            }
            if (!semanticEdge?.mutable) return;
            setSelectedEdgeId(edge.id);
            props.onClearSelection();
          }}
          onReconnect={(oldEdge, connection) => {
            const previous = scene.edges.find(
              (edge) => crokiCanvasEdgeId(edge, edge.edgeKind) === oldEdge.id,
            );
            if (!previous?.mutable || !connection.source || !connection.target) return;
            const previousContextEdge = toCrokiContextEdge(previous);
            const next = props.onReplaceEdge(previousContextEdge, {
              ...previousContextEdge,
              from: connection.source,
              to: connection.target,
            });
            if (next) setSelectedEdgeId(crokiCanvasEdgeId(next));
          }}
          onPaneClick={() => {
            setSelectedEdgeId(null);
            props.onClearSelection();
          }}
          fitView
          fitViewOptions={{
            padding: layoutBucket === "wide" ? 0.18 : 0.08,
            minZoom: layoutBucket === "wide" ? 0.72 : 0.68,
            maxZoom: 1,
          }}
          minZoom={layoutBucket === "wide" ? 0.72 : 0.68}
          maxZoom={1.6}
          nodesDraggable
          nodesConnectable
          nodesFocusable={false}
          selectionOnDrag={false}
          zoomOnDoubleClick={false}
          connectionLineStyle={{ stroke: "#a1a1aa", strokeWidth: 1.25 }}
          proOptions={{ hideAttribution: true }}
        />
      </div>
      {selectedEdge ? (
        <CrokiCanvasEdgeRail
          edge={selectedEdge}
          items={scene.items}
          onRemove={() => {
            props.onDisconnect(toCrokiContextEdge(selectedEdge));
            setSelectedEdgeId(null);
          }}
          onReplace={(nextEdge) => {
            const next = props.onReplaceEdge(toCrokiContextEdge(selectedEdge), nextEdge);
            if (next) setSelectedEdgeId(crokiCanvasEdgeId(next));
          }}
        />
      ) : (
        <CrokiCanvasFieldFooter
          hasCustomLayout={Object.keys(storedPositions).length > 0}
          onResetLayout={() => {
            setStoredPositions({});
            persistCrokiCanvasPositions(positionStorageKey, {});
          }}
        />
      )}
    </div>
  );
}

function toCrokiContextEdge(edge: CrokiContextEdge): CrokiContextEdge {
  return { from: edge.from, relation: edge.relation, to: edge.to };
}

function EmptyCanvas(props: { readonly props: CrokiCanvasFieldProps }) {
  return (
    <div className="flex min-h-72 flex-1 items-center justify-center bg-black p-8 text-center">
      <div className="max-w-64">
        <p className="text-sm text-white">{crokiViewEmptyCopy(props.props.view)}</p>
        {props.props.view === "product" && props.props.onBuildFromRepository ? (
          <Button
            className="mt-4"
            size="sm"
            variant="outline"
            onClick={props.props.onBuildFromRepository}
          >
            <Sparkles className="size-3.5" aria-hidden />
            Build from repository
          </Button>
        ) : null}
      </div>
    </div>
  );
}
