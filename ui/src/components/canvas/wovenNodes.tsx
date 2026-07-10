// wovenNodes — the two synthetic node components the intertwined canvas adds to GraphCanvas's nodeTypes
// (docs/INTERTWINED-CANVAS.md §3). Both are RENDER-TIME projections over getOperatingView's arrays — never
// persisted, re-derived every re-weave (the deriveFunnel discipline). They speak the shipped canvas's
// design language exactly: opaque zinc surfaces (never glass), monochrome ink, Geist, semantic color only
// (the parked pulse; the wall's amber is never borrowed here), no gradients, no water styling.
//
//   ObjectChip  — one shared object drawn ONCE. Its size and ink encode DEGREE (motionCount) so a moat
//                 object is visibly the largest/darkest at any altitude (the far-zoom weight rule, in the
//                 chip itself so N crossings add zero lines). Carries a target handle so every tie from a
//                 touching step lands on it, and focus/dim classes for focus-to-trace.
//   KindCluster — a labeled region chip for a group of same-kind objects (far-zoom blend) or a GTM-type
//                 cluster (the TYPE axis). Its label is an OPEN string; overlap reads as weight, not lines.
//
// The integrator registers these in NODE_TYPES ({ objectChip: memo(ObjectChip), kindCluster:
// memo(KindCluster) }) and hands each node `data` of the matching type below.

import React from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { degreeWeight, type ObjectChipData, type KindClusterData } from "@/lib/wovenLayout";
import type { CanvasAnchorData } from "@/lib/wovenOverlay";
import "@/styles/woven-canvas.css";

// The one-line provenance receipt shown on hover (the title attr) — plain words plus the ids so a founder
// can trace the bucket back to the run/outcome that produced it. Mirrors OperatorLens's provReceipt so the
// two never disagree; kept local so this component stays self-contained.
function chipReceipt(data: ObjectChipData): string {
  const p = data.provenance;
  const bits = [
    p.kind === "bet" ? "A bet — no touch recorded yet" : "Grounded",
    p.basis,
  ].filter(Boolean);
  if (p.runId) bits.push(`run ${p.runId}`);
  if (p.outcomeId) bits.push(`outcome ${p.outcomeId}`);
  return bits.join(" · ");
}

// The plain-word bucket label — the same words the retired shared-map band used, so the vocabulary carries
// over. Advisory (deriveFunnel), never a gate.
function bucketLabel(bucket: ObjectChipData["bucket"]): string {
  return bucket === "in_flight" ? "in flight"
    : bucket === "handled" ? "handled"
    : bucket === "suppressed" ? "set aside"
    : "seen";
}

// ─── ObjectChip ─────────────────────────────────────────────────────────────────────────────────────
// A small opaque zinc card for one shared object: its label, open kind, degree, and "touched by N motions",
// with the provenance receipt on hover. Size + ink scale with degree (the far-zoom weight rule) so the eye
// finds the moat objects without hunting. The whole card is a real <button> (it selects the object → the
// integrator runs focus-to-trace); a target handle on the left receives every converging tie.
function ObjectChipComponent({ data }: NodeProps<Node<ObjectChipData>>) {
  const degree = data.degree ?? 0;
  // Degree is already the raw motionCount; normalize against a small ceiling so a 2-motion object still
  // reads distinctly larger than a 1-motion one without a canvas-wide pass here (the integrator can pass a
  // pre-normalized degree via v2's sizeByObject; when it doesn't, this local ramp is the honest fallback).
  const norm = data.normDegree ?? Math.min(1, Math.max(0, (degree - 1) / 4));
  const { size, inkStep } = degreeWeight(norm);
  const shared = (data.lanes?.length ?? 0) >= 2;
  const receipt = chipReceipt(data);

  return (
    <div
      className={cn(
        "woven-chip",
        `woven-chip-ink-${inkStep}`,
        shared && "is-shared",
        data.bucket === "in_flight" && "is-inflight",
        data.focus === "focus" && "is-focus",
        data.focus === "dim" && "is-dim",
      )}
      style={{ width: size }}
      // The receipt on hover — the part a screenshot can't clone: where this state came from.
      title={receipt}
    >
      {/* Every tie lands here: one target handle on the left, one source handle on the right so a chip can
          also feed a downstream step if the integrator wires an outgoing tie. Kept invisible via CSS; the
          converging lines are the intertwining, drawn once. */}
      <Handle type="target" position={Position.Left} id="obj-in" />
      {/* The reuse badge — the moat, named: a shared object is drawn ONCE and every motion that reuses it
          converges here. On a 2+-touch chip it floats as the one teal accent the weave earns; it's the
          "in N motions" pill the reference hangs on the convergence point. */}
      {shared ? (
        <span className="woven-chip-reuse" aria-label={`reused in ${degree} motions`}>
          <span className="woven-chip-reuse-dot" aria-hidden />
          in <b>{degree}</b> motions
        </span>
      ) : null}
      <div className="woven-chip-head">
        <span className="woven-chip-kind">{data.kind}</span>
      </div>
      <span className="woven-chip-label" title={data.objectKey}>
        {data.label ?? data.objectKey}
      </span>
      <span className="woven-chip-foot">
        {shared
          ? <>{bucketLabel(data.bucket)}</>
          : <>touched once · {bucketLabel(data.bucket)}</>}
      </span>
      <Handle type="source" position={Position.Right} id="obj-out" />
    </div>
  );
}

