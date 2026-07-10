// Operator runtime registry + selector.
//
// A runtime is provider-neutral: it drives a durable operator session to its
// next pause and nothing more. The contract every adapter implements:
//
//   id        string         stable identifier recorded on the session
//   label     string         human label for events
//   isAvailable({ client?, env? }) -> { ok, reason?, path? }
//   async drive(ctx) -> { kind, summary? }
//       kind ∈ "completed" | "paused" | "cancelled" | "budget"
//
// `ctx` carries the goal/model/system/tools plus GTM-IDE-owned callbacks
// (isCancelled, currentStatus, onTurn, onText, onToolStart, onToolError,
// runTool, persistMessages). The runtime NEVER touches the session store, the
// run ledger, gates, or cancellation directly — it only calls those callbacks.
// That is what keeps persistence and safety on GTM IDE's side of the line no
// matter which runtime (API, Claude Code subprocess, or a future Codex
// subprocess) is actually reasoning.

import { anthropicRuntime } from "./anthropic.mjs";
import { authModeLabel as claudeAuthModeLabel, claudeCodeRuntime } from "./claude-code.mjs";
import { codexAuthModeLabel, codexRuntime } from "./codex.mjs";

export { anthropicRuntime, claudeCodeRuntime, codexRuntime };

export function authModeLabel(mode) {
  return claudeAuthModeLabel(mode) ?? codexAuthModeLabel(mode);
}

const REGISTRY = {
  [anthropicRuntime.id]: anthropicRuntime,
  [claudeCodeRuntime.id]: claudeCodeRuntime,
  [codexRuntime.id]: codexRuntime,
};

// Preference order when nothing is forced: the bundled Claude Code Agent SDK is
// subscription runtimes first, then the direct Anthropic API as a keyed
// fallback. A session bound through the model picker overrides this order.
const PREFERENCE = [claudeCodeRuntime, codexRuntime, anthropicRuntime];

export function getRuntime(id) {
  return REGISTRY[id] ?? null;
}

export function runtimeForModel(model) {
  if (typeof model !== "string") return null;
  if (/^gpt-/i.test(model)) return codexRuntime.id;
  if (/^claude-/i.test(model)) return claudeCodeRuntime.id;
  return null;
}

export function runtimeStatuses({ env = process.env } = {}) {
  return PREFERENCE.map((adapter) => {
    const availability = adapter.isAvailable({ env });
    return {
      id: adapter.id,
      label: adapter.label,
      connected: availability.ok,
      auth: availability.ok ? availability.auth ?? null : null,
      reason: availability.ok ? null : availability.reason ?? "Not available.",
    };
  });
}

// Decide which runtime drives this session.
//   - An injected client (tests / custom transport) forces the Anthropic adapter.
//   - An injected adapter object is used as-is.
//   - GTM_IDE_OPERATOR_RUNTIME (or session.runtime) forces a named runtime.
//   - Otherwise: first available in PREFERENCE order.
// Returns { adapter, client?, auth?, reason? }. A null adapter carries an
// honest reason; `auth` names the credential mode the adapter will use.
export function selectRuntime({ client, runtime, forced, model, env = process.env } = {}) {
  if (client) return { adapter: anthropicRuntime, client, auth: "client" };
  if (runtime && typeof runtime.drive === "function") return { adapter: runtime };

  const forcedId = forced || runtimeForModel(model) || env.GTM_IDE_OPERATOR_RUNTIME;
  if (forcedId) {
    const adapter = getRuntime(forcedId);
    if (!adapter) {
      return { adapter: null, reason: `Unknown operator runtime "${forcedId}".` };
    }
    const availability = adapter.isAvailable({ env });
    return availability.ok
      ? { adapter, auth: availability.auth }
      : { adapter: null, reason: `${adapter.label} is not available: ${availability.reason}` };
  }

  const reasons = [];
  for (const adapter of PREFERENCE) {
    const availability = adapter.isAvailable({ env });
    if (availability.ok) return { adapter, auth: availability.auth };
    reasons.push(`${adapter.label}: ${availability.reason}`);
  }
  return {
    adapter: null,
    reason: reasons.join(" "),
  };
}
