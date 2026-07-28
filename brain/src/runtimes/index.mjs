// Firm runtime registry + selector.
//
// A runtime is provider-neutral: it drives a teammate to its
// next pause and nothing more. The contract every adapter implements:
//
//   id        string         stable identifier recorded on the session
//   label     string         human label for events
//   isAvailable({ client?, env? }) -> { ok, reason?, path? }
//   async drive(ctx) -> { kind, summary? }
//       kind ∈ "completed" | "paused" | "cancelled" | "budget"
//
// `ctx` carries the goal/model/system/tools plus Croki-owned callbacks
// (isCancelled, currentStatus, onTurn, onText, onToolStart, onToolError,
// runTool, persistMessages). The runtime only calls those callbacks.
// That keeps persistence and safety on Croki's side of the line no
// matter which runtime (API, Claude Code subprocess, or a future Codex
// subprocess) is actually reasoning.

import { anthropicRuntime } from "./anthropic.mjs";
import { authModeLabel as claudeAuthModeLabel, claudeCodeRuntime } from "./claude-code.mjs";
import { codexAuthModeLabel, codexRuntime } from "./codex.mjs";
import { discoverNativeCapabilities, nativeCapabilities } from "./native-capabilities.mjs";

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
const DRIVE_PREFERENCE = [claudeCodeRuntime, codexRuntime, anthropicRuntime];
const FOUNDER_RUNTIME_CHOICES = [claudeCodeRuntime, codexRuntime];
const PRODUCT_CHANGE_PREFERENCE = [claudeCodeRuntime, codexRuntime];

export function getRuntime(id) {
  return REGISTRY[id] ?? null;
}

export function runtimeForModel(model) {
  if (typeof model !== "string") return null;
  if (/^gpt-/i.test(model)) return codexRuntime.id;
  if (/^claude-/i.test(model)) return claudeCodeRuntime.id;
  return null;
}

export function runtimeStatuses({ env = process.env, cwd = null, capabilityDeps = {} } = {}) {
  return FOUNDER_RUNTIME_CHOICES.map((adapter) => {
    const availability = adapter.isAvailable({ env });
    return {
      id: adapter.id,
      label: adapter.label,
      connected: availability.ok,
      auth: availability.ok ? availability.auth ?? null : null,
      authLabel: availability.ok ? authModeLabel(availability.auth) : null,
      reason: availability.ok ? null : availability.reason ?? "Not available.",
      abortSupported: adapter.supportsAbort === true,
      nativeFeatures: { ...(adapter.nativeFeatures ?? {}) },
      capabilities: nativeCapabilities(adapter.id, { cwd, env, ...capabilityDeps }),
    };
  });
}

export async function runtimeStatusesLive({ env = process.env, cwd = null, capabilityDeps = {} } = {}) {
  return Promise.all(runtimeStatuses({ env, cwd, capabilityDeps }).map(async (status) => ({
    ...status,
    capabilities: await discoverNativeCapabilities(status.id, { cwd, env, ...capabilityDeps }),
  })));
}

// Decide which runtime drives this session.
//   - An injected client (tests / custom transport) forces the Anthropic adapter.
//   - An injected adapter object is used as-is.
//   - GTM_IDE_FIRM_RUNTIME forces a named runtime.
//   - Otherwise: first available in PREFERENCE order.
// Returns { adapter, client?, auth?, reason? }. A null adapter carries an
// honest reason; `auth` names the credential mode the adapter will use.
export function selectRuntime({ client, runtime, forced, model, env = process.env, capability = "drive" } = {}) {
  if (client) return { adapter: anthropicRuntime, client, auth: "client" };
  if (runtime && typeof runtime[capability] === "function") return { adapter: runtime };

  const forcedId = forced || runtimeForModel(model) || env.GTM_IDE_FIRM_RUNTIME;
  if (forcedId) {
    const adapter = getRuntime(forcedId);
    if (!adapter) {
      return { adapter: null, reason: `Unknown Firm runtime "${forcedId}".` };
    }
    if (typeof adapter[capability] !== "function") {
      return { adapter: null, reason: `${adapter.label} does not support ${capability}.` };
    }
    const availability = adapter.isAvailable({ env });
    return availability.ok
      ? { adapter, auth: availability.auth }
      : { adapter: null, reason: `${adapter.label} is not available: ${availability.reason}` };
  }

  const reasons = [];
  const preference = capability === "runProductChange" ? PRODUCT_CHANGE_PREFERENCE : DRIVE_PREFERENCE;
  for (const adapter of preference) {
    const availability = adapter.isAvailable({ env });
    if (availability.ok) return { adapter, auth: availability.auth };
    reasons.push(`${adapter.label}: ${availability.reason}`);
  }
  return {
    adapter: null,
    reason: reasons.join(" "),
  };
}
