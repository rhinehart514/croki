import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";
import type { ProductGtmEdgeData } from "./productGtmProjection";
import { productGtmBundleOffset } from "./productGtmEdgeGeometry";

type ProductGtmFlowEdge = Edge<ProductGtmEdgeData>;

export function ProductGtmEdge({
  id, sourceX, sourceY, targetX, targetY,
  style, label, data,
}: EdgeProps<ProductGtmFlowEdge>) {
  const route = data?.route ?? "forward";
  const deltaX = targetX - sourceX;
  // Longer flat leads let a forward edge hug its source and target rows and compress the vertical
  // transition into the span between them, instead of slicing one full-width diagonal across
  // unrelated nodes.
  const trunk = Math.max(40, Math.min(150, Math.abs(deltaX) * 0.3));
  const bundleOffset = productGtmBundleOffset(data?.bundleIndex, data?.bundleCount);
  const anchorToSource = route === "forward" && deltaX > 160;
  const labelX = anchorToSource ? sourceX + trunk + 18 : (sourceX + targetX) / 2;
  const labelY = route === "return"
    ? Math.max(sourceY, targetY) + 112 + bundleOffset
    : anchorToSource
      ? sourceY + bundleOffset
      : (sourceY + targetY) / 2 + bundleOffset;
  const path = route === "vertical"
    ? `M ${sourceX} ${sourceY} C ${sourceX + bundleOffset} ${sourceY - 58}, ${targetX + bundleOffset} ${targetY + 58}, ${targetX} ${targetY}`
    : route === "return"
      ? `M ${sourceX} ${sourceY} C ${sourceX + 82} ${sourceY}, ${sourceX + 82} ${labelY}, ${labelX} ${labelY} C ${targetX - 82} ${labelY}, ${targetX - 82} ${targetY}, ${targetX} ${targetY}`
      : `M ${sourceX} ${sourceY} L ${sourceX + trunk} ${sourceY} C ${sourceX + trunk} ${sourceY + bundleOffset}, ${targetX - trunk} ${targetY + bundleOffset}, ${targetX - trunk} ${targetY} L ${targetX} ${targetY}`;
  const gradientId = `product-gtm-spectrum-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const crossTerritory = data?.crossTerritory === true;
  // Arrowhead makes the causal direction unmistakable. Its color tracks the edge kind (matching the
  // stroke palette but a touch brighter to stay legible on the near-black canvas); a cross-territory
  // edge takes the terminal spectrum hue so the restrained gradient reads through to its tip.
  const arrowColor = crossTerritory
    ? "#62a986"
    : data?.kind === "return"
      ? "#54c79a"
      : data?.kind === "spine"
        ? "#a3b2c6"
        : data?.kind === "provisional"
          ? "#8199c0"
          : "#7c8ba3";
  const arrowSize = data?.kind === "spine" ? 13 : 11;
  const arrowId = `product-gtm-arrow-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return <>
    <defs>
      {crossTerritory ? <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
        <stop offset="0%" stopColor="#58b8c8" />
        <stop offset="26%" stopColor="#7b79d9" />
        <stop offset="51%" stopColor="#b46cae" />
        <stop offset="75%" stopColor="#d59262" />
        <stop offset="100%" stopColor="#62a986" />
      </linearGradient> : null}
      {/* markerUnits="userSpaceOnUse" keeps the arrow a fixed size instead of scaling down with the
          thin dashed stroke, which is why direction was invisible before. */}
      <marker id={arrowId} markerWidth={arrowSize} markerHeight={arrowSize} viewBox="0 0 10 10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M1,1 L9,5 L1,9 Z" fill={arrowColor} />
      </marker>
    </defs>
    <BaseEdge
      id={id}
      path={path}
      label={label}
      labelX={labelX}
      labelY={labelY}
      labelShowBg
      markerEnd={`url(#${arrowId})`}
      className={`product-gtm-edge-path is-${data?.kind ?? "support"}${data?.focused ? " is-focus" : ""}${crossTerritory ? " is-cross-territory" : ""}`}
      style={{ ...style, ...(crossTerritory ? { stroke: `url(#${gradientId})` } : {}) }}
    />
  </>;
}
