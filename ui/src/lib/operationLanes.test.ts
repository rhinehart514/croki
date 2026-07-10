import { describe, it, expect } from "vitest";
import { buildOperationLanes } from "@/lib/operationLanes";
import type { ChannelMeta, GTMGraph, GTMNode } from "@/types";

function channel(over: Partial<ChannelMeta> & { id: string; name: string }): ChannelMeta {
  return {
    kind: "outbound", objective: "", graphId: over.id, enabled: true, status: "idle", lastRunAt: null,
    lastRunOk: null, pendingGates: 0, nodeCount: 6, runCount: 0, graphRevision: 1, lastRunResult: null, ...over,
  };
}
function node(over: Partial<GTMNode> & { id: string; category: GTMNode["category"] }): GTMNode {
  return { label: over.id, position: { x: 0, y: 0 }, config: {}, ...over } as GTMNode;
}
function graph(id: string, nodes: GTMNode[]): GTMGraph { return { id, name: id, version: "0", nodes, edges: [] }; }

// The Operator semantic projection (docs/production-direction/16): one BOUNDED lane per pipeline — goal ·
// work · gate · outcome — not the full Engineer step graph. This is the fix for the illegible Fit View.
describe("buildOperationLanes — Operator semantic compression", () => {
  const graphs = new Map<string, GTMGraph>([
    ["a", graph("a", [
      node({ id: "src", category: "source" }),
      node({ id: "t1", category: "generate", kind: "agent", ref: "scout", label: "Find owners" }),
      node({ id: "t2", category: "generate", kind: "agent", ref: "writer", label: "Draft pitch" }),
      node({ id: "t3", category: "enrich" }), node({ id: "t4", category: "filter" }),
      node({ id: "gate", category: "gate" }), node({ id: "send", category: "execute" }),
      node({ id: "m", category: "measure" }),
    ])],
    ["b", graph("b", [node({ id: "g", category: "generate", kind: "agent", ref: "closer" }), node({ id: "gate", category: "gate" })])],
  ]);
  const channels = [
    channel({ id: "a", name: "Direct outbound", objective: "Book 3 calls this week from real operators", pendingGates: 2, lastRunResult: { produced: 13, byCategory: {} }, lastRunAt: "2026-07-10" }),
    channel({ id: "b", name: "Inbound content", objective: "Earn inbound from trigger events", pendingGates: 0 }),
    channel({ id: "c", name: "Not built", nodeCount: 0 }), // no lane — nothing composed
  ];

  it("emits exactly four bounded nodes per BUILT pipeline (goal · work · gate · outcome), never the full graph", () => {
    const { nodes } = buildOperationLanes(channels, graphs);
    // Two built pipelines → 8 nodes total; the unbuilt one gets no lane. The 8-node pipeline is NOT expanded.
    expect(nodes.filter((n) => n.type === "opGoal")).toHaveLength(2);
    expect(nodes.filter((n) => n.type === "opWork")).toHaveLength(2);
    expect(nodes.filter((n) => n.type === "opGate")).toHaveLength(2);
    expect(nodes.filter((n) => n.type === "opOutcome")).toHaveLength(2);
    expect(nodes).toHaveLength(8);
    expect(nodes.some((n) => n.id === "c::op-goal")).toBe(false);
  });

  it("the goal node carries the pipeline name, goal, and gate-aware status", () => {
    const { nodes } = buildOperationLanes(channels, graphs);
    const goal = nodes.find((n) => n.id === "a::op-goal")!.data as { name: string; goal: string; statusLabel: string; tone: string };
    expect(goal.name).toBe("Direct outbound");
    expect(goal.goal).toContain("Book 3 calls");
    expect(goal.tone).toBe("gate");
    expect(goal.statusLabel).toBe("2 at your gate");
  });

  it("the work node summarizes the crew and step count (not every step)", () => {
    const { nodes } = buildOperationLanes(channels, graphs);
    const work = nodes.find((n) => n.id === "a::op-work")!.data as { crewRefs: string[]; stepCount: number; lead: string | null };
    expect(work.crewRefs).toEqual(["scout", "writer"]);
    expect(work.stepCount).toBe(8);       // the pipeline HAS 8 steps — summarized, not rendered as 8 nodes
    expect(work.lead).toBe("Find owners");
  });

  it("the gate node carries the pending count", () => {
    const { nodes } = buildOperationLanes(channels, graphs);
    expect((nodes.find((n) => n.id === "a::op-gate")!.data as { pending: number }).pending).toBe(2);
  });

  it("the outcome node shows a REAL joined outcome matched by typed channelId — never internal produced", () => {
    const outcomes = [
      // A real joined outcome for pipeline "a" (matched by the backend's typed pipeline channelId).
      { id: "o-new", kind: "observed-response" as const, label: "3 replies", value: 3, observedAt: "2026-07-10T10:00:00Z", channelId: "a" },
      { id: "o-old", kind: "observed-response" as const, label: "1 reply", value: 1, observedAt: "2026-07-09T10:00:00Z", channelId: "a" },
      // A Gmail CONNECTOR name is not a pipeline id — it must never attach to a lane.
      { id: "o-gmail", kind: "sent" as const, label: "sent", value: null, observedAt: "2026-07-11T10:00:00Z", channelId: "gmail" },
    ];
    const { nodes } = buildOperationLanes(channels, graphs, outcomes);
    const a = nodes.find((n) => n.id === "a::op-outcome")!.data as { hasOutcome: boolean; label: string | null; value: number | null };
    // The NEWEST real outcome for "a" — not the Gmail connector's, not produced.
    expect(a.hasOutcome).toBe(true);
    expect(a.label).toBe("3 replies");
    expect(a.value).toBe(3);
    // `produced` is never surfaced on an outcome node.
    expect(Object.keys(a)).not.toContain("produced");
    // Pipeline "b" ran nothing / has no joined outcome → honest empty, never a produced count.
    const b = nodes.find((n) => n.id === "b::op-outcome")!.data as { hasOutcome: boolean; ran: boolean };
    expect(b.hasOutcome).toBe(false);
    expect(b.ran).toBe(false);
  });

  it("a connector name (Gmail/Slack) can never be matched as a pipeline's outcome", () => {
    const outcomes = [
      { id: "o1", kind: "sent" as const, label: "sent", value: null, observedAt: "2026-07-11", channelId: "gmail" },
      { id: "o2", kind: "sent" as const, label: "sent", value: null, observedAt: "2026-07-11", channelId: "slack" },
    ];
    const { nodes } = buildOperationLanes(channels, graphs, outcomes);
    // No pipeline id equals "gmail"/"slack", so every lane's outcome node stays honestly empty.
    for (const id of ["a::op-outcome", "b::op-outcome"]) {
      expect((nodes.find((n) => n.id === id)!.data as { hasOutcome: boolean }).hasOutcome).toBe(false);
    }
  });

  it("says 'No outcome yet' when a pipeline ran but has no joined outcome, 'Not measured yet' when it never ran", () => {
    // Pipeline "a" ran (lastRunAt set) but no joined outcome → hasOutcome false, ran true.
    const { nodes } = buildOperationLanes(channels, graphs, []);
    const a = nodes.find((n) => n.id === "a::op-outcome")!.data as { hasOutcome: boolean; ran: boolean };
    expect(a.hasOutcome).toBe(false);
    expect(a.ran).toBe(true);
    const b = nodes.find((n) => n.id === "b::op-outcome")!.data as { hasOutcome: boolean; ran: boolean };
    expect(b.hasOutcome).toBe(false);
    expect(b.ran).toBe(false);
  });

  it("aligns all gates on one shared x and reports a single wall band across the lanes", () => {
    const { nodes, wall } = buildOperationLanes(channels, graphs);
    const gateXs = nodes.filter((n) => n.type === "opGate").map((n) => n.position.x);
    expect(new Set(gateXs).size).toBe(1);               // one shared gate column = one wall
    expect(wall).toBeTruthy();
    expect(wall!.x).toBeLessThan(gateXs[0]);            // the wall sits just left of the aligned gate column
    expect(wall!.bottom).toBeGreaterThan(wall!.top);
  });

  it("produces no lanes and no wall when nothing is built", () => {
    const { nodes, wall } = buildOperationLanes([channel({ id: "x", name: "x", nodeCount: 0 })], new Map());
    expect(nodes).toHaveLength(0);
    expect(wall).toBeNull();
  });
});
