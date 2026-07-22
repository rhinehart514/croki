import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { createFirmTools } = await import("../../src/firm/mcp-tools.mjs");
const { filterSafeTools } = await import("../../src/tool-safety.mjs");
const { TOOLS, TOOL_MAP, FIRM_TOOLS } = await import("../../src/mcp.mjs");

describe("provider-neutral Product/GTM MCP surface", () => {
  it("advertises current model, branch, scoped-work, outward preparation, and return operations", () => {
    const names = FIRM_TOOLS.map((tool) => tool.name);
    for (const required of [
      "read_current_model", "create_model_branch", "read_model_branch", "propose_model_change",
      "compare_model_branches", "start_scoped_work", "prepare_outward_action", "watch_for_return",
    ]) assert.ok(names.includes(required), `${required} is advertised`);
    for (const retired of [
      "read_venture_architecture", "read_architecture_context", "propose_architecture_change",
      "list_architecture_proposals", "fork_product_bet", "drive_teammate", "set_heat",
    ]) assert.ok(!names.includes(retired), `${retired} stays off the current agent door`);
  });

  it("maps neutral operations to exact venture-scoped routes", async () => {
    const calls = [];
    const brainGet = async (path) => { calls.push(["GET", path]); return {}; };
    const brainPost = async (path, body) => { calls.push(["POST", path, body]); return {}; };
    const byName = new Map(createFirmTools({ brainGet, brainPost }).map((tool) => [tool.name, tool]));

    await byName.get("read_current_model").handler({ ventureId: "v1" });
    await byName.get("create_model_branch").handler({ ventureId: "v1", question: "Change audience?", sourceRefs: ["conversation:one"] });
    await byName.get("start_scoped_work").handler({ ventureId: "v1", workScopeId: "s1", participantRef: "codex", goal: "Test it" });
    await byName.get("prepare_outward_action").handler({ ventureId: "v1", kind: "founder-interview", decisionRef: "decision:one" });
    await byName.get("watch_for_return").handler({ ventureId: "v1" });

    assert.deepEqual(calls.map((entry) => entry.slice(0, 2)), [
      ["GET", "/api/ventures/v1/model"],
      ["POST", "/api/ventures/v1/model/branches"],
      ["POST", "/api/ventures/v1/drive"],
      ["POST", "/api/ventures/v1/outward-actions"],
      ["GET", "/api/ventures/v1/market-movement"],
    ]);
    assert.equal(calls[2][2].teammateRef, "codex", "compatibility routing stays behind the neutral schema");
  });

  it("keeps founder-decision and execution verbs off the agent door", () => {
    assert.doesNotThrow(() => filterSafeTools(TOOLS));
    for (const tool of FIRM_TOOLS) {
      assert.ok(!/approve|send|publish|deploy|charge|decide|merge|execute/i.test(tool.name));
      assert.equal(TOOL_MAP.get(tool.name), tool);
    }
  });
});
