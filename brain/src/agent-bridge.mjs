// Real bridges for open workflow steps (P2).
//
// The host stays thin: it does not own the intelligence, it rents it. These are the two
// real dependencies a live run wires into the step runtime —
//
//   loadSkillGuidance   — read a skill's judgment from disk (deterministic, no model)
//   createClaudeAgentInvoker — invoke a subagent on the founder's Claude subscription
//
// liveStepRuntime() composes both into the runtime graph.mjs expects.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { query as agentQuery } from "@anthropic-ai/claude-agent-sdk";
import { createStepRuntime } from "./step-runners.mjs";
import { assembleContext } from "./context/assembler.mjs";
import { providersFromContext } from "./context/providers.mjs";

// ── Skill loader (real, deterministic) ───────────────────────────────────────
// Skills live in ~/.claude/skills/<ref>/SKILL.md. Returns the guidance text, or null
// when the skill isn't found — the step then reports applied:false honestly.
export function loadSkillGuidance(ref, { root } = {}) {
  if (!ref || typeof ref !== "string") return null;
  const base = root || path.join(os.homedir(), ".claude", "skills");
  const file = path.join(base, ref, "SKILL.md");
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

// ── Agent definition loader (real, deterministic) ────────────────────────────
// The symmetric twin of loadSkillGuidance. A born agent instance points at its definition via
// artifactPath; hand-authored subagents live at ~/.claude/agents/<ref>.md (the same file the UI
// editor writes). This reads whichever exists so the real doctrine + role drives the run, not just
// a "you are the <ref> agent" label. Resolution order:
//   1. an explicit, resolvable artifactPath (the instance's own definition)
//   2. ~/.claude/agents/<ref>.md
//   3. ~/.claude/agents/<ref>/AGENT.md
// Returns the markdown text, or null when nothing is found — the caller then runs the ref as a
// focused task exactly as before. Never throws on a missing file.
export function loadAgentDefinition(ref, { artifactPath, root } = {}) {
  const base = root || path.join(os.homedir(), ".claude", "agents");
  const candidates = [];
  if (artifactPath && typeof artifactPath === "string") {
    candidates.push(path.isAbsolute(artifactPath) ? artifactPath : path.resolve(artifactPath));
  }
  if (ref && typeof ref === "string") {
    candidates.push(path.join(base, `${ref}.md`));
    candidates.push(path.join(base, ref, "AGENT.md"));
  }
  for (const file of candidates) {
    try {
      const text = fs.readFileSync(file, "utf8");
      if (typeof text === "string" && text.trim()) return text;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

// ── Agent result parsing (pure, tested) ──────────────────────────────────────
// A subagent returns prose that should contain a JSON array of result items. Pull the
// array out whether it's fenced, inline, or the whole message. Returns [] when there is
// no parseable array rather than throwing — the caller decides what an empty result means.
export function parseAgentItems(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced) candidates.push(fenced[1].trim());
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));
  candidates.push(text.trim());
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // try the next candidate
    }
  }
  return [];
}

// Pull a JSON object out of model prose — fenced, inline, or the whole message. Returns null
// when there is no parseable object. The composer uses this for its { nodes, edges } graph.
export function parseAgentObject(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced) candidates.push(fenced[1].trim());
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));
  candidates.push(text.trim());
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

