// codex-events.mjs — JSONL exec decoding, shaping, and the narrow product-change door.
//
// Split out of codex.mjs when Codex reached the Claude adapter's live behaviour: the decoder plus the
// three shaping helpers around it (whole-turn text, thinking spans, measured usage) pushed that file
// past its service ceiling. codex.mjs keeps interactive process, MCP, and sandbox orchestration. This
// module owns the legacy JSONL wire format and the intentionally isolated product-change exec client
// that consumes it.
import { spawn } from "node:child_process";
import { findCodexBinary } from "./codex-auth.mjs";
//
// Shapes observed against codex-cli 0.145.0 (`codex exec --json`, 2026-07-23), not inferred:
//   {"type":"thread.started","thread_id":"019f…"}
//   {"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"…"}}
//   {"type":"item.started","item":{"id":"item_1","type":"file_change","changes":[{"path":"/abs/p","kind":"add"}],"status":"in_progress"}}
//   {"type":"turn.completed","usage":{"input_tokens":42741,"cached_input_tokens":13056,"cache_write_input_tokens":0,"output_tokens":209,"reasoning_output_tokens":52}}
// That client reports whole items, never text deltas: `item.updated` exists in its event enum but was
// emitted by none of the probe turns (prose, a two-file patch, a three-second command). Codex therefore
// streams per item, which is the finest grain the CLI offers — not the token-level grain the Claude SDK
// gives. The decoder still folds item.updated in, so a client that starts emitting it streams finer
// without another change here.

// Live callbacks run inside the child's stdout handler, where a host-side throw would take the whole
// turn down with it. Every live signal reports best-effort, exactly like Claude's usage report.
export function notify(callback, payload) {
  if (typeof callback !== "function") return;
  try { callback(payload); } catch { /* a presence-report error never breaks the run */ }
}

