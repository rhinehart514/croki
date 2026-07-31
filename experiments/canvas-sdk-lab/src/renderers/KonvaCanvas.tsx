import Konva from "konva";
import { useEffect, useRef, useState } from "react";
import { Arrow, Group, Layer, Rect, Stage, Text, Transformer } from "react-konva";

import type { LabNode } from "../model";
import type { CanvasRendererProps } from "../rendererTypes";

interface Size {
  readonly width: number;
  readonly height: number;
}

const nodeWidth = 270;
const nodeHeight = 128;

export function KonvaCanvas(props: CanvasRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const groupRefs = useRef(new Map<string, Konva.Group>());
  const [size, setSize] = useState<Size>({ width: 1200, height: 680 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const selected = props.selectedId ? groupRefs.current.get(props.selectedId) : undefined;
    transformer.nodes(selected ? [selected] : []);
    transformer.getLayer()?.batchDraw();
  }, [props.selectedId]);

  const scale = Math.min(size.width / 1420, size.height / 690);
  const xOffset = Math.max(24, (size.width - 1370 * scale) / 2);
  const yOffset = Math.max(32, (size.height - 620 * scale) / 2);

  return (
    <div ref={containerRef} className="konva-host">
      <Stage
        width={size.width}
        height={size.height}
        onMouseDown={(event) => {
          if (event.target === event.target.getStage()) props.onSelect(null);
        }}
        onTouchStart={(event) => {
          if (event.target === event.target.getStage()) props.onSelect(null);
        }}
      >
        <Layer x={xOffset} y={yOffset} scaleX={scale} scaleY={scale}>
          {props.projection.edges.map((edge) => {
            const source = props.projection.nodes.find((node) => node.id === edge.from);
            const target = props.projection.nodes.find((node) => node.id === edge.to);
            if (!source || !target) return null;
            const startX = source.x + nodeWidth;
            const startY = source.y + nodeHeight / 2;
            const endX = target.x;
            const endY = target.y + nodeHeight / 2;
            return (
              <Arrow
                key={edge.id}
                points={[
                  startX,
                  startY,
                  (startX + endX) / 2,
                  startY,
                  (startX + endX) / 2,
                  endY,
                  endX,
                  endY,
                ]}
                stroke="#46464d"
                fill="#46464d"
                strokeWidth={1.5}
                pointerLength={7}
                pointerWidth={7}
                tension={0.08}
              />
            );
          })}
          {props.projection.nodes.map((node) => (
            <KonvaNode
              key={node.id}
              node={node}
              selected={node.id === props.selectedId}
              register={(group) => {
                if (group) groupRefs.current.set(node.id, group);
                else groupRefs.current.delete(node.id);
              }}
              onSelect={() => props.onSelect(node)}
            />
          ))}
          <Transformer
            ref={transformerRef}
            rotateEnabled={false}
            enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
            borderStroke="#ffffff"
            borderStrokeWidth={1}
            anchorFill="#000000"
            anchorStroke="#ffffff"
            anchorSize={7}
            padding={5}
          />
        </Layer>
      </Stage>
    </div>
  );
}

interface KonvaNodeProps {
  readonly node: LabNode;
  readonly selected: boolean;
  readonly register: (group: Konva.Group | null) => void;
  readonly onSelect: () => void;
}

function KonvaNode(props: KonvaNodeProps) {
  const accent = authorityColor(props.node.authority);
  return (
    <Group
      ref={props.register}
      x={props.node.x}
      y={props.node.y}
      draggable
      onClick={props.onSelect}
      onTap={props.onSelect}
    >
      <Rect
        width={nodeWidth}
        height={nodeHeight}
        fill="#0b0b0d"
        stroke={props.selected ? "#ffffff" : "#34343a"}
        strokeWidth={props.selected ? 1.5 : 1}
        cornerRadius={3}
        shadowColor="#000000"
        shadowBlur={props.selected ? 18 : 8}
        shadowOpacity={0.75}
      />
      <Rect width={3} height={nodeHeight} fill={accent} cornerRadius={[3, 0, 0, 3]} />
      <Text
        x={18}
        y={14}
        text={props.node.kind.toUpperCase()}
        fill="#86868e"
        fontSize={10}
        fontFamily="Inter, sans-serif"
      />
      <Text
        x={18}
        y={35}
        width={234}
        text={props.node.title}
        fill="#ffffff"
        fontSize={16}
        fontStyle="bold"
        fontFamily="Inter, sans-serif"
      />
      <Text
        x={18}
        y={62}
        width={234}
        height={36}
        text={props.node.body}
        fill="#a5a5ad"
        fontSize={11}
        lineHeight={1.35}
        fontFamily="Inter, sans-serif"
        ellipsis
      />
      <Text
        x={18}
        y={108}
        width={234}
        text={props.node.meta}
        fill={accent}
        fontSize={10}
        fontFamily="Inter, sans-serif"
        ellipsis
      />
    </Group>
  );
}

function authorityColor(authority: LabNode["authority"]): string {
  if (authority === "current") return "#6ee7b7";
  if (authority === "provisional") return "#fbbf24";
  return "#60a5fa";
}
