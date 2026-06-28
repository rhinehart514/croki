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

// Fold every system's founder gate into ONE shared gate — the consolidated approval queue. Many
// channels at volume should not scatter the founder across one review tab per channel; they should
// pool into a single queue. We rewire in place on the already-namespaced union: drop each per-system
// gate node, redirect everything that flowed INTO a gate so it flows into the shared gate, and
// redirect everything that flowed OUT of a gate so it flows out of the shared gate. The wall is
// strictly preserved — every path that had a gate before its execute still has the (now shared) gate
// before its execute — and `assertPortfolioWall` re-checks it on the rewired union regardless.
//
// A system that composed with NO gate is left untouched here; the wall assertion then rejects the
// union if that gateless system has an execute, exactly as it would without consolidation. The shared
// gate carries `consolidated: true` and `systems` (the systems whose gates merged into it) so the UI
// can label the single queue.
const SHARED_GATE_ID = "portfolio__gate";

function consolidateGates(nodes, edges, manifest) {
  const gateIds = new Set(nodes.filter((n) => n.category === "gate").map((n) => n.id));
  if (gateIds.size < 1) return { nodes, edges }; // nothing to consolidate
  // Never collide with a real node id.
  let sharedId = SHARED_GATE_ID;
  const existing = new Set(nodes.map((n) => n.id));
  let suffix = 1;
  while (existing.has(sharedId)) sharedId = `${SHARED_GATE_ID}-${suffix++}`;

  // Place the shared gate centered vertically, to the right of the lanes, so it reads as the one
  // junction every lane funnels through.
  const ys = nodes.map((n) => n.position?.y).filter((y) => Number.isFinite(y));
  const xs = nodes.map((n) => n.position?.x).filter((x) => Number.isFinite(x));
  const sharedGate = {
    id: sharedId,
    category: "gate",
    connector: "default",
    label: "Founder review (all channels)",
    consolidated: true,
    systems: [...new Set(nodes.filter((n) => gateIds.has(n.id)).map((n) => n.system).filter(Boolean))],
    config: {},
    position: {
      x: (xs.length ? Math.max(...xs) : 120) + COL_GAP,
      y: ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : LANE_TOP,
    },
  };

  const keptNodes = nodes.filter((n) => !gateIds.has(n.id));
  keptNodes.push(sharedGate);

  const redirect = (id) => (gateIds.has(id) ? sharedId : id);
  const rewired = [];
  const seen = new Set();
  for (const edge of edges) {
    const source = redirect(edge.source);
    const target = redirect(edge.target);
    if (source === target) continue; // a gate→gate edge collapses to a self-loop; drop it
    const id = `${edge.edgeType ?? "data"}-${source}-${target}`;
    if (seen.has(id)) continue; // many lanes' gate edges fold onto the same shared edge — dedup
    seen.add(id);
    rewired.push({ ...edge, id, source, target });
  }

  // Reflect the merge in the manifest: every system now points at the one shared gate.
  for (const system of manifest) system.gateIds = [sharedId];
  return { nodes: keptNodes, edges: rewired };
}

// Assemble composed systems into one portfolio graph.
//   goal            — the plain-language goal the whole portfolio serves (becomes the graph name)
//   systems         — [{ channel: { id, name, objective }, graph: { nodes, edges } }]
//   consolidateGate — when true, fold every system's founder gate into ONE shared approval queue
//                     (the consolidated-queue mode). Defaults to false: each system keeps its own
//                     gate, the original per-lane behavior, so existing callers are unaffected.
// Returns one validated graph whose nodes carry { system, systemLabel } so the canvas can render
// each system as its own cluster, plus a `systems` manifest the UI uses to label and fold lanes.
export function assemblePortfolioGraph({ goal = "", systems = [], consolidateGate = false } = {}) {
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

  // Optionally fold the per-system gates into ONE consolidated approval queue. Done BEFORE the wall
  // assertion so the wall is checked on the exact topology the founder will see and run.
  const assembled = consolidateGate ? consolidateGates(nodes, edges, manifest) : { nodes, edges };

  // The wall and structural validity, on the union. A merge that produced an ungated send, a
  // collided id, or a cycle is rejected here rather than reaching the canvas.
  assertPortfolioWall(assembled.nodes, assembled.edges);

  const id = `portfolio-${slug(goal, "goal")}`;
  const graph = {
    id,
    name: goal || "Portfolio",
    kind: "portfolio",
    objective: goal,
    version: "1.0.0",
    revision: 0,
    nodes: assembled.nodes,
    edges: assembled.edges,
    systems: manifest,
    consolidatedGate: consolidateGate,
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
    consolidatedGate: graph?.consolidatedGate === true,
    systems: systems.map((s) => ({
      id: s.id,
      label: s.label,
      nodes: s.nodeIds.length,
      gates: s.gateIds.length,
    })),
  };
}
