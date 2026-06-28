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
import { query as agentQuery, createSdkMcpServer, tool as sdkTool } from "@anthropic-ai/claude-agent-sdk";
import { createStepRuntime } from "./step-runners.mjs";
import { assembleContext } from "./context/assembler.mjs";
import { providersFromContext } from "./context/providers.mjs";
import { createRetrievalTools, RETRIEVAL_SOURCES, SOURCE_TO_TOOL } from "./context/retrieval-tools.mjs";

// Parallel-path flag (E1.4). OFF by default, so the live default behavior and the whole test
// suite stay on the proven pre-pack until a per-provider comparison (E1.5) earns the cutover.
// An explicit boolean (per-step config) always wins over the env switch.
export function agenticRetrievalEnabled(explicit) {
  if (typeof explicit === "boolean") return explicit;
  return process.env.GTM_AGENTIC_RETRIEVAL === "1";
}

// Per-provider cutover (E1.6 + E2.4). The all-or-nothing flag above is one extreme; this is the
// dial between them. It names WHICH grounding sources have been cut over to agentic retrieval —
// those become tools the agent pulls; everything else stays pre-packed and proven. The cutover
// flips one source at a time as the comparison harness (agentic-compare.mjs) earns each move, with
// taste and design intentionally LAST because their required-consult guarantee is load-bearing.
//
// Resolution, highest priority first:
//   1. an explicit value on the step config (Array | Set | "all" | "" | comma-string)
//   2. the full-agentic flag — when on, EVERY source is agentic (the old all-on case, unchanged)
//   3. GTM_AGENTIC_PROVIDERS env (comma list, or "all")
//   4. nothing → empty set → today's behavior: everything pre-packed, no tools offered.
//
// Default (no config, no env, full flag off) returns an EMPTY set, so an unconfigured run is
// byte-identical to before — the cutover is opt-in per source.
export function agenticProviders(explicit, { full } = {}) {
  const all = new Set(RETRIEVAL_SOURCES);
  const parse = (value) => {
    if (value == null) return null;
    if (value instanceof Set) return new Set([...value].filter((s) => all.has(s)));
    if (Array.isArray(value)) return new Set(value.filter((s) => all.has(s)));
    if (value === true) return all;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return new Set();
      if (trimmed.toLowerCase() === "all") return all;
      return new Set(trimmed.split(",").map((s) => s.trim()).filter((s) => all.has(s)));
    }
    return null;
  };

  const fromExplicit = parse(explicit);
  if (fromExplicit) return fromExplicit;

  // The full-agentic flag (explicit boolean or env) means "cut everything over at once".
  if (agenticRetrievalEnabled(typeof full === "boolean" ? full : undefined)) return all;

  const fromEnv = parse(process.env.GTM_AGENTIC_PROVIDERS);
  if (fromEnv) return fromEnv;

  return new Set();
}

// Render the retrieval-tool catalog the agent reads in agentic mode: which context it CAN pull,
// and the one standing instruction that protects the moat. The grounded text is NOT stapled in —
// the agent fetches what this task needs, live, through these tools.
function renderRetrievalCatalog(tools) {
  if (!tools.length) return "";
  const lines = tools.map((t) => `- ${t.name}: ${t.description}`);
  return [
    "\nContext tools — the grounding for this run is available THROUGH TOOLS, not pre-loaded. Call only the ones this task needs; do not guess at what you can fetch:",
    ...lines,
    "Always call get_taste before drafting or proposing anything the founder will review — it carries the founder's accumulated approvals and rejections, which a generic model cannot guess.",
  ].join("\n");
}

// Map the verified retrieval tools (retrieval-tools.mjs) to MCP CallToolResult-shaped handlers.
// Pure and unit-testable; the actual SDK server is one line away in buildContextMcpServer.
export function buildContextToolDefs(retrievalTools = []) {
  return retrievalTools.map((t) => ({
    name: t.name,
    description: t.description,
    handler: async () => {
      const result = t.call();
      const text = result.found ? result.text : (result.note || "No data available for this run.");
      return { content: [{ type: "text", text }] };
    },
  }));
}

// The thin live bridge: wrap the tool defs in an in-process MCP server the agent SDK can call.
// LIVE-VERIFY PENDING (E1.5): this registration path only truly exercises on a real subscription
// run, so it stays behind the agentic flag and is never hit by the default suite.
function buildContextMcpServer(retrievalTools) {
  const defs = buildContextToolDefs(retrievalTools);
  if (!defs.length) return null;
  const tools = defs.map((d) => sdkTool(d.name, d.description, {}, d.handler));
  return createSdkMcpServer({ name: "gtm_context", version: "0.1.0", tools, alwaysLoad: true });
}

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

