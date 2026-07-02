/* eslint-disable react-refresh/only-export-components */
// This module deliberately co-exports components (ObjectCard / ProvenanceTag / LensPanel /
// FlowArrow) alongside their shared helpers (kindVisual / computeLayout) and types, because the
// contract is "lenses import every shared primitive from ONE module." That trips react-refresh's
// one-export-kind-per-file rule, which only governs hot-reload granularity, not correctness — so
// it's disabled for this primitives barrel by intent.
//
// Shared lens primitives — the single source of look for ALL five Product-mode lenses.
//
// The multi-lens canvas must read as ONE calm tool, not five different diagrams. That only holds
// if every lens draws its object-like things from the SAME card, tags provenance the SAME way, and
// frames its panels with the SAME chrome. Lenses import from here; they never re-invent a card, a
// provenance tag, a panel, an icon, or a layout pass. The look is harvested from the original
// single-canvas ProductFlowCanvas (the .product-node card, the .product-prov tags, the
// .product-head-panel chrome, and computeLayout) so the new lenses are visually continuous with it.

import type React from "react";
import {
  ArrowRight, Box, Circle, FileText, GitBranch, Layers, MousePointerClick,
  Target, User, Workflow, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Citation, ProductModelProvenance } from "@/types";

// ─── kind → icon ────────────────────────────────────────────────────────────────
// `kind` is free text across the layers (things carry entity/actor/artifact/event; interactions
// carry screen/modal/etc). Normalize loosely so a near-miss still resolves to a sensible glyph
// rather than the fallback circle. Lenses pass their element's kind; they get back an icon + a
// human label they can show in the mono kind-row.

export function kindVisual(kind: string): { icon: React.ReactNode; label: string } {
  const k = (kind || "").toLowerCase();
  if (k.includes("actor") || k.includes("user") || k.includes("person") || k.includes("role"))
    return { icon: <User />, label: "Actor" };
  if (k.includes("goal") || k.includes("job") || k.includes("outcome"))
    return { icon: <Target />, label: "Goal" };
  if (k.includes("event") || k.includes("trigger") || k.includes("signal"))
    return { icon: <Zap />, label: "Event" };
  if (k.includes("artifact") || k.includes("doc") || k.includes("file") || k.includes("record"))
    return { icon: <FileText />, label: "Artifact" };
  if (k.includes("screen") || k.includes("view") || k.includes("page") || k.includes("modal") || k.includes("state"))
    return { icon: <Layers />, label: kind ? kind.replace(/^\w/, (c) => c.toUpperCase()) : "Screen" };
  if (k.includes("workflow") || k.includes("flow") || k.includes("step"))
    return { icon: <Workflow />, label: "Flow" };
  if (k.includes("section") || k.includes("nav") || k.includes("ia"))
    return { icon: <GitBranch />, label: "Section" };
  if (k.includes("interaction") || k.includes("action") || k.includes("control"))
    return { icon: <MousePointerClick />, label: "Action" };
  if (k.includes("entity") || k.includes("object") || k.includes("thing"))
    return { icon: <Box />, label: "Entity" };
  return { icon: <Circle />, label: kind ? kind.replace(/^\w/, (c) => c.toUpperCase()) : "Thing" };
}

// ─── ProvenanceTag ──────────────────────────────────────────────────────────────
// Provenance is load-bearing in EVERY lens: the green pill = grounded/proven; amber "guess" =
// speculative. The same pill the original canvas used (.product-prov), generalized to any layer.
// When citations are known and the element is grounded, it counts them ("3 cited"); otherwise it
// says where the fact comes from in plain words ("from your code" by default — a caller whose facts
// come from somewhere else, e.g. the run ledger, passes its own `label`). Never the word "derived"
// on a founder surface — that's engine vocabulary.

export function ProvenanceTag({
  provenance, citationCount, className, title, label,
}: {
  provenance: ProductModelProvenance;
  citationCount?: number;
  className?: string;
  title?: string;
  label?: string;
}) {
  const speculative = provenance === "speculative";
  const count = citationCount ?? 0;
  const text = speculative ? "guess" : count > 0 ? `${count} cited` : (label ?? "from your code");
  return (
    <span
      className={cn("product-prov", speculative ? "product-prov-spec" : "product-prov-derived", className)}
      title={title ?? (speculative
        ? "Speculative — a model or founder guess, not proven from code"
        : count > 0
          ? `Grounded in ${count} code citation${count === 1 ? "" : "s"}`
          : "Grounded in the product code")}
    >
      {text}
    </span>
  );
}

