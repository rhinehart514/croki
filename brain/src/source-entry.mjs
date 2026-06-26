// source-entry.mjs — the single domain rule for how a workflow acquires its first items.
//
// This used to be smeared across three files with three drifting predicates
// (hasConcreteInput, sourceHasConfiguredInput, an inline standsOnData) and the same
// "make the entry runnable" rewrite implemented at BOTH compose time and run time — with the
// run-time copy silently deleting the founder's connector source and turning it into an agent.
// That silent rewrite is the opposite of "the founder is in control": the founder built graph
// A and ran graph B.
//
// The clean model: a source node has ONE explicit, persisted, founder-editable MODE.
//
//   provided   — items come from outside the graph (a founder list, a CSV, an API). Backed by a
//                connector (manual/csv/api). Runnable iff it stands on real data; when empty the
//                founder configures the seed — they are the source, in control.
//   discovered — items are found by an agent step that self-sources from public signals. An
//                agent-kind node. Always runnable.
//
// The mode is decided ONCE, at compose time, in the graph the founder sees and persists. The run
// path never rewrites topology — it runs what is there. Two domain rules that ARE the run path's
// job (the gate is the contract checkpoint; a best-effort discovery chain is not contract-rigid)
// live here too so graph.mjs calls them by name instead of re-deriving them.

export const SOURCE_MODES = { PROVIDED: "provided", DISCOVERED: "discovered" };

export function isSourceNode(node) {
  return node?.category === "source";
}

// The mode of a source node, derived from its SHAPE so it can never lie: an agent-kind source
// self-sources (discovered); a connector-backed source is provided. The persisted `mode` field is
// only a cached label for the UI — switching a source's mode means changing its shape (connector
// ↔ agent + ref), not flipping a string, so the runner and the label can never disagree.
export function sourceMode(node) {
  return node?.kind === "agent" ? SOURCE_MODES.DISCOVERED : SOURCE_MODES.PROVIDED;
}

// The ONE predicate: can this source stand on real data right now? A discovered (agent) source
// always can — it self-sources. A provided source stands on data only when its connector is
// actually configured: a non-empty manual list, real CSV text, or an API endpoint.
export function sourceStandsOnData(node) {
  if (!isSourceNode(node)) return true;
  if (sourceMode(node) === SOURCE_MODES.DISCOVERED) return true;
  if (node.connector === "manual") return Array.isArray(node.config?.items) && node.config.items.length > 0;
  if (node.connector === "csv") return typeof node.config?.csv === "string" && node.config.csv.trim().length > 0;
  if (node.connector === "api") return typeof node.config?.endpoint === "string" && node.config.endpoint.trim().length > 0;
  // A provided source on some other connector is assumed self-standing (it fetches its own).
  return true;
}

// True when the founder handed the graph concrete seed data to bind onto a provided source.
export function hasConcreteInput(adapter) {
  if (!adapter || typeof adapter !== "object") return false;
  return !!(adapter.items?.length || (typeof adapter.csv === "string" && adapter.csv.trim()) || adapter.endpoint);
}

// Pick the agent best suited to be a self-sourcing discovery entry: one whose ref/role reads like
// finding/researching prospects. Falls back to the first accepted agent.
export function pickDiscoveryAgent(agents = []) {
  const re = /find|research|prospect|discover|buyer|signal|scout|lead|source|enrich/i;
  return agents.find((a) => re.test(`${a.ref} ${a.objective ?? ""} ${a.title ?? ""}`)) ?? agents[0] ?? null;
}

const DISCOVERY_PROMPT = (role) =>
  `You are the DISCOVERY entry for this go-to-market loop and you were given NO seed list. Using the product grounding and ICP in your context plus WebSearch/WebFetch on real public sources, FIND 3-5 real, currently-active people or organizations that fit this product's ICP and have a recent public now-trigger.${
    role && role.trim() ? ` Then apply your role: ${role.trim()}` : ""
  } Return ONLY a JSON array of real, source-traceable candidates — each with a name/handle, a source url, and one line on why them. Invent nothing; if you can only verify 2, return 2.`;

