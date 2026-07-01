import { validateGraph } from "./graph-operations.mjs";
import { deriveChannelEval } from "./eval.mjs";
import { channelIdFor } from "./channel-graph.mjs";
import { getProjectChannels, loadProject } from "./project-store.mjs";
import { saveFlow } from "./flow-store.mjs";
import { resolveEntry, hasConcreteInput, SOURCE_MODES } from "./source-entry.mjs";
import { clarityGrounding } from "./clarity-store.mjs";

// Fold the founder's pinned clarity into the product grounding the composer sees, under an explicit
// founderDirection key so the model reads it as real founder steering (claims to honor, ICP,
// directions, open questions) and never as invented product fact. Returns the grounding untouched
// when the founder has pinned nothing. `clarity` may be passed in directly (the pure portfolio path)
// or derived from the project (the persisting entry points); either way it's founder INPUT, not seeded.
function groundingWithClarity(grounding, clarity) {
  if (!clarity) return grounding;
  return { ...(grounding && typeof grounding === "object" ? grounding : {}), founderDirection: clarity };
}

// The engine's current agent pool — the teammates a new channel could reuse instead of minting a
// near-duplicate. With the capability-foundry layer removed there is no persisted instance pool, so
// this is empty; the naked path composes agents inline. Kept as the single seam for reuse if a pool
// is reintroduced.
function enginePoolFor() {
  return [];
}

// Honest blank default: with no composer wired, compose nothing rather than fall back to a
// hardcoded skeleton (the cage we removed). Live composition is createClaudeComposer.
const blankCompose = async () => ({ ok: false, error: "blank", nodes: [], edges: [] });

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "step";
}

const OPEN_KINDS = new Set(["agent", "skill", "code"]);
const CATEGORIES = new Set(["context", "source", "gate", "execute", "measure", "enrich", "filter", "generate", "resource"]);
const DEFAULT_CONNECTOR = { context: "product", source: "manual", gate: "default", execute: "local", measure: "default" };

// The founder's concrete input adapter → a source node's connector and config. The model chose
// the topology; the founder's real data (the CSV, the endpoint) is bound here by the host.
function inputBinding(input = {}) {
  if (input.type === "api") return { connector: "api", config: { endpoint: input.endpoint || "", method: input.method || "GET" } };
  if (input.type === "csv") return { connector: "csv", config: { csv: input.csv || "" } };
  return { connector: "manual", config: { items: input.items ?? [] } };
}

function outputBinding(output = {}, channelTitle) {
  if (output.type === "api") return { connector: "http", config: { endpoint: output.endpoint || "", channel: slug(channelTitle) } };
  return { connector: "local", config: { channel: slug(channelTitle) } };
}

// Normalize the model's graph spec into valid nodes/edges. The model owns topology, kinds, and
// ordering; the host fills defaults, drops malformed nodes, lays out anything unpositioned, and
// keeps only edges that connect real nodes.
export function normalizeComposedGraph(spec) {
  const rawNodes = Array.isArray(spec?.nodes) ? spec.nodes : [];
  const usedIds = new Set();
  const nodes = [];
  rawNodes.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    let id = slug(raw.id || raw.label || `node-${index + 1}`);
    while (usedIds.has(id)) id = `${id}-${index + 1}`;
    const position = (raw.position && Number.isFinite(raw.position.x))
      ? raw.position
      : { x: 120 + index * 240, y: 200 };
    if (OPEN_KINDS.has(raw.kind)) {
      if (!raw.ref || typeof raw.ref !== "string") return; // open kinds require a ref
      usedIds.add(id);
      nodes.push({
        id, kind: raw.kind, ref: raw.ref, label: raw.label || raw.ref, position,
        config: raw.config && typeof raw.config === "object" ? raw.config : {},
        ...(raw.contract && typeof raw.contract === "object" ? { contract: raw.contract } : {}),
        ...(raw.kind === "agent" ? { agentPrompt: raw.agentPrompt || raw.prompt || "" } : {}),
        sourceOfTruth: Array.isArray(raw.sourceOfTruth) ? raw.sourceOfTruth : ["signals", "artifacts"],
      });
      return;
    }
    const category = CATEGORIES.has(raw.category) ? raw.category : null;
    if (!category) return; // neither a known kind nor a known category
    usedIds.add(id);
    nodes.push({
      id, category, connector: raw.connector || DEFAULT_CONNECTOR[category] || "default",
      label: raw.label || category, position,
      config: raw.config && typeof raw.config === "object" ? raw.config : {},
      ...(raw.contract && typeof raw.contract === "object" ? { contract: raw.contract } : {}),
      ...(Array.isArray(raw.sourceOfTruth) ? { sourceOfTruth: raw.sourceOfTruth } : {}),
    });
  });
  const ids = new Set(nodes.map((n) => n.id));
  const seenEdges = new Set();
  const edges = [];
  for (const raw of Array.isArray(spec?.edges) ? spec.edges : []) {
    if (!raw || !ids.has(raw.source) || !ids.has(raw.target)) continue;
    const edgeType = ["data", "context", "feedback"].includes(raw.edgeType) ? raw.edgeType : "data";
    const id = raw.id || `${edgeType}-${raw.source}-${raw.target}`;
    if (seenEdges.has(id)) continue;
    seenEdges.add(id);
    edges.push({ id, source: raw.source, target: raw.target, edgeType, ...(raw.label ? { label: raw.label } : {}) });
  }
  return { nodes, edges };
}

