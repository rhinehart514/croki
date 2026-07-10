import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
import {
  anthropicRuntime,
  claudeCodeRuntime,
  codexRuntime,
  runtimeForModel,
  selectRuntime,
} from "../src/runtimes/index.mjs";
import {
  buildCodexArgs,
  codexAuthModeLabel,
  detectCodexAuth,
  parseCodexEvent,
} from "../src/runtimes/codex.mjs";
import {
  authModeLabel,
  buildClaudeArgs,
  detectClaudeAuth,
  driveBudgetUsd,
  findClaudeBinary,
  isResumeFailure,
  modelMaxTurns,
  operatorAllowedTools,
  parseStreamLine,
  PAUSE_STATUSES,
} from "../src/runtimes/claude-code.mjs";

describe("Wave 6 — model turn budget severed from the operator step budget", () => {
  it("gives a generous fixed turn budget, never maxSteps - stepCount", () => {
    // Late in a session (16 of 18 steps used) the model used to get just 2 turns and hit 'max turns (2)'.
    const ctx = { maxSteps: 18, stepCount: 16 };
    assert.ok(modelMaxTurns(ctx, false) >= 40, "the model's turns are generous, not the 2 left in the step budget");
  });
  it("floors a resume drive at 8 turns so a gate-resume re-draft always has room", () => {
    assert.ok(modelMaxTurns({ maxSteps: 18, stepCount: 17 }, true) >= 8);
  });
  it("makes the drive budget session-total-aware — never more than what the session budget has left", () => {
    // Fresh session: full per-drive cap available.
    assert.equal(driveBudgetUsd({ spentUsd: 0 }), 5);
    // Deep into a session (spent 23 of a 25 session cap): the drive is throttled to what remains.
    assert.ok(driveBudgetUsd({ spentUsd: 23 }) <= 2 + 1e-9, "the remaining session budget caps the drive");
    // Never handed exactly $0 (which would instantly trip the budget) — a small floor holds.
    assert.ok(driveBudgetUsd({ spentUsd: 999 }) >= 0.25);
  });
});

// A ctx test double. Every callback is GTM-IDE-owned in production; here we just
// record what the runtime asked GTM IDE to do.
function fakeCtx({ responses, maxSteps = 10, runTool, isCancelled } = {}) {
  let index = 0;
  const calls = { text: [], toolStart: [], toolError: [], turns: 0, persisted: 0 };
  const ctx = {
    goal: "goal", model: "m", system: "s", tools: [],
    client: {
      messages: {
        async create() {
          const response = responses[index];
          index += 1;
          if (!response) throw new Error("Unexpected extra model turn.");
          return response;
        },
      },
    },
    initialMessages: null,
    maxSteps,
    stepCount: 0,
    isCancelled: isCancelled ?? (() => false),
    currentStatus: () => "running",
    onTurn: () => { calls.turns += 1; return calls.turns; },
    onText: (text) => calls.text.push(text),
    onToolStart: (name) => calls.toolStart.push(name),
    onToolError: (name, message) => calls.toolError.push([name, message]),
    runTool: runTool ?? (async ({ name }) => ({ result: { ok: true }, pause: name === "complete" })),
    persistMessages: () => { calls.persisted += 1; },
  };
  return { ctx, calls };
}

describe("anthropicRuntime.isAvailable", () => {
  it("is available with an injected client", () => {
    assert.equal(anthropicRuntime.isAvailable({ client: {}, env: {} }).ok, true);
  });
  it("is available with a key", () => {
    assert.equal(anthropicRuntime.isAvailable({ env: { ANTHROPIC_API_KEY: "x" } }).ok, true);
  });
  it("is unavailable with neither, and says why", () => {
    const result = anthropicRuntime.isAvailable({ env: {} });
    assert.equal(result.ok, false);
    assert.match(result.reason, /ANTHROPIC_API_KEY/);
  });
});

