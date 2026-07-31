import {
  createShapeId,
  Tldraw,
  toRichText,
  type Editor,
  type TLArrowShape,
  type TLGeoShape,
} from "tldraw";
import { useCallback } from "react";
import "tldraw/tldraw.css";

import type { LabNode } from "../model";
import type { CanvasRendererProps } from "../rendererTypes";

export function TldrawCanvas(props: CanvasRendererProps) {
  const handleMount = useCallback(
    (editor: Editor) => {
      editor.createShapes<TLArrowShape>(
        props.projection.edges.flatMap((edge) => {
          const source = props.projection.nodes.find((node) => node.id === edge.from);
          const target = props.projection.nodes.find((node) => node.id === edge.to);
          if (!source || !target) return [];
          const startX = source.x * 0.58 + 240;
          const startY = source.y * 0.82 + 56;
          const endX = target.x * 0.58;
          const endY = target.y * 0.82 + 56;
          return [
            {
              id: createShapeId(`edge-${edge.id}`),
              type: "arrow" as const,
              x: startX,
              y: startY,
              props: {
                start: { x: 0, y: 0 },
                end: { x: endX - startX, y: endY - startY },
                color: "grey" as const,
                size: "s" as const,
              },
            },
          ];
        }),
      );
      editor.createShapes<TLGeoShape>(
        props.projection.nodes.map((node) => ({
          id: createShapeId(node.id),
          type: "geo",
          x: node.x * 0.58,
          y: node.y * 0.82,
          props: {
            geo: node.kind === "gate" ? "diamond" : "rectangle",
            w: 240,
            h: 112,
            color: tldrawColor(node),
            fill: node.authority === "provisional" ? "semi" : "solid",
            size: "s",
            font: "sans",
            align: "middle",
            verticalAlign: "middle",
            richText: toRichText(`${node.title}\n${node.meta}`),
          },
        })),
      );
      return editor.store.listen(
        () => {
          const shape = editor.getOnlySelectedShape();
          const nodeId = shape?.id.slice("shape:".length);
          const node = props.projection.nodes.find((candidate) => candidate.id === nodeId);
          props.onSelect(node ?? null);
        },
        { scope: "session" },
      );
    },
    [props.onSelect, props.projection.edges, props.projection.nodes],
  );

  return (
    <div className="tldraw-host">
      <Tldraw autoFocus onMount={handleMount} options={{ maxPages: 1 }} />
    </div>
  );
}

function tldrawColor(node: LabNode): "green" | "yellow" | "blue" {
  if (node.authority === "current") return "green";
  if (node.authority === "provisional") return "yellow";
  return "blue";
}
