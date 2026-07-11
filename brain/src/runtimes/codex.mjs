// Codex CLI operator runtime — a first-class local subscription runtime.
//
// The Codex process gets exactly one MCP server: the session-scoped Drover
// bridge. Shell tools, app connectors, and sandboxed networking are disabled
// for this invocation, so the model cannot work around the founder wall. The
// bridge itself has no approve/send/publish/deploy tools; every durable change
// and gate remains in the host process.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAUSE_STATUSES } from "./claude-code.mjs";

const OPERATOR_MCP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../operator-mcp.mjs");

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

export function codexDeveloperInstructions(system) {
  return `${system}\n\nYou are driving Drover through its session-scoped MCP tools. Use those typed Drover tools for every project, pipeline, graph, run, and completion action. Do not use shell, connectors, web search, or any external action. You cannot approve a founder gate, send, publish, deploy, charge, or write files. Stop when Drover reports that it has paused at a founder gate or needs founder input.`;
}

function tomlArray(values) {
  return `[${values.map((value) => JSON.stringify(value)).join(",")}]`;
}

function tomlInlineTable(entries) {
  return `{${Object.entries(entries)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
    .join(",")}}`;
}

// Pure command builder. The config hard-stops deliberately narrow Codex to
// Drover's safe MCP bridge: no shell, no apps, no network proxy, and no
// inherited user MCP configuration. This is a structural boundary, not a
// prompt-only request.
export function buildCodexArgs({
  model,
  system = "",
  mcpPath = OPERATOR_MCP,
  toolNames = [],
  sessionId,
  home,
  persistenceBackend,
  resumeId,
  prompt,
}) {
  // Codex deliberately gives MCP children an explicit environment rather than blindly inheriting the
  // CLI process environment. Put the bridge's session scope into the server config itself; setting these
  // only on the Codex child makes operator-mcp exit before it can answer `initialize`.
  const mcpEnv = tomlInlineTable({
    GTM_IDE_OPERATOR_SESSION: sessionId,
    GTM_IDE_HOME: home,
    GTM_IDE_PERSISTENCE: persistenceBackend,
  });
  const shared = [
    "--json",
    "--ignore-user-config",
    "-c", 'approval_policy="never"',
    "-c", 'sandbox_mode="read-only"',
    "-c", "features.shell_tool=false",
    "-c", "features.apps=false",
    "-c", "features.network_proxy.enabled=false",
    "-c", 'mcp_servers.gtm-operator.command="node"',
    "-c", `mcp_servers.gtm-operator.args=${tomlArray([mcpPath])}`,
    ...(mcpEnv === "{}" ? [] : ["-c", `mcp_servers.gtm-operator.env=${mcpEnv}`]),
    "-c", `mcp_servers.gtm-operator.enabled_tools=${tomlArray(toolNames)}`,
    // Non-interactive Codex runs otherwise turn every MCP approval prompt into an immediate
    // `user cancelled MCP tool call`. This server exposes only filterSafeTools(operatorTools), so it
    // contains no founder approval, send, publish, deploy, or charge capability and is safe to approve.
    "-c", 'mcp_servers.gtm-operator.default_tools_approval_mode="approve"',
    "-c", "mcp_servers.gtm-operator.required=true",
    "-c", `developer_instructions=${JSON.stringify(codexDeveloperInstructions(system))}`,
    ...(model ? ["-m", model] : []),
  ];
  return resumeId
    ? ["exec", "resume", ...shared, resumeId, prompt]
    : ["exec", ...shared, prompt];
}

