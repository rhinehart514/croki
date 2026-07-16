// Codex CLI adapter for teammate drives and isolated product changes. Both doors use the founder's
// authenticated Codex subscription. Teammate drives get a read-only repository plus Drover's typed
// tool protocol; product changes get an isolated writable worktree. Neither door inherits apps,
// MCP servers, hooks, network, or approval authority.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const DRIVE_SCHEMA = fileURLToPath(new URL("./codex-drive.schema.json", import.meta.url));

export function findCodexBinary(env = process.env) {
  const override = env.GTM_IDE_CODEX_PATH;
  if (override) {
    return fs.existsSync(override)
      ? { ok: true, path: override }
      : { ok: false, reason: `GTM_IDE_CODEX_PATH does not exist: ${override}` };
  }
  const lookup = process.platform === "win32" ? "where" : "which";
  const found = spawnSync(lookup, ["codex"], { encoding: "utf8" });
  const resolved = found.status === 0 ? found.stdout.split("\n")[0].trim() : "";
  return resolved
    ? { ok: true, path: resolved }
    : { ok: false, reason: "The `codex` CLI was not found on PATH." };
}

// `codex login status` is the authoritative, redacted readiness probe. It
// exits zero for cached ChatGPT, access-token, or CLI API-key auth without
// ever printing a credential. `probe` keeps this pure in tests.
export function hasCodexLogin(env = process.env, probe) {
  if (typeof probe === "function") return probe(env);
  const binary = findCodexBinary(env);
  if (!binary.ok) return false;
  const result = spawnSync(binary.path, ["login", "status"], {
    encoding: "utf8",
    env,
    timeout: 5_000,
  });
  return result.status === 0;
}

export function detectCodexAuth(env = process.env, probe) {
  return hasCodexLogin(env, probe) ? { mode: "chatgpt-login" } : { mode: "none" };
}

export function codexAuthModeLabel(mode) {
  return mode === "chatgpt-login" ? "ChatGPT subscription" : null;
}

const CODEX_CAGED_CONFIG = [
  "-c", 'approval_policy="never"',
  "-c", "features.apps=false",
  "-c", "features.hooks=false",
  "-c", "features.plugin_sharing=false",
  "-c", "features.computer_use=false",
  "-c", "features.browser_use=false",
  "-c", "features.in_app_browser=false",
  "-c", "features.network_proxy.enabled=false",
];

export function buildCodexDriveArgs({ model, resumeId } = {}) {
  const common = [
    "--json",
    "--ignore-user-config",
    "--ignore-rules",
    "--strict-config",
    "--skip-git-repo-check",
    "--output-schema", DRIVE_SCHEMA,
    ...CODEX_CAGED_CONFIG,
    ...(model ? ["-m", model] : []),
  ];
  return resumeId
    ? ["exec", "resume", ...common, resumeId, "-"]
    : ["exec", ...common, "-s", "read-only", "-"];
}

export function parseCodexAction(text) {
  const raw = String(text ?? "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  for (const candidate of [fenced, raw]) {
    if (!candidate) continue;
    try {
      const action = JSON.parse(candidate);
      if (action?.type === "final" && typeof action.summary === "string") {
        return { type: "final", summary: action.summary.trim() };
      }
      if (action?.type === "tool" && typeof action.name === "string") {
        let input = action.input ?? {};
        if (typeof input === "string") {
          try { input = JSON.parse(input); } catch { return null; }
        }
        if (!input || typeof input !== "object" || Array.isArray(input)) return null;
        return { type: "tool", name: action.name, input };
      }
    } catch {
      // Try the unfenced candidate next.
    }
  }
  return null;
}

function drivePrompt(ctx) {
  const tools = (ctx.tools ?? []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  }));
  return [
    ctx.system,
    "",
    "You are operating through Codex inside Drover. The repository is read-only. Drover tools are",
    "invoked one at a time by returning the structured tool action required by the output schema.",
    "For a tool action, encode its arguments object as a JSON string in the input field.",
    "Use the tools to inspect truth and taste, fork genuinely different bets, and stage useful work.",
    "Anything outward must go through stage_outward and stop at the founder wall.",
    `Available Drover tools:\n${JSON.stringify(tools)}`,
    "",
    `Founder's outcome: ${ctx.goal}`,
  ].join("\n");
}

function toolResultPrompt(name, result) {
  return [
    `Drover completed ${name}.`,
    JSON.stringify(result),
    "Continue the same outcome. Return the next Drover tool action, or a final action when the useful",
    "work is complete. Do not claim an outward action happened; outward work can only wait at the wall.",
  ].join("\n");
}

