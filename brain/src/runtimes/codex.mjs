// Codex CLI adapter for teammate drives and isolated product changes. Both doors use the founder's
// authenticated Codex subscription. Teammate drives are native resumable Codex sessions: they inherit
// the founder's Codex configuration and receive the current direction's screened Drover tools as one
// additional process-local MCP server. Product changes remain a narrower isolated-worktree capability.

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";

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

export function buildCodexDriveArgs({ model, resumeId, mcpUrl, nativeCoding = false } = {}) {
  const common = [
    "--json",
    "--skip-git-repo-check",
    ...(nativeCoding ? [
      "-s", "workspace-write",
      "-c", 'approval_policy="never"',
      "-c", "sandbox_workspace_write.network_access=true",
      "-c", "features.network_proxy.enabled=true",
      "-c", 'features.network_proxy.domains={ "localhost" = "allow", "127.0.0.1" = "allow" }',
      "-c", "features.network_proxy.allow_local_binding=true",
      "-c", "features.network_proxy.allow_upstream_proxy=false",
    ] : []),
    ...(mcpUrl ? ["-c", `mcp_servers.drover.url=${JSON.stringify(mcpUrl)}`] : []),
    ...(model ? ["-m", model] : []),
  ];
  return resumeId
    ? ["exec", "resume", ...common, resumeId, "-"]
    : ["exec", ...common, "-"];
}

function sendMcpJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function readMcpBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

