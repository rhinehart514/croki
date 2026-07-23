// claude-stream.mjs — the streaming-input seam for the Claude Agent SDK runtime.
// Portions Copyright (c) 2026 T3 Tools Inc. Licensed under MIT (github.com/pingdotgg/t3code).
//
// claude-code.mjs used to hand query() a one-shot prompt, so a founder message that arrived while a
// run was live had nowhere to land except the durable next-resume queue. Ported from T3 Code's
// ClaudeAdapter run architecture (prompt queue + steering + partial streaming), stripped of Effect:
// the run now holds a long-lived prompt queue — query({ prompt: AsyncIterable<SDKUserMessage>,
// includePartialMessages: true, canUseTool }) — keeping ONE agent loop alive for the whole turn. A
// founder message pushed onto the queue continues the SAME turn; interrupt/setModel/setPermissionMode
// ride the SDK's own streaming-mode control requests. This module owns the plain-Node pieces: the
// queue, the SDKUserMessage builder, the live-run control handle, the partial-event dispatch, and the
// stream-json line parser the adapter loop reads assistant turns through.

import { imageUserContent } from "./image-input.mjs";

// An unbounded push queue exposed as the AsyncIterable the SDK consumes as its prompt. push() after
// close() returns false so a racing steer falls back to the durable queue instead of vanishing.
export function createPromptQueue() {
  const items = [];
  let closed = false;
  let wake = null;
  return {
    get size() { return items.length; },
    get closed() { return closed; },
    push(message) {
      if (closed) return false;
      items.push(message);
      wake?.();
      return true;
    },
    close() {
      closed = true;
      wake?.();
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (items.length) { yield items.shift(); continue; }
        if (closed) return;
        await new Promise((resolve) => { wake = resolve; });
        wake = null;
      }
    },
  };
}

// One streaming-input user message, with any founder images as native vision blocks.
export function sdkUserMessage(text, attachments = []) {
  return {
    type: "user",
    message: { role: "user", content: imageUserContent(String(text ?? ""), attachments) },
    parent_tool_use_id: null,
  };
}

// The live controls a running query exposes while its turn is open. steer() pushes onto this run's
// own prompt queue (same turn, no restart); the other three are the SDK's streaming-mode control
// requests. Every control is best-effort against a run that just finished.
export function liveRunHandle({ queue, stream }) {
  return {
    steer: (text, attachments = []) => queue.push(sdkUserMessage(text, attachments)),
    interrupt: async () => { await stream.interrupt?.(); },
    setModel: async (model) => { await stream.setModel?.(model || undefined); },
    setPermissionMode: async (mode) => { await stream.setPermissionMode?.(mode); },
  };
}

// One SDK content-block stream reduced to the neutral delta kinds Croki surfaces. The SAME reducer
// serves the main turn and every subagent turn, because a subagent emits the identical
// content_block_* events under its own parent_tool_use_id — only the destination differs. `emit`
// receives exactly one of:
//   { kind: "text", text }
//   { kind: "tool_input", name, partialJson }        (both null when the tool block closes)
//   { kind: "thinking", state: "start" | "stop", durationMs }
//
// Thinking is the deliberate asymmetry. thinking_delta and signature_delta content NEVER reaches
// `emit`, is never accumulated, and never leaves this function: the only facts that travel outward
// are that the model is thinking and, at the close, how long it thought by the wall clock. AGENTS.md
// forbids exposing hidden chain-of-thought or raw unshaped model prose as activity, so the
// containment lives here at the seam rather than in every consumer.
function createBlockDispatch(emit, now) {
  const toolBlocks = new Map(); // content block index -> { name, json }
  const thinkingBlocks = new Map(); // content block index -> wall-clock start (ms)
  // A thinking stream that started before this dispatcher saw its content_block_start still counts
  // as thinking; the first delta opens the span so a resumed or mid-stream attach still measures.
  const openThinking = (index) => {
    if (thinkingBlocks.has(index)) return;
    thinkingBlocks.set(index, now());
    emit({ kind: "thinking", state: "start", durationMs: 0 });
  };
  return (event) => {
    if (!event) return;
    if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
      toolBlocks.set(event.index, { name: event.content_block.name, json: "" });
      return;
    }
    if (event.type === "content_block_start" && event.content_block?.type === "thinking") {
      openThinking(event.index);
      return;
    }
    if (event.type === "content_block_stop") {
      if (toolBlocks.delete(event.index)) emit({ kind: "tool_input", name: null, partialJson: null });
      const startedAt = thinkingBlocks.get(event.index);
      if (startedAt != null) {
        thinkingBlocks.delete(event.index);
        emit({ kind: "thinking", state: "stop", durationMs: Math.max(0, now() - startedAt) });
      }
      return;
    }
    if (event.type !== "content_block_delta") return;
    if (event.delta?.type === "text_delta" && event.delta.text) {
      emit({ kind: "text", text: event.delta.text });
      return;
    }
    if (event.delta?.type === "thinking_delta" || event.delta?.type === "signature_delta") {
      openThinking(event.index); // the content of this delta is dropped here, on purpose
      return;
    }
    if (event.delta?.type === "input_json_delta" && typeof event.delta.partial_json === "string") {
      const tool = toolBlocks.get(event.index);
      if (!tool) return;
      tool.json += event.delta.partial_json;
      emit({ kind: "tool_input", name: tool.name, partialJson: tool.json });
    }
  };
}

