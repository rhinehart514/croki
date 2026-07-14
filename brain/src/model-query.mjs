import { query as agentQuery } from "@anthropic-ai/claude-agent-sdk";

export const DEFAULT_READ_TOOLS = ["Read", "Glob", "Grep"];

function jsonCandidates(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const candidates = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) candidates.push(text.slice(arrayStart, arrayEnd + 1));
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) candidates.push(text.slice(objectStart, objectEnd + 1));
  candidates.push(text.trim());
  return candidates;
}

export function parseAgentItems(text) {
  for (const candidate of jsonCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") {
        const array = Object.values(parsed).find(Array.isArray);
        if (array) return array;
        if (Object.keys(parsed).length) return [parsed];
      }
    } catch {
      // Try the next candidate.
    }
  }
  return [];
}

export function parseAgentObject(text) {
  for (const candidate of jsonCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function classifyResultError(message) {
  const detail = typeof message?.result === "string" ? message.result.trim() : "";
  if (/session limit|usage limit|rate limit|reset/i.test(detail)) {
    return { kind: "limit", retriable: true, message: detail || "The model usage limit was reached." };
  }
  if (message?.subtype === "error_max_turns") {
    return { kind: "max_turns", retriable: true, message: "The model reached its turn budget before finishing." };
  }
  if (message?.subtype === "error_max_budget_usd") {
    return { kind: "max_budget", retriable: true, message: "The model reached its cost budget before finishing." };
  }
  return { kind: "error", retriable: false, message: detail || "The model returned an error." };
}

function classifyThrownError(error) {
  const detail = error instanceof Error ? error.message : String(error ?? "");
  if (/overloaded|\b5\d{2}\b|service unavailable|too many requests|529/i.test(detail)) {
    return { kind: "model_error", retriable: true, message: detail };
  }
  if (/session limit|usage limit|rate limit|reset|quota/i.test(detail)) {
    return { kind: "limit", retriable: true, message: detail };
  }
  if (/ECONN|ENOTFOUND|fetch failed|socket|EAI_AGAIN|network/i.test(detail)) {
    return { kind: "network", retriable: true, message: detail };
  }
  return { kind: "error", retriable: false, message: detail || "The model call failed." };
}

export async function runClaudeQuery({
  prompt,
  cwd = process.cwd(),
  model,
  maxTurns = 12,
  onText,
  allowedTools = DEFAULT_READ_TOOLS,
  mcpServers,
  canUseTool,
  env = process.env,
  allowApiKey = false,
} = {}) {
  const childEnv = { ...env, CLAUDE_AGENT_SDK_CLIENT_APP: "gtm-ide/0.3.0" };
  if (!allowApiKey) delete childEnv.ANTHROPIC_API_KEY;
  const stream = agentQuery({
    prompt,
    options: {
      cwd,
      ...(model ? { model } : {}),
      maxTurns,
      permissionMode: "dontAsk",
      allowedTools,
      ...(mcpServers ? { mcpServers } : {}),
      ...(typeof canUseTool === "function" ? { canUseTool } : {}),
      settingSources: [],
      persistSession: false,
      includePartialMessages: typeof onText === "function",
      env: childEnv,
    },
  });
  let text = "";
  let error = null;
  const toolCalls = new Set();
  const recordTool = (name) => {
    if (typeof name !== "string" || !name) return;
    toolCalls.add(name);
    if (name.includes("__")) toolCalls.add(name.slice(name.lastIndexOf("__") + 2));
  };
  try {
    for await (const message of stream) {
      if (message.type === "stream_event") {
        const event = message.event;
        if (event?.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
          try { onText?.(event.delta.text); } catch { /* Display callbacks cannot fail the task. */ }
        }
        if (event?.type === "content_block_start" && event.content_block?.type === "tool_use") recordTool(event.content_block.name);
        continue;
      }
      if (message.type === "assistant" && Array.isArray(message.message?.content)) {
        for (const block of message.message.content) if (block?.type === "tool_use") recordTool(block.name);
      }
      if (message.type !== "result") continue;
      if (typeof message.result === "string") text = message.result;
      if (message.is_error || message.subtype === "error_max_turns" || message.subtype === "error_max_budget_usd") {
        error = classifyResultError(message);
      }
    }
  } catch (thrown) {
    error = classifyThrownError(thrown);
  }
  return { text, error, toolCalls: [...toolCalls] };
}
