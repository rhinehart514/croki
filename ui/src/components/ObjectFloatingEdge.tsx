// A floating edge for the free object canvas: instead of always leaving a card's right side and entering
// the next card's left, it connects the two cards at the points on their borders that actually face each
// other. That is what lets the map read as a true node diagram — a card dragged above, below, or behind
// another still gets a clean stroke, and branches/merges route without hooking around. Only the geometry
// is custom; the arrowhead, the lit/gate/feedback classes, and the verb label all still ride the edge as
// before.
import {
  BaseEdge, EdgeLabelRenderer, getBezierPath, useInternalNode, Position, type EdgeProps, type InternalNode, type Node,
} from "@xyflow/react";

// Where the straight line between two card centres crosses the FIRST card's border. Standard React Flow
// floating-edge maths (the ellipse-normalized intersection), kept intact.
function nodeIntersection(node: InternalNode<Node>, other: InternalNode<Node>) {
  const w = (node.measured.width ?? 0) / 2;
  const h = (node.measured.height ?? 0) / 2;
  const x2 = node.internals.positionAbsolute.x + w;
  const y2 = node.internals.positionAbsolute.y + h;
  const x1 = other.internals.positionAbsolute.x + (other.measured.width ?? 0) / 2;
  const y1 = other.internals.positionAbsolute.y + (other.measured.height ?? 0) / 2;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;
  const x = w * (xx3 + yy3) + x2;
  const y = h * (-xx3 + yy3) + y2;
  return { x, y };
}

// Which border the intersection sits on, so the bezier leaves/arrives perpendicular to it.
function edgeSide(node: InternalNode<Node>, point: { x: number; y: number }): Position {
  const nx = Math.round(node.internals.positionAbsolute.x);
  const ny = Math.round(node.internals.positionAbsolute.y);
  const px = Math.round(point.x);
  const py = Math.round(point.y);
  if (px <= nx + 1) return Position.Left;
  if (px >= nx + (node.measured.width ?? 0) - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  return Position.Bottom;
}

export function ObjectFloatingEdge({ id, source, target, markerEnd, style, label }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  // Before the cards have been measured there's no border to aim at — skip a frame rather than divide by
  // a zero width.
  if (!sourceNode?.measured.width || !targetNode?.measured.width) return null;

  const sp = nodeIntersection(sourceNode, targetNode);
  const tp = nodeIntersection(targetNode, sourceNode);
  const [path, labelX, labelY] = getBezierPath({
    sourceX: sp.x, sourceY: sp.y, sourcePosition: edgeSide(sourceNode, sp),
    targetX: tp.x, targetY: tp.y, targetPosition: edgeSide(targetNode, tp),
  });

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="object-edge-label"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
