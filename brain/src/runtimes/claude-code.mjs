// Claude Code Agent SDK runtime — the preferred local intelligence adapter.
//
// Why this exists: Drover is a local harness. Claude Code is exactly
// that — it runs on the founder's existing authenticated subscription (no raw
// ANTHROPIC_API_KEY), holds its own agent/tool loop, and reads the repo locally.
// So when the `claude` CLI is installed, the resident teammate should be driven
// by a Claude Code subprocess rather than a direct API call.
//
// Claude Code owns none of Drover's durable state or founder authority. It receives the goal plus
// typed Firm tools over an in-process MCP bridge while retaining its native tools, configuration,
// skills, agents, plugins, and MCP servers. Drover owns its state, typed mutations, cancellation,
// timeout, restart recovery, and the tools that stage outward work for founder review.
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
import { runClaudeQuery } from "../model-query.mjs";
import { z } from "zod";

const BRIDGE_SERVER = "drover-firm";

// Firm tools are all read/patch/run/ask/complete — none send, publish, or
// clear the wall. We still funnel the allow-list through one builder so the
// safety property is asserted in one place.
export function firmAllowedTools(toolNames, server = BRIDGE_SERVER) {
  return toolNames.map((name) => `mcp__${server}__${name}`);
}

// The composer IS the Claude harness (founder decision, 2026-07-01). Full mode is a real native
// Claude Code session, not a hand-picked imitation: the default toolset (including Bash, Write,
// and Edit), all normal user/project/local settings, CLAUDE.md files, skills, agents, plugins, and
// configured MCP servers remain available. Drover adds its screened MCP server to that harness.
// Those Drover tools keep founder-only outward authority; the founder's own Claude Code policy
// remains authoritative for native tools and integrations. GTM_FIRM_HARNESS=caged (or
// ctx.options.harness === "caged") retains the prior bridge-only compatibility mode.

export function firmHarnessMode(ctx = {}, env = process.env) {
  const explicit = ctx.options?.harness ?? env.GTM_FIRM_HARNESS;
  return explicit === "caged" ? "caged" : "full";
}

// Build the headless `claude` argument vector. Isolated so the exact flags are
// trivially auditable and adjustable against the installed CLI version.
export function buildClaudeArgs({ mcpConfigPath, allowedTools, model, maxTurns, harness = "full" }) {
  const args = [
    "--print",
    "--output-format", "stream-json",
    "--verbose",
    "--mcp-config", mcpConfigPath,
    "--permission-mode", harness === "caged" ? "dontAsk" : "auto",
  ];
  if (harness === "caged") args.push("--strict-mcp-config");
  if (allowedTools?.length) args.push("--allowedTools", allowedTools.join(","));
  if (model) args.push("--model", model);
  if (maxTurns) args.push("--max-turns", String(maxTurns));
  return args;
}

// The MODEL's per-drive turn budget — decoupled from the teammate step budget (Wave 6). Generous by
// default so a real multi-step drive can think, and floored at 8 on a resume so a wall-resume re-draft
// always has room. Overridable via env for tuning. Never derived from maxSteps/stepCount — that
// coupling was the "max turns (2)" leak; the teammate's own step guard is the cross-cycle throttle.
export function modelMaxTurns(ctx, isResume) {
  const base = Number(process.env.GTM_IDE_CLAUDE_CODE_MAX_TURNS) || 40;
  const floor = isResume ? 8 : 1;
  return Math.max(floor, base);
}

// The per-drive dollar cap, made session-total-aware. Each drive may spend up to the per-drive cap, but
// never more than what remains of the session's total budget (sessionBudget − spentSoFar, both in USD).
// spentSoFar is the cumulative cost prior drives reported back through ctx.onCost; 0 on the first drive.
// This makes ONE real dollar figure the throttle for a whole multi-drive run, instead of an unbounded
// fresh $5 every drive. A configured participant rail may narrow it further; work-loop rejects a drive
// before this adapter when nothing remains.
export function driveBudgetUsd(ctx) {
  const perDrive = Number(process.env.GTM_IDE_CLAUDE_CODE_MAX_BUDGET_USD) || 5;
  const sessionCap = Number(process.env.GTM_IDE_CLAUDE_CODE_SESSION_BUDGET_USD) || 25;
  const spent = Number(ctx?.spentUsd) || 0;
  const remaining = Math.max(0, sessionCap - spent);
  const configuredRemaining = ctx?.maxBudgetUsd != null && Number.isFinite(Number(ctx.maxBudgetUsd))
    ? Math.max(0, Number(ctx.maxBudgetUsd))
    : Number.POSITIVE_INFINITY;
  return Math.min(perDrive, remaining, configuredRemaining);
}