describe("anthropicRuntime.drive", () => {
  it("runs tools then completes when the model stops calling tools", async () => {
    const { ctx, calls } = fakeCtx({
      responses: [
        { content: [{ type: "tool_use", id: "t1", name: "patch_graph", input: {} }] },
        { content: [{ type: "text", text: "all set" }] },
      ],
    });
    const outcome = await anthropicRuntime.drive(ctx);
    assert.equal(outcome.kind, "completed");
    assert.equal(outcome.summary, "all set");
    assert.deepEqual(calls.toolStart, ["patch_graph"]);
    assert.deepEqual(calls.text, ["all set"]);
    assert.equal(calls.turns, 2);
  });

  it("returns paused when a tool pauses (gate / founder input / complete)", async () => {
    const { ctx, calls } = fakeCtx({
      responses: [{ content: [{ type: "tool_use", id: "t1", name: "complete", input: {} }] }],
    });
    const outcome = await anthropicRuntime.drive(ctx);
    assert.equal(outcome.kind, "paused");
    assert.deepEqual(calls.toolStart, ["complete"]);
  });

  it("returns budget when the step budget is exhausted mid-goal", async () => {
    const { ctx } = fakeCtx({
      maxSteps: 1,
      responses: [{ content: [{ type: "tool_use", id: "t1", name: "run_node", input: {} }] }],
      runTool: async () => ({ result: {}, pause: false }),
    });
    const outcome = await anthropicRuntime.drive(ctx);
    assert.equal(outcome.kind, "budget");
  });

  it("bails out immediately when GTM IDE flags a cancel", async () => {
    const { ctx } = fakeCtx({ responses: [], isCancelled: () => true });
    const outcome = await anthropicRuntime.drive(ctx);
    assert.equal(outcome.kind, "cancelled");
  });

  it("records a tool failure and keeps going", async () => {
    const { ctx, calls } = fakeCtx({
      responses: [
        { content: [{ type: "tool_use", id: "t1", name: "run_loop", input: {} }] },
        { content: [{ type: "text", text: "recovered" }] },
      ],
      runTool: async () => { throw new Error("boom"); },
    });
    const outcome = await anthropicRuntime.drive(ctx);
    assert.equal(outcome.kind, "completed");
    assert.equal(calls.toolError[0][0], "run_loop");
    assert.match(calls.toolError[0][1], /boom/);
  });

  it("sends adaptive thinking, high effort, and a cache-controlled system prefix (Wave 3)", async () => {
    let seen = null;
    const ctx = {
      goal: "goal", model: "claude-opus-4-8", system: "Operate the GTM desk.", tools: [{ name: "x" }],
      client: { messages: { async create(params) { seen = params; return { content: [{ type: "text", text: "done" }] }; } } },
      initialMessages: null, maxSteps: 5, stepCount: 0,
      isCancelled: () => false, currentStatus: () => "running",
      onTurn: () => 1, onText: () => {}, onToolStart: () => {}, onToolError: () => {},
      runTool: async () => ({ result: {}, pause: false }), persistMessages: () => {},
    };
    await anthropicRuntime.drive(ctx);
    assert.deepEqual(seen.thinking, { type: "adaptive" }, "adaptive thinking is on — no downgrade to no-think");
    assert.deepEqual(seen.output_config, { effort: "high" }, "high effort for the reasoning-heavy operator loop");
    assert.ok(seen.max_tokens >= 16000, "room for thinking + a real tool turn (thinking counts toward max_tokens)");
    // The operator doctrine (system) rides as a cache_control block so each turn re-reads the prefix cheaply.
    assert.ok(Array.isArray(seen.system), "system is a block array carrying cache_control");
    assert.equal(seen.system[0].text, "Operate the GTM desk.");
    assert.deepEqual(seen.system[0].cache_control, { type: "ephemeral" });
  });

  it("leaves a caller-supplied system block array untouched (no double cache_control)", async () => {
    let seen = null;
    const suppliedSystem = [{ type: "text", text: "custom", cache_control: { type: "ephemeral", ttl: "1h" } }];
    const ctx = {
      goal: "g", model: "claude-opus-4-8", system: suppliedSystem, tools: [],
      client: { messages: { async create(params) { seen = params; return { content: [{ type: "text", text: "done" }] }; } } },
      initialMessages: null, maxSteps: 5, stepCount: 0,
      isCancelled: () => false, currentStatus: () => "running",
      onTurn: () => 1, onText: () => {}, onToolStart: () => {}, onToolError: () => {},
      runTool: async () => ({ result: {}, pause: false }), persistMessages: () => {},
    };
    await anthropicRuntime.drive(ctx);
    assert.equal(seen.system, suppliedSystem, "a caller's own system blocks pass through unchanged");
  });
});

