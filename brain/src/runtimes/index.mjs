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
import { authModeLabel, claudeCodeRuntime } from "./claude-code.mjs";

export { anthropicRuntime, claudeCodeRuntime, authModeLabel };

const REGISTRY = {
  [anthropicRuntime.id]: anthropicRuntime,
  [claudeCodeRuntime.id]: claudeCodeRuntime,
  // Codex is the planned optional third runtime. It would slot in here as a
  // sibling subprocess adapter (same drive contract) with no other changes.
};

// Preference order when nothing is forced: the bundled Claude Code Agent SDK is
// the preferred runtime (founder subscription, local harness), then the direct
// Anthropic API as the keyed fallback.
const PREFERENCE = [claudeCodeRuntime, anthropicRuntime];

export function getRuntime(id) {
  return REGISTRY[id] ?? null;
}

// Decide which runtime drives this session.
//   - An injected client (tests / custom transport) forces the Anthropic adapter.
//   - An injected adapter object is used as-is.
//   - GTM_IDE_OPERATOR_RUNTIME (or session.runtime) forces a named runtime.
//   - Otherwise: first available in PREFERENCE order.
// Returns { adapter, client?, auth?, reason? }. A null adapter carries an
// honest reason; `auth` names the credential mode the adapter will use.
export function selectRuntime({ client, runtime, forced, env = process.env } = {}) {
  if (client) return { adapter: anthropicRuntime, client, auth: "client" };
  if (runtime && typeof runtime.drive === "function") return { adapter: runtime };

  const forcedId = forced || env.GTM_IDE_OPERATOR_RUNTIME;
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
