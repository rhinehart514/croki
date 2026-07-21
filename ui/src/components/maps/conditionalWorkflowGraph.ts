import type { WorkIndexOutlineObject } from "@/api";

export type ConditionalWorkflowStep = { id: string; label: string; detail?: string; type?: string };
export type ConditionalWorkflowEdge = { from: string; to: string; label?: string };
export type ConditionalWorkflowGraph = {
  sourceWorkRef: string;
  threadRef?: string | null;
  steps: ConditionalWorkflowStep[];
  edges: ConditionalWorkflowEdge[];
};

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function conditionalWorkflowGraph(object: WorkIndexOutlineObject | undefined): ConditionalWorkflowGraph | null {
  const graph = record(object?.details?.workflowGraph);
  if (!graph || typeof graph.sourceWorkRef !== "string" || !Array.isArray(graph.steps) || !Array.isArray(graph.edges)) return null;
  const steps = graph.steps.flatMap((value) => {
    const step = record(value);
    return typeof step?.id === "string" && typeof step.label === "string" ? [{ id: step.id, label: step.label, ...(typeof step.detail === "string" ? { detail: step.detail } : {}), ...(typeof step.type === "string" ? { type: step.type } : {}) }] : [];
  });
  const edges = graph.edges.flatMap((value) => {
    const edge = record(value);
    return typeof edge?.from === "string" && typeof edge.to === "string" ? [{ from: edge.from, to: edge.to, ...(typeof edge.label === "string" ? { label: edge.label } : {}) }] : [];
  });
  return { sourceWorkRef: graph.sourceWorkRef, threadRef: typeof graph.threadRef === "string" ? graph.threadRef : null, steps, edges };
}