describe("selectRuntime", () => {
  it("uses the Anthropic adapter when a client is injected", () => {
    const selection = selectRuntime({ client: {}, env: {} });
    assert.equal(selection.adapter, anthropicRuntime);
    assert.ok(selection.client);
  });

  it("uses an injected adapter as-is", () => {
    const custom = { id: "custom", label: "Custom", isAvailable: () => ({ ok: true }), drive: async () => ({ kind: "completed" }) };
    assert.equal(selectRuntime({ runtime: custom, env: {} }).adapter, custom);
  });

  it("honors a forced runtime when it is available", () => {
    const selection = selectRuntime({ forced: "anthropic", env: { ANTHROPIC_API_KEY: "x" } });
    assert.equal(selection.adapter, anthropicRuntime);
  });

  it("returns an honest reason when a forced runtime is unavailable", () => {
    const selection = selectRuntime({ forced: "claude-code", env: { GTM_IDE_DISABLE_CLAUDE_CODE: "1" } });
    assert.equal(selection.adapter, null);
    assert.match(selection.reason, /Claude Code/);
  });

  it("rejects an unknown forced runtime", () => {
    const selection = selectRuntime({ forced: "nope", env: {} });
    assert.equal(selection.adapter, null);
    assert.match(selection.reason, /Unknown operator runtime/);
  });

  it("falls back to Anthropic when Claude Code is unavailable", () => {
    const selection = selectRuntime({ env: { ANTHROPIC_API_KEY: "x", GTM_IDE_DISABLE_CLAUDE_CODE: "1" } });
    assert.equal(selection.adapter, anthropicRuntime);
  });

  it("returns a dual-named reason when no runtime is available", () => {
    const selection = selectRuntime({ env: { GTM_IDE_DISABLE_CLAUDE_CODE: "1" } });
    assert.equal(selection.adapter, null);
    assert.match(selection.reason, /Claude Code/);
    assert.match(selection.reason, /ANTHROPIC_API_KEY/);
  });

  it("maps the founder's selected model to its local runtime", () => {
    assert.equal(runtimeForModel("gpt-5.5-codex"), "codex");
    assert.equal(runtimeForModel("gpt-5.6-sol"), "codex");
    assert.equal(runtimeForModel("claude-opus-4-8"), "claude-code");
    assert.equal(runtimeForModel("unknown"), null);
  });
});

describe("codexRuntime", () => {
  it("recognizes a redacted CLI login without requiring an API key", () => {
    assert.equal(detectCodexAuth({}, () => true).mode, "chatgpt-login");
    assert.equal(detectCodexAuth({}, () => false).mode, "none");
    assert.match(codexAuthModeLabel("chatgpt-login"), /ChatGPT subscription/);
    assert.equal(codexRuntime.isAvailable({ env: {}, probe: () => true }).ok, true);
  });

  it("builds a Codex invocation limited to the safe Drover MCP bridge", () => {
    const args = buildCodexArgs({
      model: "gpt-5.5-codex",
      system: "Operate the GTM desk.",
      mcpPath: "/tmp/operator-mcp.mjs",
      toolNames: ["inspect", "run"],
      sessionId: "operator-1",
      home: "/tmp/gtm-codex",
      prompt: "Find the first pilot.",
    });
    assert.deepEqual(args.slice(0, 2), ["exec", "--json"]);
    assert.ok(args.includes("--ignore-user-config"));
    assert.ok(args.includes('sandbox_mode="read-only"'));
    assert.ok(args.includes("features.shell_tool=false"));
    assert.ok(args.includes("features.apps=false"));
    assert.ok(args.includes("features.network_proxy.enabled=false"));
    assert.ok(args.includes('mcp_servers.gtm-operator.command="node"'));
    assert.ok(args.includes('mcp_servers.gtm-operator.env={GTM_IDE_OPERATOR_SESSION="operator-1",GTM_IDE_HOME="/tmp/gtm-codex"}'));
    assert.ok(args.includes('mcp_servers.gtm-operator.enabled_tools=["inspect","run"]'));
    assert.ok(args.includes('mcp_servers.gtm-operator.default_tools_approval_mode="approve"'));
    assert.ok(args.some((arg) => arg.includes("developer_instructions=")));
  });

  it("parses durable session, text, tool, and terminal JSONL events", () => {
    assert.deepEqual(parseCodexEvent('{"type":"thread.started","thread_id":"thread-1"}'), { type: "thread", id: "thread-1" });
    assert.deepEqual(parseCodexEvent('{"type":"item.completed","item":{"type":"agent_message","text":"Checking."}}'), { type: "text", text: "Checking." });
    assert.deepEqual(parseCodexEvent('{"type":"item.started","item":{"type":"mcp_tool_call","name":"inspect"}}'), { type: "tool", name: "inspect" });
    assert.deepEqual(parseCodexEvent('{"type":"turn.completed","summary":"Done."}'), { type: "completed", summary: "Done." });
  });

  it("drives through the session MCP and records the Codex thread for a later resume", async () => {
    let seen;
    const spawn = (_binary, args) => {
      seen = args;
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.killed = false;
      child.kill = () => { child.killed = true; };
      queueMicrotask(() => {
        child.stdout.write('{"type":"thread.started","thread_id":"codex-thread"}\n');
        child.stdout.write('{"type":"item.completed","item":{"type":"agent_message","text":"Inspecting."}}\n');
        child.stdout.write('{"type":"item.started","item":{"type":"mcp_tool_call","name":"inspect"}}\n');
        child.stdout.write('{"type":"turn.completed","summary":"Ready for the wall."}\n');
        child.emit("close", 0);
      });
      return child;
    };
    const seenText = [];
    const seenTools = [];
    const runtimeIds = [];
    const outcome = await codexRuntime.drive({
      sessionId: "operator-1",
      goal: "Find the first pilot.",
      model: "gpt-5.5-codex",
      system: "Operate the GTM desk.",
      tools: [{ name: "inspect" }],
      env: { GTM_IDE_CODEX_PATH: process.execPath },
      options: { cwd: process.cwd(), root: "/tmp/gtm-codex" },
      spawn,
      isCancelled: () => false,
      currentStatus: () => "running",
      onRuntimeSession: (id) => runtimeIds.push(id),
      onText: (text) => seenText.push(text),
      onToolStart: (name) => seenTools.push(name),
      onTurn: () => 1,
    });
    assert.equal(outcome.kind, "completed");
    assert.equal(outcome.summary, "Ready for the wall.");
    assert.deepEqual(runtimeIds, ["codex-thread"]);
    assert.deepEqual(seenText, ["Inspecting."]);
    assert.deepEqual(seenTools, ["inspect"]);
    assert.ok(seen.includes("--ignore-user-config"));
  });
});