// Build the subagent prompt by ASSEMBLING context through the substrate instead of dumping the
// whole context object as raw JSON. Recognized grounding (product, taste, state, signal) becomes
// a clean, selected base-layer block; anything the substrate doesn't recognize (context-node
// output, __run) is passed through as JSON so no information is lost. Returns the manifest too, so
// the caller can attach it to the node result — that is the instrument the UI inspector reads.
export function buildAgentPrompt({ ref, prompt, items, context = {}, artifactPath, agentDefinitionRoot } = {}) {
  const input = JSON.stringify(items ?? [], null, 2);
  const assembled = assembleContext({ providers: providersFromContext(context), intent: prompt || "" });

  // eslint-disable-next-line no-unused-vars
  const { grounding, productModel, market, __memory, __state, signal, designState, ...rest } = context ?? {};
  const restJson = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : null;

  // Load the real on-disk definition if one exists. When found, the agent's own doctrine + role
  // drives the run; when not, we fall back to the original one-line label (identical to before),
  // so a missing definition is a pure no-op.
  const definition = loadAgentDefinition(ref, { artifactPath, root: agentDefinitionRoot });
  const role = definition
    ? `You are acting as the "${ref}" GTM subagent. Follow this agent definition:\n\n${definition.trim()}`
    : `You are doing the work of the "${ref}" GTM subagent.`;

  const text = [
    role,
    prompt ? `\nTask:\n${prompt}` : "",
    assembled.text ? `\nGrounded context:\n${assembled.text}` : "",
    restJson ? `\nAdditional workflow context (JSON):\n${restJson}` : "",
    `\nInput items (JSON):\n${input}`,
    `\nReturn ONLY a JSON array of result items — no prose, no preamble. Each item should be a JSON object. If you have nothing to return, return [].`,
  ].filter(Boolean).join("\n");

  return { prompt: text, manifest: assembled.manifest, definitionLoaded: !!definition };
}

// Classify a Claude Code error result so a quota or turn-budget cutoff stops masquerading as a
// product failure (or, worse, an empty success). The agent-step path used to swallow these:
// runClaudeQuery returned "" and the step looked like it "found nothing." Now the step fails
// loudly with a clear, retriable reason — which is what the real run ledger needed.
export function classifyAgentError(message) {
  const raw = typeof message?.result === "string" ? message.result : "";
  if (/session limit|usage limit|rate limit|reset/i.test(raw)) {
    return { kind: "limit", retriable: true, message: `Claude subscription limit reached: ${raw.trim()}. This is a quota limit, not a product failure — retry after it resets.` };
  }
  if (message?.subtype === "error_max_turns") {
    return { kind: "max_turns", retriable: true, message: "The agent hit its turn budget before finishing. Raise the step's maxTurns and retry." };
  }
  if (message?.subtype === "error_max_budget_usd") {
    return { kind: "max_budget", retriable: true, message: "The agent hit its cost budget before finishing." };
  }
  return { kind: "error", retriable: false, message: raw.trim() || "The agent returned an error result." };
}

// ── Agent invoker (live, OAuth-first subscription) ───────────────────────────
// Runs a focused, read-only subagent task headlessly on the founder's Claude Code
// subscription. OAuth-first: the API key is stripped from the child env so the run bills
// the subscription, not a key (the product invariant). It returns staged items only — it
// never sends, publishes, or crosses a gate; that wall stays in the host.
// The shared subscription call: run a read-only headless task on the founder's Claude Code
// subscription and return the raw result text. OAuth-first — the API key is stripped so the
// run bills the subscription, not a key. Read-only tools only; no send/publish/approve path.
// onText (optional) fires with each assistant text delta as the model writes — token-level "watch
// it think". Enabled via includePartialMessages; we read content_block_delta text_delta events.
export async function runClaudeQuery({ prompt, cwd = process.cwd(), model, maxTurns = 12, onText } = {}) {
  const childEnv = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "gtm-ide/0.3.0" };
  delete childEnv.ANTHROPIC_API_KEY; // subscription, not a raw key
  const stream = agentQuery({
    prompt,
    options: {
      cwd,
      model: model || undefined,
      maxTurns,
      permissionMode: "dontAsk",
      allowedTools: ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
      settingSources: [],
      persistSession: false,
      includePartialMessages: typeof onText === "function",
      env: childEnv,
    },
  });
  let text = "";
  let error = null;
  for await (const message of stream) {
    if (message.type === "stream_event" && typeof onText === "function") {
      const ev = message.event;
      if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
        try { onText(ev.delta.text); } catch { /* a consumer error never breaks the run */ }
      }
      continue;
    }
    if (message.type !== "result") continue;
    if (typeof message.result === "string") text = message.result;
    if (message.is_error || message.subtype === "error_max_turns" || message.subtype === "error_max_budget_usd") {
      error = classifyAgentError(message);
    }
  }
  return { text, error };
}

