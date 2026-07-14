import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FIRM_TOOLS, TOOLS, TOOL_MAP } from "../src/mcp.mjs";
import { filterSafeTools } from "../src/tool-safety.mjs";

describe("MCP live surface", () => {
  it("advertises the firm tools plus the surviving product-work contract", () => {
    assert.equal(TOOL_MAP.size, FIRM_TOOLS.length + 3);
    for (const tool of FIRM_TOOLS) assert.equal(TOOL_MAP.get(tool.name), tool);
    assert.deepEqual(TOOLS.slice(FIRM_TOOLS.length).map((tool) => tool.name), [
      "report_friction",
      "request_feature",
      "get_dogfood_queue",
    ]);
  });

  it("keeps outbound and founder-decision verbs off the agent door", () => {
    assert.doesNotThrow(() => filterSafeTools(TOOLS));
    for (const tool of TOOLS) {
      assert.doesNotMatch(tool.name, /approve|send|publish|deploy|charge|decide|release|kill|set.?heat/i);
    }
  });
});