// Surface partial streaming onto the host callbacks: content_block_delta text reaches
// ctx.onTextDelta as it forms, input_json_delta partial tool arguments reach ctx.onToolInputDelta
// with the tool name and the JSON accumulated so far, and a thinking block reaches ctx.onThinking as
// a start/stop span with its measured duration.
//
// Subagent partials (parent_tool_use_id set) used to be dropped, exactly as in the T3 source, so a
// Task fan-out looked like one flat line. They now reach ctx.onChildDelta keyed by that id, which
// keeps a child's stream attributable to the parent tool call that spawned it. They deliberately do
// NOT flatten into onTextDelta: a child's prose is not the reply, and merging it would corrupt the
// transcript. Every new callback is optional — an older host simply receives nothing extra.
//
// Returns the per-attempt dispatcher because content-block indexes are scoped to one SDK stream, and
// each subagent gets its own reducer for the same reason.
export function createPartialDispatch(ctx, { now = Date.now } = {}) {
  const main = createBlockDispatch((delta) => {
    if (delta.kind === "text") ctx.onTextDelta?.(delta.text);
    else if (delta.kind === "tool_input") ctx.onToolInputDelta?.(delta.name, delta.partialJson);
    else ctx.onThinking?.({ state: delta.state, durationMs: delta.durationMs });
  }, now);
  const children = new Map(); // parent_tool_use_id -> that subagent's own block reducer
  return (message) => {
    if (message?.type !== "stream_event") return;
    const event = message.event;
    if (!event) return;
    const parentToolUseId = message.parent_tool_use_id;
    if (!parentToolUseId) {
      main(event);
      return;
    }
    let child = children.get(parentToolUseId);
    if (!child) {
      child = createBlockDispatch((delta) => ctx.onChildDelta?.({ parentToolUseId, delta }), now);
      children.set(parentToolUseId, child);
    }
    child(event);
  };
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
      .map((block) => ({ id: block.id ?? null, name: stripServer(block.name), nativeName: block.name, input: block.input ?? {} }));
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

// The native tools whose work earns a durable receipt, and where each one's real subject lives in
// its own input. Only Bash used to survive the adapter: every other call collapsed into "Using Read"
// and the input — the exact file path or pattern the founder actually wants to see — was discarded
// at the seam. A tool absent from this table still reports its start; it simply has no subject worth
// naming, so nothing is invented for it.
const TOOL_SUBJECTS = {
  Bash: { verb: "Running", of: (input) => input?.command },
  Read: { verb: "Reading", of: (input) => input?.file_path ?? input?.path },
  Edit: { verb: "Editing", of: (input) => input?.file_path ?? input?.path },
  Write: { verb: "Writing", of: (input) => input?.file_path ?? input?.path },
  Grep: { verb: "Searching for", of: (input) => input?.pattern },
  Glob: { verb: "Finding", of: (input) => input?.pattern },
};

// The exact subject of one tool call, or null when this tool has none. Kept verbatim — a Bash
// command receipt has always carried the founder's whole command, and the read projections bound
// what they display rather than the adapter lying about what ran.
export function toolTarget(tool) {
  const subject = TOOL_SUBJECTS[tool?.name];
  if (!subject) return null;
  const target = String(subject.of(tool?.input ?? {}) ?? "").trim();
  return target || null;
}

// The one-line activity label for a starting tool call: the tool's own verb against its real
// subject, falling back to the prior "Using {name}" when the tool names no subject.
export function toolSummary(tool) {
  const target = toolTarget(tool);
  return target ? `${TOOL_SUBJECTS[tool.name].verb} ${target}` : `Using ${tool?.name}`;
}

// TodoWrite carries the plan the model is keeping for itself. Croki projects it and stores nothing:
// it is a tool-result projection of the model's latest plan message, not a durable object and not a
// new founder-facing concept. Returns true when the call was the plan (so the caller skips the
// ordinary tool-start path — a plan update is not work the founder needs narrated as a tool).
export function reportTodoWrite(ctx, tool) {
  if (tool?.name !== "TodoWrite") return false;
  const todos = Array.isArray(tool.input?.todos) ? tool.input.todos : [];
  const items = todos
    .map((todo) => ({ content: String(todo?.content ?? "").trim(), status: String(todo?.status ?? "pending").trim() }))
    .filter((todo) => todo.content);
  if (items.length) ctx.onTodos?.(items);
  return true;
}

function firstLine(text, limit = 160) {
  const line = String(text ?? "").split("\n").map((entry) => entry.trim()).find(Boolean) ?? "";
  return line.slice(0, limit);
}

// One measured, factual line about what a tool call returned. Read reports the line count it
// actually returned; everything else reports the first line of its own output. Nothing is
// interpreted, and an empty result says so plainly rather than claiming success detail it lacks.
function resultDetail(name, text, isError) {
  if (isError) return firstLine(text) || "Failed";
  if (name === "Read") {
    const lines = String(text ?? "") ? String(text).split("\n").length : 0;
    return `${lines} ${lines === 1 ? "line" : "lines"}`;
  }
  return firstLine(text) || "No output";
}

// Report one settled tool call back to the host. Every tracked tool reaches ctx.onToolResult with
// its real target, status, and one-line detail; Bash additionally keeps its existing command receipt
// (ctx.onCommand) unchanged, because a command receipt carries the full output a founder inspects.
export function reportToolResult(ctx, pending, block) {
  const output = typeof block?.content === "string" ? block.content : JSON.stringify(block?.content ?? "");
  const status = block?.is_error ? "failed" : "passed";
  ctx.onToolResult?.({
    name: pending.name,
    target: pending.target,
    status,
    detail: resultDetail(pending.name, output, block?.is_error === true),
  });
  if (pending.name !== "Bash") return;
  ctx.onCommand?.({
    id: block.tool_use_id,
    command: pending.target || "Command",
    status,
    exitCode: block?.is_error ? 1 : 0,
    startedAt: pending.startedAt,
    completedAt: new Date().toISOString(),
    output: output.slice(-8_000),
  });
}

// Report the drive's real token usage from the SDK's terminal result message back through
// ctx.onUsage — the same best-effort contract as ctx.onCost. Nothing is fabricated: fields the
// SDK omitted simply do not report, and a result with no measured tokens reports nothing.
export function reportDriveUsage(ctx, terminalResult) {
  if (typeof ctx?.onUsage !== "function") return;
  const usage = terminalResult?.usage;
  if (!usage || typeof usage !== "object") return;
  const measured = {
    inputTokens: Number(usage.input_tokens) || 0,
    outputTokens: Number(usage.output_tokens) || 0,
    cacheReadInputTokens: Number(usage.cache_read_input_tokens) || 0,
    cacheCreationInputTokens: Number(usage.cache_creation_input_tokens) || 0,
  };
  if (!Object.values(measured).some((amount) => amount > 0)) return;
  try { ctx.onUsage(measured); } catch { /* a usage-report error never breaks the run */ }
}
