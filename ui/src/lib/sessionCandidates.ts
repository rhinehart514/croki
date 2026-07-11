// The ONE seam where the backend's candidate pipeline SHAPES are read off an operator session.
//
// When a goal is ambiguous, the backend composes 2–3 candidate pipeline shapes (each a full graph in the
// open node model) and parks the session at status "waiting_for_candidates" with the shapes on
// `session.pendingCandidates.candidates`. Two surfaces read them: the CANVAS lays them out side by side as
// pickable pipelines (the primary place the founder decides), and the composer dock echoes them inline.
// Both read through this one helper so there is a single definition of "what a candidate is."
//
// Nothing here runs, sends, or builds. A candidate is a shape only; it becomes work solely when the
// founder picks it (resolveOperatorCandidates → compose_and_run), which is a founder act, never a tool.

import type { GTMEdge, GTMNode, OperatorEvent, OperatorSession } from "@/types";
import { rewriteFounderLanguage } from "./operatorLanguage";

export type Candidate = { id: string; label: string; rationale: string; nodes: GTMNode[]; edges: GTMEdge[] };

export function normalizeCandidates(raw: unknown): Candidate[] {
  if (!Array.isArray(raw)) return [];
  const out: Candidate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const id = typeof c.id === "string" ? c.id : null;
    const label = typeof c.label === "string" ? c.label : null;
    if (!id || !label) continue;
    const nodes = (Array.isArray(c.nodes) ? c.nodes : []).map((n) => {
      const node = n as GTMNode;
      // Candidate nodes may arrive un-laid-out; a missing position would crash a flow-order sort.
      return node.position ? node : { ...node, position: { x: 0, y: 0 } };
    });
    out.push({
      id,
      label: rewriteFounderLanguage(label),
      rationale: typeof c.rationale === "string" ? rewriteFounderLanguage(c.rationale) : "",
      nodes,
      edges: Array.isArray(c.edges) ? (c.edges as GTMEdge[]) : [],
    });
  }
  return out;
}

function candidatesFromEvents(events: OperatorEvent[]): unknown {
  for (let i = events.length - 1; i >= 0; i--) {
    const data = events[i].data;
    if (data && typeof data === "object" && (data as Record<string, unknown>).kind === "candidates") {
      return (data as Record<string, unknown>).candidates;
    }
  }
  return null;
}

export function sessionCandidates(session: OperatorSession | null): Candidate[] {
  if (!session) return [];
  const bag = session as unknown as { pendingCandidates?: { candidates?: unknown } | null; candidates?: unknown };
  const raw =
    (Array.isArray(bag.pendingCandidates?.candidates) ? bag.pendingCandidates!.candidates : null) ??
    (Array.isArray(bag.candidates) ? bag.candidates : null) ??
    candidatesFromEvents(session.events);
  return normalizeCandidates(raw);
}
