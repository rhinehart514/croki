import { MarkerType, ReactFlow, type Edge, type NodeMouseHandler } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";

import { crokiCanvasLiveObjectTypes, type CrokiCanvasLiveNode } from "./CrokiCanvasLiveObjects";
import type { CrokiCanvasLiveObject, CrokiCanvasLiveScene } from "./crokiCanvasLiveScene";

interface CrokiCanvasLiveFieldProps {
  readonly scene: CrokiCanvasLiveScene;
  readonly focusMode: "all" | "attention";
  readonly selectedIds: readonly string[];
  readonly onClearSelection: () => void;
  readonly onOpen: (object: CrokiCanvasLiveObject) => void;
  readonly onSelect: (object: CrokiCanvasLiveObject) => void;
}

/** Read-only spatial projection of the perception stream. Layout is derived on every observation. */
export function CrokiCanvasLiveField(props: CrokiCanvasLiveFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [fieldWidth, setFieldWidth] = useState(800);
  const visibleObjects = useMemo(
    () => visibleSceneObjects(props.scene, props.focusMode),
    [props.focusMode, props.scene],
  );
  const visibleIds = useMemo(
    () => new Set(visibleObjects.map((object) => object.id)),
    [visibleObjects],
  );
  const selectedIds = useMemo(() => new Set(props.selectedIds), [props.selectedIds]);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const update = () => setFieldWidth(element.getBoundingClientRect().width);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => {
    const columns = fieldWidth >= 1120 ? 3 : fieldWidth >= 720 ? 2 : 1;
    const bySource = new Map<string, number>();
    return Object.fromEntries(
      visibleObjects.map((object) => {
        const sourceIndex = bySource.get(object.source) ?? 0;
        bySource.set(object.source, sourceIndex + 1);
        const group = sourceOrder(object);
        const localColumn = sourceIndex % columns;
        const localRow = Math.floor(sourceIndex / columns);
        return [object.id, { x: localColumn * 356, y: group * 236 + localRow * 196 }];
      }),
    );
  }, [fieldWidth, visibleObjects]);

  const projectedNodes = useMemo(
    () =>
      visibleObjects.map(
        (object): CrokiCanvasLiveNode => ({
          id: object.id,
          type: "live-object",
          position: layout[object.id] ?? { x: 0, y: 0 },
          width: object.source === "attention" ? 390 : object.source === "visual" ? 320 : 300,
          height: object.source === "attention" ? 154 : object.source === "reference" ? 130 : 170,
          draggable: false,
          selectable: true,
          data: {
            object,
            selected: selectedIds.has(object.id),
            connected: props.scene.edges.some(
              (edge) => edge.from === object.id || edge.to === object.id,
            ),
            onSelect: () => props.onSelect(object),
            onOpen: props.onOpen,
          },
        }),
      ),
    [layout, props.onOpen, props.onSelect, props.scene.edges, selectedIds, visibleObjects],
  );
  const edges = useMemo<Edge[]>(
    () =>
      props.scene.edges
        .filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
        .map((edge, index) => {
          const emphasized = selectedIds.has(edge.from) || selectedIds.has(edge.to);
          const edgeColor =
            edge.kind === "epistemic"
              ? "#6f6a57"
              : edge.kind === "source"
                ? "#3f3f46"
                : edge.kind === "temporal"
                  ? "#365064"
                  : "#52525b";
          return {
            id: `${edge.from}:${edge.relation}:${edge.to}:${index}`,
            source: edge.from,
            target: edge.to,
            type: "default",
            selectable: false,
            label: emphasized || props.focusMode === "attention" ? edge.relation : undefined,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: emphasized ? "#f4f4f5" : edgeColor,
              width: 10,
              height: 10,
            },
            style: {
              stroke: emphasized ? "#f4f4f5" : edgeColor,
              strokeWidth: emphasized ? 1.25 : 0.8,
            },
            labelStyle: {
              fill: emphasized ? "#f4f4f5" : edgeColor,
              fontSize: 9,
              letterSpacing: "0.04em",
            },
            labelBgStyle: { fill: "#000", fillOpacity: 0.95 },
            labelBgPadding: [4, 2],
            labelBgBorderRadius: 0,
          };
        }),
    [props.focusMode, props.scene.edges, selectedIds, visibleIds],
  );

  const onNodeClick: NodeMouseHandler<CrokiCanvasLiveNode> = (_, node) => {
    const object = props.scene.objects.find((candidate) => candidate.id === node.id);
    if (object) props.onSelect(object);
  };

  if (visibleObjects.length === 0) {
    return (
      <div
        ref={rootRef}
        className="flex min-h-72 flex-1 items-center justify-center bg-black p-8 text-center"
      >
        <div>
          <p className="text-sm text-zinc-300">Waiting for perception.</p>
          <p className="mt-2 text-xs text-zinc-600">
            The Canvas appears as the agent observes the project.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div
      ref={rootRef}
      className="relative min-h-72 flex-1 bg-black"
      data-canvas-focus={props.focusMode}
    >
      <ReactFlow<CrokiCanvasLiveNode>
        key={`${props.scene.updatedAt}:${props.focusMode}:${visibleObjects.map((object) => object.id).join(",")}`}
        aria-label="Live Canvas field"
        className="!bg-black"
        colorMode="dark"
        nodes={projectedNodes}
        edges={edges}
        nodeTypes={crokiCanvasLiveObjectTypes}
        onNodeClick={onNodeClick}
        onPaneClick={props.onClearSelection}
        fitView
        fitViewOptions={{ padding: fieldWidth >= 1120 ? 0.15 : 0.08, minZoom: 0.55, maxZoom: 1 }}
        minZoom={0.38}
        maxZoom={1.45}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable
        selectionOnDrag={false}
        panOnDrag
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
}

function visibleSceneObjects(scene: CrokiCanvasLiveScene, focusMode: "all" | "attention") {
  if (focusMode === "all" || scene.attentionIds.length === 0) return scene.objects;
  const ids = new Set(["attention:stream", ...scene.attentionIds]);
  for (const edge of scene.edges) {
    if (ids.has(edge.from)) ids.add(edge.to);
    if (ids.has(edge.to)) ids.add(edge.from);
  }
  return scene.objects.filter((object) => ids.has(object.id));
}

function sourceOrder(object: CrokiCanvasLiveObject): number {
  if (object.source === "attention") return 0;
  if (object.source === "agent") return 1;
  if (object.source === "outcome") return 2;
  if (object.source === "release") return 3;
  if (object.source === "visual") return 4;
  if (object.source === "context") return 5;
  return 6;
}
