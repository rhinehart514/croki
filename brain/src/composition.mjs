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
// Injectable: a fake composer in tests, createClaudeComposer() live
// on the subscription, an honest blank default that composes nothing rather than falling back
// to a template.

import { runClaudeQuery, parseAgentObject } from "./agent-bridge.mjs";

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
  - gate:    { "category": "gate", "connector": "default" }
  - execute: { "category": "execute", "connector": "local" | "http" } — staged, never sends on its own
  - measure: { "category": "measure", "connector": "default" }
- Use the accepted agents by their exact refs. Wire each where it belongs.
- REUSE the engine's existing teammates. You are given the engine's current agent pool — the agents other channels in this same product already use. When an existing engine agent already covers a capability this channel needs, reference it by its EXACT existing ref instead of inventing a near-duplicate. Channels are routes through ONE engine that shares its agent pool; they do not each get a private copy of every worker. Introduce a new agent ref ONLY when no existing teammate fits the job.
- Give every executable node a plain data contract: "contract": { "accepts": ["fieldName"], "emits": ["fieldName"], "minItems": 1 }. Use only fields the step genuinely needs or can promise. A personal outreach draft should require a real personalFact; measurement should require the attribution join fields it needs.
- Close the loop where it helps: a feedback edge from measure back to context or source.

Return ONLY a JSON object: { "nodes": [ ... ], "edges": [ ... ] }.
Each node: { "id": "kebab-id", plus the kind/category fields above, "label": "...", "contract": { "accepts": [], "emits": [] }, and for agents "ref". Positions optional; the host lays out anything you omit.
Each edge: { "source": "node-id", "target": "node-id", "edgeType": "data" | "context" | "feedback" }.`;

// Live composer: reads the repo on the founder's subscription and returns a { nodes, edges }
// graph spec. The host (workflow-composer.mjs) normalizes, enforces the gate wall, and validates.
export function createClaudeComposer({ cwd = process.cwd(), model, maxTurns = 24, onText } = {}) {
  return async function compose({ goal, channel, agents, grounding, enginePool }) {
    const prompt = [
      COMPOSE_PROMPT,
      `\nChannel objective:\n${goal || channel?.objective || ""}`,
      `\nAccepted agents (use these refs):\n${JSON.stringify(agents ?? [], null, 2)}`,
      `\nEngine agent pool — reuse an existing ref when it already covers the capability, don't duplicate:\n${JSON.stringify(enginePool ?? [], null, 2)}`,
      `\nProduct grounding:\n${JSON.stringify(grounding ?? {}, null, 2)}`,
    ].join("\n");
    const { text, error } = await runClaudeQuery({ prompt, cwd, model, maxTurns, onText });
    if (error) return { ok: false, error: error.message };
    const graph = parseAgentObject(text);
    if (!graph || !Array.isArray(graph.nodes)) {
      return { ok: false, error: "Composer did not return a { nodes, edges } graph." };
    }
    return { ok: true, nodes: graph.nodes, edges: Array.isArray(graph.edges) ? graph.edges : [] };
  };
}
