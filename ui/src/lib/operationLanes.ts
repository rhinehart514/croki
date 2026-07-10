// operationLanes — the OPERATOR (product-altitude) semantic projection over the same pipeline object model
// (docs/production-direction/16, second visual repair). Operator is NOT the Engineer step graph shrunk to
// fit: each pipeline becomes ONE bounded, readable horizontal lane — goal/name at the left, a single
// crew/work summary in the middle, its gate crossing aligned to the ONE shared founder wall, and the
// outcome/return at the right. Engineer remains the full step graph; GateReview remains the only action
// path (a lane's gate routes into Engineer). Pure and deterministic so it is unit-testable.

import type { Node, Edge } from "@xyflow/react";
import type { ChannelMeta, GTMGraph, JoinedOutcome } from "@/types";

// Column geometry — bounded so a 3-4 lane operation stays legible at 1440 (source ~300px + slim composer
// leave ~1000px of canvas; a lane is ~960px wide). Columns: goal · work · gate(wall) · outcome.
export const OP_LANE_H = 116;
export const OP_LANE_GAP = 40;
const X_GOAL = 0;
const X_WORK = 300;
const X_GATE = 596;
const X_OUTCOME = 792;

export type OpGoalData = { channelId: string; name: string; goal: string; statusLabel: string; tone: "idle" | "gate" | "done" | "error" };
export type OpWorkData = { channelId: string; crewRefs: string[]; stepCount: number; lead: string | null };
export type OpGateData = { channelId: string; pending: number };
// The outcome node means a REAL joined market return, never internal per-node emitted-item throughput. It
// carries the newest joined outcome for the lane (honest label + kind + optional value) or an honest empty
// state: `hasOutcome=false, ran=true` → "No outcome yet"; `ran=false` → "Not measured yet".
export type OpOutcomeData = {
  channelId: string;
  hasOutcome: boolean;
  ran: boolean;
  label: string | null;
  kind: JoinedOutcome["kind"] | null;
  value: number | null;
};

function truncate(s: string, n: number): string {
  const t = (s ?? "").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

function laneStatus(c: ChannelMeta): { label: string; tone: OpGoalData["tone"] } {
  if ((c.pendingGates ?? 0) > 0) return { label: `${c.pendingGates} at your gate`, tone: "gate" };
  if (c.status === "error") return { label: "Needs a look", tone: "error" };
  if (c.status === "done" || c.lastRunOk) return { label: "Ran — results in", tone: "done" };
  return { label: "Ready to run", tone: "idle" };
}

// Newest joined outcome for a pipeline, matched ONLY by the backend's typed pipeline `channelId` (from the
// canonical woven-canvas outcome lineage). A connector name (Gmail/Slack/…) is never a channelId, so it can
// never be mistaken for a lane's outcome. Ties broken by observedAt (newest wins), stable otherwise.
function newestOutcomeFor(channelId: string, outcomes: JoinedOutcome[]): JoinedOutcome | null {
  const mine = outcomes.filter((o) => o.channelId === channelId);
  if (!mine.length) return null;
  return [...mine].sort((a, b) => String(b.observedAt ?? "").localeCompare(String(a.observedAt ?? "")))[0];
}

export function buildOperationLanes(
  channels: ChannelMeta[],
  channelGraphs: Map<string, GTMGraph>,
  outcomes: JoinedOutcome[] = [],
): { nodes: Node[]; edges: Edge[]; wall: { x: number; top: number; bottom: number } | null } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  // Only built pipelines get a lane; a not-yet-composed channel has nothing to project.
  const built = channels.filter((c) => (c.nodeCount ?? 0) > 0);
  built.forEach((c, i) => {
    const y = i * (OP_LANE_H + OP_LANE_GAP);
    const g = channelGraphs.get(c.id) ?? null;
    // The crew on this pipeline (unique agent refs), and its most meaningful lead step.
    const crewRefs: string[] = [];
    let lead: string | null = null;
    for (const n of g?.nodes ?? []) {
      if (n.kind === "agent" && n.ref && !crewRefs.includes(n.ref)) crewRefs.push(n.ref);
      if (!lead && n.category === "generate" && n.label) lead = n.label;
    }
    const stepCount = g?.nodes.length ?? c.nodeCount ?? 0;
    const st = laneStatus(c);

    const goalId = `${c.id}::op-goal`;
    const workId = `${c.id}::op-work`;
    const gateId = `${c.id}::op-gate`;
    const outId = `${c.id}::op-outcome`;

    nodes.push({ id: goalId, type: "opGoal", position: { x: X_GOAL, y }, draggable: false, selectable: true,
      data: { channelId: c.id, name: c.name, goal: truncate(c.objective || "", 96), statusLabel: st.label, tone: st.tone } satisfies OpGoalData });
    nodes.push({ id: workId, type: "opWork", position: { x: X_WORK, y }, draggable: false, selectable: true,
      data: { channelId: c.id, crewRefs: crewRefs.slice(0, 4), stepCount, lead: lead ? truncate(lead, 40) : null } satisfies OpWorkData });
    nodes.push({ id: gateId, type: "opGate", position: { x: X_GATE, y }, draggable: false, selectable: true,
      data: { channelId: c.id, pending: c.pendingGates ?? 0 } satisfies OpGateData });
    // The outcome node is a REAL joined market return (or an honest empty state) — never `produced`, which
    // is internal per-node emitted-item throughput and can double-count the same item.
    const outcome = newestOutcomeFor(c.id, outcomes);
    nodes.push({ id: outId, type: "opOutcome", position: { x: X_OUTCOME, y }, draggable: false, selectable: true,
      data: {
        channelId: c.id,
        hasOutcome: !!outcome,
        ran: !!c.lastRunAt,
        label: outcome ? outcome.label : null,
        kind: outcome ? outcome.kind : null,
        value: outcome ? outcome.value ?? null : null,
      } satisfies OpOutcomeData });

    edges.push({ id: `${c.id}::e1`, source: goalId, target: workId, type: "default", selectable: false, focusable: false });
    edges.push({ id: `${c.id}::e2`, source: workId, target: gateId, type: "default", selectable: false, focusable: false });
    edges.push({ id: `${c.id}::e3`, source: gateId, target: outId, type: "default", className: "op-edge-gate", selectable: false, focusable: false });
  });

  // The single founder wall — one vertical amber threshold aligned just left of every lane's gate column.
  const wall = built.length >= 1
    ? { x: X_GATE - 20, top: -24, bottom: built.length * (OP_LANE_H + OP_LANE_GAP) - OP_LANE_GAP + 8 }
    : null;
  return { nodes, edges, wall };
}