// The wall, owned by the host: anything that reaches the world (an execute node) must have a
// founder gate upstream of it on every path. The model is told this; the host enforces it.
export function assertGateWall(nodes, edges) {
  const executes = nodes.filter((n) => n.category === "execute");
  if (executes.length === 0) return;
  const gates = new Set(nodes.filter((n) => n.category === "gate").map((n) => n.id));
  if (gates.size === 0) throw new Error("Composed workflow has an execute node but no founder gate.");
  const incoming = new Map();
  for (const edge of edges) {
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target).push(edge.source);
  }
  // covered(n): EVERY path from a root to n passes through a founder gate. A gate covers itself;
  // any other node is covered only when it has predecessors and ALL of them are covered. A root
  // (no incoming) that is not a gate is never covered — a path begins there ungated. This is
  // all-paths semantics, not exists-a-gate-ancestor: one ungated branch into an execute node
  // fails the wall even when a sibling branch is gated (the diamond-routing-around-the-gate case).
  const memo = new Map();
  const covered = (id, visiting = new Set()) => {
    if (gates.has(id)) return true;
    if (memo.has(id)) return memo.get(id);
    if (visiting.has(id)) return false; // cycle guard: an unresolved loop is not a gate
    visiting.add(id);
    const preds = incoming.get(id) ?? [];
    const result = preds.length > 0 && preds.every((p) => covered(p, visiting));
    visiting.delete(id);
    memo.set(id, result);
    return result;
  };
  for (const exec of executes) {
    const preds = incoming.get(exec.id) ?? [];
    const gated = preds.length > 0 && preds.every((p) => covered(p));
    if (!gated) throw new Error(`Execute node "${exec.id}" is not behind a founder gate on every path.`);
  }
}

// Bind the founder's concrete input/output onto the model's source/execute nodes. The model
// picked where they go; the founder's real data lands here. Runs after resolveEntry, so a source
// still present here is a provided (connector-backed) source — stamp its connector and mark the
// mode explicit so the persisted graph carries it.
function bindIO(nodes, channel, inputAdapter, outputAdapter) {
  // An agent-kind entry self-sources (discovered mode), so never stamp a connector onto it.
  const source = nodes.find((n) => n.category === "source" && n.kind !== "agent");
  if (source) {
    const bound = inputBinding(inputAdapter ?? channel.input ?? {});
    source.connector = bound.connector;
    source.config = { ...bound.config, ...source.config };
    source.mode = SOURCE_MODES.PROVIDED;
  }
  const execute = nodes.find((n) => n.category === "execute");
  if (execute) {
    const bound = outputBinding(outputAdapter ?? channel.output ?? {}, channel.title);
    execute.connector = bound.connector;
    execute.config = { ...bound.config, ...execute.config };
  }
}

// The pure compose path: model designs the graph, host normalizes, binds IO, and enforces the
// gate wall — returns { nodes, edges } with NO persistence and no status mutation. Used by both
// the streaming compose preview (compose each channel's real graph, live) and the
// persisting compose below. The model owns topology; the host owns the wall.
export async function composeGraphForChannel({ channel, agents = [], grounding = null, clarity = null, enginePool = [], input, output, compose = blankCompose }) {
  const spec = await compose({
    goal: input?.objective || channel.objective,
    channel,
    agents: agents.map((a) => ({ ref: a.ref, title: a.title, objective: a.objective, prompt: a.prompt, provider: a.provider })),
    enginePool,
    grounding: groundingWithClarity(grounding, clarity),
  });
  if (spec?.ok === false) {
    throw new Error(spec.error === "blank"
      ? "Composition is model-driven and needs a live Claude subscription. Sign in and try again."
      : `Composition failed: ${spec.error}`);
  }
  const normalized = normalizeComposedGraph(spec);
  if (normalized.nodes.length === 0) throw new Error("Composer returned no usable nodes.");
  // Host invariant: decide the entry source mode VISIBLY in the graph (provided vs discovered) so
  // the first node can run unaided — no empty-source dead-end, and no silent run-time rewrite. The
  // founder sees and persists the mode this picks.
  const hasInput = hasConcreteInput(input ?? channel.input);
  const { nodes, edges } = resolveEntry({ nodes: normalized.nodes, edges: normalized.edges, agents, hasInput });
  bindIO(nodes, channel, input ?? channel.input, output ?? channel.output);
  assertGateWall(nodes, edges);
  return { nodes, edges };
}

