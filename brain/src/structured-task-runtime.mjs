// One-shot, provider-neutral rented intelligence.
//
// This adapter is deliberately separate from the durable operator runtime. It selects the
// same local subscription runtime, asks it for one read-only result, normalizes that result,
// and stops. It owns no prompts, records, decisions, graph state, gates, or outcomes.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseAgentItems, parseAgentObject, runClaudeQuery } from "./agent-bridge.mjs";
import { findCodexBinary } from "./runtimes/codex.mjs";
import { selectRuntime } from "./runtimes/index.mjs";

const OUTPUTS = new Set(["object", "items", "text"]);
const READ_ONLY_TOOLS = ["Read", "Glob", "Grep"];
const SAFETY_SUFFIX = `\n\nThis is a one-shot read. You may inspect repository files, but you may not write files, mutate Drover state, call external connectors, send, publish, deploy, charge, approve, or release a founder gate. Return only the requested result.`;

function emptyValue(output) {
  if (output === "items") return [];
  if (output === "text") return "";
  return null;
}

function safeError(kind = "provider_error", runtime = null) {
  const messages = {
    unavailable: "No local intelligence runtime is available for this read.",
    invalid_request: "Drover could not start this read because its request was invalid.",
    invalid_output: "The selected runtime returned a response Drover could not read.",
    limit: "The selected runtime reached its usage limit. Try the read again after the limit resets.",
    timeout: "The selected runtime did not finish this read in time.",
    provider_error: "The selected runtime could not complete this read.",
  };
  return { kind, message: messages[kind] ?? messages.provider_error, runtime, retriable: ["limit", "timeout", "provider_error"].includes(kind) };
}

function classifyProviderError(error) {
  const kind = String(error?.kind ?? "").toLowerCase();
  const message = String(error?.message ?? error ?? "").toLowerCase();
  if (kind.includes("limit") || /quota|usage limit|rate limit|session limit/.test(message)) return "limit";
  if (kind.includes("timeout") || /timed out|timeout/.test(message)) return "timeout";
  return "provider_error";
}

export function parseStructuredValue(text, output) {
  if (output === "text") return { ok: true, value: typeof text === "string" ? text : String(text ?? "") };
  if (output === "items") {
    const value = parseAgentItems(text);
    if (value.length || /^\s*(?:```(?:json)?\s*)?\[\s*\](?:\s*```)?\s*$/i.test(String(text ?? ""))) return { ok: true, value };
    return { ok: false, value: [] };
  }
  const value = parseAgentObject(text);
  return value ? { ok: true, value } : { ok: false, value: null };
}

export async function runClaudeStructuredTask({ prompt, cwd, model, maxTurns, onText } = {}) {
  return runClaudeQuery({ prompt, cwd, model, maxTurns, onText, allowedTools: READ_ONLY_TOOLS });
}

export async function runCodexStructuredTask({ prompt, cwd = process.cwd(), model, onText, env = process.env, spawnProcess = spawn } = {}) {
  const binary = findCodexBinary(env);
  if (!binary.ok) return { text: "", error: { kind: "unavailable" } };
  const outputFile = path.join(os.tmpdir(), `drover-structured-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  const args = [
    "exec", "--ephemeral", "--skip-git-repo-check",
    "--sandbox", "read-only", "--ask-for-approval", "never",
    "--output-last-message", outputFile,
    "--ignore-user-config",
    "-c", "features.apps=false",
    "-c", "features.network_proxy.enabled=false",
    ...(model ? ["--model", model] : []),
    "-",
  ];
  try {
    const result = await new Promise((resolve) => {
      const child = spawnProcess(binary.path, args, {
        cwd,
        env: { ...env, CODEX_CLI_CLIENT_APP: "gtm-ide/0.3.0" },
        stdio: ["pipe", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk) => { stderr += chunk; });
      child.on("error", (error) => resolve({ code: -1, error }));
      child.on("close", (code) => resolve({ code, stderr }));
      child.stdin.end(prompt);
    });
    if (result.code !== 0) return { text: "", error: { kind: /limit|quota|rate/i.test(result.stderr ?? "") ? "limit" : "provider_error" } };
    let text = "";
    try { text = fs.readFileSync(outputFile, "utf8"); } catch { return { text: "", error: { kind: "provider_error" } }; }
    if (typeof onText === "function" && text) {
      try { onText(text); } catch { /* presentation callbacks cannot fail the read */ }
    }
    return { text, error: null };
  } finally {
    try { fs.rmSync(outputFile, { force: true }); } catch { /* best effort */ }
  }
}

const DEFAULT_ADAPTERS = {
  "claude-code": runClaudeStructuredTask,
  codex: runCodexStructuredTask,
};

export function createStructuredTaskRunner({ adapters = DEFAULT_ADAPTERS, select = selectRuntime, env = process.env } = {}) {
  return async function runStructuredTask({ task, prompt, cwd = process.cwd(), model, output = "object", readOnly = true, maxTurns = 12, onText, runtime } = {}) {
    if (!OUTPUTS.has(output) || readOnly !== true || typeof prompt !== "string" || !prompt.trim()) {
      return { ok: false, value: emptyValue(output), runtime: null, model: model ?? null, error: safeError("invalid_request") };
    }
    const selected = select({
      ...(runtime && typeof runtime === "object" ? { runtime } : {}),
      ...(typeof runtime === "string" && runtime ? { forced: runtime } : {}),
      model,
      env,
    });
    const runtimeId = selected?.adapter?.id ?? null;
    if (!runtimeId) {
      return { ok: false, value: emptyValue(output), runtime: null, model: model ?? null, error: safeError("unavailable") };
    }
    const adapter = adapters[runtimeId];
    if (typeof adapter !== "function") {
      return { ok: false, value: emptyValue(output), runtime: runtimeId, model: model ?? null, error: safeError("unavailable", runtimeId) };
    }
    let raw;
    try {
      raw = await adapter({ task: String(task || "structured-read"), prompt: `${prompt}${SAFETY_SUFFIX}`, cwd, model, maxTurns, onText, env });
    } catch (error) {
      const kind = classifyProviderError(error);
      return { ok: false, value: emptyValue(output), runtime: runtimeId, model: model ?? null, error: safeError(kind, runtimeId) };
    }
    if (raw?.error) {
      const kind = classifyProviderError(raw.error);
      return { ok: false, value: emptyValue(output), runtime: runtimeId, model: model ?? null, error: safeError(kind, runtimeId) };
    }
    const parsed = parseStructuredValue(raw?.text ?? "", output);
    if (!parsed.ok) {
      return { ok: false, value: parsed.value, runtime: runtimeId, model: model ?? null, error: safeError("invalid_output", runtimeId) };
    }
    return { ok: true, value: parsed.value, runtime: runtimeId, model: model ?? null };
  };
}

export const runStructuredTask = createStructuredTaskRunner();
