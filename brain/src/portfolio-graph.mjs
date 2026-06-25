// Portfolio fan-out — many GTM systems, one legible diagram.
//
// The old mental model was one goal → one channel → one linear graph. An ADE for go-to-market
// thinks in a PORTFOLIO: a single plain-language goal blooms into several distinct GTM systems
// (an outbound channel, a referral loop, an attribution repair), and the founder reviews them as
// ONE branching node diagram with multiple founder gates — not as separate pages clicked through.
//
// The model still composes each system's topology (workflow-composer.mjs / composition.mjs). This
// module is the deterministic HOST assembly that unions those composed systems into one graph:
// it namespaces each system so ids never collide, lays the systems out as parallel lanes so the
// diagram stays legible at density, preserves every gate and feedback edge, and re-asserts the
// wall across the union (every execute still behind a founder gate on every path). No model, no
// fabrication — it only assembles what was already composed.

import { validateGraph } from "./graph-operations.mjs";

const LANE_GAP = 280; // vertical distance between two systems' lanes — keeps lanes from overlapping
const COL_GAP = 240; // horizontal distance between successive nodes within a lane
const LANE_TOP = 120; // y of the first lane

function slug(value, fallback = "system") {
  return (
    String(value || fallback)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || fallback
  );
}

// The wall, across the whole portfolio: every execute node must have a founder gate upstream of
// it on every path. Identical guarantee to the per-channel composer, re-checked on the union so a
// merge can never smuggle an ungated send into existence. Throws with the offending node id.
function assertPortfolioWall(nodes, edges) {
  const executes = nodes.filter((n) => n.category === "execute");
  if (!executes.length) return;
  const gates = new Set(nodes.filter((n) => n.category === "gate").map((n) => n.id));
  const incoming = new Map();
  for (const edge of edges) {
    if (edge.edgeType === "feedback") continue; // feedback edges don't carry execution forward
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target).push(edge.source);
  }
  for (const exec of executes) {
    const seen = new Set();
    const stack = [...(incoming.get(exec.id) ?? [])];
    let gated = false;
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      if (gates.has(id)) { gated = true; break; }
      stack.push(...(incoming.get(id) ?? []));
    }
    if (!gated) throw new Error(`Portfolio assembly rejected: execute node "${exec.id}" is not behind a founder gate.`);
  }
}

// Lay one system's nodes out as a single horizontal lane at a fixed y, ordered left-to-right by
// the node's own x (falling back to declaration order). Parallel lanes — one per system — read as
// distinct rows on the canvas, which is what keeps a 15+ node portfolio legible instead of a
// hairball.
function laneLayout(nodes, laneY) {
  const ordered = [...nodes].sort((a, b) => {
    const ax = Number.isFinite(a.position?.x) ? a.position.x : 0;
    const bx = Number.isFinite(b.position?.x) ? b.position.x : 0;
    return ax - bx;
  });
  const xByOriginalId = new Map();
  ordered.forEach((node, col) => xByOriginalId.set(node.id, 120 + col * COL_GAP));
  return xByOriginalId.size ? { laneY, x: (originalId) => xByOriginalId.get(originalId) ?? 120 } : { laneY, x: () => 120 };
}

// Assemble composed systems into one portfolio graph.
//   goal     — the plain-language goal the whole portfolio serves (becomes the graph name)
//   systems  — [{ channel: { id, name, objective }, graph: { nodes, edges } }]
// Returns one validated graph whose nodes carry { system, systemLabel } so the canvas can render
// each system as its own cluster, plus a `systems` manifest the UI uses to label and fold lanes.
export function assemblePortfolioGraph({ goal = "", systems = [] } = {}) {
  if (!Array.isArray(systems) || systems.length === 0) {
    throw new Error("A portfolio needs at least one composed system.");
  }

  const usedSystemIds = new Set();
  const nodes = [];
  const edges = [];
  const manifest = [];

  systems.forEach((entry, laneIndex) => {
    const channel = entry?.channel ?? {};
    const graph = entry?.graph ?? {};
    const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const rawEdges = Array.isArray(graph.edges) ? graph.edges : [];
    if (!rawNodes.length) throw new Error(`System "${channel.name || channel.id || laneIndex}" has no nodes.`);

    // Unique, stable system id even if two channels share a name.
    let systemId = slug(channel.id || channel.name, `system-${laneIndex + 1}`);
    while (usedSystemIds.has(systemId)) systemId = `${systemId}-${laneIndex + 1}`;
    usedSystemIds.add(systemId);
    const systemLabel = channel.name || channel.objective || systemId;

    const laneY = LANE_TOP + laneIndex * LANE_GAP;
    const lane = laneLayout(rawNodes, laneY);
    const ns = (id) => `${systemId}__${id}`;

    const gateIds = [];
    const nodeIds = [];
    for (const node of rawNodes) {
      const id = ns(node.id);
      nodeIds.push(id);
      if (node.category === "gate") gateIds.push(id);
      nodes.push({
        ...structuredClone(node),
        id,
        system: systemId,
        systemLabel,
        position: { x: lane.x(node.id), y: laneY },
      });
    }
    for (const edge of rawEdges) {
      edges.push({
        ...structuredClone(edge),
        id: ns(edge.id || `${edge.source}-${edge.target}`),
        source: ns(edge.source),
        target: ns(edge.target),
        edgeType: edge.edgeType ?? "data",
      });
    }

    manifest.push({
      id: systemId,
      label: systemLabel,
      objective: channel.objective ?? "",
      laneIndex,
      nodeIds,
      gateIds,
    });
  });

  // The wall and structural validity, on the union. A merge that produced an ungated send, a
  // collided id, or a cycle is rejected here rather than reaching the canvas.
  assertPortfolioWall(nodes, edges);

  const id = `portfolio-${slug(goal, "goal")}`;
  const graph = {
    id,
    name: goal || "Portfolio",
    kind: "portfolio",
    objective: goal,
    version: "1.0.0",
    revision: 0,
    nodes,
    edges,
    systems: manifest,
    store: { path: `.gtm/flows/${id}.json`, runs: 0 },
  };

  const validation = validateGraph(graph);
  if (!validation.ok) {
    throw new Error(`Portfolio graph is invalid: ${validation.errors.join(" ")}`);
  }
  return graph;
}

// A compact read of a portfolio for the UI/operator: how many systems, gates, and outward nodes,
// and the per-system breakdown. Pure derivation from the assembled graph — never seeded.
export function summarizePortfolio(graph) {
  const systems = Array.isArray(graph?.systems) ? graph.systems : [];
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return {
    systemCount: systems.length,
    nodeCount: nodes.length,
    gateCount: nodes.filter((n) => n.category === "gate").length,
    executeCount: nodes.filter((n) => n.category === "execute").length,
    systems: systems.map((s) => ({
      id: s.id,
      label: s.label,
      nodes: s.nodeIds.length,
      gates: s.gateIds.length,
    })),
  };
}