// Normalize an inline channel spec from the compose request body. Channels are now defined directly
// (by the founder or by Claude) and handed in — there is no auto-generated opportunity accept-list to
// look them up in. A stable id is derived from the title when none is supplied, so the program the
// channel compiles into stays idempotent across re-composes.
function channelSpecFrom(input = {}) {
  const base = input.channel && typeof input.channel === "object" ? input.channel : {};
  const title = input.title || input.name || base.title || "Channel";
  const objective = input.objective || base.objective || "";
  const id = input.channelId || input.id || base.id || `channel:${slug(title)}`;
  return { ...base, id, title, objective, kind: input.kind || base.kind || null };
}

// Normalize the inline agent specs the request carries. Each is a plain `{ ref, role?, objective?,
// prompt?, title? }`; a stable id (derived from ref) keeps the agent's creation policy idempotent.
function agentSpecsFrom(input = {}) {
  const raw = Array.isArray(input.agents) ? input.agents : [];
  return raw
    .filter((agent) => agent && (agent.ref || agent.title))
    .map((agent) => {
      const ref = agent.ref ? String(agent.ref) : slug(agent.title);
      return {
        ...agent,
        ref,
        id: agent.id || `agent:${ref}`,
        title: agent.title || agent.role || ref,
      };
    });
}


// The naked compose: the model designs the graph for a goal (research/enrich/draft agents behind a
// founder gate) and we persist it as a runnable flow. NOTHING ELSE — no outcome program, no creation
// policy, no capability foundry, no on-disk agent artifacts. The agent nodes carry their prompt inline
// (agentPrompt), so they run without a written definition; the founder gate is the only checkpoint and
// the wall is re-asserted here. This is what compose_and_run uses now: goal in, runnable graph out, the
// run reaches the gate, the founder reviews. The whole program/policy/foundry layer is gone from this path.
export async function composeNakedGraph(input, options = {}) {
  const project = loadProject(options);
  const channel = channelSpecFrom(input);
  const agents = agentSpecsFrom(input);

  const { nodes, edges } = await composeGraphForChannel({
    channel,
    agents,
    enginePool: enginePoolFor(project, options),
    grounding: input.grounding ?? null,
    clarity: clarityGrounding(project.id, options),
    input: input.input,
    output: input.output,
    compose: options.compose || blankCompose,
  });

  // Derive this channel's eval — its answer key — at compose time (HARNESS.md invariant 1). With no
  // evaluator wired the eval is null and composition is unaffected; with one wired it is stored on
  // the graph and the run path grades against it.
  const channelEval = await deriveChannelEval({
    goal: input.objective || channel.objective,
    channel,
    agents,
    grounding: input.grounding ?? null,
    evaluate: options.evaluate,
  });

  const channelName = input.name || channel.title;
  const channelObjective = input.objective || channel.objective;
  const channelId = channelIdFor(channelName, getProjectChannels(project, options).map((item) => item.id));
  const graphId = project.id === "default" ? channelId : `${project.id}--${channelId}`;
  const graph = {
    id: graphId,
    name: channelName,
    kind: input.kind || "composed",
    objective: channelObjective,
    version: "1.0.0",
    revision: 1,
    nodes,
    edges,
    store: { path: `.gtm/flows/${graphId}.json`, runs: 0 },
  };
  if (channelEval) graph.eval = channelEval;
  // The wall, re-asserted on the composed topology: every execute node must have a founder gate upstream.
  assertGateWall(nodes, edges);
  const validation = validateGraph(graph);
  if (!validation.ok) throw new Error(`Composed workflow is invalid: ${validation.errors.join(" ")}`);
  saveFlow(graph, options);
  return { channel: { id: channelId, name: channelName, graphId }, graph, validation };
}

