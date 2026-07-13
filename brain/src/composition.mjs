// The composition harness — the model designs the graph, the host owns the wall.
//
// Channel composition used to stamp one fixed skeleton every time:
//   context + source -> agent1 -> agent2 -> ... -> founder-gate -> output -> measure
// That linear outbound shape was the last cage. A channel's real topology depends on the
// goal — it can branch, run steps in parallel, gate more than once, close a loop, or be a
// single code-change. The model should design it; the host only guarantees the invariants it
// must not let the model violate: a valid graph, and a founder gate before anything that
// reaches the world.
//
// Injectable: a fake composer in tests, createComposer() live through either local runtime,
// createClaudeComposer() as a compatibility wrapper,
// on the subscription, an honest blank default that composes nothing rather than falling back
// to a template.

import { runStructuredTask } from "./structured-task-runtime.mjs";

// The composition doctrine. Edit ~/.claude/agents/gtm-compose-workflow.md to change how
// graphs are composed — the instruction is a markdown artifact, not host code.
export const COMPOSE_PROMPT = `You are composing the executable graph for ONE go-to-market channel toward a goal, grounded in a real product. You may Read and Grep the repository.

You are given the channel's objective, its accepted agents (each with a ref and an instruction), and the product grounding. Design the graph that actually fits this goal.

Critical rules:

- ZERO fixed shape. Do NOT default to source -> agents -> gate -> output -> measure. Design the topology the goal needs: it can be linear, branched, run steps in parallel, gate more than once, close a feedback loop, or be a single in-product code change. Let the goal decide.
- THE WALL (non-negotiable). Any node that sends, publishes, posts, or otherwise reaches the outside world (an "execute" node) MUST sit downstream of a founder "gate" node. Never place an execute/output before a gate. The gate is human-only review. A research- or code-only channel may have no execute node and needs no gate.
- Use the open node model. Each node is one of:
  - context: { "category": "context", "connector": "product" } — grounded product/learning context
  - source:  { "category": "source", "connector": "manual" | "csv" | "api" }
  - agent:   { "kind": "agent", "ref": "<accepted-agent-ref>" } — judgment/research/drafting; use the provided refs
  - skill:   { "kind": "skill", "ref": "<skill>" }
  - code:    { "kind": "code", "ref": "<deterministic-transform>" } — only for genuinely deterministic work
  - mcp:     { "kind": "mcp", "ref": "<serverId>/<toolName>" } — call a connected external MCP tool by ref; a read tool runs free, but anything that writes still sits behind a founder gate/wall.
  - gate:    { "category": "gate", "connector": "default" }
  - execute: { "category": "execute", "connector": "local" | "http" } — staged, never sends on its own
  - measure: { "category": "measure", "connector": "default" }
  - switch:  { "kind": "switch", "label": "..." } — a conditional router. Use it when ONE upstream stream should split down different branches by a property of each item (high-fit vs low-fit, replied vs silent), instead of hand-wiring two near-duplicate branches. Its OUTGOING data edges carry the rule. Deterministic, never blocks, never sends; logic is automatic so a switch is NEVER a gate (and still needs a gate downstream of any execute it routes to).
- Use the accepted agents by their exact refs. Wire each where it belongs.
- Connector configuration is exact, not prose: manual uses "config": { "items": [...] }; csv uses "config": { "csv": "<CSV text including its header row>" }; api uses "config": { "endpoint": "https://..." }. Put placeholder recipients directly in manual config.items when the founder explicitly permits placeholders. Never use rows, contacts, data, a bare array, or an empty manual source when the requested run already supplies usable items.
- REUSE the engine's existing teammates. You are given the engine's current agent pool — the agents other channels in this same product already use. When an existing engine agent already covers a capability this channel needs, reference it by its EXACT existing ref instead of inventing a near-duplicate. Channels are routes through ONE engine that shares its agent pool; they do not each get a private copy of every worker. Introduce a new agent ref ONLY when no existing teammate fits the job.
- Give every executable node a plain data contract: "contract": { "accepts": ["fieldName"], "emits": ["fieldName"], "minItems": 1 }. Use only fields the step genuinely needs or can promise. A personal outreach draft should require a real personalFact; measurement should require the attribution join fields it needs.
- Close the loop where it helps: a feedback edge from measure back to context or source.
- Give every node and every edge a one-line "rationale": a plain founder-facing sentence — for a node, why this teammate/step exists and why it sits here; for an edge, why this ordering (source → target). Plain language the founder reads, never engineering register. Keep each to one sentence.

Return ONLY a JSON object: { "nodes": [ ... ], "edges": [ ... ] }.
Each node: { "id": "kebab-id", plus the kind/category fields above, "label": "...", "rationale": "one plain sentence on why this step exists here", "contract": { "accepts": [], "emits": [] }, and for agents "ref". Positions optional; the host lays out anything you omit.
Each edge: { "source": "node-id", "target": "node-id", "edgeType": "data" | "context" | "feedback", "rationale": "one plain sentence on why this ordering" }.
A data edge leaving a "switch" node ALSO carries "predicate": { "field": "<itemField>", "op": "eq"|"ne"|"gt"|"gte"|"lt"|"lte"|"exists"|"missing"|"contains"|"in", "value": <v> } — only items matching it take that branch. An unconditional fall-through branch omits the predicate.`;