export async function runCodexDriveTurn({
  prompt,
  cwd,
  model,
  resumeId,
  env = process.env,
  spawnProcess = spawn,
  timeoutMs = Number(env.GTM_IDE_CODEX_TIMEOUT_MS) || 600_000,
  isCancelled = () => false,
  signal = null,
} = {}) {
  const binary = findCodexBinary(env);
  if (!binary.ok) return { threadId: null, text: "", error: binary.reason };
  const args = buildCodexDriveArgs({ model, resumeId });
  return new Promise((resolve) => {
    const child = spawnProcess(binary.path, args, {
      cwd,
      env: { ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let threadId = resumeId ?? null;
    let text = "";
    let terminalError = "";
    let settled = false;
    let timedOut = false;
    let cancelled = false;
    let forceKill = null;
    const requestStop = (kind) => {
      if (kind === "cancelled") cancelled = true;
      child.kill?.("SIGTERM");
      if (!forceKill) {
        forceKill = setTimeout(() => child.kill?.("SIGKILL"), 2_000);
        forceKill.unref?.();
      }
    };
    const abortFromHost = () => requestStop("cancelled");
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(cancelPoll);
      if (forceKill) clearTimeout(forceKill);
      signal?.removeEventListener?.("abort", abortFromHost);
      resolve(result);
    };
    const consume = (line) => {
      const event = parseCodexEvent(line);
      if (event?.type === "thread" && event.id) threadId = event.id;
      if (event?.type === "text" && event.text) text = String(event.text);
      if (event?.type === "completed" && event.summary) text ||= String(event.summary);
      if (event?.type === "error") terminalError = String(event.message || "Codex failed.");
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      requestStop("timeout");
    }, timeoutMs);
    const cancelPoll = setInterval(() => {
      if (!isCancelled()) return;
      requestStop("cancelled");
    }, 100);
    cancelPoll.unref?.();
    if (signal?.aborted) abortFromHost();
    else signal?.addEventListener?.("abort", abortFromHost, { once: true });
    child.stdout?.setEncoding?.("utf8");
    child.stdout?.on?.("data", (chunk) => {
      stdout += chunk;
      const lines = stdout.split("\n");
      stdout = lines.pop() ?? "";
      for (const line of lines) consume(line);
    });
    child.stderr?.setEncoding?.("utf8");
    child.stderr?.on?.("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => finish({ threadId, text, error: error.message }));
    child.on("close", (code) => {
      if (stdout.trim()) consume(stdout);
      if (cancelled || signal?.aborted || isCancelled()) finish({ threadId, text, error: "cancelled" });
      else if (timedOut) finish({ threadId, text, error: "Codex reached the teammate time limit." });
      else if (terminalError) finish({ threadId, text, error: terminalError });
      else if (code === 0) finish({ threadId, text, error: null });
      else finish({ threadId, text, error: stderr.trim().slice(-2_000) || `Codex exited with status ${code}.` });
    });
    child.stdin?.end?.(prompt);
  });
}

// Product changes use the same authenticated Codex adapter but a different, intentionally
// tiny door from the teammate MCP runtime: the isolated worktree is writable, while shell,
// apps, network, inherited MCP servers, hooks, and approvals are disabled. Codex can use its
// built-in patch tool; it cannot execute generated code or reach an outward action.
export function buildCodexProductChangeArgs({ prompt, model }) {
  return [
    "exec",
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--strict-config",
    "-s", "workspace-write",
    "-c", 'approval_policy="never"',
    "-c", "features.shell_tool=false",
    "-c", "features.unified_exec=false",
    "-c", "features.apps=false",
    "-c", "features.hooks=false",
    "-c", "features.plugin_sharing=false",
    "-c", "features.computer_use=false",
    "-c", "features.browser_use=false",
    "-c", "features.in_app_browser=false",
    "-c", "features.network_proxy.enabled=false",
    ...(model ? ["-m", model] : []),
    prompt,
  ];
}

export async function runCodexProductChange({
  prompt,
  cwd,
  model,
  env = process.env,
  spawnProcess = spawn,
  timeoutMs = Number(env.GTM_IDE_CODEX_TIMEOUT_MS) || 600_000,
} = {}) {
  const binary = findCodexBinary(env);
  if (!binary.ok) return { text: "", error: { kind: "unavailable", message: binary.reason } };
  const args = buildCodexProductChangeArgs({ prompt, model });
  return new Promise((resolve) => {
    const child = spawnProcess(binary.path, args, {
      cwd,
      env: { ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let text = "";
    let terminalError = "";
    let settled = false;
    let timedOut = false;
    let forceKill = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKill) clearTimeout(forceKill);
      resolve(result);
    };
    const consume = (line) => {
      const event = parseCodexEvent(line);
      if (event?.type === "text" && event.text) text = String(event.text);
      if (event?.type === "completed" && event.summary) text ||= String(event.summary);
      if (event?.type === "error") terminalError = String(event.message || "Codex failed.");
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill?.("SIGTERM");
      // Do not hand the worktree back to feature-builder while the writer may still be alive.
      // A resistant child gets a bounded grace period, then SIGKILL; settlement happens on close.
      forceKill = setTimeout(() => child.kill?.("SIGKILL"), 2_000);
      if (typeof forceKill.unref === "function") forceKill.unref();
    }, timeoutMs);
    child.stdout?.setEncoding?.("utf8");
    child.stdout?.on?.("data", (chunk) => {
      stdout += chunk;
      const lines = stdout.split("\n");
      stdout = lines.pop() ?? "";
      for (const line of lines) consume(line);
    });
    child.stderr?.setEncoding?.("utf8");
    child.stderr?.on?.("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => finish({ text, error: { kind: "error", message: error.message } }));
    child.on("close", (code) => {
      if (stdout.trim()) consume(stdout);
      if (timedOut) finish({ text, error: { kind: "budget", message: "Codex reached the product-change time limit and was stopped before the worktree was inspected." } });
      else if (terminalError) finish({ text, error: { kind: "error", message: terminalError } });
      else if (code === 0) finish({ text, error: null });
      else finish({ text, error: { kind: "error", message: stderr.trim().slice(-2_000) || `Codex exited with status ${code}.` } });
    });
  });
}

// JSONL events are decoded defensively: Codex emits stable thread/turn/item
// families while individual client versions add fields inside them. We retain
// only Drover-owned signals: thread id, readable text, MCP tool activity, and
// terminal errors.
export function parseCodexEvent(line) {
  let event;
  try { event = typeof line === "string" ? JSON.parse(line) : line; } catch { return null; }
  if (!event || typeof event !== "object") return null;
  const item = event.item ?? {};
  if (event.type === "thread.started") {
    return { type: "thread", id: event.thread_id ?? event.thread?.id ?? null };
  }
  if (event.type === "item.completed" && item.type === "agent_message") {
    return { type: "text", text: item.text ?? item.content ?? "" };
  }
  if ((event.type === "item.started" || event.type === "item.completed") && /mcp.*tool|tool.*mcp/i.test(item.type ?? "")) {
    return { type: "tool", name: item.tool_name ?? item.name ?? item.tool?.name ?? null };
  }
  if (event.type === "turn.failed" || event.type === "error") {
    return { type: "error", message: event.error?.message ?? event.message ?? "Codex failed." };
  }
  if (event.type === "turn.completed") {
    return { type: "completed", summary: event.summary ?? event.result ?? null };
  }
  return null;
}

function unavailableReason(env, probe) {
  const binary = findCodexBinary(env);
  if (!binary.ok) return binary.reason;
  return hasCodexLogin(env, probe)
    ? null
    : "Codex is not signed in. Run `codex login` to use your ChatGPT subscription.";
}

export const codexRuntime = {
  id: "codex",
  label: "Codex",
  supportsAbort: true,

  async runProductChange(input) {
    return runCodexProductChange(input);
  },

  async drive(ctx) {
    const runTurn = ctx.runCodexTurn ?? runCodexDriveTurn;
    let resumeId = ctx.runtimeSessionId ?? null;
    let prompt = resumeId ? (ctx.resumePrompt || "Continue from where you left off.") : drivePrompt(ctx);
    let coldRetryAvailable = Boolean(resumeId);

    while (true) {
      if (ctx.isCancelled()) return { kind: "cancelled" };
      if ((Number(ctx.stepCount) || 0) >= (Number(ctx.maxSteps) || 24)) return { kind: "budget" };

      const turn = await runTurn({
        prompt,
        cwd: ctx.cwd || process.cwd(),
        model: ctx.model,
        resumeId,
        env: ctx.env ?? process.env,
        isCancelled: ctx.isCancelled,
        signal: ctx.signal,
      });
      if (turn.error === "cancelled") return { kind: "cancelled" };
      if (turn.error) {
        if (coldRetryAvailable && /session|thread|conversation|resume/i.test(turn.error)) {
          coldRetryAvailable = false;
          resumeId = null;
          prompt = drivePrompt(ctx);
          ctx.onText?.("Previous Codex conversation memory was unavailable, so the teammate is starting a fresh pass.");
          continue;
        }
        throw new Error(turn.error);
      }
      if (turn.threadId) {
        resumeId = turn.threadId;
        ctx.onRuntimeSession?.(turn.threadId);
      }

      const action = parseCodexAction(turn.text);
      if (!action) throw new Error("Codex finished without a valid Drover action.");
      if (action.type === "final") {
        if (action.summary) ctx.onText?.(action.summary);
        return { kind: "completed", summary: action.summary || "Codex finished the session." };
      }

      ctx.onToolStart(action.name);
      let result;
      let pause = false;
      try {
        const response = await ctx.runTool({
          id: `codex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: action.name,
          input: action.input ?? {},
        });
        result = response?.result;
        pause = response?.pause === true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.onToolError(action.name, message);
        result = { error: message };
      }
      const step = ctx.onTurn();
      if (pause) return { kind: "paused" };
      if (step >= ctx.maxSteps) return { kind: "budget" };
      prompt = toolResultPrompt(action.name, result);
    }
  },

  isAvailable({ env = process.env, probe } = {}) {
    if (env.GTM_IDE_DISABLE_CODEX) {
      return { ok: false, reason: "Codex runtime is disabled (GTM_IDE_DISABLE_CODEX)." };
    }
    const reason = unavailableReason(env, probe);
    return reason ? { ok: false, reason } : { ok: true, auth: "chatgpt-login" };
  },
};