// ─── ObjectCard ─────────────────────────────────────────────────────────────────
// The one card every lens uses for anything object-like: white surface, hairline border, a mono
// uppercase kind-label, the provenance tag, an optional state-chip row, optional summary, optional
// footer slot. A speculative object is ghosted (dashed, off the solid ramp) so a guess can never
// read as a proven fact — the .product-node-speculative treatment from the original canvas.
//
// `asReactFlowNode` drops the hover-lift transform/margins that fight React Flow's own positioning,
// so the SAME card works both inside a React-Flow node wrapper and in a plain DOM list (IA tree,
// jobs column). Lenses choose the context; the card stays identical.

export type StateChip = { id: string; label: string };

export function ObjectCard({
  kind, name, summary, provenance, citationCount, states, hasSignal, selected,
  onSelect, footer, headerExtra, asReactFlowNode, focal, className, style,
}: {
  kind: string;
  name: string;
  summary?: string;
  provenance: ProductModelProvenance;
  citationCount?: number;
  states?: StateChip[];
  hasSignal?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  footer?: React.ReactNode;
  headerExtra?: React.ReactNode;
  asReactFlowNode?: boolean;
  // The center of gravity. A focal card is wider, larger-typed, and more elevated, so a hub reads
  // as the heart of the picture instead of one more card in a grid of equals.
  focal?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const visual = kindVisual(kind);
  const speculative = provenance === "speculative";

  return (
    <button
      type="button"
      onClick={onSelect}
      style={style}
      className={cn(
        "product-node lens-object-card",
        speculative && "product-node-speculative",
        selected && "product-node-selected",
        asReactFlowNode && "lens-object-card-flow",
        focal && "lens-object-card-focal",
        className,
      )}
    >
      <div className="product-node-head">
        <span className="product-node-icon">{visual.icon}</span>
        <span className="product-node-kind">{visual.label}</span>
        {hasSignal && (
          <span className="product-node-live" title="Real-world feedback is pinned to this object">
            <span className="product-node-live-dot" /> live
          </span>
        )}
        {headerExtra}
        <ProvenanceTag provenance={provenance} citationCount={citationCount} />
      </div>
      <div className="product-node-name">{name || "Untitled"}</div>
      {summary && <div className="product-node-summary">{summary}</div>}
      {states && states.length > 0 && (
        <div className="product-node-states" title="Lifecycle states">
          {states.map((s) => (
            <span key={s.id} className="product-state-pill">{s.label}</span>
          ))}
        </div>
      )}
      {footer}
    </button>
  );
}

// ─── LensPanel ──────────────────────────────────────────────────────────────────
// The translucent panel chrome — header, legend, side rail — matching the original
// .product-head-panel (translucent surface, backdrop blur, hairline, card shadow). Every lens that
// floats a panel uses this so the panels read as one family. `title` renders the standard mono
// eyebrow; pass children for the body.

export function LensPanel({
  title, children, className, style,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cn("lens-panel", className)} style={style}>
      {title && <div className="lens-panel-title">{title}</div>}
      {children}
    </div>
  );
}

// ─── computeLayout — generalized DAG rank layout ────────────────────────────────
// Ported from ProductFlowCanvas.computeLayout (which itself mirrored GraphCanvas), generalized to
// take any node ids + any {from,to} edges. A Kahn topological pass assigns a column to each node by
// its longest path from a root; nodes that share a column are stacked and vertically centered. Used
// by every node/edge lens (conceptual graph, workflow chain, interaction state machine) so they all
// flow left → right in the same visual rhythm.

export type LayoutEdge = { from: string; to: string };
export type LayoutPos = { x: number; y: number };

export function computeLayout(
  nodeIds: string[],
  edges: LayoutEdge[],
  opts?: { columnGap?: number; rowGap?: number },
): Map<string, LayoutPos> {
  const columnGap = opts?.columnGap ?? 320;
  const rowGap = opts?.rowGap ?? 168;

  const ids = new Set(nodeIds);
  const adj = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  const indeg = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
    adj.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const rank = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const queue = nodeIds.filter((id) => (indeg.get(id) ?? 0) === 0);
  const deg = new Map(indeg);
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of adj.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1));
      deg.set(next, (deg.get(next) ?? 0) - 1);
      if ((deg.get(next) ?? 0) === 0) queue.push(next);
    }
  }
  const byRank = new Map<number, string[]>();
  for (const id of nodeIds) {
    const r = rank.get(id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(id);
  }
  const pos = new Map<string, LayoutPos>();
  for (const [r, group] of byRank) {
    const total = group.length;
    group.forEach((id, i) => {
      pos.set(id, { x: r * columnGap, y: (i - (total - 1) / 2) * rowGap });
    });
  }
  return pos;
}

// A tiny shared affordance some lenses want — the "flows into" arrow glyph, sized to match the
// card's mono row. Exported so a lens never hand-rolls an arrow with a different size/color.
export function FlowArrow({ className }: { className?: string }) {
  return <ArrowRight className={cn("lens-flow-arrow", className)} />;
}

// Re-export the citation type so lenses can type evidence rows without reaching past this module.
export type { Citation };
