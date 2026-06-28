import type { GTMGraph, GTMNode, GTMEdge, GTMOpportunity, DataAdapter } from "@/types";

// Build one canvas holding EVERY proposed channel as its own workflow — different workflows in
// stacked lanes on one canvas. Each lane is the channel's REAL model-composed graph once it
// streams in; until then it shows a synthesized placeholder so the lane is never empty. Node ids
// are namespaced `${channelId}::${id}` so lanes stay separate and a node maps back to its channel.

const COL = 248;        // horizontal gap between workflow steps
const LANE_GAP = 250;   // vertical gap between channel workflows
const LANE_TOP = 40;
const ROW = 150;        // vertical gap between branched nodes in the same rank

export type IdeationLane = { channelId: string; title: string };

// A channel's composed workflow as it streams from the server, plus its live status. While a lane
// is "composing" it carries the model's live reasoning (thinking) so the lane shows real work in
// progress instead of a fabricated pipeline; "error" carries why the compose failed.
export type LaneState = {
  status: "composing" | "ready" | "error";
  title: string;
  nodes?: GTMNode[];
  edges?: GTMEdge[];
  error?: string;
  thinking?: string;
};

export function channelIdFromNode(nodeId: string): string | null {
  const i = nodeId.indexOf("::");
  return i === -1 ? null : nodeId.slice(0, i);
}

// Lay a single workflow out by DAG depth and drop it into its lane's Y band. Shared by the synth
// placeholder and the real composed graph so both read identically. Namespaces ids by channel.
function layoutLane(cid: string, rawNodes: GTMNode[], rawEdges: GTMEdge[], laneTop: number): { nodes: GTMNode[]; edges: GTMEdge[] } {
  const ids = new Set(rawNodes.map((n) => n.id));
  const flow = rawEdges.filter((e) => e.edgeType !== "feedback" && ids.has(e.source) && ids.has(e.target));
  const adj = new Map<string, string[]>(rawNodes.map((n) => [n.id, []]));
  const indeg = new Map<string, number>(rawNodes.map((n) => [n.id, 0]));
  for (const e of flow) { adj.get(e.source)!.push(e.target); indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1); }
  const rank = new Map<string, number>(rawNodes.map((n) => [n.id, 0]));
  const q = rawNodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const deg = new Map(indeg);
  while (q.length) {
    const id = q.shift()!;
    for (const next of adj.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1));
      deg.set(next, (deg.get(next) ?? 0) - 1);
      if ((deg.get(next) ?? 0) === 0) q.push(next);
    }
  }
  const byRank = new Map<number, string[]>();
  for (const n of rawNodes) { const r = rank.get(n.id) ?? 0; (byRank.get(r) ?? byRank.set(r, []).get(r)!).push(n.id); }
  const posY = new Map<string, number>();
  for (const [, group] of byRank) group.forEach((id, i) => posY.set(id, (i - (group.length - 1) / 2) * ROW));
  const ns = (id: string) => `${cid}::${id}`;
  const nodes = rawNodes.map((n) => ({
    ...n, id: ns(n.id),
    position: { x: (rank.get(n.id) ?? 0) * COL, y: laneTop + (posY.get(n.id) ?? 0) },
  }));
  const edges = rawEdges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({ ...e, id: `${cid}::${e.id}`, source: ns(e.source), target: ns(e.target) }));
  return { nodes, edges };
}

// The honest stand-in for a lane that has NOT composed yet — composing or failed. NOT a fabricated
// pipeline (the old synthLane lied: it drew a finished-looking five-node workflow for a lane that
// had composed nothing). This is a single status card that says the truth — the model is reasoning
// (with its live thinking) or the compose errored (with why) — and is replaced the instant the real
// graph streams in. The canvas renders it via the laneStatusNode type (detected by config.laneStatus).
function laneStatusNode(channel: GTMOpportunity, state: LaneState | undefined): { nodes: GTMNode[]; edges: GTMEdge[] } {
  const node: GTMNode = {
    id: "status",
    category: "context",
    connector: "product",
    label: channel.title,
    position: { x: 0, y: 0 },
    config: {
      laneStatus: {
        status: state?.status === "error" ? "error" : "composing",
        title: channel.title,
        thinking: state?.thinking ?? "",
        error: state?.error ?? "",
      },
    },
  };
  return { nodes: [node], edges: [] };
}

// Assemble the whole ideation canvas: one lane per channel. A lane shows its REAL model-composed
// graph once the workflow event lands; until then it shows the honest status card above — never a
// fabricated workflow. lanes[] preserves order for the build bar.
export function buildIdeationCanvas(
  channels: GTMOpportunity[],
  laneStates: Record<string, LaneState>,
): { graph: GTMGraph; lanes: IdeationLane[] } {
  const nodes: GTMNode[] = [];
  const edges: GTMEdge[] = [];
  const lanes: IdeationLane[] = [];
  channels.forEach((channel, i) => {
    const laneTop = LANE_TOP + i * LANE_GAP;
    const state = laneStates[channel.id];
    const raw = (state?.status === "ready" && state.nodes && state.edges)
      ? { nodes: state.nodes, edges: state.edges }
      : laneStatusNode(channel, state);
    const laid = layoutLane(channel.id, raw.nodes, raw.edges, laneTop);
    nodes.push(...laid.nodes);
    edges.push(...laid.edges);
    lanes.push({ channelId: channel.id, title: channel.title });
  });
  return { graph: { id: "ideation-preview", name: "Ideation", version: "preview", nodes, edges }, lanes };
}

// Commit a previewed lane: accept the channel + its agents (the composer requires accepted
// status), then run the real composer with manual input/output (nothing sends).
export async function buildChannelDefaults(
  channel: GTMOpportunity,
  agents: GTMOpportunity[],
  update: (id: string, patch: Partial<GTMOpportunity>) => void | Promise<void>,
  compose: (input: { channelOpportunityId: string; agentOpportunityIds: string[]; input: DataAdapter; output: DataAdapter }) => Promise<void>,
) {
  await update(channel.id, { status: "accepted" });
  for (const agent of agents) await update(agent.id, { status: "accepted" });
  await compose({
    channelOpportunityId: channel.id,
    agentOpportunityIds: agents.map((a) => a.id),
    // Honor the input/output the opportunity actually specified (the model may have proposed an API
    // or CSV source); fall back to a manual seed only when the opportunity named none.
    input: channel.input ?? { type: "manual", label: "Manual input", items: [] },
    output: channel.output ?? { type: "manual", label: "Manual output queue" },
  });
}