function conciseProcessError(raw) {
  const clean = String(raw ?? "").trim();
  if (!clean) return "";
  const marker = clean.lastIndexOf("\nerror:");
  const relevant = marker >= 0 ? clean.slice(marker + 1) : clean.slice(-1_200);
  return relevant.split("\n").slice(0, 7).join("\n").slice(0, 1_200);
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

// Human label for an auth mode, shown in teammate events. null for "none" and
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
// a staged change waits for the founder's accept/discard at the wall.
export const PAUSE_STATUSES = new Set(["paused"]);

// A resume can fail when the prior on-disk transcript is gone — cleared, expired, or the session
// was created on another machine/cwd. Detect that narrowly so we only fall back to a cold start
// for a genuine missing-session error, not for an unrelated failure we should surface.
export function isResumeFailure(error) {
  const message = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  return /resume|session/.test(message) && /not found|no longer|does not exist|missing|unknown|no conversation|cannot/.test(message);
}

export function createFirmSdkServer(ctx) {
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
    instructions: "Use these typed Drover tools for venture truth, taste, bets, staged work, and founder-wall pauses. Never narrate a tool call in text.",
    tools,
    alwaysLoad: true,
  });
}

export const claudeCodeRuntime = {
  id: "claude-code",
  label: "Claude Code (Agent SDK)",
  costReporting: "usd",
  supportsAbort: true,

  // A deliberately smaller capability than `drive`: edit inert files inside one isolated
  // worktree and return prose. The host owns the worktree, receipt, git checks, and wall.
  // Keeping this on the existing runtime adapter prevents product changes from quietly
  // becoming a second Claude-only intelligence path.
  async runProductChange({ prompt, cwd, model, maxTurns, allowedTools, canUseTool, env = process.env, authProbe, runQuery = runClaudeQuery }) {
    const auth = detectClaudeAuth(env, authProbe);
    return runQuery({
      prompt,
      cwd,
      model,
      maxTurns,
      allowedTools,
      canUseTool,
      env,
      allowApiKey: auth.mode === "api-key",
    });
  },

  isAvailable({ env = process.env, probe } = {}) {
    if (env.GTM_IDE_DISABLE_CLAUDE_CODE) {
      return { ok: false, reason: "Claude Code runtime is disabled (GTM_IDE_DISABLE_CLAUDE_CODE)." };
    }
    if (env.GTM_IDE_CLAUDE_CODE_PATH) {
      const binary = findClaudeBinary(env);
      if (!binary.ok) return binary;
    }
    // The bundled SDK is present, but the runtime is only usable if the founder
    // is actually authenticated. Require authentication on that so a signed-out
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

  // Drive the session through the Agent SDK, wired to GTM IDE's teammate MCP
  // bridge. The bridge executes tools in its own process against the durable
  // session store. The SDK owns model orchestration; GTM IDE still owns state,
  // validation, cancellation, and the exact boundary around founder walls.
  //
  // Conversation memory ("remember your chats"): the SDK persists the running
  // transcript under ~/.claude/projects (persistSession), keyed by cwd + a
  // session id. On the FIRST drive we let the SDK mint that id and capture it
  // back through ctx.onRuntimeSession so GTM IDE stores it on the durable
  // teammate session. On every LATER drive — after a founder wall, founder
  // input, an iteration-budget pause, or a full process restart — we `resume`
  // that same id and send only the new instruction (ctx.resumePrompt: "the
  // founder approved the wall", etc.). The subprocess then continues the exact
  // conversation it was in instead of re-deriving context from cold. GTM IDE
  // still owns all durable state and the wall; this only restores the model's
  // working memory across the pauses GTM IDE itself imposes.
  async drive(ctx) {
    const harness = firmHarnessMode(ctx);
    const allowedTools = firmAllowedTools((ctx.tools ?? []).map((tool) => tool.name));
    const sdkServer = createFirmSdkServer(ctx);
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
      const abortFromHost = () => abortController.abort(ctx.signal?.reason);
      if (ctx.signal?.aborted) abortFromHost();
      else ctx.signal?.addEventListener?.("abort", abortFromHost, { once: true });
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
            cwd: ctx.cwd || process.cwd(),
            ...(ctx.model ? { model: ctx.model } : {}),
            // SEVERED from the teammate step budget (Wave 6). maxTurns is the MODEL's turns inside ONE
            // drive; it used to be `maxSteps - stepCount`, so late in a session the model got 1-2 turns
            // and hit "max turns (2)" before it could think — the leak the audit named. The teammate's
            // own cross-cycle throttle stays where it belongs (stepCount >= maxSteps in the runtime).
            // Here the model gets a generous fixed turn budget, with a HARD FLOOR of 8 on a resume so a
            // wall-resume drive always has room to re-draft. The real economic throttle is maxBudgetUsd
            // (session-total-aware, below) plus the silence watchdog — not a starved turn count.
            maxTurns: modelMaxTurns(ctx, resumeId != null),
            // Session-total-aware: each drive may spend up to the per-drive cap, but never past what is
            // left of the session's total budget (sessionBudgetUsd minus what prior drives already spent,
            // reported back via ctx.onCost). So a long multi-drive run is bounded by ONE real dollar cap
            // instead of an unbounded per-drive $5 each time.
            maxBudgetUsd: driveBudgetUsd(ctx),
            systemPrompt: harness === "full"
              ? {
                  type: "preset",
                  preset: "claude_code",
                  append: `${ctx.system}\n\nThis is a Drover teammate session inside the founder's full native Claude Code harness. Use the native tools, settings, skills, agents, plugins, and configured MCP servers normally. Use the added Drover MCP tools for Drover venture truth, durable work, and any Drover-owned outward staging. Those tools cannot approve, send, or publish on the founder's behalf; only the founder resolves a Drover wall. Native tools and integrations remain governed by the founder's own Claude Code policy.`,
                }
              : ctx.system,
            tools: harness === "full" ? { type: "preset", preset: "claude_code" } : [],
            allowedTools,
            permissionMode: harness === "full" ? "auto" : "dontAsk",
            strictMcpConfig: harness === "caged",
            // Omitting settingSources in full mode preserves Claude Code's normal CLI behavior:
            // user, project, and local settings all load. Caged mode opts out explicitly.
            ...(harness === "caged" ? { settingSources: [] } : {}),
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
          // yielded. Check every message so the wall reached by the bridge stops
          // the resident teammate before another model turn can cross it.
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
      } catch (error) {
        if (ctx.isCancelled() || ctx.signal?.aborted) return { kind: "cancelled" };
        const detail = conciseProcessError(stderr.join(""));
        if (!detail) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${message}: ${detail}`, { cause: error });
      } finally {
        clearTimeout(timeout);
        ctx.signal?.removeEventListener?.("abort", abortFromHost);
      }

      if (!terminalResult) {
        if (abortController.signal.aborted) return { kind: "budget" };
        throw new Error(stderr.join("").trim().slice(-2_000) || "Claude Code ended without a result.");
      }
      // Report this drive's real dollar cost back so the session can track cumulative spend and make the
      // NEXT drive's budget session-total-aware. Best-effort: any SDK that omits the field reports 0.
      const driveCost = Number(terminalResult.total_cost_usd ?? terminalResult.cost_usd ?? 0) || 0;
      if (driveCost > 0 && typeof ctx.onCost === "function") {
        try { ctx.onCost(driveCost); } catch { /* a cost-report error never breaks the run */ }
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
        ctx.onText?.("Previous conversation memory was unavailable, so the teammate is starting a fresh pass and re-inspecting from the goal.");
        return await attempt(null);
      }
      throw error;
    }
  },
};
