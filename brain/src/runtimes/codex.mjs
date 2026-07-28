// Codex CLI adapter for native resumable drives and isolated product changes. It inherits founder
// configuration and adds the current direction's screened Croki tools through a process-local MCP server.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { runCodexAppServerTurn as runCodexAppServerProtocolTurn } from "./codex-app-server.mjs";
import { findCodexBinary, hasCodexLogin } from "./codex-auth.mjs";
import {
  CODEX_NATIVE_FEATURES,
  codexFileChangeResults,
  createCodexTextStream,
  createCodexThinkingSpans,
  isVerificationCommand,
  notify,
  parseCodexEvent,
  runCodexProductChange,
} from "./codex-events.mjs";

export {
  codexAuthModeLabel,
  detectCodexAuth,
  findCodexBinary,
  hasCodexLogin,
} from "./codex-auth.mjs";

export {
  buildCodexProductChangeArgs,
  parseCodexEvent,
  runCodexProductChange,
} from "./codex-events.mjs";
export {
  buildCodexAppServerArgs,
  createCodexAppServerClient,
  decodeCodexAppServerNotification,
  parseCodexAppServerMessage,
} from "./codex-app-server.mjs";
export function buildCodexDriveArgs({ model, resumeId, mcpUrl, nativeCoding = false, effort = null, images = [], outputSchemaPath = null } = {}) {
  const common = [
    "--json",
    "--skip-git-repo-check",
    // Forward the founder-selected effort verbatim; omission preserves Codex's configured default.
    ...(effort ? ["-c", `model_reasoning_effort=${JSON.stringify(effort)}`] : []),
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
    ...(outputSchemaPath ? ["--output-schema", outputSchemaPath] : []),
    ...images.flatMap((image) => ["--image", image]),
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
// The loopback bridge uses an unguessable path and exposes only this direction's screened tools.
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
          instructions: "Use these tools for venture truth and Croki-managed work. They cannot authorize founder-held outward consequences.",
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
        sendMcpJson(res, 200, { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: `Unknown Croki tool: ${params?.name ?? "missing"}` }] } });
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
  if (ctx.directSdk) {
    return [
      ctx.system,
      "",
      "This is the founder's coding Thread inside the native Codex harness. Use your normal Codex configuration, project rules, tools, skills, apps, plugins, hooks, browser, and configured MCP servers.",
      (ctx.tools ?? []).length
        ? "Croki adds only the bounded tools exposed for this exact Thread and target. They grant no outward authority."
        : "",
      ctx.nativeCoding
        ? "You are in a Croki-owned isolated worktree. Implement and verify here. Do not commit, merge, push, create a pull request, deploy, or apply changes to another workspace; Croki presents those exact consequences to the founder."
        : "",
      "",
      `Founder's request: ${ctx.goal}`,
    ].filter(Boolean).join("\n");
  }
  return [
    ctx.system,
    "",
    "You are operating as a native Codex session inside Croki. Your normal Codex configuration,",
    "project rules, tools, skills, apps, plugins, hooks, browser, and MCP servers remain available.",
    "Croki adds a native MCP server named drover for venture truth, durable work, and founder-held",
    "consequences. Use those tools when work must attach to the venture. A Croki tool can prepare or",
    "park an outward consequence, but only the founder can authorize it.",
    ctx.nativeCoding
      ? "You are in a Croki-owned isolated worktree. Implement and verify here. Do not commit, merge, push, create a pull request, deploy, or apply changes to another workspace; Croki presents those exact consequences to the founder."
      : "",
    "",
    `Founder's outcome: ${ctx.goal}`,
  ].join("\n");
}

