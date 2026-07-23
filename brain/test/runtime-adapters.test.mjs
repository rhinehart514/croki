import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { anthropicRuntime } from "../src/runtimes/anthropic.mjs";
import { buildCodexDriveArgs, buildCodexProductChangeArgs, codexRuntime, runCodexDriveTurn, startCodexMcpBridge } from "../src/runtimes/codex.mjs";
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

  it("sends every founder image as a native vision block", async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "anthropic-images-")), "screen.png");
    fs.writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    let request;
    const client = { messages: { async create(input) { request = input; return { content: [{ type: "text", text: "Seen." }] }; } } };
    await anthropicRuntime.drive(baseContext({ client, attachments: [{ path: file, mediaType: "image/png" }] }));
    assert.equal(request.messages[0].content[0].type, "image");
    assert.equal(request.messages[0].content[1].text, "Explore a distinct bet");
  });
});

describe("reasoning effort reaches each runtime", () => {
  const captureAnthropicEffort = async (effort) => {
    let request;
    const client = { messages: { async create(input) { request = input; return { content: [{ type: "text", text: "Done." }] }; } } };
    await anthropicRuntime.drive(baseContext({ client, ...(effort === undefined ? {} : { effort }) }));
    return request.output_config.effort;
  };

  it("sends the founder-selected effort to the Anthropic Messages API and defaults to high when unset", async () => {
    assert.equal(await captureAnthropicEffort("low"), "low");
    assert.equal(await captureAnthropicEffort(undefined), "high");
    assert.equal(await captureAnthropicEffort(null), "high");
  });

  it("passes the founder-selected effort to the Claude Agent SDK query and omits it when unset", async () => {
    const capture = async (effort) => {
      let invocation;
      await claudeCodeRuntime.drive(baseContext({
        currentStatus: () => "running",
        env: { CLAUDE_CODE_OAUTH_TOKEN: "test-token" },
        ...(effort === undefined ? {} : { effort }),
        query: (input) => { invocation = input; return (async function* () { yield { type: "result", subtype: "success", is_error: false, result: "Done." }; })(); },
      }));
      return invocation.options;
    };
    assert.equal((await capture("medium")).effort, "medium");
    // The Claude Agent SDK reasons up through max — its top tiers must reach the query, not be flattened.
    assert.equal((await capture("xhigh")).effort, "xhigh");
    assert.equal((await capture("max")).effort, "max");
    assert.equal(Object.hasOwn(await capture(undefined), "effort"), false);
    assert.equal(Object.hasOwn(await capture(null), "effort"), false);
  });

  it("streams multiple images into the Claude Agent SDK user turn", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "claude-sdk-images-"));
    const paths = [path.join(directory, "one.png"), path.join(directory, "two.jpg")];
    fs.writeFileSync(paths[0], Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(paths[1], Buffer.from([0xff, 0xd8, 0xff]));
    let prompt;
    await claudeCodeRuntime.drive(baseContext({
      currentStatus: () => "running",
      env: { CLAUDE_CODE_OAUTH_TOKEN: "test-token" },
      attachments: [{ path: paths[0], mediaType: "image/png" }, { path: paths[1], mediaType: "image/jpeg" }],
      query: (input) => { prompt = input.prompt; return (async function* () { yield { type: "result", subtype: "success", is_error: false, result: "Done." }; })(); },
    }));
    const messages = [];
    for await (const message of prompt) messages.push(message);
    assert.deepEqual(messages[0].message.content.map((block) => block.type), ["image", "image", "text"]);
  });

  it("passes the founder-selected effort to the Codex config and omits it when unset", () => {
    const withEffort = buildCodexDriveArgs({ model: "gpt-test", effort: "xhigh" });
    const idx = withEffort.indexOf("model_reasoning_effort=\"xhigh\"");
    assert.ok(idx > 0 && withEffort[idx - 1] === "-c", "effort rides on a -c config override");
    assert.equal(buildCodexDriveArgs({ model: "gpt-test" }).some((arg) => String(arg).startsWith("model_reasoning_effort")), false);
  });

  it("passes multiple image paths through Codex's native image flags", () => {
    const args = buildCodexDriveArgs({ images: ["/tmp/one.png", "/tmp/two.jpg"] });
    assert.equal(args.filter((arg) => arg === "--image").length, 2);
    assert.ok(args.includes("/tmp/one.png"));
    assert.ok(args.includes("/tmp/two.jpg"));
  });

  it("forwards the max tier to Codex verbatim (GPT-5.6 Sol reaches max)", () => {
    const args = buildCodexDriveArgs({ model: "gpt-5.6-sol", effort: "max" });
    assert.ok(args.includes("model_reasoning_effort=\"max\""), "codex forwards the founder-selected tier unchanged");
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

  it("runs the default Claude teammate in the full native Claude Code harness", async () => {
    let invocation;
    const result = await claudeCodeRuntime.drive(baseContext({
      tools: [{
        name: "read_truth",
        description: "Read product truth.",
        input_schema: { type: "object", properties: {} },
      }],
      currentStatus: () => "running",
      env: { CLAUDE_CODE_OAUTH_TOKEN: "test-token" },
      query: (input) => {
        invocation = input;
        return (async function* completedQuery() {
          yield { type: "result", subtype: "success", is_error: false, result: "Done." };
        })();
      },
    }));

    assert.equal(result.kind, "completed");
    assert.deepEqual(invocation.options.tools, { type: "preset", preset: "claude_code" });
    assert.deepEqual(invocation.options.systemPrompt, {
      type: "preset",
      preset: "claude_code",
      append: invocation.options.systemPrompt.append,
    });
    assert.match(invocation.options.systemPrompt.append, /Stay inside the founder wall\./);
    assert.match(invocation.options.systemPrompt.append, /full native Claude Code harness/);
    assert.deepEqual(invocation.options.allowedTools, ["mcp__drover-firm__read_truth"]);
    assert.equal(invocation.options.permissionMode, "auto");
    assert.equal(invocation.options.strictMcpConfig, false);
    assert.equal(Object.hasOwn(invocation.options, "settingSources"), false);
    assert.equal(Object.hasOwn(invocation.options, "skills"), false);
    assert.equal(Object.hasOwn(invocation.options, "plugins"), false);
    assert.ok(invocation.options.mcpServers["drover-firm"]);
  });

  it("keeps Claude's bridge-only caged harness as explicit compatibility mode", async () => {
    let invocation;
    const result = await claudeCodeRuntime.drive(baseContext({
      options: { harness: "caged" },
      tools: [{
        name: "read_truth",
        description: "Read product truth.",
        input_schema: { type: "object", properties: {} },
      }],
      currentStatus: () => "running",
      env: { CLAUDE_CODE_OAUTH_TOKEN: "test-token" },
      query: (input) => {
        invocation = input;
        return (async function* completedQuery() {
          yield { type: "result", subtype: "success", is_error: false, result: "Done." };
        })();
      },
    }));

    assert.equal(result.kind, "completed");
    assert.deepEqual(invocation.options.tools, []);
    assert.equal(invocation.options.systemPrompt, "Stay inside the founder wall.");
    assert.deepEqual(invocation.options.allowedTools, ["mcp__drover-firm__read_truth"]);
    assert.equal(invocation.options.permissionMode, "dontAsk");
    assert.equal(invocation.options.strictMcpConfig, true);
    assert.deepEqual(invocation.options.settingSources, []);
    assert.ok(invocation.options.mcpServers["drover-firm"]);
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
    // The prompt is now the run's long-lived queue (streaming input); the resume text rides its
    // first SDKUserMessage. The drive's own finally closed the queue, so iteration drains and ends.
    const queued = [];
    for await (const message of invocation.prompt) queued.push(message);
    assert.equal(queued.length, 1);
    assert.equal(queued[0].type, "user");
    assert.equal(queued[0].parent_tool_use_id, null);
    assert.equal(queued[0].message.content, resumePrompt);
    assert.match(queued[0].message.content, /Prior pause context:/);
    assert.match(queued[0].message.content, /New founder direction:/);
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
          text: "Redirected.",
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

  it("builds a native Codex teammate invocation that inherits founder configuration", () => {
    const args = buildCodexDriveArgs({ model: "gpt-test", mcpUrl: "http://127.0.0.1:43210/mcp/token" });
    assert.ok(args.includes("mcp_servers.drover.url=\"http://127.0.0.1:43210/mcp/token\""));
    for (const removed of [
      "read-only", "--ignore-user-config", "--ignore-rules", "--strict-config", "--output-schema",
      "features.apps=false", "features.hooks=false", "features.plugin_sharing=false",
      "features.computer_use=false", "features.browser_use=false", "features.in_app_browser=false",
      "features.network_proxy.enabled=false",
    ]) {
      assert.ok(!args.includes(removed), `native drive still carries ${removed}`);
    }
  });

  it("exposes screened Drover tools through the native Codex MCP contract", async () => {
    const calls = [];
    const context = baseContext({
      tools: [{
        name: "read_truth",
        description: "Read product truth.",
        input_schema: { type: "object", properties: {}, required: [] },
      }],
      async runTool(call) {
        calls.push(call);
        return { result: { evidenceState: "grounded" }, pause: false };
      },
    });
    const bridge = await startCodexMcpBridge(context);
    try {
      const initialize = await fetch(bridge.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }),
      }).then((response) => response.json());
      assert.equal(initialize.result.serverInfo.name, "drover");
      const listed = await fetch(bridge.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      }).then((response) => response.json());
      assert.deepEqual(listed.result.tools[0].inputSchema.required, []);
      const called = await fetch(bridge.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "read_truth", arguments: {} } }),
      }).then((response) => response.json());
      assert.deepEqual(JSON.parse(called.result.content[0].text), { evidenceState: "grounded" });
    } finally {
      await bridge.close();
    }
    assert.equal(calls[0].name, "read_truth");
  });

  it("accepts a normal Codex final response without a Drover action envelope", async () => {
    const sessions = [];
    const result = await codexRuntime.drive(baseContext({
      model: null,
      cwd: "/tmp/product",
      onRuntimeSession: (id) => sessions.push(id),
      runCodexTurn: async () => ({ threadId: "thread-1", text: "Grounded in the repository.", error: null, terminal: null }),
    }));
    assert.deepEqual(result, { kind: "completed", summary: "Grounded in the repository." });
    assert.deepEqual(sessions, ["thread-1"]);
  });

  it("preserves a founder-wall pause returned by a native Drover MCP tool", async () => {
    const bridge = await startCodexMcpBridge(baseContext({
      tools: [{ name: "stage_outward", description: "Park an outward act.", input_schema: { type: "object", properties: {} } }],
      async runTool() { return { result: { parked: true }, pause: true }; },
    }));
    try {
      await fetch(bridge.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "stage_outward", arguments: {} } }),
      });
      assert.equal(bridge.terminal(), "paused");
    } finally {
      await bridge.close();
    }
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