// ─── KindCluster ────────────────────────────────────────────────────────────────────────────────────
// A labeled region chip standing in for a group of same-kind objects (far-zoom blend) or a GTM-type
// cluster on the TYPE axis. The label is an OPEN string (an object kind, or a deriveMotionName motion
// name). Overlap is carried as WEIGHT (its member count + total degree size it up), never as N new lines —
// approach 5's depth principle in flat zinc. Clicking it is the fan-in gesture (the integrator expands it).
function KindClusterComponent({ data }: NodeProps<Node<KindClusterData>>) {
  // A cluster's heft reads off how much it stands in for — more members / more crossings = heavier chip.
  // Normalized against a modest ceiling so a big cluster is clearly weightier without swallowing the canvas.
  const norm = Math.min(1, (data.totalDegree ?? data.count ?? 0) / 24);
  const { size, inkStep } = degreeWeight(norm);
  return (
    <div
      className={cn(
        "woven-cluster",
        `woven-chip-ink-${inkStep}`,
        data.focus === "focus" && "is-focus",
        data.focus === "dim" && "is-dim",
      )}
      style={{ minWidth: size }}
      title={`${data.count} ${data.label} object${data.count === 1 ? "" : "s"} — ${data.totalDegree} crossing${data.totalDegree === 1 ? "" : "s"}. Zoom in to fan into lanes and ties.`}
    >
      <Handle type="target" position={Position.Left} id="cluster-in" />
      <div className="woven-cluster-head">
        <span className="woven-cluster-label">{data.label}</span>
        <span className="woven-cluster-count">{data.count}</span>
      </div>
      <span className="woven-cluster-foot">
        {data.count === 1 ? "1 object" : `${data.count} objects`}
        {data.totalDegree > 0 ? <> · <b>{data.totalDegree}</b> crossings</> : null}
      </span>
      <Handle type="source" position={Position.Right} id="cluster-out" />
    </div>
  );
}

// Memoized at export so a re-weave that leaves most chips unchanged doesn't re-render every one (React Flow
// passes stable data/selected props — the default shallow compare is correct), matching GraphCanvas's own
// NODE_TYPES discipline. The integrator spreads these into its nodeTypes map.
// Register these in GraphCanvas's NODE_TYPES under { objectChip: ObjectChip, kindCluster: KindCluster } —
// the integrator adds those two keys, matching the shipped memoized-node discipline. (No node-types map is
// exported here: a component file that also exports a plain object breaks Fast Refresh, so the map is the
// integrator's one line, not this file's.)
// ─── CanvasAnchor ───────────────────────────────────────────────────────────────────────────────────
// A stable canvas landmark from operatingView.woven.canvas (fix 3): product truth, a question, or an
// outcome. Rendered ADDITIVELY beside the object weaving — opaque zinc, monochrome, one semantic accent
// (--gap/amber) reserved for the outcome-return landmark, never decoration. Selecting it runs anchor
// focus-to-trace (the integrator wires the click → onWovenSelect({ kind:"anchor", anchorId })).
const ANCHOR_KIND_LABEL: Record<string, string> = {
  "product-truth": "Product truth",
  "product-model": "Product",
  "product-thing": "Product",
  "product-goal": "User goal",
  "product-state": "State",
  "product-workflow": "Workflow",
  "product-interaction": "Interaction",
  question: "Open question",
  outcome: "Outcome",
};
function CanvasAnchorComponent({ data }: NodeProps<Node<CanvasAnchorData>>) {
  const isOutcome = data.kind === "outcome";
  const isQuestion = data.kind === "question";
  // A summary chip stands in for a collapsed kind's long tail: one compact card with the count, selectable
  // to expand its members. It reads as a group (dashed outline, "N in this group"), never as a single item.
  if (data.group) {
    return (
      <div
        className={cn("woven-anchor is-group", data.focus === "focus" && "is-focus", data.focus === "dim" && "is-dim")}
        title={`${data.count} ${data.label.toLowerCase()} — product detail summarized to keep the map legible. Click to expand.`}
      >
        <Handle type="target" position={Position.Left} id="anchor-in" />
        <span className="woven-anchor-eyebrow">Product detail</span>
        <span className="woven-anchor-label">{data.label} <b className="woven-anchor-count">{data.count}</b></span>
        <span className="woven-anchor-more">Click to expand</span>
        <Handle type="source" position={Position.Right} id="anchor-out" />
      </div>
    );
  }
  const eyebrow = ANCHOR_KIND_LABEL[data.kind] ?? "Landmark";
  return (
    <div
      className={cn(
        "woven-anchor",
        isOutcome && "is-outcome",
        isQuestion && "is-question",
        data.focus === "focus" && "is-focus",
        data.focus === "dim" && "is-dim",
      )}
      title={`${eyebrow}: ${data.label}`}
    >
      <Handle type="target" position={Position.Left} id="anchor-in" />
      <span className="woven-anchor-eyebrow">{eyebrow}</span>
      <span className="woven-anchor-label">{data.label}</span>
      <Handle type="source" position={Position.Right} id="anchor-out" />
    </div>
  );
}

// ─── FounderWall ────────────────────────────────────────────────────────────────────────────────────
// The single founder wall (docs/production-direction/16, P1): a thin vertical amber threshold every
// pipeline crosses, drawn across the lane band at the shared gate x on the merged Operator canvas. It is
// pure signal — non-interactive; the gate CARDS remain the actionable review path. One accent (amber), the
// only color the wall earns, opaque, no glow.
function FounderWallComponent({ data }: NodeProps<Node<{ height: number }>>) {
  return (
    <div className="woven-wall" style={{ height: data.height }} aria-hidden="true">
      <span className="woven-wall-label">Your wall</span>
    </div>
  );
}

export const ObjectChip = React.memo(ObjectChipComponent);
export const KindCluster = React.memo(KindClusterComponent);
export const CanvasAnchor = React.memo(CanvasAnchorComponent);
export const FounderWall = React.memo(FounderWallComponent);
