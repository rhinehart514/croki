// Codex app-server transport for rich interactive Runs.
//
// This module deliberately stops at the provider boundary. It owns the versioned JSONL protocol,
// native thread/turn lifecycle, and translation of Codex collaboration items into bounded facts.
// Croki's durable Run journal and UI decide how those facts are retained and projected.
import { spawn } from "node:child_process";
import { findCodexBinary } from "./codex-auth.mjs";
import { isVerificationCommand, notify } from "./codex-events.mjs";
import {
  buildCodexAppServerArgs,
  codexAppServerFileChanges,
  codexAppServerInput,
  codexAppServerUsage,
  createCodexNestedTaskProjection,
  decodeCodexAppServerNotification,
  parseCodexAppServerMessage,
} from "./codex-app-server-events.mjs";

export {
  buildCodexAppServerArgs,
  decodeCodexAppServerNotification,
  parseCodexAppServerMessage,
} from "./codex-app-server-events.mjs";

const APP_SERVER_CLIENT = Object.freeze({
  name: "croki",
  title: "Croki",
  version: "0.1.0",
});

function protocolError(message) {
  const detail = message?.error?.message || message?.message || "Codex app-server request failed.";
  const error = new Error(String(detail));
  error.code = message?.error?.code ?? null;
  return error;
}