export async function runCodexDriveTurn({
  prompt,
  cwd,
  model,
  effort = null,
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
  images = [],
  onCommand = null,
  onRuntimeSession = null,
  onTextDelta = null,
  onToolResult = null,
  onThinking = null,
  onUsage = null,
  outputSchema = null,
} = {}) {
  const binary = findCodexBinary(env);
  if (!binary.ok) return { threadId: null, text: "", error: binary.reason };
  const bridge = tools.length && typeof runTool === "function"
    ? await startBridge({ tools, runTool, onToolStart, onToolError, onTurn, maxSteps })
    : null;
  const schemaDirectory = outputSchema
    ? fs.mkdtempSync(path.join(os.tmpdir(), "croki-canvas-output-"))
    : null;
  const outputSchemaPath = schemaDirectory ? path.join(schemaDirectory, "schema.json") : null;
  if (outputSchemaPath) fs.writeFileSync(outputSchemaPath, `${JSON.stringify(outputSchema)}\n`, "utf8");
  const args = buildCodexDriveArgs({
    model,
    resumeId,
    mcpUrl: bridge?.url,
    nativeCoding,
    effort,
    images,
    outputSchemaPath,
  });
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
    const messages = createCodexTextStream();
    const thinking = createCodexThinkingSpans();
    let text = "";
    let latestText = "";
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
      const settle = () => {
        if (schemaDirectory) fs.rmSync(schemaDirectory, { recursive: true, force: true });
        resolve(completed);
      };
      if (!bridge) settle();
      else bridge.close().then(settle, settle);
    };
    const consume = (line) => {
      const event = parseCodexEvent(line);
      if (event?.type === "thread" && event.id) {
        threadId = event.id;
        onRuntimeSession?.(event.id);
      }
      // A turn routinely reports several agent_message items — the preamble before the work and the
      // answer after it. Each one accumulates into the turn's text and streams its own tail live, so
      // nothing the founder was told is dropped and none of it waits for the turn to end.
      if (event?.type === "text" && event.text) {
        const fold = messages.push(event);
        text = fold.text;
        latestText = event.text;
        if (fold.delta && !outputSchema) notify(onTextDelta, fold.delta);
      }
      if (event?.type === "reasoning-start") for (const span of thinking.start(event.id)) notify(onThinking, span);
      if (event?.type === "reasoning-stop") for (const span of thinking.stop(event.id)) notify(onThinking, span);
      if (event?.type === "file-change") for (const result of codexFileChangeResults(event)) notify(onToolResult, result);
      if (event?.type === "completed" && event.summary) text ||= String(event.summary);
      if (event?.type === "completed" && event.usage) notify(onUsage, event.usage);
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
      else if (code === 0 && outputSchema) {
        try {
          finish({ threadId, text, structuredOutput: JSON.parse(latestText || text), error: null });
        } catch {
          finish({ threadId, text: "", structuredOutput: null, error: "Codex returned an invalid Canvas projection." });
        }
      }
      else if (code === 0) finish({ threadId, text, error: null });
      else finish({ threadId, text, error: stderr.trim().slice(-2_000) || `Codex exited with status ${code}.` });
    });
    child.stdin?.end?.(prompt);
  });
}

// The interactive app-server provider door reuses the exact screened MCP bridge and founder wall.
// Product changes keep their intentionally narrower exec door below.
export async function runCodexAppServerTurn({
  tools = [],
  runTool,
  onToolStart,
  onToolError,
  onTurn,
  maxSteps,
  startBridge = startCodexMcpBridge,
  ...input
} = {}) {
  const bridge = tools.length && typeof runTool === "function"
    ? await startBridge({ tools, runTool, onToolStart, onToolError, onTurn, maxSteps })
    : null;
  try {
    const result = await runCodexAppServerProtocolTurn({
      ...input,
      mcpUrl: bridge?.url ?? null,
      onToolStart,
    });
    return { ...result, terminal: bridge?.terminal() ?? null };
  } finally {
    if (bridge) await bridge.close();
  }
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
  nativeFeatures: CODEX_NATIVE_FEATURES,

  async runProductChange(input) {
    return runCodexProductChange(input);
  },

  async drive(ctx) {
    // Tests and explicit compatibility callers can still inject the JSONL exec turn. Native
    // interactive Work uses app-server so child threads, steering, and interrupt remain first-class.
    const runTurn = ctx.runCodexTurn ?? runCodexAppServerTurn;
    let resumeId = ctx.runtimeSessionId ?? null;
    let prompt = resumeId ? (ctx.resumePrompt || "Continue from where you left off.") : drivePrompt(ctx);
    let coldRetryAvailable = Boolean(resumeId) && ctx.exactResumeOnly !== true;

    while (true) {
      if (ctx.isCancelled()) return { kind: "cancelled" };
      if ((Number(ctx.stepCount) || 0) >= (Number(ctx.maxSteps) || 24)) return { kind: "budget" };

      const turn = await runTurn({
        prompt,
        cwd: ctx.cwd || process.cwd(),
        model: ctx.model,
        effort: ctx.effort ?? null,
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
        // The same live channel Claude pushes into: text as it arrives, settled patch edits, measured
        // thinking spans, and the turn's real token usage. Each is optional on the host side, so an
        // older seam simply receives nothing extra.
        onTextDelta: ctx.onTextDelta,
        onToolResult: ctx.onToolResult,
        onThinking: ctx.onThinking,
        onUsage: ctx.onUsage,
        onNestedTask: ctx.onNestedTask,
        onControl: ctx.onRunHandle,
        outputSchema: ctx.outputSchema ?? null,
        images: (ctx.attachments ?? []).map((attachment) => attachment.path),
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
      const summary = ctx.outputSchema
        ? String(turn.structuredOutput?.summary ?? "").trim() || "Canvas view prepared."
        : String(turn.text ?? "").trim() || "Codex finished the session.";
      if (!ctx.outputSchema) ctx.onText?.(summary);
      return {
        kind: "completed",
        summary,
        ...(ctx.outputSchema ? { structuredOutput: turn.structuredOutput ?? null } : {}),
      };
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