describe("claudeCodeRuntime availability + helpers", () => {
  it("is unavailable when explicitly disabled", () => {
    const result = claudeCodeRuntime.isAvailable({ env: { GTM_IDE_DISABLE_CLAUDE_CODE: "1" } });
    assert.equal(result.ok, false);
    assert.match(result.reason, /disabled/);
  });

  it("resolves an explicit binary override that exists", () => {
    const result = findClaudeBinary({ GTM_IDE_CLAUDE_CODE_PATH: process.execPath });
    assert.equal(result.ok, true);
    assert.equal(result.path, process.execPath);
  });

  it("is available through the bundled Agent SDK when signed in via subscription", () => {
    const result = claudeCodeRuntime.isAvailable({ env: {}, probe: () => true });
    assert.equal(result.ok, true);
    assert.equal(result.bundled, true);
    assert.equal(result.auth, "oauth-login");
  });

  it("is available via an OAuth token with no stored login", () => {
    const result = claudeCodeRuntime.isAvailable({
      env: { CLAUDE_CODE_OAUTH_TOKEN: "tok" },
      probe: () => false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.auth, "oauth-token");
  });

  it("falls back to an API key when no subscription login exists", () => {
    const result = claudeCodeRuntime.isAvailable({
      env: { ANTHROPIC_API_KEY: "x" },
      probe: () => false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.auth, "api-key");
  });

  it("reports an honest cold-start when no credential is present", () => {
    const result = claudeCodeRuntime.isAvailable({ env: {}, probe: () => false });
    assert.equal(result.ok, false);
    assert.match(result.reason, /sign in|subscription/i);
  });

  it("reports a missing binary override honestly", () => {
    const result = findClaudeBinary({ GTM_IDE_CLAUDE_CODE_PATH: "/no/such/claude" });
    assert.equal(result.ok, false);
  });

  it("maps operator tool names to namespaced MCP tool ids", () => {
    assert.deepEqual(
      operatorAllowedTools(["inspect_graph", "run_loop"]),
      ["mcp__gtm-operator__inspect_graph", "mcp__gtm-operator__run_loop"],
    );
  });

  it("builds headless stream-json args wired to the MCP bridge", () => {
    const args = buildClaudeArgs({
      mcpConfigPath: "/tmp/op.json",
      allowedTools: ["mcp__gtm-operator__inspect_graph"],
      model: "claude-sonnet-4-6",
      maxTurns: 8,
    });
    assert.ok(args.includes("--print"));
    assert.equal(args[args.indexOf("--output-format") + 1], "stream-json");
    assert.ok(args.includes("--verbose"));
    assert.equal(args[args.indexOf("--mcp-config") + 1], "/tmp/op.json");
    assert.ok(args.includes("--strict-mcp-config"));
    assert.equal(args[args.indexOf("--allowedTools") + 1], "mcp__gtm-operator__inspect_graph");
    assert.equal(args[args.indexOf("--max-turns") + 1], "8");
  });

  it("parses assistant text and tool calls from a stream-json line", () => {
    const event = parseStreamLine(JSON.stringify({
      type: "assistant",
      message: { content: [
        { type: "text", text: "checking" },
        { type: "tool_use", name: "mcp__gtm-operator__run_loop", input: { a: 1 } },
      ] },
    }));
    assert.equal(event.type, "assistant");
    assert.equal(event.text, "checking");
    assert.deepEqual(event.toolUses, [{ name: "run_loop", input: { a: 1 } }]);
  });

  it("parses a terminal result line", () => {
    const event = parseStreamLine(JSON.stringify({ type: "result", subtype: "success", result: "done", is_error: false }));
    assert.equal(event.type, "result");
    assert.equal(event.isError, false);
    assert.equal(event.text, "done");
  });

  it("ignores noise and unsurfaced events", () => {
    assert.equal(parseStreamLine("not json"), null);
    assert.equal(parseStreamLine(JSON.stringify({ type: "system" })), null);
    assert.equal(parseStreamLine("   "), null);
  });

  it("detects auth OAuth-first: token over login over key", () => {
    assert.equal(
      detectClaudeAuth({ CLAUDE_CODE_OAUTH_TOKEN: "t", ANTHROPIC_API_KEY: "k" }, () => true).mode,
      "oauth-token",
    );
    assert.equal(detectClaudeAuth({ ANTHROPIC_API_KEY: "k" }, () => true).mode, "oauth-login");
    assert.equal(detectClaudeAuth({ ANTHROPIC_API_KEY: "k" }, () => false).mode, "api-key");
    assert.equal(detectClaudeAuth({}, () => false).mode, "none");
  });

  it("labels subscription auth distinctly from the keyed fallback", () => {
    assert.match(authModeLabel("oauth-login"), /subscription/i);
    assert.match(authModeLabel("api-key"), /API key/i);
    assert.equal(authModeLabel("none"), null);
  });

  it("drives the Agent SDK through the durable MCP bridge", async () => {
    let queryOptions;
    let status = "running";
    const calls = { text: [], tools: [], turns: 0 };
    const query = ({ options }) => {
      queryOptions = options;
      return (async function* messages() {
        yield {
          type: "assistant",
          message: {
            content: [
              { type: "text", text: "Inspecting the portfolio." },
              { type: "tool_use", name: "mcp__gtm-operator__inspect_portfolio", input: {} },
            ],
          },
        };
        status = "waiting_for_input";
        yield { type: "user", message: { content: [] } };
      }());
    };
    const outcome = await claudeCodeRuntime.drive({
      sessionId: "op-1",
      goal: "Coordinate the founder-defined channel portfolio.",
      model: "claude-sonnet-4-6",
      system: "Operate GTM IDE.",
      tools: [{ name: "inspect_portfolio" }],
      query,
      env: {},
      options: { root: "/tmp/gtm-test", cwd: "/tmp" },
      maxSteps: 8,
      stepCount: 0,
      isCancelled: () => false,
      currentStatus: () => status,
      onText: (text) => calls.text.push(text),
      onToolStart: (name) => calls.tools.push(name),
      onTurn: () => { calls.turns += 1; return calls.turns; },
    });
    assert.equal(outcome.kind, "paused");
    assert.deepEqual(calls.text, ["Inspecting the portfolio."]);
    assert.deepEqual(calls.tools, []);
    assert.equal(calls.turns, 1);
    assert.deepEqual(queryOptions.tools, []);
    // Full harness (the default): bridge tools PLUS the founder's harness — skills, subagents,
    // fan-out, web, read-only file tools. Never a send-shaped or write-shaped tool.
    assert.ok(queryOptions.allowedTools.includes("mcp__gtm-operator__inspect_portfolio"));
    for (const tool of ["Task", "Skill", "WebSearch", "Read"]) {
      assert.ok(queryOptions.allowedTools.includes(tool), `${tool} must be granted in full-harness mode`);
    }
    for (const banned of ["Bash", "Write", "Edit", "NotebookEdit"]) {
      assert.ok(!queryOptions.allowedTools.includes(banned), `${banned} must NEVER be granted to the operator`);
    }
    assert.deepEqual(queryOptions.settingSources, ["user"], "full harness loads the founder's skills/agents");
    assert.match(queryOptions.systemPrompt, /full Claude harness/);
    assert.match(queryOptions.systemPrompt, /cannot send, publish, write files, or resolve a founder gate/);
    assert.equal(queryOptions.strictMcpConfig, true);
    assert.equal(queryOptions.permissionMode, "dontAsk");
    assert.ok(queryOptions.mcpServers["gtm-operator"]);
  });

  it("caged mode restores the bridge-only operator (escape hatch)", async () => {
    let queryOptions;
    let status = "running";
    const query = ({ options }) => {
      queryOptions = options;
      return (async function* messages() {
        status = "waiting_for_input";
        yield { type: "user", message: { content: [] } };
      }());
    };
    await claudeCodeRuntime.drive({
      sessionId: "op-2",
      goal: "goal",
      system: "Operate GTM IDE.",
      tools: [{ name: "inspect_portfolio" }],
      query,
      env: {},
      options: { root: "/tmp/gtm-test", cwd: "/tmp", harness: "caged" },
      maxSteps: 8,
      stepCount: 0,
      isCancelled: () => false,
      currentStatus: () => status,
      onText: () => {},
      onToolStart: () => {},
      onTurn: () => 1,
    });
    assert.deepEqual(queryOptions.allowedTools, ["mcp__gtm-operator__inspect_portfolio"]);
    assert.deepEqual(queryOptions.settingSources, []);
    assert.equal(queryOptions.systemPrompt, "Operate GTM IDE.");
  });

  it("every founder wall is in PAUSE_STATUSES, so none can be talked past", () => {
    // The subprocess adapter polls currentStatus() to know when to stop; any status that
    // means "the founder must act before another model turn" has to be here. Drift in this
    // set is exactly the bug that orphaned a staged proposal.
    for (const wall of ["waiting_for_gate", "waiting_for_proposal", "waiting_for_input", "waiting_for_ideas", "waiting_for_candidates"]) {
      assert.ok(PAUSE_STATUSES.has(wall), `${wall} must halt the drive`);
    }
  });

  it("halts the drive when a staged proposal sets waiting_for_proposal", async () => {
    // Regression: waiting_for_proposal was missing from PAUSE_STATUSES, so a staged graph
    // change did not stop the subprocess. The model talked past it, the turn-end was misread
    // as "completed", and the pending proposal was orphaned — the canvas keys its ghost +
    // accept buttons off waiting_for_proposal, so the founder had nothing to accept.
    let status = "running";
    const query = () => (async function* messages() {
      yield {
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "mcp__gtm-operator__propose_graph_changes", input: {} }] },
      };
      status = "waiting_for_proposal";
      yield { type: "user", message: { content: [] } };
    }());
    const outcome = await claudeCodeRuntime.drive({
      sessionId: "op-prop",
      goal: "Swap the empty source for a discovery agent.",
      model: "claude-sonnet-4-6",
      system: "Operate GTM IDE.",
      tools: [{ name: "propose_graph_changes" }],
      query,
      env: {},
      options: { root: "/tmp/gtm-test", cwd: "/tmp" },
      maxSteps: 8,
      stepCount: 0,
      isCancelled: () => false,
      currentStatus: () => status,
      onText: () => {},
      onToolStart: () => {},
      onTurn: () => 1,
    });
    assert.equal(outcome.kind, "paused", "a staged proposal is a founder wall — pause, do not complete");
  });
});

