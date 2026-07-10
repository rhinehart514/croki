// The compose prompt is the menu of node kinds the model may emit. The `mcp` step kind has a
// full run-path runtime (step-runners.mjs) and the gate/wall around it, but until it appears in
// this menu no composed graph would ever contain one. This guards that it is offered, and offered
// consistently with the other open kinds.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COMPOSE_PROMPT,
  createClaudeComposer,
  createComposer,
  createExplainer,
} from "../src/composition.mjs";

describe("COMPOSE_PROMPT — the model's node-kind menu", () => {
  it("offers the mcp node kind so a composed graph can call an external MCP tool", () => {
    assert.match(COMPOSE_PROMPT, /"kind":\s*"mcp"/);
    assert.match(COMPOSE_PROMPT, /serverId/);
  });

  it("keeps the mcp wall explicit in the doctrine (writes stay behind the founder gate)", () => {
    const mcpLine = COMPOSE_PROMPT.split("\n").find((line) => line.includes('"kind": "mcp"'));
    assert.ok(mcpLine, "the mcp kind has its own menu line");
    assert.match(mcpLine, /gate|wall/i);
  });

  it("still offers the other open kinds alongside mcp (the menu stays open, not mcp-only)", () => {
    for (const kind of ["agent", "skill", "code", "mcp"]) {
      assert.match(COMPOSE_PROMPT, new RegExp(`"kind":\\s*"${kind}"`), `menu offers ${kind}`);
    }
  });

  it("still forbids a fixed shape (anti-cage)", () => {
    assert.match(COMPOSE_PROMPT, /ZERO fixed shape/);
  });
});

describe("provider-neutral one-shot composition", () => {
  it("normalizes the same open graph through Codex and Claude while keeping the task read-only", async () => {
    const graph = {
      nodes: [{ id: "research", kind: "agent", ref: "researcher", label: "Research" }],
      edges: [],
    };
    const requests = [];
    const make = (runtime) => createComposer({
      runtime,
      runTask: async (request) => {
        requests.push(request);
        return { ok: true, value: graph, runtime, model: runtime === "codex" ? "gpt-test" : "claude-test" };
      },
    });
    const input = { goal: "Find the strongest product-shaped opening", agents: [{ ref: "researcher" }] };
    const codex = await make("codex")(input);
    const claude = await make("claude-code")(input);

    assert.deepEqual({ nodes: codex.nodes, edges: codex.edges }, { nodes: claude.nodes, edges: claude.edges });
    assert.equal(codex.meta.provider, "codex");
    assert.equal(claude.meta.provider, "claude");
    for (const request of requests) {
      assert.equal(request.task, "composition");
      assert.equal(request.output, "object");
      assert.equal(request.readOnly, true);
      assert.match(request.prompt, /ZERO fixed shape/);
    }
  });

  it("keeps the Claude composer name as a compatibility wrapper", async () => {
    let request;
    const compose = createClaudeComposer({
      runTask: async (value) => {
        request = value;
        return { ok: true, value: { nodes: [], edges: [] }, runtime: "claude-code", model: null };
      },
    });
    await compose({ goal: "Explain the terrain" });
    assert.equal(request.runtime, "claude-code");
  });

  it("returns founder-safe provider errors without fabricating a graph", async () => {
    const compose = createComposer({
      runtime: "codex",
      runTask: async () => ({
        ok: false,
        value: null,
        runtime: "codex",
        model: "gpt-test",
        error: { kind: "limit", message: "The selected runtime reached its usage limit.", retriable: true },
      }),
    });
    const result = await compose({ goal: "Compose safely" });
    assert.equal(result.ok, false);
    assert.equal(result.meta.provider, "codex");
    assert.equal(result.meta.errorKind, "limit");
    assert.equal(result.meta.retriable, true);
    assert.equal(result.nodes, undefined);
  });

  it("uses the same object seam for provider-neutral graph explanations", async () => {
    let request;
    const explain = createExplainer({
      runtime: "codex",
      runTask: async (value) => {
        request = value;
        return { ok: true, value: { nodes: { research: "It establishes the evidence." }, edges: {} }, runtime: "codex", model: "gpt-test" };
      },
    });
    const result = await explain({ graph: { nodes: [{ id: "research", label: "Research", kind: "agent" }], edges: [] } });
    assert.equal(request.task, "composition-explanation");
    assert.equal(request.readOnly, true);
    assert.equal(result.nodes.research, "It establishes the evidence.");
    assert.equal(result.meta.provider, "codex");
  });
});