// ── Per-agent toolset resolution (real, tested) ──────────────────────────────
// Every agent used to run with the same blanket five read-only tools, ignoring the `tools:` its
// definition declares — the one fixed thing left in the otherwise-personalized bridge. Now the
// declared set drives the run, intersected with a host-enforced read-only allowlist so the wall
// still holds: the bridge NEVER grants a mutation tool (Write / Edit / NotebookEdit) or any
// send / publish / approve path, and the step still returns staged items behind the founder gate.
//
// The allowlist is wider than the default by exactly one tool: Bash. A research scout
// (gtm-enrich, gtm-signal-github) declares Bash to curl public, free-tier APIs — that is reading,
// not the GTM send, which only ever happens at an execute node downstream of a gate. Bash is
// granted ONLY when an agent explicitly declares it; an agent that declares nothing keeps the
// conservative five. Declared tools outside the allowlist are dropped and recorded (never silent).
export const DEFAULT_AGENT_TOOLS = ["Read", "Glob", "Grep", "WebSearch", "WebFetch"];
export const ALLOWED_AGENT_TOOLS = [...DEFAULT_AGENT_TOOLS, "Bash"];

// Parse the `tools:` field from an agent definition's YAML frontmatter. Handles the two real
// shapes: the inline comma string (`tools: Read, Bash, WebSearch`) and the YAML list form. Returns
// the declared names, or null when the field is absent (the caller keeps the safe default).
export function parseDeclaredTools(definition) {
  if (typeof definition !== "string" || !definition.trim()) return null;
  const fm = definition.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const body = fm[1];
  const inline = body.match(/^tools:[ \t]*(\S.*)$/m);
  if (inline) {
    return inline[1].split(",").map((t) => t.trim()).filter(Boolean);
  }
  const list = body.match(/^tools:[ \t]*\n((?:[ \t]*-[ \t]*.+\n?)+)/m);
  if (list) {
    return list[1].split("\n").map((l) => l.replace(/^[ \t]*-[ \t]*/, "").trim()).filter(Boolean);
  }
  return null;
}

