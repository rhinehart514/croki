// Claude Code Agent SDK operator runtime — the preferred local runtime.
//
// Why this exists: GTM IDE claims to be a local harness. Claude Code is exactly
// that — it runs on the founder's existing authenticated subscription (no raw
// ANTHROPIC_API_KEY), holds its own agent/tool loop, and reads the repo locally.
// So when the `claude` CLI is installed, the resident operator should be driven
// by a Claude Code subprocess rather than a direct API call.
//
// Ownership boundary (critical): Claude Code owns NONE of GTM IDE's durable
// state or safety. It receives the goal plus GTM IDE's typed operator tools
// (over an MCP bridge, ./operator-mcp.mjs), reasons, and calls those tools. The
// tools execute inside GTM IDE code and persist to GTM IDE's session store, run
// ledger, and gates. The operator toolset contains no approve/send/publish tool,
// so the subprocess literally cannot push past a founder gate — when a run
// reaches a gate the session flips to `waiting_for_gate` and this adapter stops
// the subprocess. GTM IDE keeps owning session state, typed mutations, the
// ledger, permissions, gates, cancellation, timeout, and restart recovery.
//
// The Agent SDK bundles Claude Code, so the product does not depend on a global
// `claude` binary. It can use an existing Claude Code login or ANTHROPIC_API_KEY.
// GTM_IDE_CLAUDE_CODE_PATH remains available for an explicit binary override.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createSdkMcpServer,
  query as agentQuery,
  tool as sdkTool,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const BRIDGE_SERVER = "gtm-operator";

// Operator tools are all read/patch/run/ask/complete — none send, publish, or
// approve a gate. We still funnel the allow-list through one builder so the
// safety property is asserted in one place (see operator-mcp.test.mjs).
export function operatorAllowedTools(toolNames, server = BRIDGE_SERVER) {
  return toolNames.map((name) => `mcp__${server}__${name}`);
}

// Build the headless `claude` argument vector. Isolated so the exact flags are
// trivially auditable and adjustable against the installed CLI version.
export function buildClaudeArgs({ mcpConfigPath, allowedTools, model, maxTurns }) {
  const args = [
    "--print",
    "--output-format", "stream-json",
    "--verbose",
    "--mcp-config", mcpConfigPath,
    "--strict-mcp-config",
    "--permission-mode", "default",
  ];
  if (allowedTools?.length) args.push("--allowedTools", allowedTools.join(","));
  if (model) args.push("--model", model);
  if (maxTurns) args.push("--max-turns", String(maxTurns));
  return args;
}

// Parse one newline-delimited stream-json line into a neutral event. Returns
// null for lines we do not surface. Tolerant of partial/non-JSON noise.
export function parseStreamLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return null;
  let event;
  try {
    event = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (event.type === "assistant" && event.message?.content) {
    const blocks = event.message.content;
    const text = blocks
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    const toolUses = blocks
      .filter((block) => block.type === "tool_use")
      .map((block) => ({ name: stripServer(block.name), input: block.input ?? {} }));
    return { type: "assistant", text, toolUses };
  }
  if (event.type === "result") {
    return {
      type: "result",
      isError: event.is_error === true || event.subtype === "error_max_turns",
      text: typeof event.result === "string" ? event.result : null,
      subtype: event.subtype ?? null,
    };
  }
  return null;
}

function stripServer(toolName) {
  const match = /^mcp__[^_]+(?:_[^_]+)*__(.+)$/.exec(toolName || "");
  return match ? match[1] : toolName;
}

// Locate the `claude` binary. Honors an explicit override, otherwise resolves on
// PATH. Cheap and synchronous — only runs during runtime selection.
export function findClaudeBinary(env = process.env) {
  const override = env.GTM_IDE_CLAUDE_CODE_PATH;
  if (override) {
    return fs.existsSync(override) ? { ok: true, path: override } : { ok: false, reason: `GTM_IDE_CLAUDE_CODE_PATH does not exist: ${override}` };
  }
  const lookup = process.platform === "win32" ? "where" : "which";
  const found = spawnSync(lookup, ["claude"], { encoding: "utf8" });
  const resolved = found.status === 0 ? found.stdout.split("\n")[0].trim() : "";
  if (resolved) return { ok: true, path: resolved };
  return { ok: false, reason: "The `claude` CLI was not found on PATH." };
}

// True when a Claude Code subscription login is stored locally: the macOS
// keychain item the CLI writes on `claude` login, or the credentials file it
// writes on other platforms. This is the signal that the founder is on their
// subscription with no raw key — the preferred auth for this product.
export function hasStoredClaudeLogin(env = process.env) {
  if (process.platform === "darwin") {
    const found = spawnSync(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials"],
      { encoding: "utf8" },
    );
    if (found.status === 0) return true;
  }
  const home = env.HOME || os.homedir();
  if (home && fs.existsSync(path.join(home, ".claude", ".credentials.json"))) return true;
  return false;
}

