// Structural warnings — a cheap, always-on read of the pipeline's SHAPE, not its parts.
//
// The engine already grades each node (health, verdict, contract audit). Nothing looked at the graph
// as a whole and asked "is this arrangement any good — is a step redundant, does one lead nowhere,
// does the context feed anyone?" This is that pass. It is PURE over the graph the canvas already
// holds (no run state, no server round-trip), so it flags the moment a shape goes wrong — which is
// how the two "Outreach Writer" cards, or a context nobody reads, light up the instant they appear.
//
// Deliberately calm: it names only clear structural mistakes, so the canvas wears a couple of amber
// marks, never a wall of red. Red stays reserved for true breakage (blocked contracts). This is amber
// — "worth a look" — only.

import type { GTMGraph, GTMNode, GTMEdge } from "@/types";

export type StructuralWarningKind =
  | "duplicate-role"    // two teammates doing the same job
  | "orphan-context"    // a context card nothing downstream reads
  | "dead-end"          // a step whose output feeds nothing
  | "gate-weak-upstream"; // a data edge reaching the gate from a duplicated step

export type StructuralWarning = {
  kind: StructuralWarningKind;
  title: string;   // the short label on the mark (e.g. "Duplicate role")
  detail: string;  // one plain founder-facing sentence
  nodeId?: string; // the flagged node (node-anchored warnings)
  edgeId?: string; // the flagged edge (gate-weak-upstream)
  peerId?: string; // the OTHER node this one duplicates (duplicate-role)
  fixable?: boolean; // a restructure proposal can act on it (drives the "See the fix" affordance)
};

// A teammate/step whose output is meant to travel onward. Context is handled separately (orphan),
// measure is a terminal scoreboard, resource is a visual declaration, and gate/execute are the
// safety spine (a gate that stages-and-stops is a valid pattern, so they are not "dead ends").
const FLOWS_ONWARD = new Set<GTMNode["category"]>(["source", "enrich", "filter", "generate"]);

function normalizeRole(node: GTMNode): string {
  // Two teammates are "the same role" when they carry the same ref (the persona/subagent) or, absent
  // that, the same plain label. Case- and space-insensitive so "Outreach Writer" == "outreach  writer".
  const key = (node.ref && node.ref.trim()) || node.label || node.id;
  return key.trim().toLowerCase().replace(/\s+/g, " ");
}

function flowsOnward(node: GTMNode): boolean {
  return node.kind === "agent" || FLOWS_ONWARD.has(node.category);
}

export function structuralWarnings(graph: GTMGraph | null | undefined): StructuralWarning[] {
  if (!graph?.nodes?.length) return [];
  const nodes = graph.nodes;
  const edges = graph.edges ?? [];

  const dataOut = new Map<string, GTMEdge[]>();
  const anyOut = new Map<string, GTMEdge[]>();
  const dataInToGate = new Map<string, GTMEdge[]>();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    (anyOut.get(e.source) ?? anyOut.set(e.source, []).get(e.source)!).push(e);
    if (e.edgeType === "data") {
      (dataOut.get(e.source) ?? dataOut.set(e.source, []).get(e.source)!).push(e);
      const target = nodeById.get(e.target);
      if (target?.category === "gate") {
        (dataInToGate.get(e.target) ?? dataInToGate.set(e.target, []).get(e.target)!).push(e);
      }
    }
  }

  const warnings: StructuralWarning[] = [];
  const duplicateIds = new Set<string>();

  // 1. Duplicate role — two agent teammates doing the same job. Group agent-kind nodes by role key.
  const byRole = new Map<string, GTMNode[]>();
  for (const n of nodes) {
    if (n.kind !== "agent") continue;
    const key = normalizeRole(n);
    (byRole.get(key) ?? byRole.set(key, []).get(key)!).push(n);
  }
  for (const group of byRole.values()) {
    if (group.length < 2) continue;
    for (const n of group) {
      duplicateIds.add(n.id);
      const peer = group.find((g) => g.id !== n.id);
      warnings.push({
        kind: "duplicate-role",
        title: "Duplicate role",
        detail: `“${n.label}” also runs elsewhere in this pipeline — same job, two voices. The gate would see two drafts of the same thing.`,
        nodeId: n.id,
        peerId: peer?.id,
        fixable: true,
      });
    }
  }

  // 2. Orphan context — a context card nothing downstream reads (no edge leaves it).
  for (const n of nodes) {
    if (n.category !== "context") continue;
    if ((anyOut.get(n.id)?.length ?? 0) === 0) {
      warnings.push({
        kind: "orphan-context",
        title: "Feeds nothing",
        detail: `Nothing downstream reads “${n.label}”, so it never shapes a single message.`,
        nodeId: n.id,
        fixable: true,
      });
    }
  }

  // 3. Dead end — a producing step whose output feeds nothing onward.
  for (const n of nodes) {
    if (!flowsOnward(n)) continue;
    if ((dataOut.get(n.id)?.length ?? 0) === 0) {
      warnings.push({
        kind: "dead-end",
        title: "Leads nowhere",
        detail: `“${n.label}” produces work that no next step picks up.`,
        nodeId: n.id,
        fixable: false,
      });
    }
  }

  // 4. Weak upstream at the gate — a data edge reaching the gate from a duplicated step. Deterministic
  // from the shape alone (a duplicate producer means the gate is fed twice for one job).
  for (const [, incoming] of dataInToGate) {
    for (const e of incoming) {
      if (duplicateIds.has(e.source)) {
        warnings.push({
          kind: "gate-weak-upstream",
          title: "Weak feed",
          detail: `This reaches the gate from a duplicated step — the gate is fed twice for one job.`,
          edgeId: e.id,
          nodeId: e.source,
          fixable: true,
        });
      }
    }
  }

  return warnings;
}

// Convenience index for the canvas: the primary (most actionable) warning per node id. Duplicate-role
// and orphan-context win over the softer dead-end/weak reads when a node carries more than one.
const KIND_RANK: Record<StructuralWarningKind, number> = {
  "duplicate-role": 0,
  "orphan-context": 1,
  "dead-end": 2,
  "gate-weak-upstream": 3,
};

export function warningsByNode(warnings: StructuralWarning[]): Map<string, StructuralWarning> {
  const byNode = new Map<string, StructuralWarning>();
  for (const w of warnings) {
    if (!w.nodeId || w.kind === "gate-weak-upstream") continue;
    const existing = byNode.get(w.nodeId);
    if (!existing || KIND_RANK[w.kind] < KIND_RANK[existing.kind]) byNode.set(w.nodeId, w);
  }
  return byNode;
}

export function weakEdgeIds(warnings: StructuralWarning[]): Set<string> {
  const ids = new Set<string>();
  for (const w of warnings) if (w.kind === "gate-weak-upstream" && w.edgeId) ids.add(w.edgeId);
  return ids;
}

// The count for the toolbar chip: distinct flagged NODES plus weak edges, so "3 worth a look" matches
// what the founder can actually see marked on the canvas (a node counted once, not once per warning).
export function worthALookCount(warnings: StructuralWarning[]): number {
  const nodes = new Set<string>();
  let weakEdges = 0;
  for (const w of warnings) {
    if (w.kind === "gate-weak-upstream") weakEdges += 1;
    else if (w.nodeId) nodes.add(w.nodeId);
  }
  return nodes.size + weakEdges;
}
