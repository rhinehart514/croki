import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { anthropicRuntime } from "../src/runtimes/anthropic.mjs";
import { buildCodexDriveArgs, buildCodexProductChangeArgs, codexRuntime, runCodexDriveTurn } from "../src/runtimes/codex.mjs";
import { claudeCodeRuntime, createFirmSdkServer, detectClaudeAuth, driveBudgetUsd, modelMaxTurns } from "../src/runtimes/claude-code.mjs";
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

  it("uses the same Codex adapter for teammate drives and isolated product changes", () => {
    assert.equal(selectRuntime({ runtime: codexRuntime }).adapter, codexRuntime);
    assert.equal(selectRuntime({ runtime: codexRuntime, capability: "runProductChange" }).adapter, codexRuntime);
  });

  it("maps named model families without silently changing providers", () => {
    assert.equal(runtimeForModel("claude-sonnet"), "claude-code");
    assert.equal(runtimeForModel("gpt-5"), "codex");
    assert.equal(runtimeForModel(undefined), null);
  });
});

describe("subscription adapter boundaries", () => {
  it("advertises abort only on adapters whose live transport is wired to it", () => {
    assert.equal(anthropicRuntime.supportsAbort, true);
    assert.equal(claudeCodeRuntime.supportsAbort, true);
    assert.equal(codexRuntime.supportsAbort, true);
  });

  it("aborts an in-flight Claude SDK query through its real AbortController seam", async () => {
    const controller = new AbortController();
    let queryStarted;
    const started = new Promise((resolve) => { queryStarted = resolve; });
    const drive = claudeCodeRuntime.drive(baseContext({
      signal: controller.signal,
      isCancelled: () => controller.signal.aborted,
      currentStatus: () => "running",
      env: { CLAUDE_CODE_OAUTH_TOKEN: "test-token" },
      query: ({ options }) => (async function* blockedQuery() {
        queryStarted();
        await new Promise((resolve, reject) => {
          options.abortController.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
        yield { type: "result", subtype: "success", is_error: false, result: "unreachable" };
      })(),
    }));
    await started;
    controller.abort();
    assert.deepEqual(await drive, { kind: "cancelled" });
  });

  it("terminates an in-flight Codex child as soon as the host signal aborts", async () => {
    const controller = new AbortController();
    const signals = [];
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = { end() {} };
    child.kill = (signal) => {
      signals.push(signal);
      if (signal === "SIGTERM") queueMicrotask(() => child.emit("close", 143));
    };
    const turn = runCodexDriveTurn({
      prompt: "Inspect",
      cwd: process.cwd(),
      env: { GTM_IDE_CODEX_PATH: process.execPath },
      spawnProcess: () => child,
      signal: controller.signal,
    });
    controller.abort();
    const result = await turn;
    assert.equal(result.error, "cancelled");
    assert.deepEqual(signals, ["SIGTERM"]);
  });

  it("detects Claude authentication OAuth-first", () => {
    assert.equal(detectClaudeAuth({ CLAUDE_CODE_OAUTH_TOKEN: "token", ANTHROPIC_API_KEY: "key" }, () => true).mode, "oauth-token");
    assert.equal(detectClaudeAuth({ ANTHROPIC_API_KEY: "key" }, () => true).mode, "oauth-login");
    assert.equal(detectClaudeAuth({ ANTHROPIC_API_KEY: "key" }, () => false).mode, "api-key");
  });

  it("gives a resumed Claude drive enough turns to act after the wall", () => {
    assert.ok(modelMaxTurns({}, true) >= 8);
  });

  it("narrows Claude's provider-side budget to the configured participant remainder", () => {
    assert.equal(claudeCodeRuntime.costReporting, "usd");
    assert.ok(driveBudgetUsd({ spentUsd: 0, maxBudgetUsd: 0.07 }) <= 0.07);
    assert.ok(driveBudgetUsd({ spentUsd: 0, maxBudgetUsd: null }) > 0, "an unset participant cap must not become a zero-dollar provider invocation");
  });

  it("sends the complete directed-resume prompt to Claude", async () => {
    const resumePrompt = [
      "Prior pause context: Waiting for the founder's answer.",
      "New founder direction: Lead with the operational pain instead",
    ].join("\n\n");
    let invocation;
    const result = await claudeCodeRuntime.drive(baseContext({
      runtimeSessionId: "claude-session-1",
      resumePrompt,
      currentStatus: () => "running",
      env: { CLAUDE_CODE_OAUTH_TOKEN: "test-token" },
      query: ({ prompt, options }) => {
        invocation = { prompt, options };
        return (async function* completedQuery() {
          yield {
            type: "result",
            session_id: "claude-session-1",
            subtype: "success",
            is_error: false,
            result: "Redirected.",
          };
        })();
      },
    }));

    assert.equal(result.kind, "completed");
    assert.equal(invocation.options.resume, "claude-session-1");
    assert.equal(invocation.prompt, resumePrompt);
    assert.match(invocation.prompt, /Prior pause context:/);
    assert.match(invocation.prompt, /New founder direction:/);
  });

  it("surfaces Claude subprocess stderr when the SDK exits before yielding a result", async () => {
    await assert.rejects(
      claudeCodeRuntime.drive(baseContext({
        currentStatus: () => "running",
        env: { CLAUDE_CODE_OAUTH_TOKEN: "test-token" },
        query: ({ options }) => {
          options.stderr("invalid live invocation");
          return (async function* failedQuery() {
            throw new Error("Claude Code process exited with code 1");
          })();
        },
      })),
      /Claude Code process exited with code 1: invalid live invocation/,
    );
  });

  it("sends the complete directed-resume prompt to Codex", async () => {
    const resumePrompt = [
      "Prior pause context: Waiting at the founder wall.",
      "New founder direction: Rework the offer before trying again",
    ].join("\n\n");
    let invocation;
    const result = await codexRuntime.drive(baseContext({
      runtimeSessionId: "codex-thread-1",
      resumePrompt,
      runCodexTurn: async (input) => {
        invocation = input;
        return {
          threadId: "codex-thread-1",
          text: JSON.stringify({ type: "final", name: null, input: null, summary: "Redirected." }),
          error: null,
        };
      },
    }));

    assert.equal(result.kind, "completed");
    assert.equal(invocation.resumeId, "codex-thread-1");
    assert.equal(invocation.prompt, resumePrompt);
    assert.match(invocation.prompt, /Prior pause context:/);
    assert.match(invocation.prompt, /New founder direction:/);
  });

  it("builds a Codex product-change invocation with no shell or network", () => {
    const args = buildCodexProductChangeArgs({ prompt: "Change one file", model: "gpt-5" });
    assert.ok(args.includes("workspace-write"));
    assert.ok(args.includes("features.shell_tool=false"));
    assert.ok(args.includes("features.network_proxy.enabled=false"));
    assert.ok(!args.some((value) => /mcp_servers/.test(value)));
  });

  it("builds a read-only Codex teammate invocation with no inherited apps or network", () => {
    const args = buildCodexDriveArgs({ model: "gpt-test" });
    assert.ok(args.includes("read-only"));
    assert.ok(args.includes("features.apps=false"));
    assert.ok(args.includes("features.network_proxy.enabled=false"));
    assert.ok(args.includes("--output-schema"));
  });

  it("drives typed Drover tools through a real Codex-session contract", async () => {
    const calls = [];
    const sessions = [];
    const context = baseContext({
      model: null,
      cwd: "/tmp/product",
      tools: [{
        name: "read_truth",
        description: "Read product truth.",
        input_schema: { type: "object", properties: {}, required: [] },
      }],
      onRuntimeSession: (id) => sessions.push(id),
      async runTool(call) {
        calls.push(call);
        return { result: { evidenceState: "grounded" }, pause: false };
      },
      runCodexTurn: async ({ resumeId }) => resumeId
        ? { threadId: "thread-1", text: JSON.stringify({ type: "final", name: null, input: null, summary: "Grounded." }), error: null }
        : { threadId: "thread-1", text: JSON.stringify({ type: "tool", name: "read_truth", input: "{}", summary: null }), error: null },
    });
    const result = await codexRuntime.drive(context);
    assert.deepEqual(result, { kind: "completed", summary: "Grounded." });
    assert.equal(calls[0].name, "read_truth");
    assert.deepEqual(sessions, ["thread-1", "thread-1"]);
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