// Decide how the bundled Claude Code subprocess will authenticate, in
// OAuth-first order. A stored subscription login or an explicit
// CLAUDE_CODE_OAUTH_TOKEN both run on the founder's subscription with no raw
// key; a bare ANTHROPIC_API_KEY is the last-resort keyed fallback. Returns
// { mode } where mode is "oauth-token" | "oauth-login" | "api-key" | "none".
// `probe` is injectable so availability is testable without touching the real
// keychain.
export function detectClaudeAuth(env = process.env, probe = hasStoredClaudeLogin) {
  if (env.CLAUDE_CODE_OAUTH_TOKEN) return { mode: "oauth-token" };
  if (probe(env)) return { mode: "oauth-login" };
  if (env.ANTHROPIC_API_KEY) return { mode: "api-key" };
  return { mode: "none" };
}

// Human label for an auth mode, shown in operator events. null for "none" and
// the test client — nothing useful to display.
export function authModeLabel(mode) {
  switch (mode) {
    case "oauth-token": return "Claude subscription (OAuth token)";
    case "oauth-login": return "Claude subscription";
    case "api-key": return "Anthropic API key";
    default: return null;
  }
}

// Every status that must HALT the subprocess drive. The adapter polls ctx.currentStatus()
// after each SDK message because MCP tools execute out-of-band, so a wall the founder must
// resolve has to appear here or the model keeps talking past it and the turn-end is misread
// as "completed" (which then clobbers the pending wall). waiting_for_proposal is a wall:
// a staged graph change waits for the founder's accept/discard exactly like a gate.
export const PAUSE_STATUSES = new Set([
  "waiting_for_gate",
  "waiting_for_proposal",
  "waiting_for_input",
  "waiting_for_ideas",
  "completed",
  "blocked",
]);

// A resume can fail when the prior on-disk transcript is gone — cleared, expired, or the session
// was created on another machine/cwd. Detect that narrowly so we only fall back to a cold start
// for a genuine missing-session error, not for an unrelated failure we should surface.
export function isResumeFailure(error) {
  const message = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  return /resume|session/.test(message) && /not found|no longer|does not exist|missing|unknown|no conversation|cannot/.test(message);
}