// Default turn budget raised from 12 to 20: a repo-reading discovery agent (find prospects,
// research) routinely needs more than 12 turns and was hitting the cap — one of the real run
// failures in the ledger. Cheap item-transform steps finish early regardless; ideation still
// overrides higher. A step can always set config.maxTurns.
export function createClaudeAgentInvoker({ cwd = process.cwd(), model, maxTurns = 20, onText } = {}) {
  return async function invoke({ ref, prompt, items, context, config = {}, artifactPath }) {
    const built = buildAgentPrompt({ ref, prompt, items, context, artifactPath: artifactPath ?? config.artifactPath });
    const { text, error } = await runClaudeQuery({
      prompt: built.prompt,
      cwd,
      model: config.model || model,
      maxTurns: config.maxTurns || maxTurns,
      onText,
    });
    if (error) {
      return { ok: false, items: [], error: error.message, meta: { invoked: ref, contextManifest: built.manifest, errorKind: error.kind, retriable: error.retriable } };
    }
    return { ok: true, items: parseAgentItems(text), meta: { invoked: ref, contextManifest: built.manifest } };
  };
}

export function createCodexAgentInvoker({ cwd = process.cwd(), model, binary = "codex" } = {}) {
  return async function invoke({ ref, prompt, items, context, config = {}, artifactPath }) {
    const outputFile = path.join(os.tmpdir(), `gtm-ide-codex-${process.pid}-${Date.now()}.txt`);
    const args = [
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox", "read-only",
      "--ask-for-approval", "never",
      "--output-last-message", outputFile,
      ...(config.model || model ? ["--model", config.model || model] : []),
      "-",
    ];
    const built = buildAgentPrompt({ ref, prompt, items, context, artifactPath: artifactPath ?? config.artifactPath });
    const task = built.prompt;
    const result = await new Promise((resolve) => {
      const child = spawn(binary, args, {
        cwd,
        env: { ...process.env, CODEX_CLI_CLIENT_APP: "gtm-ide/0.3.0" },
        stdio: ["pipe", "ignore", "pipe"],
      });
      let errorText = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => { errorText += chunk; });
      child.on("error", (error) => resolve({ code: -1, error: error.message }));
      child.on("close", (code) => resolve({ code, error: errorText.trim() }));
      child.stdin.end(task);
    });
    let text = "";
    try { text = fs.readFileSync(outputFile, "utf8"); } catch { /* surfaced below */ }
    try { fs.rmSync(outputFile, { force: true }); } catch { /* best effort */ }
    if (result.code !== 0) {
      return {
        ok: false,
        items: [],
        error: `Codex agent "${ref}" failed${result.error ? `: ${result.error.slice(0, 240)}` : "."}`,
        meta: { provider: "codex", invoked: ref },
      };
    }
    return { ok: true, items: parseAgentItems(text), meta: { provider: "codex", invoked: ref, contextManifest: built.manifest } };
  };
}

export function createProviderAgentInvoker(options = {}) {
  const claude = options.claudeInvoker || createClaudeAgentInvoker(options);
  const codex = options.codexInvoker || createCodexAgentInvoker(options);
  return async function invoke(input) {
    const provider = String(input.config?.provider || "claude").toLowerCase();
    if (provider === "codex") return codex(input);
    if (provider === "claude") return claude(input);
    return { ok: false, items: [], error: `Unknown agent provider: ${provider}` };
  };
}

// Compose the live step runtime graph.mjs expects: a provider-aware agent invoker + skill loader.
export function liveStepRuntime({ cwd, model, skillRoot, claudeInvoker, codexInvoker } = {}) {
  return createStepRuntime({
    agentInvoker: createProviderAgentInvoker({ cwd, model, claudeInvoker, codexInvoker }),
    skillLoader: (ref) => loadSkillGuidance(ref, { root: skillRoot }),
  });
}
