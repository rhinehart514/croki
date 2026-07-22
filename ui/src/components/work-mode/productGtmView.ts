import type { RichArtifactPayload, ThreadTimeline, ThreadTimelineItem } from "@/api";

export type ProductGtmViewNode = Extract<RichArtifactPayload, { kind: "model-view" }>["nodes"][number];
export type ProductGtmViewEdge = Extract<RichArtifactPayload, { kind: "model-view" }>["edges"][number];

export type ProductGtmView = {
  item: ThreadTimelineItem;
  workRef: string;
  workId: string;
  betId: string | null;
  title: string;
  question: string;
  branchRef: string;
  branchId: string;
  nodes: ProductGtmViewNode[];
  edges: ProductGtmViewEdge[];
};

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function productGtmViewFromItem(item: ThreadTimelineItem | null | undefined): ProductGtmView | null {
  if (!item || item.kind !== "artifact") return null;
  const artifact = record(item.artifact);
  const content = record(artifact?.content);
  if (content?.kind !== "model-view" || content.purpose !== "product-gtm-local-model") return null;
  const nodes = Array.isArray(content.nodes) ? content.nodes.filter((node): node is ProductGtmViewNode => Boolean(record(node)?.id && record(node)?.label && record(node)?.kind && record(node)?.state)) : [];
  const edges = Array.isArray(content.edges) ? content.edges.filter((edge): edge is ProductGtmViewEdge => Boolean(record(edge)?.from && record(edge)?.to)) : [];
  const branchRef = typeof content.branchRef === "string" ? content.branchRef : "";
  return {
    item,
    workRef: item.ref,
    workId: typeof artifact?.id === "string" ? artifact.id : item.ref.replace(/^work:/, ""),
    betId: typeof item.betRef === "string" ? item.betRef.replace(/^bet:/, "") : null,
    title: typeof item.title === "string" ? item.title : "Product / GTM view",
    question: typeof content.question === "string" ? content.question : "What changes if this direction is right?",
    branchRef,
    branchId: branchRef.replace(/^model-branch:/, ""),
    nodes,
    edges,
  };
}

export function productGtmViewFromTimeline(timeline: ThreadTimeline | null): ProductGtmView | null {
  const item = [...(timeline?.items ?? [])].reverse().find((candidate) => {
    if (candidate.kind !== "artifact") return false;
    const content = record(record(candidate.artifact)?.content);
    return content?.kind === "model-view" && content.purpose === "product-gtm-local-model";
  });
  return productGtmViewFromItem(item);
}
