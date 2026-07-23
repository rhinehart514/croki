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

// Surface partial streaming onto the host callbacks: content_block_delta text reaches
// ctx.onTextDelta as it forms, and input_json_delta partial tool arguments reach
// ctx.onToolInputDelta with the tool name and the JSON accumulated so far. Subagent partials
// (parent_tool_use_id set) stay internal, exactly as in the T3 source. Returns the per-attempt
// dispatcher because tool-block indexes are scoped to one SDK stream.
export function createPartialDispatch(ctx) {
  const toolBlocks = new Map(); // content block index -> { name, json }
  return (message) => {
    if (message?.type !== "stream_event" || message.parent_tool_use_id) return;
    const event = message.event;
    if (!event) return;
    if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
      toolBlocks.set(event.index, { name: event.content_block.name, json: "" });
      return;
    }
    if (event.type === "content_block_stop") {
      if (toolBlocks.delete(event.index)) ctx.onToolInputDelta?.(null, null);
      return;
    }
    if (event.type !== "content_block_delta") return;
    if (event.delta?.type === "text_delta" && event.delta.text) {
      ctx.onTextDelta?.(event.delta.text);
      return;
    }
    if (event.delta?.type === "input_json_delta" && typeof event.delta.partial_json === "string") {
      const tool = toolBlocks.get(event.index);
      if (!tool) return;
      tool.json += event.delta.partial_json;
      ctx.onToolInputDelta?.(tool.name, tool.json);
    }
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
