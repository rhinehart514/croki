import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { useMemo, useRef } from "react";
import "@excalidraw/excalidraw/index.css";

import type { LabNode } from "../model";
import type { CanvasRendererProps } from "../rendererTypes";

const nodeWidth = 260;
const nodeHeight = 116;

type ExcalidrawSkeletons = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>;

export function ExcalidrawCanvas(props: CanvasRendererProps) {
  const lastSelection = useRef<string | null>(props.selectedId);
  const elements = useMemo(() => makeElements(props), [props.projection]);

  return (
    <div className="excalidraw-host">
      <Excalidraw
        theme="dark"
        name={`Croki · ${props.projection.title}`}
        autoFocus
        initialData={{
          elements,
          appState: {
            viewBackgroundColor: "#050505",
            scrollX: 30,
            scrollY: 70,
          },
        }}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            export: false,
            loadScene: false,
            saveAsImage: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
          tools: { image: false },
        }}
        onChange={(_, appState) => {
          const rawId = Object.keys(appState.selectedElementIds).find(
            (id) => appState.selectedElementIds[id],
          );
          const nodeId = rawId?.startsWith("label-") ? rawId.slice("label-".length) : rawId;
          const node = props.projection.nodes.find((candidate) => candidate.id === nodeId) ?? null;
          const nextId = node?.id ?? null;
          if (nextId !== lastSelection.current) {
            lastSelection.current = nextId;
            props.onSelect(node);
          }
        }}
      />
    </div>
  );
}

function makeElements(props: CanvasRendererProps) {
  const skeletons: ExcalidrawSkeletons = [
    ...props.projection.edges.flatMap((edge): ExcalidrawSkeletons => {
      const source = props.projection.nodes.find((node) => node.id === edge.from);
      const target = props.projection.nodes.find((node) => node.id === edge.to);
      if (!source || !target) return [];
      const startX = source.x + nodeWidth;
      const startY = source.y + nodeHeight / 2;
      const endX = target.x;
      const endY = target.y + nodeHeight / 2;
      return [
        {
          id: `edge-${edge.id}`,
          type: "arrow",
          x: startX,
          y: startY,
          points: [
            [0, 0],
            [endX - startX, endY - startY],
          ],
          strokeColor: "#77777f",
          strokeWidth: 1,
          endArrowhead: "arrow",
          roughness: 1,
          label: { text: edge.relation, fontSize: 11 },
        },
      ];
    }),
    ...props.projection.nodes.map((node): ExcalidrawSkeletons[number] => ({
      id: node.id,
      type: node.kind === "gate" ? "diamond" : "rectangle",
      x: node.x,
      y: node.y,
      width: nodeWidth,
      height: nodeHeight,
      strokeColor: authorityColor(node),
      backgroundColor: authorityBackground(node),
      fillStyle: "solid",
      strokeWidth: node.id === props.selectedId ? 2 : 1,
      roughness: 1,
      roundness: node.kind === "gate" ? null : { type: 3 },
      label: {
        text: `${node.title}\n${node.meta}`,
        fontSize: 15,
        textAlign: "center",
        verticalAlign: "middle",
      },
    })),
  ];
  return convertToExcalidrawElements(skeletons, { regenerateIds: false });
}

function authorityColor(node: LabNode): string {
  if (node.authority === "current") return "#6ee7b7";
  if (node.authority === "provisional") return "#fbbf24";
  return "#60a5fa";
}

function authorityBackground(node: LabNode): string {
  if (node.authority === "current") return "#123229";
  if (node.authority === "provisional") return "#35280a";
  return "#102a43";
}
