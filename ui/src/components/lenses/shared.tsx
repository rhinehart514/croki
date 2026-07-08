// Shared lens primitives — the provenance tag and panel chrome the Product-mode lenses draw from.
//
// The multi-lens canvas must read as ONE calm tool, not different diagrams. That only holds if every
// lens tags provenance the SAME way and frames its panels with the SAME chrome. Lenses import from
// here; they never re-invent a provenance tag or a panel. The look is harvested from the original
// single-canvas ProductFlowCanvas (the .product-prov tags, the .product-head-panel chrome). Co-
// exporting a component alongside its config trips react-refresh's one-export-kind-per-file rule,
// which only governs hot-reload granularity, not correctness — so it's disabled for this barrel.

import type React from "react";
import { cn } from "@/lib/utils";
import type { ProductModelProvenance } from "@/types";

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
