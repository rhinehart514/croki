// The compose prompt is the menu of node kinds the model may emit. The `mcp` step kind has a
// full run-path runtime (step-runners.mjs) and the gate/wall around it, but until it appears in
// this menu no composed graph would ever contain one. This guards that it is offered, and offered
// consistently with the other open kinds.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COMPOSE_PROMPT } from "../src/composition.mjs";

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
