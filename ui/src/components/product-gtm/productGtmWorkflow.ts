import type { CanvasPoint } from "./productGtmLayout";

export type ProductGtmWorkflowStepType = "trigger" | "agent-work" | "condition" | "founder-decision" | "founder-gate" | "external-action" | "observation" | "outcome";
export type ProductGtmWorkflowStep = { id: string; label: string; detail?: string; type?: ProductGtmWorkflowStepType };
export type ProductGtmWorkflowEdge = { from: string; to: string; label?: string };
export type ProductGtmWorkflowGraph = { steps: ProductGtmWorkflowStep[]; edges: ProductGtmWorkflowEdge[] };

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const STEP_TYPES = new Set<ProductGtmWorkflowStepType>([
  "trigger", "agent-work", "condition", "founder-decision", "founder-gate", "external-action", "observation", "outcome",
]);

export const productGtmWorkflowNodeId = (ownerId: string, stepId: string) => `workflow:${ownerId}:${stepId}`;

export function parseProductGtmWorkflowNodeId(value: string | null | undefined) {
  const match = value?.match(/^workflow:([^:]+):(.+)$/);
  return match ? { ownerId: match[1], stepId: match[2] } : null;
}

export function productGtmWorkflowGraph(properties: Record<string, unknown>): ProductGtmWorkflowGraph | null {
  const graph = record(properties.workflowGraph);
  if (!graph) return null;
  const seen = new Set<string>();
  const steps = Array.isArray(graph.steps) ? graph.steps.flatMap((value) => {
    const step = record(value);
    const id = typeof step?.id === "string" ? step.id.trim() : "";
    const label = typeof step?.label === "string" ? step.label.trim() : "";
    if (!id || !label || seen.has(id)) return [];
    seen.add(id);
    const type = typeof step?.type === "string" && STEP_TYPES.has(step.type as ProductGtmWorkflowStepType)
      ? step.type as ProductGtmWorkflowStepType
      : undefined;
    return [{
      id,
      label,
      ...(typeof step?.detail === "string" ? { detail: step.detail } : {}),
      ...(type ? { type } : {}),
    }];
  }) : [];
  const ids = new Set(steps.map((step) => step.id));
  const edges = Array.isArray(graph.edges) ? graph.edges.flatMap((value) => {
    const edge = record(value);
    return typeof edge?.from === "string" && typeof edge.to === "string" && ids.has(edge.from) && ids.has(edge.to) ? [{
      from: edge.from,
      to: edge.to,
      ...(typeof edge.label === "string" ? { label: edge.label } : {}),
    }] : [];
  }) : [];
  return steps.length ? { steps, edges } : null;
}

export function layoutProductGtmWorkflow(ownerId: string, graph: ProductGtmWorkflowGraph, origin: CanvasPoint) {
  const outgoing = new Map(graph.steps.map((step) => [step.id, [] as string[]]));
  const incoming = new Map(graph.steps.map((step) => [step.id, 0]));
  const order = new Map(graph.steps.map((step, index) => [step.id, index]));
  const forwardEdges = graph.edges.filter((edge) => (order.get(edge.to) ?? 0) > (order.get(edge.from) ?? 0));
  for (const edge of forwardEdges) {
    outgoing.get(edge.from)?.push(edge.to);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }
  const roots = graph.steps.filter((step) => incoming.get(step.id) === 0).map((step) => step.id);
  if (!roots.length && graph.steps[0]) roots.push(graph.steps[0].id);
  const depth = new Map(graph.steps.map((step) => [step.id, 0]));
  const visited = new Set<string>();
  const queue = [...roots];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const target of outgoing.get(current) ?? []) {
      depth.set(target, Math.max(depth.get(target) ?? 0, (depth.get(current) ?? 0) + 1));
      if (!visited.has(target)) queue.push(target);
    }
  }
  const groups = new Map<number, ProductGtmWorkflowStep[]>();
  for (const step of graph.steps) {
    const column = depth.get(step.id) ?? 0;
    groups.set(column, [...(groups.get(column) ?? []), step]);
  }
  const positions = new Map<string, CanvasPoint>();
  for (const [column, steps] of groups) steps.forEach((step, row) => positions.set(step.id, {
    x: origin.x + (column + 1) * 272,
    y: origin.y + (row - (steps.length - 1) / 2) * 72,
  }));
  const nodeId = (stepId: string) => productGtmWorkflowNodeId(ownerId, stepId);
  const isReturn = (edge: ProductGtmWorkflowEdge) => (depth.get(edge.to) ?? 0) <= (depth.get(edge.from) ?? 0);
  return { roots, positions, depth, nodeId, isReturn };
}

export function productGtmWorkflowStepLabel(type: ProductGtmWorkflowStepType | undefined) {
  const labels: Record<ProductGtmWorkflowStepType, string> = {
    trigger: "Trigger", "agent-work": "Agent work", condition: "Condition",
    "founder-decision": "Founder decision", "founder-gate": "Founder gate",
    "external-action": "Outward action", observation: "Observation", outcome: "Outcome",
  };
  return type ? labels[type] : "Workflow step";
}
