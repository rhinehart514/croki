import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { assertSafeTool, filterSafeTools } from "../src/tool-safety.mjs";
import { safeOperatorTools } from "../src/operator-mcp.mjs";
import { createOperatorSession } from "../src/operator-store.mjs";
import { operatorTools, runOperatorSession } from "../src/operator-runtime.mjs";

// REGRESSION — the direct-Anthropic runtime path must apply the SAME outbound/approval tool guard the
// MCP bridge runs. Before the fix it handed NAKED_TOOLS to the model unfiltered, so a future tool named
// like send/approve/deploy would reach the model on that door while being refused on the MCP door.
describe("operator tool-safety guard is shared across both runtime doors", () => {
  it("refuses outbound/approval verbs and idea verdicts", () => {
    assert.throws(() => assertSafeTool("send_email"), /outbound\/approval verb/);
    assert.throws(() => assertSafeTool("approve_gate"), /outbound\/approval verb/);
    assert.throws(() => assertSafeTool("deploy_microproduct"), /outbound\/approval verb/);
    assert.throws(() => assertSafeTool("publish_post"), /outbound\/approval verb/);
    assert.throws(() => assertSafeTool("charge_card"), /outbound\/approval verb/);
    assert.throws(() => assertSafeTool("kill_idea"), /founder act/);
    // Safe-by-construction names pass.
    assert.doesNotThrow(() => assertSafeTool("compose_and_run"));
    assert.doesNotThrow(() => assertSafeTool("ideate"));
  });

  it("filterSafeTools throws loud if a forbidden tool is ever in the list — never silently drops it", () => {
    assert.throws(
      () => filterSafeTools([...operatorTools, { name: "send_blast" }]),
      /outbound\/approval verb/,
      "a mis-added outbound tool must fail loud, not be quietly stripped",
    );
    // The real operator toolset is clean and passes intact.
    const safe = filterSafeTools(operatorTools);
    assert.equal(safe.length, operatorTools.length);
  });

  it("the MCP door and the shared guard agree — no drift between the two doors", () => {
    // safeOperatorTools (the MCP bridge) is now built on filterSafeTools; both produce the same set.
    assert.deepEqual(
      safeOperatorTools().map((t) => t.name).sort(),
      filterSafeTools(operatorTools).map((t) => t.name).sort(),
    );
  });

  describe("the anthropic path hands the model only guard-passing tools", () => {
    let parent;
    let options;
    beforeEach(() => {
      parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-tool-safety-"));
      const repo = path.join(parent, "repo");
      fs.mkdirSync(repo);
      fs.writeFileSync(path.join(repo, "app.ts"), "export const x = 1;\n");
      options = { root: path.join(parent, "state"), claudeDir: path.join(parent, "claude"), cwd: repo };
    });
    afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

    it("every tool the direct-Anthropic runtime hands the model passes assertSafeTool", async () => {
      let handedTools = null;
      // A fake Anthropic client that records the `tools` param the runtime hands it, then completes the
      // session with a plain text turn (no tool_use) so the drive ends after one turn.
      const client = {
        messages: {
          async create(params) {
            handedTools = params.tools;
            return { content: [{ type: "text", text: "Nothing to do." }] };
          },
        },
      };

      const session = createOperatorSession({ goal: "Say hello.", projectId: "default" }, options);
      await runOperatorSession(session.id, { options, client });

      assert.ok(Array.isArray(handedTools) && handedTools.length > 0, "the model was handed a toolset");
      // The invariant the fix guarantees: nothing the model sees on this path is an outbound/approval tool.
      for (const tool of handedTools) {
        assert.doesNotThrow(() => assertSafeTool(tool.name), `unsafe tool reached the model: ${tool.name}`);
      }
      // And it is the real naked toolset — the compose-and-run door is present, not an empty list.
      assert.ok(handedTools.some((t) => t.name === "compose_and_run"), "the naked compose_and_run door is present");
    });
  });
});
