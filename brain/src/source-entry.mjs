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

export const SOURCE_MODES = { PROVIDED: "provided", DISCOVERED: "discovered", DERIVED: "derived" };

export function isSourceNode(node) {
  return node?.category === "source";
}

// The mode of a source node, derived from its SHAPE so it can never lie:
//   derived    — the source carries config.sourceChannelId: it pulls another channel's output. The
//                founder drew this feed on the canvas; the shape (a real channel id in config) is
//                the truth, so the runner and the label can never disagree.
//   discovered — an agent-kind source that self-sources from public signals.
//   provided   — a connector-backed source (a founder list / CSV / API).
// The persisted `mode` field is only a cached label for the UI; sourceMode() is the source of truth.
export function sourceMode(node) {
  if (isSourceNode(node) && node?.config?.sourceChannelId) return SOURCE_MODES.DERIVED;
  return node?.kind === "agent" ? SOURCE_MODES.DISCOVERED : SOURCE_MODES.PROVIDED;
}

// The ONE predicate: can this source stand on real data right now? A discovered (agent) source
// always can — it self-sources. A derived source stands on the channel it pulls from. A provided
// source stands on data only when its connector is configured: a non-empty manual list, CSV, or API.
export function sourceStandsOnData(node) {
  if (!isSourceNode(node)) return true;
  if (sourceMode(node) === SOURCE_MODES.DISCOVERED) return true;
  if (sourceMode(node) === SOURCE_MODES.DERIVED) return true;
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

// Prompt additions for an unseeded entry. Both are DERIVED from the pipeline's goal — what to look
// for follows the goal, never a hardwired find-N-ICP-people template — and both are ADDED alongside
// the agent's own instruction, never in place of it. A drafting agent stays a drafting agent.
function unseededEntryNote(goal) {
  const objective = String(goal ?? "").trim();
  return [
    "You are the first step of this pipeline and no seed list was provided for this run.",
    `Proceed from the product grounding, the shared context, and the goal${objective ? `: ${objective}` : "."}`,
    "If your instructions genuinely need real outside people, places, or things, find them yourself from real public sources (WebSearch/WebFetch) and note where each came from. Invent nothing; leave out anything you cannot verify.",
  ].join(" ");
}

function selfSourcingInstruction(goal, role) {
  const objective = String(goal ?? "").trim();
  const ownRole = String(role ?? "").trim();
  return [
    "This step opens the pipeline: no starting list was provided for this run, and the steps after this one work through real items, so gather them first.",
    objective ? `The pipeline's goal, in the founder's words: ${objective}` : "",
    "Let that goal decide what to look for and how many. Work from the product grounding and shared context, and use WebSearch/WebFetch on real public sources when the goal needs things from outside the product. Note where each item came from. Invent nothing; return fewer items rather than padding.",
    ownRole ? `Alongside that, keep doing your own job: ${ownRole}` : "",
  ].filter(Boolean).join("\n");
}

// Prepend a derived note to an agent's own prompt without ever displacing it.
function withEntryNote(agentPrompt, goal) {
  const own = typeof agentPrompt === "string" ? agentPrompt.trim() : "";
  const note = unseededEntryNote(goal);
  return own ? `${note}\n\n${own}` : note;
}

// Compose-time entry resolution. Decides the source mode VISIBLY in the graph the founder
// persists — never a silent run-time rewrite. Four honest outcomes:
//   1. The founder gave concrete input  → keep the provided source, mark it provided.
//   2. No input, an agent consumes the source → drop the dead empty connector source and let that
//      agent be the entry. The agent runs AS COMPOSED: it proceeds from the product, the goal, and
//      shared context, so its own instruction is kept in full — only a short goal-derived note is
//      prepended telling it no seed list exists (a drafting agent stays a drafting agent).
//   3. No input, the source's consumers are deterministic steps (or the gate itself) that genuinely
//      consume a list of items the graph does not have → convert the source node into a discovered
//      (agent) entry whose gathering instruction is DERIVED from the pipeline's goal, added
//      alongside the picked agent's own role — never a hardwired template, never replacing the role.
//   4. No input, nothing to discover with → leave it a provided source; the run will honestly ask
//      the founder to configure the seed (they are in control).
// Returns { nodes, edges } and never throws. Idempotent: a graph already resolved passes through.
export function resolveEntry({ nodes, edges, agents = [], hasInput = false, goal = "" } = {}) {
  const source = nodes.find((n) => isSourceNode(n) && n.kind !== "agent");
  if (!source) return { nodes, edges }; // already discovered, or no source at all

  if (hasInput || sourceStandsOnData(source)) {
    // Keep the source as-is and stamp its real mode label — a derived source (config.sourceChannelId)
    // stays derived, a configured connector stays provided. Never re-derive a topology that stands.
    return { nodes: nodes.map((n) => (n.id === source.id ? withMode(n, sourceMode(n)) : n)), edges };
  }

  // Outcome 2: a downstream agent proceeds from the product, the goal, and shared context — the
  // pipeline runs as composed, minus the one dead node. Its own instruction is never replaced.
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
              agentPrompt: withEntryNote(n.agentPrompt, goal),
            }
          : n,
      );
    return { nodes: newNodes, edges: newEdges };
  }

  // Outcome 3: the source's consumers cannot invent items (deterministic steps, or the gate itself
  // reviewing what flows in) — the graph genuinely consumes a list it does not have. Convert the
  // source node into a discovered agent entry with a goal-derived gathering instruction that carries
  // the picked agent's own role alongside.
  const feedsAnything = edges.some((e) => e.source === source.id && (e.edgeType ?? "data") === "data");
  const discovery = pickDiscoveryAgent(agents);
  if (feedsAnything && discovery?.ref) {
    const newNodes = nodes.map((n) =>
      n.id === source.id
        ? {
            ...stripConnector(n),
            kind: "agent",
            ref: discovery.ref,
            mode: SOURCE_MODES.DISCOVERED,
            label: n.label || "Find candidates",
            contract: { ...(n.contract ?? {}), accepts: [], minItems: 0 },
            agentPrompt: selfSourcingInstruction(goal, discovery.prompt ?? discovery.objective ?? ""),
          }
        : n,
    );
    return { nodes: newNodes, edges };
  }

  // Outcome 4: leave it provided; the run will ask the founder to configure the seed.
  return { nodes: nodes.map((n) => (n.id === source.id ? withMode(n, sourceMode(n)) : n)), edges };
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