// Compose-time entry resolution. Decides the source mode VISIBLY in the graph the founder
// persists — never a silent run-time rewrite. Three honest outcomes:
//   1. The founder gave concrete input  → keep the provided source, mark it provided.
//   2. No input, a discovery agent feeds the source → drop the empty connector source and let
//      that agent be the discovered entry (the agent already self-sources; promoting it keeps
//      the topology the model designed minus a dead node).
//   3. No input, no downstream agent but an accepted discovery agent exists → convert the source
//      node itself into a discovered (agent) source.
//   4. No input, nothing to discover with → leave it a provided source; the run will honestly ask
//      the founder to configure the seed (they are in control).
// Returns { nodes, edges } and never throws. Idempotent: a graph already resolved passes through.
export function resolveEntry({ nodes, edges, agents = [], hasInput = false } = {}) {
  const source = nodes.find((n) => isSourceNode(n) && n.kind !== "agent");
  if (!source) return { nodes, edges }; // already discovered, or no source at all

  if (hasInput || sourceStandsOnData(source)) {
    return { nodes: nodes.map((n) => (n.id === source.id ? withMode(n, SOURCE_MODES.PROVIDED) : n)), edges };
  }

  // Outcome 2: a downstream agent can be the self-sourcing entry.
  const downstreamAgent = edges
    .filter((e) => e.source === source.id)
    .map((e) => nodes.find((n) => n.id === e.target))
    .find((n) => n && n.kind === "agent");
  if (downstreamAgent) {
    const newEdges = edges
      .filter((e) => !(e.source === source.id && e.target === downstreamAgent.id))
      .map((e) => (e.target === source.id ? { ...e, target: downstreamAgent.id } : e));
    const newNodes = nodes
      .filter((n) => n.id !== source.id)
      .map((n) =>
        n.id === downstreamAgent.id
          ? {
              ...n,
              mode: SOURCE_MODES.DISCOVERED,
              contract: { ...(n.contract ?? {}), accepts: [], minItems: 0 },
              agentPrompt: DISCOVERY_PROMPT(typeof n.agentPrompt === "string" ? n.agentPrompt : ""),
            }
          : n,
      );
    return { nodes: newNodes, edges: newEdges };
  }

  // Outcome 3: convert the source node itself into a discovered agent source.
  const discovery = pickDiscoveryAgent(agents);
  if (discovery?.ref) {
    const newNodes = nodes.map((n) =>
      n.id === source.id
        ? {
            ...stripConnector(n),
            kind: "agent",
            ref: discovery.ref,
            mode: SOURCE_MODES.DISCOVERED,
            label: n.label || "Find candidates",
            contract: { ...(n.contract ?? {}), accepts: [], minItems: 0 },
            agentPrompt: DISCOVERY_PROMPT(typeof n.agentPrompt === "string" ? n.agentPrompt : ""),
          }
        : n,
    );
    return { nodes: newNodes, edges };
  }

  // Outcome 4: leave it provided; the run will ask the founder to configure the seed.
  return { nodes: nodes.map((n) => (n.id === source.id ? withMode(n, SOURCE_MODES.PROVIDED) : n)), edges };
}

function withMode(node, mode) {
  return node.mode === mode ? node : { ...node, mode };
}

function stripConnector(node) {
  const { connector, ...rest } = node;
  return rest;
}

// ─── Run-path contract rules (the gate is the checkpoint; discovery is best-effort) ───────────

function buildIncoming(edges) {
  const incoming = new Map();
  for (const e of edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target).push(e.source);
  }
  return incoming;
}

function descendantsOf(startIds, edges) {
  const out = new Set();
  const stack = [...startIds];
  while (stack.length) {
    const id = stack.pop();
    for (const e of edges) {
      if (e.edgeType === "data" && e.source === id && !out.has(e.target)) {
        out.add(e.target);
        stack.push(e.target);
      }
    }
  }
  return out;
}

// Always-on domain rule: the founder gate IS the contract checkpoint. The gate itself must not
// reject a real human-reviewed draft on a field-name technicality, and a post-gate execute
// (staging/send) must trust the approval rather than re-litigate field names. Measure is left
// untouched so it stays honestly blind when the win event carries no source.
export function relaxGateContracts(nodes, edges) {
  const gateIds = nodes.filter((n) => n.category === "gate").map((n) => n.id);
  if (gateIds.length === 0) return nodes;
  const postGate = descendantsOf(gateIds, edges);
  return nodes.map((n) => {
    if (n.category === "gate") return { ...n, contract: { ...(n.contract ?? {}), accepts: [], emits: [], minItems: 1 } };
    if (postGate.has(n.id) && n.category === "execute") return { ...n, contract: { ...(n.contract ?? {}), accepts: [], emits: [] } };
    return n;
  });
}

// Discovery-only rule: a self-sourcing agent chain emits a generic candidate shape and each
// downstream agent enriches best-effort, so the rigid field contracts designed for a deterministic
// seed-list flow no longer fit. Relax the FIELD contracts (accepts/emits) on every agent/code node
// on a path to a gate — item-flow via minItems is kept. Applied ONLY when the entry is discovered;
// a provided (deterministic) graph keeps its declared field contracts, because there they mean
// something. The founder still reviews everything at the gate.
export function relaxDiscoveryChainContracts(nodes, edges) {
  const incoming = buildIncoming(edges);
  const gateIds = nodes.filter((n) => n.category === "gate").map((n) => n.id);
  const preGate = new Set();
  const stack = [...gateIds];
  while (stack.length) {
    const id = stack.pop();
    for (const src of incoming.get(id) ?? []) {
      if (!preGate.has(src)) { preGate.add(src); stack.push(src); }
    }
  }
  return nodes.map((n) =>
    preGate.has(n.id) && (n.kind === "agent" || n.kind === "code")
      ? { ...n, contract: { ...(n.contract ?? {}), accepts: [], emits: [] } }
      : n,
  );
}

// True when the graph's entry is discovered (self-sourcing). Decided from the data-root nodes (no
// incoming data edge): a source root decides by its own mode; with no source root, an agent root is
// self-sourcing. This is precise — it does NOT fire just because some agent sits mid-chain on a
// provided graph, so a provided (deterministic) graph keeps its declared field contracts.
export function entryIsDiscovered(nodes, edges = []) {
  const hasDataParent = new Set();
  for (const e of edges) if (e.edgeType === "data") hasDataParent.add(e.target);
  const roots = nodes.filter(
    (n) => !hasDataParent.has(n.id) && n.category !== "context" && n.category !== "resource",
  );
  const sourceRoot = roots.find(isSourceNode);
  if (sourceRoot) return sourceMode(sourceRoot) === SOURCE_MODES.DISCOVERED;
  return roots.some((n) => n.kind === "agent");
}
