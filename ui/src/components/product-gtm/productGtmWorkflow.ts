import type { FirmSemanticModel, MarketMovementIndex } from "@/types";
import { productGtmRefId, type CanvasPoint } from "./productGtmLayout";

export type ProductGtmWorkflowStepType = "trigger" | "source" | "agent-work" | "tool" | "condition" | "wait" | "founder-decision" | "founder-gate" | "external-action" | "observation" | "outcome";
export type ProductGtmWorkflowStep = { id: string; label: string; detail?: string; type?: ProductGtmWorkflowStepType };
export type ProductGtmWorkflowEdge = { from: string; to: string; label?: string };
export type ProductGtmWorkflowRegister = "drafted" | "established";
// The graph the founder authored: steps, edges, and an optional objective. It carries no register field.
// Whether a play reads as drafted or established is never a self-declared property on the blob — that is
// exactly how a draft could dishonestly present as established. Register is derived from physics (see
// deriveWorkflowRegister) so an intended play can never claim it has run.
export type ProductGtmWorkflowGraph = { steps: ProductGtmWorkflowStep[]; edges: ProductGtmWorkflowEdge[]; objective?: string };

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const STEP_TYPES = new Set<ProductGtmWorkflowStepType>([
  "trigger", "source", "agent-work", "tool", "condition", "wait", "founder-decision", "founder-gate", "external-action", "observation", "outcome",
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
  const objective = typeof graph.objective === "string" ? graph.objective.trim() : "";
  return steps.length ? { steps, edges, ...(objective ? { objective } : {}) } : null;
}

// A play's real market state, derived from the movement index — never hand-maintained. `ran` records that
// the play actually moved (an executed outward act or attached live work); the four buckets carry the exact
// item references behind each derived step count, so the people are one click behind the number.
export type ProductGtmPlayRun = { ran: boolean; needApproval: string[]; waitingReply: string[]; returned: string[]; inProgress: string[] };

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

export function playRunStates(movement: MarketMovementIndex | null | undefined): Map<string, ProductGtmPlayRun> {
  const runs = new Map<string, ProductGtmPlayRun>();
  const ensure = (id: string) => {
    let run = runs.get(id);
    if (!run) { run = { ran: false, needApproval: [], waitingReply: [], returned: [], inProgress: [] }; runs.set(id, run); }
    return run;
  };
  for (const action of movement?.actions ?? []) {
    const ref = `outward-action:${action.id}`;
    const state = String(action.state ?? "");
    for (const subject of strings(action.subjectRefs)) {
      const id = productGtmRefId(subject);
      if (!id) continue;
      const run = ensure(id);
      // A prepared-but-unsent act (needs-founder) has not run; every other state means it left the draft.
      if (state !== "needs-founder") run.ran = true;
      if (state === "needs-founder") run.needApproval.push(ref);
      else if (state === "returned" || state === "silent") run.returned.push(ref);
      else if (state === "in-world") run.waitingReply.push(ref);
    }
  }
  for (const [index, item] of (movement?.liveWork ?? []).entries()) {
    const record = item as Record<string, unknown>;
    const ref = String(record.threadRef ?? record.id ?? `work-${index}`);
    const attention = String(record.attention ?? "");
    const activity = String(record.activity ?? "");
    for (const subject of strings(record.subjectRefs)) {
      const id = productGtmRefId(subject);
      if (!id) continue;
      const run = ensure(id);
      run.ran = true;
      if (attention === "decision") run.needApproval.push(ref);
      else if (activity === "running") run.inProgress.push(ref);
    }
  }
  return runs;
}

// The single source of register truth. Established requires the play to be canonical (founder-adopted, not a
// tentative staged draft) AND to have actually run. Everything else is drafted. This is what makes a draft
// undisplayable as established regardless of what its blob once claimed.
export function deriveWorkflowRegister(assertion: string | undefined, run: ProductGtmPlayRun | undefined): ProductGtmWorkflowRegister {
  return assertion !== "tentative" && Boolean(run?.ran) ? "established" : "drafted";
}

export function deriveWorkflowRegisters(model: FirmSemanticModel, movement: MarketMovementIndex | null | undefined): Map<string, ProductGtmWorkflowRegister> {
  const runs = playRunStates(movement);
  const registers = new Map<string, ProductGtmWorkflowRegister>();
  for (const object of model.objects) {
    if (!productGtmWorkflowGraph(object.properties)) continue;
    registers.set(object.id, deriveWorkflowRegister(object.assertion, runs.get(object.id)));
  }
  return registers;
}

export type ProductGtmWorkflowStepCount = { label: string; count: number; itemRefs: string[] };

// Per-step running counts derived from real state. Each real item is assigned once, to the canonical step of
// the kind it belongs to (the founder gate for approvals, the outward action for sends awaiting a reply, the
// observation for returns, the agent-work step for work in progress). A step whose kind has no real items
// shows no count; nothing is fabricated and no item is double-counted.
export function workflowStepCounts(graph: ProductGtmWorkflowGraph, run: ProductGtmPlayRun | undefined): Map<string, ProductGtmWorkflowStepCount> {
  const counts = new Map<string, ProductGtmWorkflowStepCount>();
  if (!run) return counts;
  const firstOfType = (...types: ProductGtmWorkflowStepType[]) => graph.steps.find((step) => step.type && types.includes(step.type))?.id ?? null;
  const place = (stepId: string | null, refs: string[], phrase: (count: number) => string) => {
    if (!stepId || !refs.length) return;
    counts.set(stepId, { count: refs.length, itemRefs: refs, label: phrase(refs.length) });
  };
  place(firstOfType("founder-gate", "founder-decision"), run.needApproval, (count) => `${count} ${count === 1 ? "needs" : "need"} your approval`);
  place(firstOfType("external-action"), run.waitingReply, (count) => `${count} waiting on reply`);
  place(firstOfType("observation", "outcome"), run.returned, (count) => `${count} returned`);
  place(firstOfType("agent-work"), run.inProgress, (count) => `${count} in progress`);
  return counts;
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
    trigger: "Trigger", source: "Source", "agent-work": "Agent work", tool: "Tool", condition: "Condition", wait: "Wait",
    "founder-decision": "Founder decision", "founder-gate": "Founder gate",
    "external-action": "Outward action", observation: "Observation", outcome: "Outcome",
  };
  return type ? labels[type] : "Workflow step";
}