function providerForRuntime(runtime) {
  if (runtime === "codex") return "codex";
  if (runtime === "claude-code" || runtime === "anthropic") return "claude";
  return "blank";
}

function resultMeta(result, fallbackModel) {
  return {
    provider: providerForRuntime(result?.runtime),
    runtime: result?.runtime ?? null,
    model: result?.model ?? fallbackModel ?? null,
    ...(result?.error ? {
      errorKind: result.error.kind,
      retriable: result.error.retriable === true,
    } : {}),
  };
}

// Live composer: reads the repo on the founder's selected/available subscription runtime and returns
// a { nodes, edges } graph spec. This read-only one-shot produces a spec only; the host
// (workflow-composer.mjs) separately normalizes it, enforces the gate wall, and validates it.
export function createComposer({ cwd = process.cwd(), model, runtime, maxTurns = 24, onText, runTask = runStructuredTask } = {}) {
  return async function compose({ goal, channel, agents, grounding, enginePool, capabilities, taste, learn }) {
    // The live capability inventory (agents ∪ connected MCP tools). When present, the model composes
    // from what ACTUALLY exists — real MCP tool refs — instead of inventing them. Only MCP tools are
    // rendered here; the reusable agent pool has its own block above.
    const capabilityBlock = capabilities
      ? [
          "\nLive capabilities you can wire (compose from these; reference by their exact ref/name):",
          `- Connected MCP tools (kind:\"mcp\", ref = \"serverId/toolName\"; a \"read\" tool runs free, a \"write\" tool still sits behind a founder gate): ${JSON.stringify((capabilities.tools ?? []).map((t) => ({ ref: `${t.serverId}/${t.toolName}`, lane: t.lane })))}`,
        ].join("\n")
      : "";
    const prompt = [
      COMPOSE_PROMPT,
      `\nChannel objective:\n${goal || channel?.objective || ""}`,
      `\nSelected move context (founder wording and stable references are advisory lineage, not required fields or authorization):\n${JSON.stringify({
        founderWording: channel?.founderWording ?? null,
        intendedEffect: channel?.intendedEffect ?? null,
        uncertainty: channel?.uncertainty ?? null,
        measurementIntent: channel?.measurementIntent ?? null,
        questionId: channel?.questionId ?? null,
        contextRefs: channel?.contextRefs ?? [],
        evidenceRefs: channel?.evidenceRefs ?? [],
        productRefs: channel?.productRefs ?? [],
        participantRefs: channel?.participantRefs ?? [],
      }, null, 2)}`,
      `\nAccepted agents (use these refs):\n${JSON.stringify(agents ?? [], null, 2)}`,
      `\nEngine agent pool — reuse an existing ref when it already covers the capability, don't duplicate:\n${JSON.stringify(enginePool ?? [], null, 2)}`,
      capabilityBlock,
      `\nProduct grounding:\n${JSON.stringify(grounding ?? {}, null, 2)}`,
      // The founder's distilled taste (voice guidance only) — shape the crew and steps to fit what
      // they've already approved/rejected instead of re-asking. It NEVER overrides the wall (every
      // execute still needs a founder gate) and NEVER licenses inventing product facts.
      taste
        ? "\nFounder taste to match (learned from what they approved/rejected — compose the crew and steps to fit it, do not re-ask what this already settles; it never overrides the founder gate and never licenses inventing product facts):\n" + taste
        : "",
      // What the machine's recorded OUTCOMES have taught it (Area 3): which motion shapes earn wins and
      // which drew nothing. Lean toward the working shapes; don't repeat the dead ones. A strong steer,
      // not a contract — it never overrides the founder gate and never licenses inventing product facts.
      learn
        ? "\nWhat your outcomes have taught the machine (lean toward the motion shapes earning wins; don't lean on the ones drawing nothing — this is measured signal, not a rule that overrides your gate):\n" + learn
        : "",
    ].filter(Boolean).join("\n");
    const result = await runTask({
      task: "composition",
      prompt,
      cwd,
      model,
      runtime,
      output: "object",
      readOnly: true,
      maxTurns,
      onText,
    });
    const meta = resultMeta(result, model);
    if (!result.ok) return { ok: false, error: result.error?.message ?? "Composer could not complete this read.", meta };
    const graph = result.value;
    if (!graph || !Array.isArray(graph.nodes)) {
      return { ok: false, error: "Composer did not return a { nodes, edges } graph.", meta };
    }
    return { ok: true, nodes: graph.nodes, edges: Array.isArray(graph.edges) ? graph.edges : [], meta };
  };
}

