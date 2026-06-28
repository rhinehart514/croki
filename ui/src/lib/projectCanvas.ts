import type { ChannelMeta, EngineBand, GTMGraph, GTMNode, GTMEdge, PortfolioSystem } from "@/types";

// One project, one ENGINE. A project's workflows are not three machines parked side by side —
// they are channels off a single GTM engine that shares its grounding, its agent pool, its founder
// gate, and its measurement. This assembles every channel's real graph into that one engine view:
//
//   - SHARED nodes are drawn ONCE. The same agent (by ref) used by two channels is a single node
//     with edges fanning to both — not a copy per lane. The product grounding collapses the same way.
//   - The layout reads top to bottom as role-BANDS: ground → source → capabilities → process →
//     gate → stage → measure. Only the channel-specific bands fan into columns; the shared bands
//     (grounding, capabilities) sit once across the top, and the gate is one wall band the whole
//     engine passes through.
//
// The overview stays read-only: clicking a node focuses the channel that owns it through the existing
// single-graph machinery. A shared node carries its first consumer channel in its id, so a click on
// a shared agent focuses a real channel rather than a phantom lane. Nothing here persists positions —
// they recompute from the graph every time, so the overview never fights a founder's hand layout.

const COL_W = 320; // horizontal slot width for one node / one channel column
const BAND_GAP = 248; // vertical distance between two role bands
const BAND_TOP = 40; // y of the first band's baseline
const BAND_H = 188; // painted height of a band row (node ~150 + label room)
const NODE_W = 240; // assumed node width, for centering shared nodes

export type ProjectCanvasEntry = { channel: ChannelMeta; graph: GTMGraph };

// The engine's role-bands, top to bottom. Source sits above Capabilities and Process below it, so a
// channel's natural flow (source → agent → code → gate) reads straight down through the bands.
type Role = "ground" | "source" | "capabilities" | "process" | "gate" | "stage" | "measure";
const ROLE_ORDER: Role[] = ["ground", "source", "capabilities", "process", "gate", "stage", "measure"];
const ROLE_LABEL: Record<Role, string> = {
  ground: "Ground",
  source: "Source",
  capabilities: "Capabilities · shared",
  process: "Process",
  gate: "Founder gate — nothing past this line sends",
  stage: "Stage",
  measure: "Measure",
};
const SHARED = "::~shared~"; // marker in a shared node's id: `${firstConsumerChannel}::~shared~${key}`

function norm(value: string | undefined): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function roleOf(node: GTMNode): Role {
  const k = node.kind;
  const c = node.category;
  if (c === "context") return "ground";
  if (k === "agent" || k === "skill") return "capabilities";
  if (c === "source") return "source";
  if (c === "gate") return "gate";
  if (c === "execute") return "stage";
  if (c === "measure") return "measure";
  return "process"; // code / enrich / filter / generate / resource — the channel's own plumbing
}

// What makes a node THE SAME node across channels. Agents and skills are shared by ref (the engine's
// reusable teammates); grounding is shared when it carries the same ref or the same label. Everything
// else is owned by exactly one channel.
function sharedKey(node: GTMNode, role: Role): string | null {
  if (role === "capabilities") return `cap:${norm(node.ref) || norm(node.label)}`;
  if (role === "ground") return `ground:${norm(node.ref) || norm(node.label)}`;
  return null;
}

function isShared(id: string): boolean {
  return id.includes(SHARED);
}

