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

/** Read-only composition of the agent's current working understanding. */
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

  const layout = useMemo(
    () => composeWorkingUnderstanding(visibleObjects, fieldWidth),
    [fieldWidth, visibleObjects],
  );

  const projectedNodes = useMemo(
    () =>
      visibleObjects.map(
        (object): CrokiCanvasLiveNode => ({
          id: object.id,
          type: "live-object",
          position: layout[object.id]?.position ?? { x: 0, y: 0 },
          width: layout[object.id]?.width ?? 320,
          height: layout[object.id]?.height ?? 154,
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
  const edges = useMemo<Edge[]>(() => {
    if (selectedIds.size === 0) return [];
    return props.scene.edges
      .filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
      .filter((edge) => selectedIds.has(edge.from) || selectedIds.has(edge.to))
      .map((edge, index) => {
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
          label: edge.relation,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#a1a1aa",
            width: 10,
            height: 10,
          },
          style: {
            stroke: edgeColor,
            strokeWidth: 1,
            opacity: 0.7,
          },
          labelStyle: {
            fill: "#a1a1aa",
            fontSize: 9,
            letterSpacing: "0.04em",
          },
          labelBgStyle: { fill: "#000", fillOpacity: 0.95 },
          labelBgPadding: [4, 2],
          labelBgBorderRadius: 0,
        };
      });
  }, [props.focusMode, props.scene.edges, selectedIds, visibleIds]);

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
          <p className="text-sm text-zinc-300">No working understanding yet.</p>
          <p className="mt-2 text-xs text-zinc-600">
            Start the Thread and Canvas will keep the meaningful result in view.
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
        fitViewOptions={{ padding: fieldWidth >= 1120 ? 0.16 : 0.1, minZoom: 0.55, maxZoom: 1 }}
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

interface ComposedObjectLayout {
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
}

function composeWorkingUnderstanding(
  objects: readonly CrokiCanvasLiveObject[],
  fieldWidth: number,
): Record<string, ComposedObjectLayout> {
  const twoColumns = fieldWidth >= 760;
  const columnWidth = twoColumns ? 340 : Math.min(440, Math.max(280, fieldWidth - 48));
  const gap = 24;
  const compositionWidth = twoColumns ? columnWidth * 2 + gap : columnWidth;
  const layout: Record<string, ComposedObjectLayout> = {};
  const unplaced = [...objects];
  const explicitOutcome = unplaced.findIndex((object) => object.source === "outcome");
  const outcomeIndex = explicitOutcome >= 0 ? explicitOutcome : unplaced.findIndex(isOutcomeLike);
  const outcome = outcomeIndex >= 0 ? unplaced.splice(outcomeIndex, 1)[0] : undefined;
  const judgments = unplaced.filter(isJudgment);
  const evidence = unplaced.filter(isEvidence);
  const understanding = unplaced.filter(
    (object) => !judgments.includes(object) && !evidence.includes(object),
  );
  let y = 0;

  if (outcome) {
    layout[outcome.id] = {
      position: { x: 0, y },
      width: compositionWidth,
      height: 148,
    };
    y += 148 + 36;
  }

  y = placeGrid(layout, understanding, y, columnWidth, gap, twoColumns, 154);
  y = placeGrid(layout, judgments, y, columnWidth, gap, twoColumns, 168);
  placeGrid(layout, evidence, y, columnWidth, gap, twoColumns, 112);
  return layout;
}

function placeGrid(
  layout: Record<string, ComposedObjectLayout>,
  objects: readonly CrokiCanvasLiveObject[],
  y: number,
  width: number,
  gap: number,
  twoColumns: boolean,
  height: number,
): number {
  if (objects.length === 0) return y;
  const columns = twoColumns ? 2 : 1;
  for (const [index, object] of objects.entries()) {
    layout[object.id] = {
      position: {
        x: (index % columns) * (width + gap),
        y: y + Math.floor(index / columns) * (height + gap),
      },
      width,
      height,
    };
  }
  return y + Math.ceil(objects.length / columns) * (height + gap) + 12;
}

function isOutcomeLike(object: CrokiCanvasLiveObject): boolean {
  return object.source === "attention" || object.source === "release";
}

function isJudgment(object: CrokiCanvasLiveObject): boolean {
  return (
    object.kind === "decision" ||
    object.status === "provisional" ||
    object.status === "blocked" ||
    object.authority?.toLowerCase().includes("judgment") === true
  );
}

function isEvidence(object: CrokiCanvasLiveObject): boolean {
  return object.source === "reference" || object.kind === "evidence" || object.kind === "source";
}