export function createOperatorSdkServer(ctx) {
  const tools = (ctx.tools ?? []).map((definition) => {
    const schema = z.fromJSONSchema(definition.input_schema ?? { type: "object", properties: {} });
    const shape = schema instanceof z.ZodObject ? schema.shape : {};
    return sdkTool(
      definition.name,
      definition.description,
      shape,
      async (input) => {
        ctx.onToolStart(definition.name);
        try {
          const { result } = await ctx.runTool({
            id: `sdk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: definition.name,
            input: input ?? {},
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.onToolError(definition.name, message);
          return {
            isError: true,
            content: [{ type: "text", text: message }],
          };
        }
      },
      { alwaysLoad: true },
    );
  });
  return createSdkMcpServer({
    name: BRIDGE_SERVER,
    version: "0.3.0",
    instructions: "Use these typed GTM IDE tools for every project, channel, graph, run, and completion action. Never narrate a tool call in text.",
    tools,
    alwaysLoad: true,
  });
}

export const claudeCodeRuntime = {
  id: "claude-code",
  label: "Claude Code (Agent SDK)",

  isAvailable({ env = process.env, probe } = {}) {
    if (env.GTM_IDE_DISABLE_CLAUDE_CODE) {
      return { ok: false, reason: "Claude Code runtime is disabled (GTM_IDE_DISABLE_CLAUDE_CODE)." };
    }
    if (env.GTM_IDE_CLAUDE_CODE_PATH) {
      const binary = findClaudeBinary(env);
      if (!binary.ok) return binary;
    }
    // The bundled SDK is present, but the runtime is only usable if the founder
    // is actually authenticated. Gate availability on that so a signed-out
    // founder hits an honest cold-start (with options) instead of a deep SDK
    // crash mid-session. OAuth subscription is preferred; a raw key is the
    // fallback.
    const auth = detectClaudeAuth(env, probe);
    if (auth.mode === "none") {
      return {
        ok: false,
        reason: "Claude Code is not signed in. Run `claude` to sign in with your Claude subscription (preferred), or set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY.",
      };
    }
    return {
      ok: true,
      bundled: true,
      auth: auth.mode,
      note: "Uses the Claude Code executable bundled with the Agent SDK.",
    };
  },

  // Drive the session through the Agent SDK, wired to GTM IDE's operator MCP
  // bridge. The bridge executes tools in its own process against the durable
  // session store. The SDK owns model orchestration; GTM IDE still owns state,
  // validation, cancellation, and the exact boundary around founder gates.
  //
  // Conversation memory ("remember your chats"): the SDK persists the running
  // transcript under ~/.claude/projects (persistSession), keyed by cwd + a
  // session id. On the FIRST drive we let the SDK mint that id and capture it
  // back through ctx.onRuntimeSession so GTM IDE stores it on the durable
  // operator session. On every LATER drive — after a founder gate, founder
  // input, an iteration-budget pause, or a full process restart — we `resume`
  // that same id and send only the new instruction (ctx.resumePrompt: "the
  // founder approved the gate", etc.). The subprocess then continues the exact
  // conversation it was in instead of re-deriving context from cold. GTM IDE
  // still owns all durable state and the gate; this only restores the model's
  // working memory across the pauses GTM IDE itself imposes.
  async drive(ctx) {
    const allowedTools = operatorAllowedTools((ctx.tools ?? []).map((tool) => tool.name));
    const sdkServer = createOperatorSdkServer(ctx);
    const runQuery = ctx.query || agentQuery;
    const reportSession = typeof ctx.onRuntimeSession === "function" ? ctx.onRuntimeSession : () => {};

    // OAuth-first billing. When the founder is on their Claude subscription,
    // strip any stray ANTHROPIC_API_KEY from the subprocess env so the run bills
    // the subscription, not the key — "runs on the founder's subscription, no
    // raw key" is the product invariant. When the key is the only credential,
    // leave it in place; that's the honest fallback.
    const auth = detectClaudeAuth(ctx.env ?? process.env);
    const childEnv = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "gtm-ide/0.3.0" };
    if (auth.mode === "oauth-token" || auth.mode === "oauth-login") {
      delete childEnv.ANTHROPIC_API_KEY;
    }

    // One pass over the SDK. resumeId !== null means "continue the stored
    // conversation"; null means "start a fresh one from the goal".
    const attempt = async (resumeId) => {
      const abortController = new AbortController();
      const timeoutMs = Number(process.env.GTM_IDE_CLAUDE_CODE_TIMEOUT_MS) || 600_000;
      const timeout = setTimeout(() => abortController.abort(), timeoutMs);
      const stderr = [];
      let terminalResult = null;
      let captured = false;
      const prompt = resumeId
        ? (ctx.resumePrompt || "Continue from where you left off.")
        : ctx.goal;

      try {
        const stream = runQuery({
          prompt,
          options: {
            abortController,
            cwd: ctx.options?.cwd || process.cwd(),
            model: ctx.model,
            maxTurns: Math.max(1, ctx.maxSteps - ctx.stepCount),
            maxBudgetUsd: Number(process.env.GTM_IDE_CLAUDE_CODE_MAX_BUDGET_USD) || 5,
            systemPrompt: ctx.system,
            tools: [],
            allowedTools,
            permissionMode: "dontAsk",
            strictMcpConfig: true,
            settingSources: [],
            // Persist the transcript so a later drive can resume it. This is the
            // founder's local Claude session store — the local-harness contract.
            persistSession: true,
            ...(resumeId ? { resume: resumeId } : {}),
            pathToClaudeCodeExecutable: ctx.env?.GTM_IDE_CLAUDE_CODE_PATH || undefined,
            env: childEnv,
            mcpServers: {
              [BRIDGE_SERVER]: sdkServer,
            },
            stderr: (line) => stderr.push(line),
          },
        });

        for await (const message of stream) {
          // Capture the session id from the first message that carries one and
          // hand it to GTM IDE immediately, so even a crash mid-run leaves a
          // resumable id on the durable session.
          if (!captured && message?.session_id) {
            captured = true;
            reportSession(message.session_id);
          }

          if (ctx.isCancelled()) {
            abortController.abort();
            return { kind: "cancelled" };
          }

          if (message.type === "assistant" && message.message?.content) {
            const parsed = parseStreamLine(JSON.stringify(message));
            if (parsed?.text) ctx.onText(parsed.text);
            if (parsed?.toolUses?.length) ctx.onTurn();
          }

          if (message.type === "result") terminalResult = message;

          // MCP tool execution completes before the following SDK message is
          // yielded. Check every message so a gate reached by the bridge stops
          // the resident operator before another model turn can cross it.
          const status = ctx.currentStatus();
          if (status === "cancelled") {
            abortController.abort();
            return { kind: "cancelled" };
          }
          if (PAUSE_STATUSES.has(status)) {
            abortController.abort();
            return { kind: "paused" };
          }
        }
      } finally {
        clearTimeout(timeout);
      }

      if (!terminalResult) {
        if (abortController.signal.aborted) return { kind: "budget" };
        throw new Error(stderr.join("").trim().slice(-2_000) || "Claude Code ended without a result.");
      }
      if (terminalResult.subtype === "error_max_turns" || terminalResult.subtype === "error_max_budget_usd") {
        return { kind: "budget" };
      }
      if (terminalResult.is_error) {
        throw new Error(terminalResult.errors?.join(" ") || terminalResult.result || "Claude Code failed.");
      }
      return {
        kind: "completed",
        summary: terminalResult.result || "Claude Code finished the session.",
      };
    };

    const priorSessionId = ctx.runtimeSessionId || null;
    try {
      return await attempt(priorSessionId);
    } catch (error) {
      // Resume failed because the prior transcript is gone — don't strand the
      // founder. Fall back ONCE to a fresh session that re-inspects from the
      // goal. Any other failure surfaces unchanged.
      if (priorSessionId && isResumeFailure(error)) {
        ctx.onText?.("Previous conversation memory was unavailable, so the operator is starting a fresh pass and re-inspecting from the goal.");
        return await attempt(null);
      }
      throw error;
    }
  },
};