// A command receipt Croki marks as verification is the founder's proof the work was checked, not just
// run. The shapes stay conservative: only commands that are unambiguously a test/lint/build/typecheck.
export function isVerificationCommand(command) {
  const value = String(command ?? "");
  return /(?:^|[;&|]\s*|["'])(?:npm(?:\s+--prefix\s+\S+)?\s+(?:test|run\s+(?:test[^\s]*|lint|build|typecheck|check|verify[^\s]*))|node\s+--(?:test|check)|git\s+diff\s+--check|(?:npx\s+)?(?:tsc|vitest|eslint)\b)/i.test(value);
}

// One turn can contain several agent_message items — a preamble before the work and the real answer
// after it, both of which the founder is owed. This folds every snapshot into one whole-turn text and
// reports the not-yet-surfaced tail so the same prose can also stream live. Codex reports an item as a
// complete text, so a later snapshot of the SAME item replaces that item's part rather than appending.
export function createCodexTextStream() {
  const parts = new Map(); // agent_message item id -> the latest whole text Codex reported for it
  const order = [];
  let anonymous = 0;
  let streamed = "";
  const whole = () => order.map((key) => parts.get(key)).filter(Boolean).join("\n\n");
  return {
    get text() { return whole(); },
    push({ id = null, text = "" } = {}) {
      const chunk = String(text ?? "");
      if (chunk) {
        const key = id ?? `anonymous-${anonymous++}`;
        if (!parts.has(key)) order.push(key);
        parts.set(key, chunk);
      }
      const current = whole();
      // The normal case extends what was already streamed, so the delta is the exact tail. A revision
      // that rewrites earlier text cannot be expressed as a delta; it stays out of the live channel and
      // reaches the founder through the turn's completed text instead of corrupting the live one.
      if (!current.startsWith(streamed)) return { text: current, delta: "" };
      const delta = current.slice(streamed.length);
      streamed = current;
      return { text: current, delta };
    },
  };
}

// Reasoning is reported as a measured span and nothing else: Croki surfaces that Codex thought and for
// how long, never what it thought. When a stop arrives with no observed start (a client that reports
// only completed items), the span is still reported as start/stop so a host indicator stays balanced —
// but with no durationMs, because none was measured and none may be invented.
export function createCodexThinkingSpans({ now = Date.now } = {}) {
  const open = new Map(); // reasoning item id -> the instant Croki observed it begin
  const key = (id) => id ?? "anonymous";
  return {
    start(id) {
      open.set(key(id), now());
      return [{ state: "start" }];
    },
    stop(id) {
      const startedAt = open.get(key(id));
      open.delete(key(id));
      if (startedAt === undefined) return [{ state: "start" }, { state: "stop" }];
      return [{ state: "stop", durationMs: Math.max(0, now() - startedAt) }];
    },
  };
}

// Codex's usage block in Croki's provider-neutral field names. Nothing is fabricated: a field the
// client omitted reports zero, a turn with no measured tokens reports nothing at all, and
// reasoning_output_tokens is dropped because Codex already counts it inside output_tokens.
function measuredUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const measured = {
    inputTokens: Number(usage.input_tokens) || 0,
    outputTokens: Number(usage.output_tokens) || 0,
    cacheReadInputTokens: Number(usage.cached_input_tokens) || 0,
    cacheCreationInputTokens: Number(usage.cache_write_input_tokens) || 0,
  };
  return Object.values(measured).some((amount) => amount > 0) ? measured : null;
}

// Codex edits files through its own built-in patch tool, so a change Croki never asked for is real
// before any worktree diff runs. Each changed path becomes one settled tool result carrying the exact
// file it touched; an unnamed or unshaped change is dropped rather than guessed at.
export function codexFileChangeResults(event) {
  const status = event?.status === "failed" ? "failed" : "passed";
  return (Array.isArray(event?.changes) ? event.changes : [])
    .filter((change) => change?.path)
    .map((change) => ({
      toolUseId: event?.id ?? null,
      name: "apply_patch",
      target: String(change.path),
      status,
      detail: status === "failed" ? "Failed" : fileChangeDetail(change.kind),
      ...(status === "passed" ? { source: { path: String(change.path) } } : {}),
    }));
}

function fileChangeDetail(kind) {
  if (kind === "add") return "Added";
  if (kind === "delete") return "Deleted";
  if (kind === "update") return "Updated";
  return "Changed";
}

// JSONL events are decoded defensively: Codex emits stable thread/turn/item
// families while individual client versions add fields inside them. We retain
// only Croki-owned signals: thread id, readable text, patched files, measured
// reasoning spans, MCP tool activity, command receipts, token usage, and
// terminal errors.
export function parseCodexEvent(line) {
  let event;
  try { event = typeof line === "string" ? JSON.parse(line) : line; } catch { return null; }
  if (!event || typeof event !== "object") return null;
  const item = event.item ?? {};
  const itemType = typeof item.type === "string" ? item.type : "";
  const isItem = event.type === "item.started" || event.type === "item.updated" || event.type === "item.completed";
  if (event.type === "thread.started") {
    return { type: "thread", id: event.thread_id ?? event.thread?.id ?? null };
  }
  if ((event.type === "item.completed" || event.type === "item.updated") && itemType === "agent_message") {
    return { type: "text", id: item.id ?? null, text: item.text ?? item.content ?? "" };
  }
  if (isItem && itemType === "reasoning") {
    if (event.type === "item.started") return { type: "reasoning-start", id: item.id ?? null };
    if (event.type === "item.completed") return { type: "reasoning-stop", id: item.id ?? null };
    return null; // a mid-flight reasoning snapshot changes no span boundary, and its content stays internal
  }
  if (isItem && itemType === "file_change") {
    // Only the settled patch reports: the in_progress snapshot lists the same paths, and reporting both
    // would claim two edits where one happened.
    if (event.type !== "item.completed") return null;
    return {
      type: "file-change",
      id: item.id ?? null,
      status: item.status === "failed" ? "failed" : "passed",
      changes: (Array.isArray(item.changes) ? item.changes : []).map((change) => ({
        path: typeof change?.path === "string" ? change.path : null,
        kind: typeof change?.kind === "string" ? change.kind : null,
      })),
    };
  }
  if ((event.type === "item.started" || event.type === "item.completed") && /mcp.*tool|tool.*mcp/i.test(itemType)) {
    return { type: "tool", name: item.tool_name ?? item.name ?? item.tool?.name ?? null };
  }
  if ((event.type === "item.started" || event.type === "item.completed") && /command_execution/i.test(itemType)) {
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
    return { type: "completed", summary: event.summary ?? event.result ?? null, usage: measuredUsage(event.usage) };
  }
  return null;
}

// Product changes use the authenticated Codex binary through an intentionally tiny door: the
// isolated worktree is writable while shell, network, apps, hooks, and inherited config stay off.
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
    const messages = createCodexTextStream();
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
      if (event?.type === "text" && event.text) text = messages.push(event).text;
      if (event?.type === "completed" && event.summary) text ||= String(event.summary);
      if (event?.type === "error") terminalError = String(event.message || "Codex failed.");
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill?.("SIGTERM");
      // Settlement waits for the writer. A resistant child gets one bounded grace period.
      forceKill = setTimeout(() => child.kill?.("SIGKILL"), 2_000);
      forceKill.unref?.();
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

export const CODEX_NATIVE_FEATURES = Object.freeze({
  partialStreaming: true, nativeQuestions: true, nativeTools: true, sessionResume: true,
  sameTurnSteer: true, liveModelSwitch: false, livePermissionMode: false, nestedTasks: true,
});