// Codex receives Drover as one additional native MCP server. The bridge is process-local, binds only to
// loopback on a random port, and uses an unguessable path. It exposes exactly the already-screened tools
// from the current direction; it grants no founder decision or outward executor.
export async function startCodexMcpBridge(ctx) {
  const toolMap = new Map((ctx.tools ?? []).map((tool) => [tool.name, tool]));
  let terminal = null;
  const token = crypto.randomBytes(24).toString("hex");
  const route = `/mcp/${token}`;
  const server = http.createServer(async (req, res) => {
    if (req.url !== route || req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    let message;
    try {
      message = await readMcpBody(req);
    } catch {
      sendMcpJson(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    const { id, method, params } = message;
    if (method === "notifications/initialized") {
      res.writeHead(202).end();
      return;
    }
    if (method === "initialize") {
      sendMcpJson(res, 200, {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? "2025-03-26",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "drover", version: "0.3.0" },
          instructions: "Use these tools for venture truth and Drover-managed work. They cannot authorize founder-held outward consequences.",
        },
      });
      return;
    }
    if (method === "tools/list") {
      sendMcpJson(res, 200, {
        jsonrpc: "2.0",
        id,
        result: { tools: [...toolMap.values()].map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.input_schema })) },
      });
      return;
    }
    if (method === "tools/call") {
      const tool = toolMap.get(params?.name);
      if (!tool) {
        sendMcpJson(res, 200, { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: `Unknown Drover tool: ${params?.name ?? "missing"}` }] } });
        return;
      }
      ctx.onToolStart?.(tool.name);
      try {
        const response = await ctx.runTool({
          id: `codex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: tool.name,
          input: params?.arguments ?? {},
        });
        const step = ctx.onTurn?.();
        if (response?.pause === true) terminal = "paused";
        else if (Number.isFinite(step) && step >= ctx.maxSteps) terminal = "budget";
        sendMcpJson(res, 200, { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(response?.result ?? null) }] } });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        ctx.onToolError?.(tool.name, detail);
        sendMcpJson(res, 200, { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: detail }] } });
      }
      return;
    }
    if (method === "ping") {
      sendMcpJson(res, 200, { jsonrpc: "2.0", id, result: {} });
      return;
    }
    sendMcpJson(res, 200, { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}${route}`,
    terminal: () => terminal,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function drivePrompt(ctx) {
  return [
    ctx.system,
    "",
    "You are operating as a native Codex session inside Drover. Your normal Codex configuration,",
    "project rules, tools, skills, apps, plugins, hooks, browser, and MCP servers remain available.",
    "Drover adds a native MCP server named drover for venture truth, durable work, and founder-held",
    "consequences. Use those tools when work must attach to the venture. A Drover tool can prepare or",
    "park an outward consequence, but only the founder can authorize it.",
    ctx.nativeCoding
      ? "You are in a Drover-owned isolated worktree. Implement and verify here. Do not commit, merge, push, create a pull request, deploy, or apply changes to another workspace; Drover presents those exact consequences to the founder."
      : "",
    "",
    `Founder's outcome: ${ctx.goal}`,
  ].join("\n");
}

function isVerificationCommand(command) {
  const value = String(command ?? "");
  return /(?:^|[;&|]\s*|["'])(?:npm(?:\s+--prefix\s+\S+)?\s+(?:test|run\s+(?:test[^\s]*|lint|build|typecheck|check|verify[^\s]*))|node\s+--(?:test|check)|git\s+diff\s+--check|(?:npx\s+)?(?:tsc|vitest|eslint)\b)/i.test(value);
}

export async function runCodexDriveTurn({
  prompt,
  cwd,
  model,
  resumeId,
  tools = [],
  runTool,
  onToolStart,
  onToolError,
  onTurn,
  maxSteps,
  env = process.env,
  spawnProcess = spawn,
  startBridge = startCodexMcpBridge,
  timeoutMs = null,
  isCancelled = () => false,
  signal = null,
  nativeCoding = false,
  onCommand = null,
  onRuntimeSession = null,
} = {}) {
  const binary = findCodexBinary(env);
  if (!binary.ok) return { threadId: null, text: "", error: binary.reason };
  const bridge = tools.length && typeof runTool === "function"
    ? await startBridge({ tools, runTool, onToolStart, onToolError, onTurn, maxSteps })
    : null;
  const args = buildCodexDriveArgs({ model, resumeId, mcpUrl: bridge?.url, nativeCoding });
  const effectiveTimeoutMs = Number(timeoutMs) || Number(env.GTM_IDE_CODEX_TIMEOUT_MS) || (nativeCoding ? 30 * 60_000 : 600_000);
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
      const completed = { ...result, terminal: bridge?.terminal() ?? null };
      if (!bridge) resolve(completed);
      else bridge.close().then(() => resolve(completed), () => resolve(completed));
    };
    const consume = (line) => {
      const event = parseCodexEvent(line);
      if (event?.type === "thread" && event.id) {
        threadId = event.id;
        onRuntimeSession?.(event.id);
      }
      if (event?.type === "text" && event.text) text = String(event.text);
      if (event?.type === "completed" && event.summary) text ||= String(event.summary);
      if (event?.type === "error") terminalError = String(event.message || "Codex failed.");
      if (event?.type === "command-start") onToolStart?.("command", { summary: event.command ? `Running ${event.command}` : "Running a command" });
      if (event?.type === "command-complete") onCommand?.({
        id: event.id ?? null,
        command: event.command ?? "Command",
        status: event.exitCode === 0 ? "passed" : "failed",
        exitCode: event.exitCode,
        startedAt: event.startedAt ?? null,
        completedAt: new Date().toISOString(),
        output: String(event.output ?? "").slice(-8_000),
        verification: isVerificationCommand(event.command),
      });
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      requestStop("timeout");
    }, effectiveTimeoutMs);
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
  if ((event.type === "item.started" || event.type === "item.completed") && /command_execution/i.test(item.type ?? "")) {
    return {
      type: event.type === "item.started" ? "command-start" : "command-complete",
      id: item.id ?? null,
      command: item.command ?? null,
      exitCode: Number.isInteger(item.exit_code) ? item.exit_code : (item.status === "completed" ? 0 : 1),
      output: item.aggregated_output ?? item.output ?? "",
    };
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
        tools: ctx.tools ?? [],
        runTool: ctx.runTool,
        onToolStart: ctx.onToolStart,
        onToolError: ctx.onToolError,
        onTurn: ctx.onTurn,
        maxSteps: ctx.maxSteps,
        env: ctx.env ?? process.env,
        isCancelled: ctx.isCancelled,
        signal: ctx.signal,
        nativeCoding: ctx.nativeCoding === true,
        onCommand: ctx.onCommand,
        onRuntimeSession: ctx.onRuntimeSession,
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
      if (turn.terminal === "paused") return { kind: "paused" };
      if (turn.terminal === "budget") return { kind: "budget" };
      const summary = String(turn.text ?? "").trim() || "Codex finished the session.";
      ctx.onText?.(summary);
      return { kind: "completed", summary };
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
