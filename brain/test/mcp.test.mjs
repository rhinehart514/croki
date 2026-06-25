import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TOOLS, TOOL_MAP } from "../src/mcp.mjs";

const names = TOOLS.map((t) => t.name);

describe("MCP tool IA — canonical surface", () => {
  it("keeps the tool count in a reasonable range", () => {
    // Ceiling raised from 30→36 when the Living Product Picture added its four-tool object family
    // (get/derive/revise/signal). The bound still guards IA hygiene; it just admits the new object.
    assert.ok(TOOLS.length >= 10 && TOOLS.length <= 36, `expected 10–36 tools, got ${TOOLS.length}`);
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
      "request_workflow_change",
    ]) {
      assert.ok(names.includes(canonical), `${canonical} must exist`);
    }
  });

  it("collapses the gate to a single canonical approval verb", () => {
    // Both names still resolve, but to the SAME object family: approve_workflow_gate
    // is canonical and approve_gate is only a thin alias delegating to it.
    assert.ok(names.includes("approve_workflow_gate"));
    assert.ok(names.includes("approve_gate"));
    // No third gate verb leaked in.
    const gateVerbs = names.filter((n) => n.startsWith("approve_"));
    assert.deepEqual(new Set(gateVerbs), new Set(["approve_workflow_gate", "approve_gate"]));
  });

  it("removed the engine verb 'mutate' from the canonical surface", () => {
    // mutate_channel survives only as a backward-compatible alias; the canonical
    // name is request_workflow_change (a domain verb, not an engine verb).
    assert.ok(names.includes("request_workflow_change"));
    assert.ok(!names.includes("mutate_workflow"), "no engine-verb canonical tool");
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

describe("MCP tool IA — channel aliases delegate to the workflow handlers", () => {
  const aliasPairs = [
    ["get_channel", "get_workflow"],
    ["run_channel", "run_workflow"],
    ["approve_gate", "approve_workflow_gate"],
    ["mutate_channel", "request_workflow_change"],
  ];

  it("registers every alias and its canonical tool", () => {
    for (const [alias, canonical] of aliasPairs) {
      assert.ok(TOOL_MAP.has(alias), `alias ${alias} must be registered`);
      assert.ok(TOOL_MAP.has(canonical), `canonical ${canonical} must be registered`);
    }
  });

  it("marks each alias as backward-compatible in its description", () => {
    for (const [alias] of aliasPairs) {
      const desc = TOOL_MAP.get(alias).description.toLowerCase();
      assert.ok(
        desc.includes("alias"),
        `${alias} should declare it is a backward-compatible alias`,
      );
    }
  });
});

describe("MCP tool IA — disabled direct-edit path", () => {
  it("request_workflow_change refuses and points at the operator proposal flow", async () => {
    const tool = TOOL_MAP.get("request_workflow_change");
    const result = await tool.handler({ workflowId: "w1", command: "add a node" });
    assert.equal(result.ok, false);
    assert.match(result.error, /propose_graph_changes/);
  });

  it("the mutate_channel alias shares the same disabled handler", () => {
    assert.equal(TOOL_MAP.get("mutate_channel").handler, TOOL_MAP.get("request_workflow_change").handler);
  });
});
