import { useMemo } from "react";
import { agentPersona, FAMILY_TINT } from "@/lib/agentPersona";
import type { GTMGraph, GTMNode } from "@/types";
import type { AgentBenchRow } from "@/api";
import "@/styles/crew-strip.css";

// The crew strip — the focused pipeline read as a TEAM, left to right, the way a founder would name it:
// "Researcher → Scout → Writer → Critic → Gate". It is a projection over the same graph on the canvas,
// not a second source of truth: the agents are the pipeline's own agent nodes, ordered by real data
// flow, and each carries the approved count already derived for the bench. Ends on the gate, because
// every path in this product does. Clicking a teammate opens their full record.

// Longest-path depth over data + context edges (feedback edges excluded — they point at the future and
// would knot the order). Same shape the canvas layout uses, so the strip reads in the canvas's order.
function rankNodes(graph: GTMGraph): Map<string, number> {
  const flowEdges = graph.edges.filter((e) => e.edgeType !== "feedback");
  const incoming = new Map<string, string[]>();
  for (const n of graph.nodes) incoming.set(n.id, []);
  for (const e of flowEdges) {
    if (incoming.has(e.target)) incoming.get(e.target)!.push(e.source);
  }
  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    if (rank.has(id)) return rank.get(id)!;
    if (visiting.has(id)) return 0; // cycle guard — treat the back-edge as a source
    visiting.add(id);
    const parents = incoming.get(id) ?? [];
    const d = parents.length ? Math.max(...parents.map(depth)) + 1 : 0;
    visiting.delete(id);
    rank.set(id, d);
    return d;
  };
  for (const n of graph.nodes) depth(n.id);
  return rank;
}

export function CrewStrip({
  graph, bench, onOpenAgent,
}: {
  graph: GTMGraph | null;
  bench: AgentBenchRow[] | null;
  onOpenAgent: (ref: string) => void;
}) {
  const crew = useMemo(() => {
    if (!graph) return [];
    const rank = rankNodes(graph);
    return graph.nodes
      .filter((n): n is GTMNode & { ref: string } => n.kind === "agent" && !!n.ref)
      .sort((a, b) => (rank.get(a.id)! - rank.get(b.id)!) || (a.position?.x ?? 0) - (b.position?.x ?? 0));
  }, [graph]);

  const hasGate = useMemo(() => (graph?.nodes ?? []).some((n) => n.category === "gate"), [graph]);
  const approvedByRef = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of bench ?? []) if (row.hasRuns) m.set(row.ref, row.counts.approved);
    return m;
  }, [bench]);

  if (!graph || crew.length === 0) return null;

  return (
    <div className="crew-strip" role="group" aria-label="This pipeline's crew">
      <span className="crew-label">Crew</span>
      <div className="crew-flow">
        {crew.map((node, i) => {
          const { role, family, monogram } = agentPersona(node.ref, node.label);
          const tint = FAMILY_TINT[family];
          const approved = approvedByRef.get(node.ref);
          return (
            <div className="crew-item" key={node.id}>
              {i > 0 ? <span className="crew-arrow" aria-hidden>→</span> : null}
              <button
                className="crew-chip"
                type="button"
                onClick={() => onOpenAgent(node.ref)}
                title={`${role} — open record`}
              >
                <span className="crew-mono" style={{ background: tint.bg, color: tint.fg }}>{monogram}</span>
                <span className="crew-role">{role}</span>
                {approved ? <span className="crew-approved" title={`${approved} approved at your gate`}>{approved}✓</span> : null}
              </button>
            </div>
          );
        })}
        {hasGate ? (
          <div className="crew-item">
            <span className="crew-arrow" aria-hidden>→</span>
            <div className="crew-chip crew-gate" title="Your founder gate — nothing leaves without your call">
              <span className="crew-gate-mark">⛉</span>
              <span className="crew-role">Gate</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