// Resolve the allowedTools for a run: the declared set intersected with the read-only allowlist,
// or the conservative default when nothing is declared (or nothing declared survives the filter,
// so an agent never runs blind). Returns { allowed, declared, dropped } so the caller can record
// what was granted and what was refused.
export function resolveAgentTools(definition, { fallback = DEFAULT_AGENT_TOOLS, allowlist = ALLOWED_AGENT_TOOLS } = {}) {
  const declared = parseDeclaredTools(definition);
  if (!declared || !declared.length) {
    return { allowed: [...fallback], declared: null, dropped: [] };
  }
  const allowed = declared.filter((t) => allowlist.includes(t));
  const dropped = declared.filter((t) => !allowlist.includes(t));
  return { allowed: allowed.length ? allowed : [...fallback], declared, dropped };
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
export function buildAgentPrompt({ ref, prompt, items, context = {}, artifactPath, agentDefinitionRoot, agenticRetrieval, agenticProviders: agenticProvidersConfig } = {}) {
  const input = JSON.stringify(items ?? [], null, 2);

  // The per-provider cutover set: which sources are pulled through tools vs. pre-packed. The full
  // flag (`agenticRetrieval`) collapses to "every source agentic"; an explicit provider list cuts
  // one source at a time; nothing → empty set → today's all-pre-pack behavior.
  const agenticSet = agenticProviders(agenticProvidersConfig, { full: agenticRetrieval });
  const fullAgentic = agenticSet.size === RETRIEVAL_SOURCES.length;
  const partialAgentic = agenticSet.size > 0 && !fullAgentic;

  // eslint-disable-next-line no-unused-vars
  const { grounding, productModel, market, __memory, __state, signal, designState, ...rest } = context ?? {};
  const restJson = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : null;

  // Three grounding modes, all over the SAME provider summarizers (E1.4/E1.6):
  //  - pre-pack (default, empty set): assemble every provider into one block stapled to the prompt.
  //  - agentic (full set): hand the agent a CATALOG of context tools; let it pull what it needs.
  //  - partial cutover (some sources): the cut-over sources are offered as tools AND omitted from
  //    the pre-pack (toggled off in the assembler); the rest are still pre-packed. This is the
  //    per-provider dial — flip get_market before get_taste, with taste/design last.
  // Both leave `rest` (context-node output, __run) passed through as JSON so nothing is lost.
  let contextBlock = "";
  let manifest;
  let retrievalTools = null;
  if (fullAgentic) {
    retrievalTools = createRetrievalTools(context);
    contextBlock = renderRetrievalCatalog(retrievalTools);
    manifest = { mode: "agentic", offered: retrievalTools.map((t) => t.name), assembledAt: new Date().toISOString() };
  } else if (partialAgentic) {
    // Tools for the cut-over sources; pre-pack (toggled off for those) for the rest.
    retrievalTools = createRetrievalTools(context, { sources: [...agenticSet] });
    const catalog = renderRetrievalCatalog(retrievalTools);
    // Toggle the cut-over providers OFF in the pre-pack so a source is never delivered both ways.
    const toggles = {};
    for (const source of agenticSet) toggles[source] = false;
    const assembled = assembleContext({ providers: providersFromContext(context), intent: prompt || "", toggles });
    const prePackBlock = assembled.text ? `\nGrounded context:\n${assembled.text}` : "";
    contextBlock = [catalog, prePackBlock].filter(Boolean).join("\n");
    manifest = {
      mode: "partial-agentic",
      offered: retrievalTools.map((t) => t.name),
      prePacked: assembled.manifest,
      cutover: [...agenticSet],
      assembledAt: new Date().toISOString(),
    };
  } else {
    const assembled = assembleContext({ providers: providersFromContext(context), intent: prompt || "" });
    contextBlock = assembled.text ? `\nGrounded context:\n${assembled.text}` : "";
    manifest = assembled.manifest;
  }

  // Load the real on-disk definition if one exists. When found, the agent's own doctrine + role
  // drives the run; when not, we fall back to the original one-line label (identical to before),
  // so a missing definition is a pure no-op.
  const definition = loadAgentDefinition(ref, { artifactPath, root: agentDefinitionRoot });
  const role = definition
    ? `You are acting as the "${ref}" GTM subagent. Follow this agent definition:\n\n${definition.trim()}`
    : `You are doing the work of the "${ref}" GTM subagent.`;

  // The agent's own declared toolset, intersected with the read-only allowlist (the wall).
  const tools = resolveAgentTools(definition);

  const text = [
    role,
    prompt ? `\nTask:\n${prompt}` : "",
    contextBlock,
    restJson ? `\nAdditional workflow context (JSON):\n${restJson}` : "",
    `\nInput items (JSON):\n${input}`,
    `\nReturn ONLY a JSON array of result items — no prose, no preamble. Each item should be a JSON object. If you have nothing to return, return [].`,
  ].filter(Boolean).join("\n");

  return { prompt: text, manifest, definitionLoaded: !!definition, tools, retrievalTools };
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
export async function runClaudeQuery({ prompt, cwd = process.cwd(), model, maxTurns = 12, onText, allowedTools = DEFAULT_AGENT_TOOLS, mcpServers } = {}) {
  const childEnv = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "gtm-ide/0.3.0" };
  delete childEnv.ANTHROPIC_API_KEY; // subscription, not a raw key
  const stream = agentQuery({
    prompt,
    options: {
      cwd,
      model: model || undefined,
      maxTurns,
      permissionMode: "dontAsk",
      allowedTools,
      // In-process context tools (agentic retrieval, E1.2). Omitted entirely in the default
      // pre-pack path, so this never changes a non-agentic run.
      ...(mcpServers ? { mcpServers } : {}),
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
    const built = buildAgentPrompt({ ref, prompt, items, context, artifactPath: artifactPath ?? config.artifactPath, agenticRetrieval: config.agenticRetrieval, agenticProviders: config.agenticProviders });
    // Agentic mode: expose the context tools as an in-process MCP server and permit their
    // namespaced names. Pre-pack mode leaves both undefined, so the call is byte-identical to before.
    const mcpServers = built.retrievalTools ? { gtm_context: buildContextMcpServer(built.retrievalTools) } : undefined;
    const allowedTools = mcpServers
      ? [...built.tools.allowed, ...built.retrievalTools.map((t) => `mcp__gtm_context__${t.name}`)]
      : built.tools.allowed;
    const { text, error } = await runClaudeQuery({
      prompt: built.prompt,
      cwd,
      model: config.model || model,
      maxTurns: config.maxTurns || maxTurns,
      onText,
      allowedTools,
      mcpServers,
    });
    // Surface the granted toolset (and anything the wall refused) so the run is auditable.
    const toolMeta = { tools: built.tools.allowed, toolsDropped: built.tools.dropped };
    if (error) {
      return { ok: false, items: [], error: error.message, meta: { invoked: ref, contextManifest: built.manifest, errorKind: error.kind, retriable: error.retriable, ...toolMeta } };
    }
    return { ok: true, items: parseAgentItems(text), meta: { invoked: ref, contextManifest: built.manifest, ...toolMeta } };
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