// Public compatibility wrapper. Existing callers keep their name and Claude selection while using
// the same structured-task parsing, read-only safety, and error contract as every other runtime.
export function createClaudeComposer(options = {}) {
  return createComposer({ ...options, runtime: "claude-code" });
}

// The explain doctrine — the twin of COMPOSE_PROMPT for an already-composed graph that predates
// rationale. The model reasons ONLY over the real graph structure (node labels, kinds, edges) and
// explains ordering/purpose in plain founder language. It grounds in what is on the canvas; it must
// not invent product facts, only explain why each step sits where it does.
export const EXPLAIN_PROMPT = `You are explaining an already-composed go-to-market pipeline to the founder who owns it. You are given the pipeline's real nodes (each with an id, a label, and its kind/category) and its real edges (each with an id, a source, a target, and an edge type).

For EVERY node write one plain sentence: why this teammate/step exists and why it sits where it does in the flow.
For EVERY edge write one plain sentence: why this ordering — why the source feeds the target.

Ground every sentence in the REAL graph you were given — the labels, the kinds, and how the nodes connect. Do NOT invent product facts, buyer facts, or capabilities that are not visible in the graph. Explain the purpose and the ordering, nothing more. Use plain founder-facing language, never engineering register or code identifiers.

Return ONLY a JSON object:
{
  "nodes": { "<node-id>": "one plain sentence", ... },
  "edges": { "<edge-id>": "one plain sentence", ... }
}
Key every entry by the exact id given. No prose, no preamble.`;

// Live explainer: reads only the graph structure handed in and returns the rationale maps. The host
// (workflow-composer.mjs explainComposedGraph) merges these onto the stored graph and persists.
// maxTurns is low — this is a single structured reply over data already in the prompt, no tool use.
export function createExplainer({ cwd = process.cwd(), model, runtime, maxTurns = 2, onText, runTask = runStructuredTask } = {}) {
  return async function explain({ graph }) {
    const nodes = (Array.isArray(graph?.nodes) ? graph.nodes : []).map((n) => ({
      id: n.id,
      label: n.label ?? n.id,
      kind: n.kind ?? n.category ?? null,
    }));
    const edges = (Array.isArray(graph?.edges) ? graph.edges : []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      edgeType: e.edgeType ?? "data",
    }));
    const prompt = [
      EXPLAIN_PROMPT,
      `\nNodes:\n${JSON.stringify(nodes, null, 2)}`,
      `\nEdges:\n${JSON.stringify(edges, null, 2)}`,
    ].join("\n");
    const result = await runTask({
      task: "composition-explanation",
      prompt,
      cwd,
      model,
      runtime,
      output: "object",
      readOnly: true,
      maxTurns,
      onText,
    });
    const meta = resultMeta(result, model);
    if (!result.ok) return { ok: false, error: result.error?.message ?? "Explainer could not complete this read.", meta };
    const parsed = result.value;
    if (!parsed) return { ok: false, error: "Explainer did not return a { nodes, edges } rationale object.", meta };
    return {
      ok: true,
      nodes: parsed.nodes && typeof parsed.nodes === "object" ? parsed.nodes : {},
      edges: parsed.edges && typeof parsed.edges === "object" ? parsed.edges : {},
      meta,
    };
  };
}

export function createClaudeExplainer(options = {}) {
  return createExplainer({ ...options, runtime: "claude-code" });
}
