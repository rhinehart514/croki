import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { anthropicRuntime } from "../src/runtimes/anthropic.mjs";
import { buildCodexProductChangeArgs, codexRuntime } from "../src/runtimes/codex.mjs";
import { createFirmSdkServer, detectClaudeAuth, modelMaxTurns } from "../src/runtimes/claude-code.mjs";
import { runtimeForModel, selectRuntime } from "../src/runtimes/index.mjs";

function baseContext(overrides = {}) {
  return {
    goal: "Explore a distinct bet",
    model: "claude-test",
    system: "Stay inside the founder wall.",
    tools: [],
    stepCount: 0,
    maxSteps: 4,
    isCancelled: () => false,
    onTurn: () => 1,
    onText() {},
    onToolStart() {},
    onToolError() {},
    persistMessages() {},
    async runTool() { return { result: { ok: true }, pause: false }; },
    ...overrides,
  };
}

describe("Anthropic drive adapter", () => {
  it("passes complete tool schemas and stops when a tool parks at the wall", async () => {
    const requests = [];
    const client = {
      messages: {
        async create(request) {
          requests.push(request);
          return { content: [{ type: "tool_use", id: "tool-1", name: "stage_outward", input: { betId: "b1", effect: { to: "x@y.com" } } }] };
        },
      },
    };
    const ctx = baseContext({
      client,
      tools: [{
        name: "stage_outward",
        description: "Park an outward effect.",
        input_schema: {
          type: "object",
          properties: { betId: { type: "string" }, effect: { type: "object" } },
          required: ["betId", "effect"],
        },
      }],
      async runTool() { return { result: { parked: true }, pause: true }; },
    });
    const result = await anthropicRuntime.drive(ctx);
    assert.equal(result.kind, "paused");
    assert.deepEqual(requests[0].tools[0].input_schema.required, ["betId", "effect"]);
  });

  it("completes on a text-only turn", async () => {
    const client = { messages: { async create() { return { content: [{ type: "text", text: "Done." }] }; } } };
    const result = await anthropicRuntime.drive(baseContext({ client }));
    assert.deepEqual(result, { kind: "completed", summary: "Done." });
  });
});

describe("runtime selection by capability", () => {
  it("uses an injected drive adapter without changing its identity", () => {
    const adapter = { id: "fake", label: "Fake", async drive() {} };
    assert.equal(selectRuntime({ runtime: adapter }).adapter, adapter);
  });

  it("keeps Codex on the isolated product-change door, not the deleted session bridge", () => {
    const env = { ...process.env, GTM_IDE_CODEX_PATH: process.execPath };
    const drive = selectRuntime({ forced: "codex", env });
    assert.equal(drive.adapter, null);
    assert.match(drive.reason, /does not support drive/i);

    const product = selectRuntime({
      runtime: codexRuntime,
      capability: "runProductChange",
      env,
    });
    assert.equal(product.adapter, codexRuntime);
  });

  it("maps named model families without silently changing providers", () => {
    assert.equal(runtimeForModel("claude-sonnet"), "claude-code");
    assert.equal(runtimeForModel("gpt-5"), "codex");
    assert.equal(runtimeForModel(undefined), null);
  });
});

describe("subscription adapter boundaries", () => {
  it("detects Claude authentication OAuth-first", () => {
    assert.equal(detectClaudeAuth({ CLAUDE_CODE_OAUTH_TOKEN: "token", ANTHROPIC_API_KEY: "key" }, () => true).mode, "oauth-token");
    assert.equal(detectClaudeAuth({ ANTHROPIC_API_KEY: "key" }, () => true).mode, "oauth-login");
    assert.equal(detectClaudeAuth({ ANTHROPIC_API_KEY: "key" }, () => false).mode, "api-key");
  });

  it("gives a resumed Claude drive enough turns to act after the wall", () => {
    assert.ok(modelMaxTurns({}, true) >= 8);
  });

  it("builds a Codex product-change invocation with no shell or network", () => {
    const args = buildCodexProductChangeArgs({ prompt: "Change one file", model: "gpt-5" });
    assert.ok(args.includes("workspace-write"));
    assert.ok(args.includes("features.shell_tool=false"));
    assert.ok(args.includes("features.network_proxy.enabled=false"));
    assert.ok(!args.some((value) => /mcp_servers/.test(value)));
  });

  it("registers complete Firm tool schemas on the Claude SDK bridge", () => {
    const ctx = baseContext({
      tools: [{
        name: "read_truth",
        description: "Read cited truth.",
        input_schema: { type: "object", properties: {}, required: [] },
      }],
      currentStatus: () => "running",
    });
    assert.ok(createFirmSdkServer(ctx));
  });
});