export function createCodexAppServerClient({
  binary,
  args = ["app-server", "--listen", "stdio://"],
  cwd,
  env = process.env,
  spawnProcess = spawn,
  onNotification = null,
  onServerRequest = null,
  requestTimeoutMs = 30_000,
} = {}) {
  const child = spawnProcess(binary, args, {
    cwd,
    env: { ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map();
  let nextId = 1;
  let stdout = "";
  let stderr = "";
  let closed = false;
  let closing = false;
  let closeResult = null;
  let forceKill = null;
  let settleClosed;
  const closedPromise = new Promise((resolve) => { settleClosed = resolve; });

  const rejectPending = (error) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timeout);
      entry.reject(error);
    }
    pending.clear();
  };
  const send = (message) => {
    if (closed) throw new Error("Codex app-server is closed.");
    child.stdin?.write?.(`${JSON.stringify(message)}\n`);
  };
  const respondUnsupported = (message) => {
    send({
      id: message.id,
      error: { code: -32601, message: `Croki does not authorize server request: ${message.method}` },
    });
  };
  const receive = (line) => {
    const message = parseCodexAppServerMessage(line);
    if (!message) return;
    if (message.id !== undefined && !message.method) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timeout);
      if (message.error) entry.reject(protocolError(message));
      else entry.resolve(message.result);
      return;
    }
    if (message.id !== undefined && message.method) {
      if (typeof onServerRequest !== "function") {
        respondUnsupported(message);
        return;
      }
      Promise.resolve(onServerRequest(message)).then(
        (result) => send({ id: message.id, result: result ?? {} }),
        (error) => send({
          id: message.id,
          error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
        }),
      );
      return;
    }
    notify(onNotification, message);
  };
  child.stdout?.setEncoding?.("utf8");
  child.stdout?.on?.("data", (chunk) => {
    stdout += chunk;
    const lines = stdout.split("\n");
    stdout = lines.pop() ?? "";
    for (const line of lines) receive(line);
  });
  child.stderr?.setEncoding?.("utf8");
  child.stderr?.on?.("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-8_000);
  });
  child.on?.("error", (error) => {
    closeResult = error;
    rejectPending(error);
    settleClosed(error);
  });
  child.on?.("close", (code) => {
    if (stdout.trim()) receive(stdout);
    closed = true;
    if (forceKill) clearTimeout(forceKill);
    const detail = stderr.trim().slice(-2_000);
    closeResult ||= code === 0 ? null : new Error(detail || `Codex app-server exited with status ${code}.`);
    rejectPending(closeResult ?? new Error("Codex app-server closed."));
    settleClosed(closeResult);
  });

  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Codex app-server ${method} request timed out.`));
    }, requestTimeoutMs);
    pending.set(id, { resolve, reject, timeout });
    try { send({ method, id, params }); }
    catch (error) {
      pending.delete(id);
      clearTimeout(timeout);
      reject(error);
    }
  });
  const notifyServer = (method, params = {}) => send({ method, params });
  const initialize = async () => {
    const result = await request("initialize", {
      clientInfo: APP_SERVER_CLIENT,
      capabilities: {
        experimentalApi: false,
        requestAttestation: false,
      },
    });
    notifyServer("initialized", {});
    return result;
  };
  const close = () => {
    if (closed || closing) return;
    closing = true;
    child.kill?.("SIGTERM");
    forceKill = setTimeout(() => child.kill?.("SIGKILL"), 2_000);
    forceKill.unref?.();
  };

  return {
    child,
    request,
    notify: notifyServer,
    initialize,
    close,
    closedPromise,
    get closed() { return closed; },
    get error() { return closeResult; },
  };
}

export async function runCodexAppServerTurn({
  prompt,
  cwd,
  model = null,
  effort = null,
  resumeId = null,
  mcpUrl = null,
  nativeCoding = false,
  outputSchema = null,
  images = [],
  env = process.env,
  spawnProcess = spawn,
  timeoutMs = Number(env.GTM_IDE_CODEX_TIMEOUT_MS) || (nativeCoding ? 30 * 60_000 : 600_000),
  signal = null,
  isCancelled = () => false,
  onRuntimeSession = null,
  onTextDelta = null,
  onThinking = null,
  onToolStart = null,
  onToolResult = null,
  onCommand = null,
  onUsage = null,
  onNestedWork = null,
  onNestedTask = null,
  onControl = null,
} = {}) {
  const binary = findCodexBinary(env);
  if (!binary.ok) return { threadId: null, turnId: null, text: "", error: binary.reason };
  let client;
  let threadId = resumeId;
  let turnId = null;
  let terminal = null;
  let terminalError = "";
  const textItems = new Map();
  const textOrder = [];
  const streamed = new Map();
  const reasoningStarted = new Map();
  const childThreads = new Set();
  const nestedTasks = createCodexNestedTaskProjection({
    onNestedTask,
    getRootThreadId: () => threadId,
  });
  let settleTurn;
  const turnSettled = new Promise((resolve) => { settleTurn = resolve; });
  const wholeText = () => textOrder.map((id) => textItems.get(id)).filter(Boolean).join("\n\n");
  const parseStructuredOutput = () => {
    const terminalMessages = Array.isArray(terminal?.items)
      ? terminal.items
        .filter((item) => item?.type === "agentMessage")
        .map((item) => String(item.text ?? ""))
      : [];
    const observedMessages = textOrder.map((id) => String(textItems.get(id) ?? ""));
    const candidates = [...terminalMessages, ...observedMessages].reverse();
    // A single-message turn remains the common path. The joined fallback preserves compatibility
    // with older app-server builds that reported only deltas and no completed item.
    candidates.push(wholeText());
    for (const candidate of [...new Set(candidates)]) {
      const trimmed = candidate.trim();
      if (!trimmed) continue;
      const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      try {
        return JSON.parse(fenced ? fenced[1] : trimmed);
      } catch {
        // A turn may contain an earlier progress message before its schema-constrained final item.
        // Keep looking, but never extract an arbitrary embedded object from prose.
      }
    }
    return null;
  };
  const appendText = (id, delta) => {
    const key = id ?? "anonymous";
    if (!textItems.has(key)) textOrder.push(key);
    textItems.set(key, `${textItems.get(key) ?? ""}${delta}`);
    streamed.set(key, `${streamed.get(key) ?? ""}${delta}`);
    if (!outputSchema) notify(onTextDelta, delta);
  };
  const completeText = (item) => {
    const key = item.id ?? "anonymous";
    if (!textItems.has(key)) textOrder.push(key);
    const complete = String(item.text ?? "");
    const visible = streamed.get(key) ?? "";
    if (complete.startsWith(visible)) {
      const tail = complete.slice(visible.length);
      if (tail && !outputSchema) notify(onTextDelta, tail);
    }
    textItems.set(key, complete);
    streamed.set(key, complete);
  };
  const handleNotification = (message) => {
    const { method, params = {} } = message;
    const item = params.item ?? {};
    for (const event of decodeCodexAppServerNotification(message)) {
      if (event.type === "nested-work") {
        for (const child of event.children ?? []) if (child.id) childThreads.add(child.id);
        if (event.action === "agent" && event.id) childThreads.add(event.id);
        notify(onNestedWork, event);
        nestedTasks.dispatch(event);
      } else if (event.type === "session-status" && childThreads.has(event.id)) {
        const nested = { ...event, type: "nested-work", action: "status" };
        notify(onNestedWork, nested);
        nestedTasks.dispatch(nested);
      }
    }
    if (method === "item/agentMessage/delta" && params.delta) appendText(params.itemId, String(params.delta));
    if (method === "item/started" && item.type === "reasoning") {
      reasoningStarted.set(item.id, Number(params.startedAtMs) || Date.now());
      notify(onThinking, { state: "start" });
    }
    if (method === "item/completed" && item.type === "reasoning") {
      const startedAt = reasoningStarted.get(item.id);
      reasoningStarted.delete(item.id);
      if (!startedAt) notify(onThinking, { state: "start" });
      notify(onThinking, {
        state: "stop",
        ...(startedAt ? { durationMs: Math.max(0, (Number(params.completedAtMs) || Date.now()) - startedAt) } : {}),
      });
    }
    if (method === "item/completed" && item.type === "agentMessage") completeText(item);
    if (method === "item/started" && item.type === "commandExecution") {
      notify(onToolStart, "command", { summary: item.command ? `Running ${item.command}` : "Running a command" });
    }
    if (method === "item/completed" && item.type === "commandExecution") {
      notify(onCommand, {
        id: item.id ?? null,
        command: item.command ?? "Command",
        status: item.status === "completed" && item.exitCode === 0 ? "passed" : "failed",
        exitCode: Number.isInteger(item.exitCode) ? item.exitCode : null,
        startedAt: null,
        completedAt: new Date().toISOString(),
        output: String(item.aggregatedOutput ?? "").slice(-8_000),
        verification: isVerificationCommand(item.command),
      });
    }
    if (method === "item/completed" && item.type === "fileChange") {
      for (const result of codexAppServerFileChanges(item)) notify(onToolResult, result);
    }
    if (method === "thread/tokenUsage/updated") {
      const usage = codexAppServerUsage(params);
      if (usage) notify(onUsage, usage);
    }
    if (method === "error" && params.willRetry !== true) terminalError = String(params.error?.message || "Codex failed.");
    if (method === "turn/completed" && (!turnId || params.turn?.id === turnId)) {
      terminal = params.turn ?? { status: "failed", error: { message: terminalError || "Codex failed." } };
      nestedTasks.settleUnfinished();
      settleTurn();
    }
  };
  client = createCodexAppServerClient({
    binary: binary.path,
    args: buildCodexAppServerArgs({ mcpUrl, nativeCoding }),
    cwd,
    env,
    spawnProcess,
    onNotification: handleNotification,
  });
  let timeout;
  let cancelPoll;
  let stopGrace;
  let controlsOpen = false;
  const interrupt = async () => {
    if (!controlsOpen || !threadId || !turnId || client.closed) return false;
    try { await client.request("turn/interrupt", { threadId, turnId }); } catch { /* closure settles below */ }
    return true;
  };
  const requestStop = () => {
    void interrupt();
    if (!stopGrace) {
      stopGrace = setTimeout(() => client.close(), 2_000);
      stopGrace.unref?.();
    }
  };
  const abortFromHost = () => requestStop();
  try {
    await client.initialize();
    const threadParams = {
      ...(resumeId ? { threadId: resumeId } : {}),
      ...(model ? { model } : {}),
      cwd,
      ...(nativeCoding ? { approvalPolicy: "never", sandbox: "workspace-write" } : {}),
      ...(resumeId ? {} : { serviceName: "croki" }),
    };
    const thread = await client.request(resumeId ? "thread/resume" : "thread/start", threadParams);
    threadId = thread?.thread?.id ?? resumeId ?? null;
    if (!threadId) throw new Error("Codex app-server did not return a thread id.");
    notify(onRuntimeSession, threadId);
    const started = await client.request("turn/start", {
      threadId,
      input: codexAppServerInput(prompt, images),
      ...(effort ? { effort } : {}),
      ...(outputSchema ? { outputSchema } : {}),
    });
    turnId = started?.turn?.id ?? null;
    if (!turnId) throw new Error("Codex app-server did not return a turn id.");
    controlsOpen = true;
    notify(onControl, {
      threadId,
      turnId,
      steer: (text, attachments = []) => {
        if (!controlsOpen || client.closed || !String(text ?? "").trim()) return false;
        const paths = attachments.map((attachment) => attachment?.path).filter(Boolean);
        void client.request("turn/steer", {
          threadId,
          expectedTurnId: turnId,
          input: codexAppServerInput(text, paths),
        }).catch(() => {});
        return true;
      },
      interrupt,
    });
    timeout = setTimeout(() => {
      terminalError = "Codex reached the teammate time limit.";
      requestStop();
    }, Number(timeoutMs));
    cancelPoll = setInterval(() => {
      if (isCancelled()) requestStop();
    }, 100);
    cancelPoll.unref?.();
    if (signal?.aborted) abortFromHost();
    else signal?.addEventListener?.("abort", abortFromHost, { once: true });
    await Promise.race([turnSettled, client.closedPromise]);
    controlsOpen = false;
    if (!terminal && !terminalError) {
      terminalError = client.error?.message || "Codex app-server closed before the turn completed.";
    }
    const cancelled = signal?.aborted || isCancelled() || terminal?.status === "interrupted";
    let error = cancelled
      ? "cancelled"
      : terminalError || (terminal?.status === "failed" ? terminal?.error?.message || "Codex failed." : null);
    let structuredOutput = null;
    if (outputSchema && !error) {
      structuredOutput = parseStructuredOutput();
      if (structuredOutput == null) error = "Codex returned an invalid Canvas projection.";
    }
    return {
      threadId,
      turnId,
      text: wholeText(),
      structuredOutput,
      error,
    };
  } catch (error) {
    return {
      threadId,
      turnId,
      text: wholeText(),
      structuredOutput: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (timeout) clearTimeout(timeout);
    if (cancelPoll) clearInterval(cancelPoll);
    if (stopGrace) clearTimeout(stopGrace);
    signal?.removeEventListener?.("abort", abortFromHost);
    nestedTasks.settleUnfinished();
    controlsOpen = false;
    notify(onControl, null);
    client?.close();
  }
}