// The conversation-memory contract: the subscription runtime captures its SDK session id, resumes
// it with only the "what changed" instruction on later drives, and falls back to a cold start if
// the prior transcript is gone. This is what makes the operator "remember your chats" across the
// founder gates and pauses GTM IDE itself imposes.
describe("claudeCodeRuntime session continuity", () => {
  function baseCtx(overrides = {}) {
    let status = "running";
    return {
      sessionId: "op-mem",
      goal: "Land the first pilot.",
      model: "claude-sonnet-4-6",
      system: "Operate GTM IDE.",
      tools: [{ name: "inspect_problems" }],
      env: {},
      options: { cwd: "/tmp" },
      maxSteps: 8,
      stepCount: 0,
      isCancelled: () => false,
      currentStatus: () => status,
      onText: () => {},
      onToolStart: () => {},
      onTurn: () => 1,
      _setStatus: (s) => { status = s; },
      ...overrides,
    };
  }

  it("first drive persists the session, captures the SDK session id, and prompts with the goal", async () => {
    let queryOptions;
    let queryPrompt;
    const captured = [];
    const query = ({ prompt, options }) => {
      queryPrompt = prompt;
      queryOptions = options;
      return (async function* messages() {
        yield { type: "system", subtype: "init", session_id: "sdk-abc" };
        yield { type: "result", subtype: "success", result: "done", is_error: false, session_id: "sdk-abc" };
      }());
    };
    const ctx = baseCtx({ query, runtimeSessionId: null, resumePrompt: null, onRuntimeSession: (sid) => captured.push(sid) });
    const outcome = await claudeCodeRuntime.drive(ctx);
    assert.equal(outcome.kind, "completed");
    assert.equal(queryPrompt, "Land the first pilot.", "a fresh session prompts with the goal");
    assert.equal(queryOptions.persistSession, true, "the transcript is persisted so it can resume");
    assert.equal(queryOptions.resume, undefined, "a fresh session does not resume");
    assert.deepEqual(captured, ["sdk-abc"], "the SDK session id is handed back to GTM IDE");
  });

  it("a later drive resumes the stored session and prompts with only the change", async () => {
    let queryOptions;
    let queryPrompt;
    const query = ({ prompt, options }) => {
      queryPrompt = prompt;
      queryOptions = options;
      return (async function* messages() {
        yield { type: "result", subtype: "success", result: "continued", is_error: false, session_id: "sdk-abc" };
      }());
    };
    const ctx = baseCtx({
      query,
      stepCount: 4,
      runtimeSessionId: "sdk-abc",
      resumePrompt: "Founder gate resolved. Continue.",
      onRuntimeSession: () => {},
    });
    const outcome = await claudeCodeRuntime.drive(ctx);
    assert.equal(outcome.kind, "completed");
    assert.equal(queryOptions.resume, "sdk-abc", "the stored session id is resumed");
    assert.equal(queryPrompt, "Founder gate resolved. Continue.", "resume sends only the new instruction, not the whole goal");
  });

  it("falls back to a fresh session once when the prior transcript is gone", async () => {
    const prompts = [];
    const resumes = [];
    let call = 0;
    const query = ({ prompt, options }) => {
      call += 1;
      prompts.push(prompt);
      resumes.push(options.resume ?? null);
      if (call === 1) {
        return (async function* fail() {
          // eslint-disable-next-line no-unused-vars
          for (const _ of []) yield _;
          throw new Error("Could not resume session sdk-old: session not found.");
        }());
      }
      return (async function* ok() {
        yield { type: "result", subtype: "success", result: "fresh", is_error: false, session_id: "sdk-new" };
      }());
    };
    const captured = [];
    const ctx = baseCtx({
      query,
      stepCount: 6,
      runtimeSessionId: "sdk-old",
      resumePrompt: "Continue.",
      onRuntimeSession: (sid) => captured.push(sid),
    });
    const outcome = await claudeCodeRuntime.drive(ctx);
    assert.equal(outcome.kind, "completed");
    assert.equal(call, 2, "it retried exactly once");
    assert.deepEqual(resumes, ["sdk-old", null], "first tries resume, then falls back to a fresh session");
    assert.deepEqual(prompts, ["Continue.", "Land the first pilot."], "the fresh pass re-prompts with the goal");
    assert.deepEqual(captured, ["sdk-new"], "the new session id replaces the dead one");
  });

  it("isResumeFailure recognizes a missing-session error but not unrelated failures", () => {
    assert.equal(isResumeFailure(new Error("Could not resume session abc: session not found.")), true);
    assert.equal(isResumeFailure(new Error("Session no longer exists")), true);
    assert.equal(isResumeFailure(new Error("rate_limit: overloaded")), false);
    assert.equal(isResumeFailure(new Error("billing_error")), false);
  });
});
