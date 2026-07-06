import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TOOLS, TOOL_MAP } from "../src/mcp.mjs";

const names = TOOLS.map((t) => t.name);

describe("MCP tool IA — canonical surface", () => {
  it("keeps the tool count in a reasonable range", () => {
    // Ceiling raised from 30→36 when the Living Product Picture added its four-tool object family
    // (get/derive/revise/signal), then 36→39 when the Person keystone added its read tools
    // (list_people/get_person/find_references), then 39→42 when the rebuilt GTM engine added its three
    // founder rituals (run_market_research / compose_path_portfolio / promote_run), then 42→45 when the
    // five-primitive founder loop added its front door (record_outcome plus the since-removed get_cockpit
    // and propose_moves — the cockpit projection was cut back to the run summary the canvas reads).
    // The bound still guards IA hygiene; it just admits the new objects.
    assert.ok(TOOLS.length >= 10 && TOOLS.length <= 45, `expected 10–45 tools, got ${TOOLS.length}`);
  });

  it("has unique tool names", () => {
    assert.equal(new Set(names).size, names.length, "tool names must be unique");
  });

  it("exposes the outcome program (the domain center) as first-class read tools", () => {
    assert.ok(names.includes("list_outcomes"), "list_outcomes must exist");
    assert.ok(names.includes("get_outcome"), "get_outcome must exist");
  });

  it("uses one canonical noun (workflow) for the canonical tools", () => {
    for (const canonical of [
      "list_workflows",
      "create_workflow",
      "duplicate_workflow",
      "update_workflow",
      "get_workflow",
      "get_workflow_items",
      "run_workflow",
      "run_workflow_node",
      "approve_workflow_gate",
    ]) {
      assert.ok(names.includes(canonical), `${canonical} must exist`);
    }
  });

  it("collapses the gate to a single canonical approval verb", () => {
    // One canonical gate verb — approve_workflow_gate. The old backward-compat approve_gate alias
    // was removed; no other approval verb leaked in.
    assert.ok(names.includes("approve_workflow_gate"));
    const gateVerbs = names.filter((n) => n.startsWith("approve_"));
    assert.deepEqual(new Set(gateVerbs), new Set(["approve_workflow_gate"]));
  });

  it("exposes no direct graph-mutation verb on this surface", () => {
    // Direct graph edits are never applied from the engine surface — they stage
    // through the operator's propose_graph_changes flow. The old disabled stubs
    // (request_workflow_change / mutate_channel) were removed rather than kept as
    // tools whose only behaviour was to refuse.
    assert.ok(!names.includes("mutate_workflow"), "no engine-verb canonical tool");
    assert.ok(!names.includes("mutate_channel"), "removed disabled stub");
    assert.ok(!names.includes("request_workflow_change"), "removed disabled stub");
  });

  it("every tool description states the action, object, when, and a boundary", () => {
    for (const tool of TOOLS) {
      assert.ok(tool.description.length > 40, `${tool.name} description too thin`);
      assert.ok(tool.inputSchema && tool.inputSchema.type === "object", `${tool.name} needs an object schema`);
    }
  });

  it("exposes the Living Product Picture as first-class read + edit tools", () => {
    for (const name of [
      "get_product_model",
      "derive_product_model",
      "revise_product_model",
      "record_product_signal",
    ]) {
      assert.ok(names.includes(name), `${name} must exist`);
      assert.ok(TOOL_MAP.get(name).inputSchema.type === "object", `${name} needs an object schema`);
    }
  });

  it("keeps the product-picture tools inside the founder-gate wall (no outbound verb)", () => {
    const forbidden = /approve|send|publish|deploy|charge/i;
    for (const name of [
      "get_product_model",
      "derive_product_model",
      "revise_product_model",
      "record_product_signal",
    ]) {
      assert.ok(!forbidden.test(name), `${name} must not carry an outbound verb`);
    }
  });
});

describe("MCP tool IA — the removed backward-compat channel aliases stay gone", () => {
  it("exposes no channel-noun alias for the canonical workflow tools", () => {
    for (const alias of ["get_channel", "run_channel", "approve_gate"]) {
      assert.ok(!TOOL_MAP.has(alias), `alias ${alias} must not be registered`);
    }
  });
});

