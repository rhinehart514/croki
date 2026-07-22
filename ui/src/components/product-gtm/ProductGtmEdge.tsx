import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";
import type { ProductGtmEdgeData } from "./productGtmProjection";
import { productGtmBundleOffset } from "./productGtmEdgeGeometry";

type ProductGtmFlowEdge = Edge<ProductGtmEdgeData>;

export function ProductGtmEdge({
  id, sourceX, sourceY, targetX, targetY,
  markerEnd, style, label, data,
}: EdgeProps<ProductGtmFlowEdge>) {
  const route = data?.route ?? "forward";
  const deltaX = targetX - sourceX;
  const trunk = Math.max(34, Math.min(82, Math.abs(deltaX) * 0.24));
  const bundleOffset = productGtmBundleOffset(data?.bundleIndex, data?.bundleCount);
  const labelX = (sourceX + targetX) / 2;
  const labelY = route === "return" ? Math.max(sourceY, targetY) + 112 + bundleOffset : (sourceY + targetY) / 2 + bundleOffset;
  const path = route === "vertical"
    ? `M ${sourceX} ${sourceY} C ${sourceX + bundleOffset} ${sourceY - 58}, ${targetX + bundleOffset} ${targetY + 58}, ${targetX} ${targetY}`
    : route === "return"
      ? `M ${sourceX} ${sourceY} C ${sourceX + 82} ${sourceY}, ${sourceX + 82} ${labelY}, ${labelX} ${labelY} C ${targetX - 82} ${labelY}, ${targetX - 82} ${targetY}, ${targetX} ${targetY}`
      : `M ${sourceX} ${sourceY} L ${sourceX + trunk} ${sourceY} C ${sourceX + trunk} ${sourceY + bundleOffset}, ${targetX - trunk} ${targetY + bundleOffset}, ${targetX - trunk} ${targetY} L ${targetX} ${targetY}`;
  const gradientId = `product-gtm-spectrum-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const crossTerritory = data?.crossTerritory === true;

  return <>
    {crossTerritory ? <defs>
      <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
        <stop offset="0%" stopColor="#58b8c8" />
        <stop offset="26%" stopColor="#7b79d9" />
        <stop offset="51%" stopColor="#b46cae" />
        <stop offset="75%" stopColor="#d59262" />
        <stop offset="100%" stopColor="#62a986" />
      </linearGradient>
    </defs> : null}
    <BaseEdge
      id={id}
      path={path}
      label={label}
      labelX={labelX}
      labelY={labelY}
      labelShowBg
      markerEnd={markerEnd}
      className={`product-gtm-edge-path is-${data?.kind ?? "support"}${data?.focused ? " is-focus" : ""}${crossTerritory ? " is-cross-territory" : ""}`}
      style={{ ...style, ...(crossTerritory ? { stroke: `url(#${gradientId})` } : {}) }}
    />
  </>;
}
