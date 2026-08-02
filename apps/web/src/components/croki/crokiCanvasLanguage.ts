import type {
  CrokiContextNode,
  CrokiNodeDomain,
  CrokiNodeKind,
} from "@t3tools/shared/crokiContext";

export type CrokiCanvasView = "product" | "gtm" | "workflow" | "review";

export const CROKI_CANVAS_VIEWS: readonly {
  readonly id: CrokiCanvasView;
  readonly label: string;
}[] = [
  { id: "product", label: "Product" },
  { id: "workflow", label: "Run" },
  { id: "review", label: "Proposals" },
];

const KIND_LABELS: Record<CrokiNodeDomain, Record<CrokiNodeKind, string>> = {
  product: {
    intent: "Intent",
    decision: "Decision",
    evidence: "Evidence",
    work: "Consequence",
  },
  gtm: {
    intent: "Audience",
    decision: "Claim",
    evidence: "Signal",
    work: "Experiment",
  },
  workflow: {
    intent: "Outcome",
    decision: "Gate",
    evidence: "Result",
    work: "Assignment",
  },
  shared: {
    intent: "Intent",
    decision: "Decision",
    evidence: "Evidence",
    work: "Work",
  },
};

export function crokiDomainForView(view: CrokiCanvasView): CrokiNodeDomain {
  return view === "review" ? "product" : view;
}

export function crokiNodeDomain(node: CrokiContextNode): CrokiNodeDomain {
  return node.domain ?? "product";
}

export function crokiNodeKindLabel(kind: CrokiNodeKind, domain: CrokiNodeDomain): string {
  return KIND_LABELS[domain][kind];
}

export function crokiNewNodeTitle(kind: CrokiNodeKind, domain: CrokiNodeDomain): string {
  return `New ${crokiNodeKindLabel(kind, domain).toLowerCase()}`;
}

export function crokiNodeMatchesView(node: CrokiContextNode, view: CrokiCanvasView): boolean {
  if (view === "review") return node.status === "provisional";
  const domain = crokiNodeDomain(node);
  return domain === view || domain === "shared";
}

export function crokiViewEmptyCopy(view: CrokiCanvasView): string {
  switch (view) {
    case "product":
      return "No approved product understanding yet.";
    case "gtm":
      return "No approved audience, claim, signal, or experiment yet.";
    case "workflow":
      return "No active run or approved workflow context yet.";
    case "review":
      return "No proposals waiting for founder review.";
  }
}

export function crokiSemanticRelation(
  source: CrokiNodeKind | undefined,
  target: CrokiNodeKind | undefined,
): string {
  if (source === "evidence") return "supports";
  if (source === "intent") return "guides";
  if (source === "decision" && target === "work") return "commits";
  if (source === "work") return "enables";
  return "informs";
}
