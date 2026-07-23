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

import {
  createSdkMcpServer,
  query as agentQuery,
  tool as sdkTool,
} from "@anthropic-ai/claude-agent-sdk";
import { runClaudeQuery } from "../model-query.mjs";
import { z } from "zod";
import {
  authModeLabel,
  detectClaudeAuth,
  findClaudeBinary,
  hasStoredClaudeLogin,
} from "./claude-code-auth.mjs";
import { createPartialDispatch, createPromptQueue, liveRunHandle, parseStreamLine, reportDriveUsage, sdkUserMessage } from "./claude-stream.mjs";

export {
  authModeLabel,
  detectClaudeAuth,
  findClaudeBinary,
  hasStoredClaudeLogin,
} from "./claude-code-auth.mjs";
export { parseStreamLine } from "./claude-stream.mjs";

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

export async function nativeCodingPermission(toolName, input = {}) {
  const command = String(input?.command ?? "");
  if (toolName === "Bash" && /(^|[;&|]\s*|\bgit\s+)(commit|push|merge|rebase\b|reset\s+--hard)|\bgh\s+pr\s+(create|merge)|\b(vercel|npm)\s+(deploy|publish)\b/i.test(command)) {
    return { behavior: "deny", message: "Drover keeps commit, merge, push, PR creation, deploy, and destructive restoration behind the founder's exact consequence controls." };
  }
  return { behavior: "allow", updatedInput: input };
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
    const childEnv = { ...(ctx.env ?? process.env), CLAUDE_AGENT_SDK_CLIENT_APP: "gtm-ide/0.3.0" };
    if (auth.mode === "oauth-token" || auth.mode === "oauth-login") {
      delete childEnv.ANTHROPIC_API_KEY;
    }

    // One pass over the SDK. resumeId !== null means "continue the stored
    // conversation"; null means "start a fresh one from the goal".
    //
    // The prompt is a long-lived per-run queue, not a one-shot message (T3 Code run architecture,
    // ported off Effect). The SDK keeps ONE agent loop alive while the queue is open, so a founder
    // steer pushed through the live-run handle joins the SAME turn instead of restarting it. The
    // queue closes when the turn's terminal result lands with nothing further queued; a steer the
    // SDK already pulled keeps the stream alive past that close and lands its own result.
    const attempt = async (resumeId) => {
      const abortController = new AbortController();
      const queue = createPromptQueue();
      let sdkStream = null;
      let graceTimer = null;
      const hardAbort = () => abortController.abort(ctx.signal?.reason);
      // The founder's stop path: try the SDK's graceful interrupt() first so the turn winds down and
      // the transcript persists, then hard-abort if the stream does not end within the grace window.
      const abortFromHost = () => {
        queue.close();
        let interrupted = null;
        try { interrupted = sdkStream?.interrupt?.(); } catch { /* fall through to the hard abort */ }
        if (interrupted?.catch) {
          interrupted.catch(hardAbort);
          graceTimer = setTimeout(hardAbort, Number(process.env.GTM_IDE_CLAUDE_CODE_INTERRUPT_GRACE_MS) || 2_000);
          graceTimer.unref?.();
        } else {
          hardAbort();
        }
      };
      if (ctx.signal?.aborted) hardAbort();
      else ctx.signal?.addEventListener?.("abort", abortFromHost, { once: true });
      const timeoutMs = Number(process.env.GTM_IDE_CLAUDE_CODE_TIMEOUT_MS) || 600_000;
      const timeout = setTimeout(() => abortController.abort(), timeoutMs);
      const stderr = [];
      let terminalResult = null;
      let captured = false;
      const pendingCommands = new Map();
      const promptText = resumeId
        ? (ctx.resumePrompt || "Continue from where you left off.")
        : ctx.goal;
      queue.push(sdkUserMessage(promptText, ctx.attachments ?? []));
      const dispatchPartial = createPartialDispatch(ctx);

      try {
        const stream = runQuery({
          prompt: queue,
          options: {
            abortController,
            cwd: ctx.cwd || process.cwd(),
            ...(ctx.model ? { model: ctx.model } : {}),
            // Founder-selected reasoning effort. The Claude Agent SDK takes it as a top-level query option
            // (low/medium/high, default high); omitting it leaves the SDK on its own default, so an unset
            // choice is byte-identical to the prior behavior.
            ...(ctx.effort ? { effort: ctx.effort } : {}),
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
                  append: `${ctx.system}\n\nThis is a Drover teammate session inside the founder's full native Claude Code harness. Use the native tools, settings, skills, agents, plugins, and configured MCP servers normally. Use the added Drover MCP tools for Drover venture truth, durable work, and any Drover-owned outward staging. Those tools cannot approve, send, or publish on the founder's behalf; only the founder resolves a Drover wall.${ctx.nativeCoding ? " You are in a Drover-owned isolated worktree. Implement and verify here, but do not commit, merge, push, create a pull request, deploy, or apply changes elsewhere; Drover presents those consequences to the founder." : " Native tools and integrations remain governed by the founder's own Claude Code policy."}`,
                }
              : ctx.system,
            tools: harness === "full" ? { type: "preset", preset: "claude_code" } : [],
            allowedTools,
            permissionMode: harness === "full" ? "auto" : "dontAsk",
            ...(ctx.canUseTool || ctx.nativeCoding ? { canUseTool: ctx.canUseTool ?? nativeCodingPermission } : {}),
            strictMcpConfig: harness === "caged",
            // Omitting settingSources in full mode preserves Claude Code's normal CLI behavior:
            // user, project, and local settings all load. Caged mode opts out explicitly.
            ...(harness === "caged" ? { settingSources: [] } : {}),
            // Partial streaming: content_block_delta text and input_json_delta tool arguments
            // surface through ctx.onTextDelta / ctx.onToolInputDelta as the model forms them.
            includePartialMessages: true,
            // Persist the transcript so a later drive can resume it. This is the
            // founder's local Claude session store — the local-harness contract.
            persistSession: true,
            ...(resumeId ? { resume: resumeId } : {}),
            // The resume cursor's second half: the last assistant message uuid this thread already
            // holds. Resuming AT that message keeps the provider transcript exactly aligned with the
            // durable record; without a stored cursor the behavior is byte-identical to plain resume.
            ...(resumeId && ctx.resumeSessionAt ? { resumeSessionAt: ctx.resumeSessionAt } : {}),
            pathToClaudeCodeExecutable: ctx.env?.GTM_IDE_CLAUDE_CODE_PATH || undefined,
            env: childEnv,
            mcpServers: {
              [BRIDGE_SERVER]: sdkServer,
            },
            stderr: (line) => stderr.push(line),
          },
        });
        sdkStream = stream;
        // Live controls for the duration of this turn: steer (same-turn prompt-queue push),
        // interrupt, setModel, setPermissionMode. The host registers/unregisters it so a founder
        // message into this Thread can reach the run while it is genuinely live.
        ctx.onRunHandle?.(liveRunHandle({ queue, stream }));

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

          dispatchPartial(message);

          if (message.type === "assistant" && message.message?.content) {
            // The resume cursor's second half: remember the last assistant uuid so the next resume
            // can pin the provider transcript to exactly what this thread durably holds.
            if (typeof message.uuid === "string" && message.uuid) {
              ctx.onResumeCursor?.({ resumeSessionAt: message.uuid });
            }
            const parsed = parseStreamLine(JSON.stringify(message));
            if (parsed?.text) ctx.onText(parsed.text);
            if (parsed?.toolUses?.length) {
              ctx.onTurn();
              for (const tool of parsed.toolUses) {
                ctx.onToolStart?.(tool.name, { summary: tool.name === "Bash" && tool.input?.command ? `Running ${tool.input.command}` : `Using ${tool.name}` });
                if (tool.name === "Bash" && tool.id) pendingCommands.set(tool.id, { command: String(tool.input?.command ?? "Command"), startedAt: new Date().toISOString() });
              }
            }
          }

          if (message.type === "user" && Array.isArray(message.message?.content)) {
            for (const block of message.message.content.filter((entry) => entry?.type === "tool_result")) {
              const pending = pendingCommands.get(block.tool_use_id);
              if (!pending) continue;
              pendingCommands.delete(block.tool_use_id);
              const output = typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? "");
              ctx.onCommand?.({
                id: block.tool_use_id,
                command: pending.command,
                status: block.is_error ? "failed" : "passed",
                exitCode: block.is_error ? 1 : 0,
                startedAt: pending.startedAt,
                completedAt: new Date().toISOString(),
                output: output.slice(-8_000),
              });
            }
          }

          if (message.type === "result") {
            terminalResult = message;
            // The turn is answered. Close the long-lived queue so the agent loop can end — unless a
            // steer is still queued locally, in which case the SDK pulls it next and this turn
            // continues to its own terminal result.
            if (queue.size === 0) queue.close();
          }

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
        if (graceTimer) clearTimeout(graceTimer);
        queue.close();
        ctx.onRunHandle?.(null);
        ctx.signal?.removeEventListener?.("abort", abortFromHost);
      }

      if (ctx.isCancelled() || ctx.signal?.aborted) return { kind: "cancelled" };
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
      reportDriveUsage(ctx, terminalResult);
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