// Every node that can reach any of `targetIds` by walking data edges backward.
function ancestorsViaData(targetIds, edges) {
  const out = new Set();
  const stack = [...targetIds];
  while (stack.length) {
    const id = stack.pop();
    for (const e of edges) {
      if (e.edgeType === "data" && e.target === id && !out.has(e.source)) {
        out.add(e.source);
        stack.push(e.source);
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

// Naked-run rule (the gate is the ONLY contract checkpoint): no node BEFORE the founder gate may block
// a run on a field-name or item-count technicality. The model composes the work freely; whatever it
// actually produces flows down to the founder gate, where a human reviews it. So relax accepts/emits
// AND minItems to nothing on every pre-gate node that isn't the gate or measurement. Measure is left
// untouched (it stays honestly blind); the gate keeps its own checkpoint contract (relaxGateContracts).
// This makes contracts ADVISORY on the run path — they still describe shapes for the UI and validation,
// but they never dead-end a freely-composed graph before the founder has seen its output.
export function relaxPreGateContracts(nodes, edges) {
  const gateIds = nodes.filter((n) => n.category === "gate").map((n) => n.id);
  if (gateIds.length === 0) return nodes;
  const incoming = buildIncoming(edges);
  const preGate = new Set();
  const stack = [...gateIds];
  while (stack.length) {
    const id = stack.pop();
    for (const src of incoming.get(id) ?? []) {
      if (!preGate.has(src)) { preGate.add(src); stack.push(src); }
    }
  }
  return nodes.map((n) =>
    preGate.has(n.id) && n.category !== "gate" && n.category !== "measure"
      ? { ...n, contract: { ...(n.contract ?? {}), accepts: [], emits: [], minItems: 0 } }
      : n,
  );
}

// True when the graph's entry is discovered (self-sourcing). Decided from the data-root nodes (no
// incoming data edge): a source root decides by its own mode; with no source root, an agent root is
// self-sourcing. This is precise — it does NOT fire just because some agent sits mid-chain on a
// provided graph, so a provided (deterministic) graph keeps its declared field contracts.
//
// Scope matters: relaxation only ever touches the pre-gate chain, so the verdict is judged from the
// roots of the path that actually REACHES a gate. An auxiliary provided source feeding a parallel
// learning loop (e.g. inbound replies seeding a conversation-learning branch) is not on the gate
// path and must not veto discovery on the entry that is. With no gate, judge the whole graph.
export function entryIsDiscovered(nodes, edges = []) {
  const hasDataParent = new Set();
  for (const e of edges) if (e.edgeType === "data") hasDataParent.add(e.target);
  const gateIds = nodes.filter((n) => n.category === "gate").map((n) => n.id);
  const scope = gateIds.length ? ancestorsViaData(gateIds, edges) : null;
  const inScope = (n) => !scope || scope.has(n.id);
  const roots = nodes.filter(
    (n) => inScope(n) && !hasDataParent.has(n.id) && n.category !== "context" && n.category !== "resource",
  );
  const sourceRoot = roots.find(isSourceNode);
  if (sourceRoot) return sourceMode(sourceRoot) === SOURCE_MODES.DISCOVERED;
  return roots.some((n) => n.kind === "agent");
}
