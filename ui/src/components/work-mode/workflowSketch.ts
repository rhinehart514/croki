import type { RichArtifactPayload, ThreadTimeline, ThreadTimelineItem } from "@/api";

export type WorkflowSketchStep = Extract<RichArtifactPayload, { kind: "flow" }>["steps"][number];
export type WorkflowSketchEdge = Extract<RichArtifactPayload, { kind: "flow" }>["edges"][number];

export type WorkflowSketch = {
  item: ThreadTimelineItem;
  workRef: string;
  workId: string;
  betId: string | null;
  title: string;
  steps: WorkflowSketchStep[];
  edges: WorkflowSketchEdge[];
};

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function workflowSketchFromTimeline(timeline: ThreadTimeline | null): WorkflowSketch | null {
  const item = [...(timeline?.items ?? [])].reverse().find((candidate) => {
    if (candidate.kind !== "artifact") return false;
    const artifact = record(candidate.artifact);
    const content = record(artifact?.content);
    return content?.kind === "flow" && content.purpose === "product-gtm-workflow";
  });
  if (!item) return null;
  const artifact = record(item.artifact)!;
  const content = record(artifact.content)!;
  const steps = Array.isArray(content.steps) ? content.steps.filter((step): step is WorkflowSketchStep => Boolean(record(step)?.id && record(step)?.label)) : [];
  const edges = Array.isArray(content.edges) ? content.edges.filter((edge): edge is WorkflowSketchEdge => Boolean(record(edge)?.from && record(edge)?.to)) : [];
  return {
    item,
    workRef: item.ref,
    workId: typeof artifact.id === "string" ? artifact.id : item.ref.replace(/^work:/, ""),
    betId: typeof item.betRef === "string" ? item.betRef.replace(/^bet:/, "") : null,
    title: typeof item.title === "string" ? item.title : "Canvas workflow",
    steps,
    edges,
  };
}