// Product changes use the same authenticated Codex adapter but a different, intentionally
// tiny door from the operator MCP runtime: the isolated worktree is writable, while shell,
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

  async runProductChange(input) {
    return runCodexProductChange(input);
  },

  isAvailable({ env = process.env, probe } = {}) {
    if (env.GTM_IDE_DISABLE_CODEX) {
      return { ok: false, reason: "Codex runtime is disabled (GTM_IDE_DISABLE_CODEX)." };
    }
    const reason = unavailableReason(env, probe);
    return reason ? { ok: false, reason } : { ok: true, auth: "chatgpt-login" };
  },

  async drive(ctx) {
    const env = ctx.env ?? process.env;
    const binary = findCodexBinary(env);
    if (!binary.ok) throw new Error(binary.reason);
    const prompt = ctx.runtimeSessionId
      ? (ctx.resumePrompt || "Continue from where you left off.")
      : ctx.goal;
    const args = buildCodexArgs({
      model: ctx.model,
      system: ctx.system,
      toolNames: (ctx.tools ?? []).map((tool) => tool.name),
      sessionId: ctx.sessionId,
      home: ctx.options?.root,
      persistenceBackend: ctx.persistenceBackend,
      resumeId: ctx.runtimeSessionId || null,
      prompt,
    });
    const childEnv = {
      ...process.env,
      ...env,
      GTM_IDE_OPERATOR_SESSION: ctx.sessionId,
    };
    if (ctx.options?.root) childEnv.GTM_IDE_HOME = ctx.options.root;
    if (ctx.persistenceBackend) childEnv.GTM_IDE_PERSISTENCE = ctx.persistenceBackend;

    const run = ctx.spawn ?? spawn;
    return await new Promise((resolve, reject) => {
      const child = run(binary.path, args, {
        cwd: ctx.options?.cwd || process.cwd(),
        env: childEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let terminal = null;
      let killedForPause = false;
      let killedForCancel = false;
      let timedOut = false;
      const timeoutMs = Number(env.GTM_IDE_CODEX_TIMEOUT_MS) || 600_000;
      const stop = (kind) => {
        if (!child.killed) child.kill("SIGTERM");
        if (kind === "pause") killedForPause = true;
        if (kind === "cancel") killedForCancel = true;
      };
      const timeout = setTimeout(() => { timedOut = true; stop("timeout"); }, timeoutMs);
      const poll = setInterval(() => {
        if (ctx.isCancelled()) stop("cancel");
        else if (PAUSE_STATUSES.has(ctx.currentStatus())) stop("pause");
      }, 100);
      if (typeof poll.unref === "function") poll.unref();

      const handle = (line) => {
        const event = parseCodexEvent(line);
        if (!event) return;
        if (event.type === "thread" && event.id) ctx.onRuntimeSession?.(event.id);
        if (event.type === "text" && event.text) ctx.onText?.(String(event.text));
        if (event.type === "tool") {
          if (event.name) ctx.onToolStart?.(event.name);
          ctx.onTurn?.();
        }
        if (event.type === "error") terminal = { kind: "error", message: event.message };
        if (event.type === "completed") terminal = { kind: "completed", summary: event.summary };
        if (ctx.isCancelled()) stop("cancel");
        else if (PAUSE_STATUSES.has(ctx.currentStatus())) stop("pause");
      };

      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
        const lines = stdout.split("\n");
        stdout = lines.pop() ?? "";
        for (const line of lines) handle(line);
      });
      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk) => { stderr += chunk; });
      child.on("error", (error) => {
        clearTimeout(timeout); clearInterval(poll); reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timeout); clearInterval(poll);
        if (stdout.trim()) handle(stdout);
        if (ctx.isCancelled() || killedForCancel) return resolve({ kind: "cancelled" });
        if (PAUSE_STATUSES.has(ctx.currentStatus()) || killedForPause) return resolve({ kind: "paused" });
        if (timedOut) return resolve({ kind: "budget" });
        if (terminal?.kind === "error") return reject(new Error(terminal.message));
        if (code !== 0) return reject(new Error(stderr.trim().slice(-2_000) || `Codex exited with status ${code}.`));
        return resolve({ kind: "completed", summary: terminal?.summary || "Codex finished the session." });
      });
    });
  },
};
