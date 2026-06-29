import { validateGraph } from "./graph-operations.mjs";
import { assemblePortfolioGraph } from "./portfolio-graph.mjs";
import { deriveChannelEval } from "./eval.mjs";
import { channelIdFor } from "./channel-graph.mjs";
import { getChannel, getProjectChannels, loadProject, saveProject } from "./project-store.mjs";
import { saveFlow } from "./flow-store.mjs";
import { writeArtifact } from "./artifact-store.mjs";
import {
  annotateGraphWithProgram,
  compileChannelProgram,
  ensureGraphAgents,
  markProgramComposed,
} from "./program-compiler.mjs";
import { resolveEntry, hasConcreteInput, SOURCE_MODES } from "./source-entry.mjs";
import { listAgentInstances } from "./capability-foundry.mjs";
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

// The engine's current agent pool — every teammate already minted for this project, deduped by ref.
// Fed to the composer so a new channel reuses an existing agent instead of minting a near-duplicate;
// one engine, one shared pool. Job text travels so the model can judge whether an existing ref fits.
function enginePoolFor(project, options = {}) {
  if (!project?.id) return [];
  const byRef = new Map();
  for (const instance of listAgentInstances(project.id, options)) {
    if (instance.ref && !byRef.has(instance.ref)) byRef.set(instance.ref, { ref: instance.ref, job: instance.job });
  }
  return [...byRef.values()];
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
function normalizeComposedGraph(spec) {
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
function assertGateWall(nodes, edges) {
  const executes = nodes.filter((n) => n.category === "execute");
  if (executes.length === 0) return;
  const gates = new Set(nodes.filter((n) => n.category === "gate").map((n) => n.id));
  if (gates.size === 0) throw new Error("Composed workflow has an execute node but no founder gate.");
  const incoming = new Map();
  for (const edge of edges) {
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
    if (!gated) throw new Error(`Execute node "${exec.id}" is not behind a founder gate.`);
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

// Portfolio fan-out: compose several accepted channels toward ONE goal and union them into a
// single branching diagram (assemblePortfolioGraph owns the merge + the wall + the layout). The
// model still composes each system's topology; this is the host orchestration that turns one goal
// into many systems the founder reviews together. Pure compose path — no persistence — mirroring
// composeGraphForChannel, so the streaming preview and a persisting caller can both reuse it.
export async function composePortfolioGraph({ goal, channels = [], grounding = null, clarity = null, compose = blankCompose, consolidateGate = false }) {
  if (!Array.isArray(channels) || channels.length === 0) {
    throw new Error("A portfolio needs at least one accepted channel.");
  }
  const systems = [];
  // The pool grows as channels compose: a later channel sees the agents earlier channels in THIS
  // portfolio already use, so the model reuses one shared teammate instead of minting a copy per lane.
  const poolByRef = new Map();
  for (const entry of channels) {
    const channel = entry?.channel ?? entry;
    const agents = entry?.agents ?? [];
    const { nodes, edges } = await composeGraphForChannel({
      channel,
      agents,
      enginePool: [...poolByRef.values()],
      grounding: entry?.grounding ?? grounding,
      clarity: entry?.clarity ?? clarity,
      input: entry?.input,
      output: entry?.output,
      compose,
    });
    for (const agent of agents) {
      if (agent.ref && !poolByRef.has(agent.ref)) poolByRef.set(agent.ref, { ref: agent.ref, job: agent.objective || agent.title });
    }
    for (const node of nodes) {
      if (node.kind === "agent" && node.ref && !poolByRef.has(node.ref)) poolByRef.set(node.ref, { ref: node.ref, job: node.label });
    }
    systems.push({ channel, graph: { nodes, edges } });
  }
  return assemblePortfolioGraph({ goal: goal || channels[0]?.channel?.objective || "", systems, consolidateGate });
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

// Live wiring for composePortfolioGraph: compose SEVERAL inline channels toward ONE goal and union
// them into one portfolio graph. This is the operator's "propose systems" move at portfolio altitude —
// the founder hands several channels, the operator composes them together and shows the whole GTM
// system as one branching, multi-gate diagram. Compose-only, no persistence (mirroring
// composePortfolioGraph); the per-channel apply path (composeChannel) is what persists a runnable
// system. The wall is re-asserted on the union inside assemblePortfolioGraph, so an ungated send in
// any lane is rejected before it reaches the canvas.
export async function composePortfolioFromStudio(input = {}, options = {}) {
  const project = loadProject(options);
  const rawChannels = Array.isArray(input.channels) ? input.channels : [];
  if (!rawChannels.length) {
    throw new Error("Provide at least one channel spec before composing a portfolio.");
  }
  const channels = rawChannels.map((entry) => ({
    channel: channelSpecFrom(entry?.channel ? entry : { channel: entry }),
    agents: agentSpecsFrom(entry?.channel ? entry : { agents: entry?.agents }),
  }));
  const goal = input.goal
    || project.sharedContext?.outcomes?.[0]?.outcome
    || channels[0]?.channel?.objective
    || "";
  return composePortfolioGraph({
    goal,
    channels,
    grounding: input.grounding ?? null,
    clarity: clarityGrounding(project.id, options),
    compose: options.compose || blankCompose,
    consolidateGate: input.consolidateGate === true,
  });
}

// PREVIEW path: compose the channel's real graph and return it WITHOUT any persistence — no program
// compilation, no saveFlow, no markProgramComposed, no saveProject, no domain events. The founder
// sees the would-be system ghosted on the canvas and accepts (the apply path persists that exact
// previewed graph) or discards it. Mirrors the operator's stage-then-gate proposal: nothing lands
// until the founder accepts. Takes an inline channel spec (+ agents) directly from the request body.
export async function previewOpportunityChannel(input, options = {}) {
  const channel = channelSpecFrom(input);
  const agents = agentSpecsFrom(input);
  // Resolve the project so the ghosted preview is grounded in the SAME founder direction the apply
  // path will use — the founder reviews a system composed against their pinned clarity, not without it.
  const project = loadProject(options);
  const { nodes, edges } = await composeGraphForChannel({
    channel,
    agents,
    grounding: input.grounding ?? null,
    clarity: clarityGrounding(project.id, options),
    input: input.input,
    output: input.output,
    compose: options.compose || blankCompose,
  });
  return {
    channelId: channel.id,
    name: input.name || channel.title,
    objective: input.objective || channel.objective,
    graph: { nodes, edges },
  };
}

export async function composeOpportunityChannel(input, options = {}) {
  const project = loadProject(options);
  const channel = channelSpecFrom(input);
  const agents = agentSpecsFrom(input);

  const compiled = compileChannelProgram({ project, channel, agents }, options);
  // Apply a previously-previewed graph by reusing its exact nodes/edges — never re-run the model
  // behind the founder's back on apply (the gate-continuation invariant). The host still re-asserts
  // the founder-gate wall on the provided topology, since the wall is host-owned on every path.
  // Contract: when input.graph is provided it MUST be the exact graph previewOpportunityChannel
  // returned for THIS channel + the SAME input/output adapters — the founder accepted that preview,
  // so we persist it verbatim (bindIO already ran at preview time) rather than re-composing. We only
  // re-assert the founder-gate wall, since the wall is host-owned on every path and cannot be trusted
  // to a client-supplied topology.
  const provided = Array.isArray(input.graph?.nodes) && input.graph.nodes.length ? input.graph : null;
  let nodes;
  let edges;
  if (provided) {
    nodes = provided.nodes;
    edges = Array.isArray(provided.edges) ? provided.edges : [];
    assertGateWall(nodes, edges);
  } else {
    ({ nodes, edges } = await composeGraphForChannel({
      channel,
      agents,
      enginePool: enginePoolFor(project, options),
      grounding: input.grounding ?? null,
      clarity: clarityGrounding(project.id, options),
      input: input.input,
      output: input.output,
      compose: options.compose || blankCompose,
    }));
  }

  // Derive this channel's eval — its answer key — at compose time (HARNESS.md invariant 1). With
  // no evaluator wired the eval is null and composition is unaffected; with one wired it is stored
  // on the graph and the run path grades against it.
  const channelEval = await deriveChannelEval({
    goal: input.objective || channel.objective,
    channel,
    agents,
    grounding: input.grounding ?? null,
    evaluate: options.evaluate,
  });

  // Write the real personalized capability artifact for every accepted agent so its node resolves
  // at run time, and so the founder can edit the policy/profile-born agent directly.
  for (const agent of compiled.agents) writeArtifact("agent", agent.instance.ref, agent.markdown, options);

  const projectAfterChannel = loadProject(options);
  const channelName = input.name || channel.title;
  const channelObjective = input.objective || channel.objective;
  const channelKind = input.kind || "composed";
  const channelId = channelIdFor(channelName, getProjectChannels(projectAfterChannel, options).map((item) => item.id));
  const graphId = projectAfterChannel.id === "default" ? channelId : `${projectAfterChannel.id}--${channelId}`;

  let graph = annotateGraphWithProgram({
    id: graphId,
    name: channelName,
    kind: channelKind,
    objective: channelObjective,
    version: "1.0.0",
    revision: 1,
    nodes,
    edges,
    store: { path: `.gtm/flows/${graphId}.json`, runs: 0 },
  }, compiled);
  // Mint any agent the composed graph reaches for that wasn't a declared opportunity — so a teammate
  // the model added (a Content Strategist, a Lifecycle Engineer) becomes a real personalized agent
  // with a contract and an on-disk definition, not a generic step. Idempotent for already-backed nodes.
  const ensured = ensureGraphAgents({ project: projectAfterChannel, program: compiled.program, graph }, options);
  for (const agent of ensured.agents) writeArtifact("agent", agent.instance.ref, agent.markdown, options);
  graph = ensured.graph;
  if (channelEval) graph.eval = channelEval;
  const validation = validateGraph(graph);
  if (!validation.ok) throw new Error(`Composed workflow is invalid: ${validation.errors.join(" ")}`);
  saveFlow(graph, options);
  markProgramComposed(compiled.program, {
    channelId,
    graphId,
    workflowGraph: graph,
    name: channelName,
    objective: channelObjective,
    kind: channelKind,
  }, options);

  const savedProject = saveProject({
    ...projectAfterChannel,
    activeChannelId: channelId,
  }, options);
  const projectedChannel = getChannel(savedProject, channelId, options);
  return {
    channel: projectedChannel,
    program: compiled.program,
    agents: compiled.agents.map((agent) => ({
      instance: agent.instance,
      policy: agent.policy,
      profile: agent.profile,
    })),
    graph,
    validation,
  };
}