describe("Claude streaming run architecture", () => {
  it("streams partial text and forming tool arguments while skipping subagent partials", async () => {
    const textDeltas = [];
    const toolDeltas = [];
    let invocation;
    const result = await claudeCodeRuntime.drive(baseContext({
      currentStatus: () => "running",
      env: { CLAUDE_CODE_OAUTH_TOKEN: "test-token" },
      onTextDelta: (text) => textDeltas.push(text),
      onToolInputDelta: (name, partialJson) => toolDeltas.push([name, partialJson]),
      query: (input) => {
        invocation = input;
        return (async function* partialQuery() {
          yield { type: "stream_event", session_id: "s1", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } } };
          yield { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } } };
          yield { type: "stream_event", parent_tool_use_id: "sub-1", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hidden subagent text" } } };
          yield { type: "stream_event", event: { type: "content_block_start", index: 1, content_block: { type: "tool_use", name: "Bash" } } };
          yield { type: "stream_event", event: { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"command":' } } };
          yield { type: "stream_event", event: { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '"ls"}' } } };
          yield { type: "stream_event", event: { type: "content_block_stop", index: 1 } };
          yield { type: "result", subtype: "success", is_error: false, result: "Done." };
        })();
      },
    }));

    assert.equal(result.kind, "completed");
    assert.equal(invocation.options.includePartialMessages, true);
    assert.equal(Object.hasOwn(invocation.options, "resumeSessionAt"), false);
    assert.deepEqual(textDeltas, ["Hel", "lo"]);
    assert.deepEqual(toolDeltas, [
      ["Bash", '{"command":'],
      ["Bash", '{"command":"ls"}'],
      [null, null],
    ]);
  });

  it("steers a founder message onto the SAME live turn through the run handle", async () => {
    const consumed = [];
    const handles = [];
    let steerAccepted = null;
    const result = await claudeCodeRuntime.drive(baseContext({
      currentStatus: () => "running",
      env: { CLAUDE_CODE_OAUTH_TOKEN: "test-token" },
      onRunHandle: (handle) => handles.push(handle),
      onText: (text) => {
        // The turn is mid-flight: the founder's follow-up joins this run's own prompt queue.
        if (text === "Working on it.") steerAccepted = handles[0].steer("Focus on pricing instead.");
      },
      query: ({ prompt }) => (async function* steeredQuery() {
        const turns = prompt[Symbol.asyncIterator]();
        consumed.push((await turns.next()).value.message.content);
        yield { type: "assistant", session_id: "s1", uuid: "uuid-1", message: { content: [{ type: "text", text: "Working on it." }] } };
        consumed.push((await turns.next()).value.message.content);
        yield { type: "result", subtype: "success", is_error: false, result: "Steered and done." };
      })(),
    }));

    assert.equal(result.kind, "completed");
    assert.equal(steerAccepted, true, "a live queue accepts the steer");
    assert.deepEqual(consumed, ["Explore a distinct bet", "Focus on pricing instead."]);
    assert.equal(handles.length, 2, "the handle registers at start and unregisters at end");
    assert.equal(handles[1], null);
    assert.equal(handles[0].steer("too late"), false, "a settled run refuses the steer so it falls back to the durable queue");
  });

  it("routes a founder stop through the SDK interrupt before any hard abort", async () => {
    const controller = new AbortController();
    let interrupted = false;
    let invocation;
    let releaseTurn;
    const gate = new Promise((resolve) => { releaseTurn = resolve; });
    let queryStarted;
    const started = new Promise((resolve) => { queryStarted = resolve; });
    const drive = claudeCodeRuntime.drive(baseContext({
      signal: controller.signal,
      isCancelled: () => controller.signal.aborted,
      currentStatus: () => "running",
      env: { CLAUDE_CODE_OAUTH_TOKEN: "test-token" },
      query: (input) => {
        invocation = input;
        return {
          async interrupt() { interrupted = true; releaseTurn(); },
          [Symbol.asyncIterator]: async function* blockedTurn() {
            queryStarted();
            await gate;
          },
        };
      },
    }));
    await started;
    controller.abort();
    assert.deepEqual(await drive, { kind: "cancelled" });
    assert.equal(interrupted, true);
    assert.equal(invocation.options.abortController.signal.aborted, false, "a successful interrupt never needed the hard abort");
  });

  it("pins a resumed turn to the stored assistant cursor and reports each fresh cursor", async () => {
    const cursors = [];
    let invocation;
    const result = await claudeCodeRuntime.drive(baseContext({
      runtimeSessionId: "claude-session-1",
      resumePrompt: "New founder direction: keep going",
      resumeSessionAt: "uuid-prev",
      onResumeCursor: (cursor) => cursors.push(cursor),
      currentStatus: () => "running",
      env: { CLAUDE_CODE_OAUTH_TOKEN: "test-token" },
      query: (input) => {
        invocation = input;
        return (async function* resumedQuery() {
          yield { type: "assistant", session_id: "claude-session-1", uuid: "uuid-9", message: { content: [{ type: "text", text: "Resumed." }] } };
          yield { type: "result", subtype: "success", is_error: false, result: "Done." };
        })();
      },
    }));

    assert.equal(result.kind, "completed");
    assert.equal(invocation.options.resume, "claude-session-1");
    assert.equal(invocation.options.resumeSessionAt, "uuid-prev");
    assert.deepEqual(cursors, [{ resumeSessionAt: "uuid-9" }]);
  });
});