// Assemble every non-empty channel into one banded engine graph. Returns null if there is nothing to
// draw, so the caller can fall back to the focused single-channel view.
export function buildProjectCanvas(entries: ProjectCanvasEntry[]): GTMGraph | null {
  const built = entries.filter((e) => e.graph?.nodes?.length);
  if (!built.length) return null;

  // ── Pass 1: resolve every original node to its final id, deduping shared nodes by key ──
  const finalId = new Map<string, string>(); // `${channel}::${originalId}` → rendered id
  const keyToId = new Map<string, string>(); // shared key → the one id that wins it (first consumer)
  const finalNode = new Map<string, GTMNode>();
  const role = new Map<string, Role>();
  const channelsUsing = new Map<string, Set<number>>(); // rendered id → channel indexes referencing it

  built.forEach(({ channel, graph }, ci) => {
    for (const node of graph.nodes) {
      const r = roleOf(node);
      const local = `${channel.id}::${node.id}`;
      const key = sharedKey(node, r);
      let resolved: string;
      if (key) {
        resolved = keyToId.get(key) ?? `${channel.id}${SHARED}${key}`;
        keyToId.set(key, resolved);
      } else {
        resolved = local;
      }
      finalId.set(local, resolved);
      if (!finalNode.has(resolved)) {
        finalNode.set(resolved, { ...node, id: resolved });
        role.set(resolved, r);
        channelsUsing.set(resolved, new Set());
      }
      channelsUsing.get(resolved)!.add(ci);
    }
  });

  // ── Pass 2: rewire edges onto final ids, drop self-loops and duplicates ──
  const edges: GTMEdge[] = [];
  const seenEdge = new Set<string>();
  built.forEach(({ channel, graph }) => {
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const e of graph.edges) {
      if (!ids.has(e.source) || !ids.has(e.target)) continue;
      const s = finalId.get(`${channel.id}::${e.source}`);
      const t = finalId.get(`${channel.id}::${e.target}`);
      if (!s || !t || s === t) continue;
      const key = `${s}>${t}>${e.edgeType ?? "data"}`;
      if (seenEdge.has(key)) continue;
      seenEdge.add(key);
      edges.push({ ...e, id: `${channel.id}::${e.id}`, source: s, target: t });
    }
  });

  // ── Pass 3: lay nodes out in role-bands ──
  // Channel column origins: each channel gets enough horizontal slots for its busiest band so two
  // channels never overlap, even when one band holds several of a channel's nodes.
  const channelOwned = [...finalNode.values()].filter((n) => !isShared(n.id));
  const cellCount = new Map<string, number>(); // `${ci}:${role}` → count
  for (const n of channelOwned) {
    const ci = [...channelsUsing.get(n.id)!][0];
    const k = `${ci}:${role.get(n.id)}`;
    cellCount.set(k, (cellCount.get(k) ?? 0) + 1);
  }
  const channelWidth = built.map((_, ci) => Math.max(1, ...ROLE_ORDER.map((r) => cellCount.get(`${ci}:${r}`) ?? 0)));
  const channelOriginCol: number[] = [];
  built.reduce((acc, _, ci) => { channelOriginCol[ci] = acc; return acc + channelWidth[ci]; }, 0);
  const totalWidth = Math.max(channelWidth.reduce((a, b) => a + b, 0), 1) * COL_W;

  // Compacted band rows: only roles that actually have a node get a row.
  const presentRoles = ROLE_ORDER.filter((r) => [...role.values()].includes(r));
  const bandY = new Map<Role, number>();
  presentRoles.forEach((r, i) => bandY.set(r, BAND_TOP + i * BAND_GAP));

  const meanConsumerX = (id: string): number => {
    const cis = [...(channelsUsing.get(id) ?? [])];
    if (!cis.length) return totalWidth / 2;
    return cis.reduce((a, ci) => a + (channelOriginCol[ci] + channelWidth[ci] / 2) * COL_W, 0) / cis.length;
  };

  // Channel-owned nodes: x by channel column, stacked within a band cell.
  const cellCursor = new Map<string, number>();
  for (const n of channelOwned) {
    const ci = [...channelsUsing.get(n.id)!][0];
    const r = role.get(n.id)!;
    const k = `${ci}:${r}`;
    const j = cellCursor.get(k) ?? 0;
    cellCursor.set(k, j + 1);
    n.position = { x: (channelOriginCol[ci] + j) * COL_W, y: bandY.get(r)! };
  }
  // Shared nodes: spread evenly across the engine width in their band, centered over their consumers.
  for (const r of ["ground", "capabilities"] as Role[]) {
    const shared = [...finalNode.values()]
      .filter((n) => role.get(n.id) === r && isShared(n.id))
      .sort((a, b) => meanConsumerX(a.id) - meanConsumerX(b.id));
    shared.forEach((node, i) => {
      node.position = { x: ((i + 1) / (shared.length + 1)) * totalWidth - NODE_W / 2, y: bandY.get(r)! };
    });
  }

  const bands: EngineBand[] = presentRoles.map((r) => ({
    id: r,
    label: ROLE_LABEL[r],
    y: bandY.get(r)! - 30,
    height: BAND_H,
    wall: r === "gate",
  }));
  const systems: PortfolioSystem[] = built.map(({ channel }, ci) => {
    const nodeIds = [...finalNode.values()].filter((n) => channelsUsing.get(n.id)!.has(ci)).map((n) => n.id);
    return {
      id: channel.id,
      label: channel.name,
      objective: channel.objective,
      laneIndex: ci,
      nodeIds,
      gateIds: nodeIds.filter((id) => role.get(id) === "gate"),
    };
  });

  return { id: "project-canvas", name: "Engine", version: "overview", nodes: [...finalNode.values()], edges, bands, systems };
}
