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
import { createStepRuntime, createMcpStepRunner, BUILTIN_CODE_TRANSFORMS } from "./step-runners.mjs";
import { getServer, effectiveClass } from "./mcp-store.mjs";
import { connectStdioServer } from "./mcp-client.mjs";
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

// Which grounding sources are pulled agentically (tools the agent calls) vs pre-packed. The cutover
// is COMPLETE: the default is now FULLY agentic — every source is a tool the agent pulls. Both paths
// were verified live (each returns real items; the in-process context-tool server runs clean), so
// the pre-pack is no longer the default — it survives only as an explicit escape hatch.
//
// Resolution, highest priority first:
//   1. an explicit value on the step config (Array | Set | "all" | "" | comma-string)
//   2. the full-agentic flag (GTM_AGENTIC_RETRIEVAL=1) — every source agentic
//   3. GTM_AGENTIC_PROVIDERS env — the comma list of sources to make agentic; "all" = every source;
//      "" (empty) = NONE agentic, i.e. fall back to the old pre-pack for everything (the escape hatch)
//   4. nothing set → the default: FULLY agentic (every source pulled).
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

  // Cutover complete: with nothing overriding, every source is agentic.
  return all;
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
// Coerce a parsed JSON value into an items array. A research agent reliably returns GOOD data but
// not always a bare array: it may wrap the list in an object ({ prospects: [...] }, { items: [...] })
// or, when it found exactly one, return a single object. Dropping those to [] silently loses real
// work (observed live: 2 real prospects reported as 0 items). So: an array IS the items; an object
// with an array-valued field yields that array; a non-empty bare object becomes a one-item array.
function coerceAgentItems(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const arrayField = Object.values(parsed).find((v) => Array.isArray(v));
    if (arrayField) return arrayField;
    if (Object.keys(parsed).length) return [parsed];
  }
  return null;
}

export function parseAgentItems(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced) candidates.push(fenced[1].trim());
  // First array span, then first object span (the agent may wrap items in an object), then the whole text.
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) candidates.push(text.slice(arrStart, arrEnd + 1));
  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) candidates.push(text.slice(objStart, objEnd + 1));
  candidates.push(text.trim());
  for (const candidate of candidates) {
    try {
      const items = coerceAgentItems(JSON.parse(candidate));
      if (items) return items;
    } catch {
      // try the next candidate
    }
  }
  return [];
}

// The teammate's pre-JSON prose — its plain-language reasoning, captured not discarded (Wave 2). With
// the narrate-then-fenced-JSON prompt the model thinks aloud for the watching founder, then emits the
// items in a fenced block; that prose is the reasoning the run and the gate can surface. We take the
// text up to the first fence (or, if the model skipped the fence, up to the first bare array/object).
// Returns "" when the whole message is JSON — an honest empty, never fabricated narration.
export function parseAgentReasoning(text) {
  if (typeof text !== "string" || !text.trim()) return "";
  const fenceIdx = text.search(/```(?:json)?/i);
  let head;
  if (fenceIdx !== -1) {
    head = text.slice(0, fenceIdx);
  } else {
    // No fence: reasoning is whatever precedes the first JSON span (array or object).
    const arr = text.indexOf("[");
    const obj = text.indexOf("{");
    const cut = [arr, obj].filter((i) => i !== -1).sort((a, b) => a - b)[0];
    head = cut === undefined ? "" : text.slice(0, cut);
  }
  return head.replace(/\s+/g, " ").trim();
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
// Render skill judgment accumulated UPSTREAM in this run. A `skill` step appends its loaded
// SKILL.md to the shared run context (context.__skillGuidance, threaded by graph.mjs); a
// downstream agent step acts UNDER that judgment, so it rides high in the prompt as doctrine —
// not buried in the JSON passthrough. Empty in, empty out (the block is dropped by .filter).
function renderSkillGuidance(entries) {
  if (!Array.isArray(entries) || !entries.length) return "";
  const blocks = entries
    .filter((entry) => entry && typeof entry.guidance === "string" && entry.guidance.trim())
    .map((entry) => `Skill — ${entry.ref}:\n${entry.guidance.trim()}`);
  if (!blocks.length) return "";
  return ["\nSkill judgment loaded upstream in this run — follow it:", ...blocks].join("\n\n");
}

export function buildAgentPrompt({ ref, prompt, items, context = {}, artifactPath, agentDefinitionRoot, agenticRetrieval, agenticProviders: agenticProvidersConfig } = {}) {
  const input = JSON.stringify(items ?? [], null, 2);

  // The per-provider cutover set: which sources are pulled through tools vs. pre-packed. The full
  // flag (`agenticRetrieval`) collapses to "every source agentic"; an explicit provider list cuts
  // one source at a time; nothing → empty set → today's all-pre-pack behavior.
  const agenticSet = agenticProviders(agenticProvidersConfig, { full: agenticRetrieval });
  const fullAgentic = agenticSet.size === RETRIEVAL_SOURCES.length;
  const partialAgentic = agenticSet.size > 0 && !fullAgentic;

  // Bind the taste tool to THIS drafting teammate so get_taste leads with its promoted, founder-blessed
  // soul. `ref` is the agentRef; the project comes off the run context the graph threads through. Absent
  // either (or absent a soul) the retrieval tools behave exactly as before — the binding is additive.
  const soulBinding = { agentRef: ref ?? null, projectId: context?.__run?.projectId ?? context?.credentials?.projectId ?? null };

  // eslint-disable-next-line no-unused-vars
  const { grounding, productModel, market, __memory, __state, signal, designState, __skillGuidance, ...rest } = context ?? {};
  const restJson = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : null;
  // Skill judgment a `skill` step loaded earlier in THIS run (graph threads context.__skillGuidance).
  // Folded in as doctrine below, never dumped into the rest-JSON passthrough.
  const skillGuidanceBlock = renderSkillGuidance(__skillGuidance);

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
    retrievalTools = createRetrievalTools(context, soulBinding);
    contextBlock = renderRetrievalCatalog(retrievalTools);
    manifest = { mode: "agentic", offered: retrievalTools.map((t) => t.name), assembledAt: new Date().toISOString() };
  } else if (partialAgentic) {
    // Tools for the cut-over sources; pre-pack (toggled off for those) for the rest.
    retrievalTools = createRetrievalTools(context, { sources: [...agenticSet], ...soulBinding });
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
    skillGuidanceBlock,
    prompt ? `\nTask:\n${prompt}` : "",
    contextBlock,
    restJson ? `\nAdditional workflow context (JSON):\n${restJson}` : "",
    `\nInput items (JSON):\n${input}`,
    // Narrate-then-fenced-JSON (Wave 2), mirroring OBJECT_IDEATE_GENERATE_PROMPT. The founder is
    // watching the crew work, so the prose BEFORE the fence is the teammate's plain-language reasoning
    // (captured as result.reasoning, streamed live) and the machine-readable items ride in the fenced
    // JSON block. parseAgentItems still reads the fenced block, so the items parse exactly as before.
    `\nFirst, in 1 to 3 short plain sentences, say what you did and what you're handing back — talk to the founder in plain language, no jargon, no code. This is you thinking aloud.`,
    `\nThen output your result items as ONE fenced JSON block and nothing after it — a JSON array of result objects (or [] if you have nothing to return):`,
    "```json\n[ { } ]\n```",
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
      // Pin the default to Opus 4.8 so an unset model can never silently downgrade the crew's work
      // (a missing model previously fell to the SDK default). Every caller can still pass an explicit
      // model; only the DEFAULT is pinned. Opus 4.8 is the project + global AGENTS.md drafting default.
      model: model || "claude-opus-4-8",
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
  // Capture the NAMES of every tool the subagent actually called. This is the evidence the
  // required-consult guard reads at the gate: did a drafting step call get_taste before drafting?
  // We collect from two SDK shapes so the capture is robust: the streamed content_block_start
  // tool_use events (when partial messages are on) and the tool_use blocks on each assistant
  // message (always present). A Set de-dupes repeated calls; the in-process context tools arrive
  // namespaced (mcp__gtm_context__get_taste), so we also record the bare suffix the guard expects.
  const toolCalls = new Set();
  const recordToolName = (name) => {
    if (!name || typeof name !== "string") return;
    toolCalls.add(name);
    const bare = name.includes("__") ? name.slice(name.lastIndexOf("__") + 2) : null;
    if (bare) toolCalls.add(bare);
  };
  for await (const message of stream) {
    if (message.type === "stream_event") {
      const ev = message.event;
      if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text && typeof onText === "function") {
        try { onText(ev.delta.text); } catch { /* a consumer error never breaks the run */ }
      }
      if (ev?.type === "content_block_start" && ev.content_block?.type === "tool_use") {
        recordToolName(ev.content_block.name);
      }
      continue;
    }
    if (message.type === "assistant" && Array.isArray(message.message?.content)) {
      for (const block of message.message.content) {
        if (block?.type === "tool_use") recordToolName(block.name);
      }
    }
    if (message.type !== "result") continue;
    if (typeof message.result === "string") text = message.result;
    if (message.is_error || message.subtype === "error_max_turns" || message.subtype === "error_max_budget_usd") {
      error = classifyAgentError(message);
    }
  }
  return { text, error, toolCalls: [...toolCalls] };
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
    const { text, error, toolCalls = [] } = await runClaudeQuery({
      prompt: built.prompt,
      cwd,
      model: config.model || model,
      maxTurns: config.maxTurns || maxTurns,
      onText,
      allowedTools,
      mcpServers,
    });
    // Surface the granted toolset (and anything the wall refused) so the run is auditable, plus the
    // tool names the agent ACTUALLY called — the evidence the required-consult guard reads at the gate.
    const toolMeta = { tools: built.tools.allowed, toolsDropped: built.tools.dropped, toolCalls };
    // The teammate's plain-language reasoning — its pre-JSON prose, captured for the run + gate (Wave 2).
    const reasoning = parseAgentReasoning(text);
    if (error) {
      return { ok: false, items: [], reasoning, error: error.message, meta: { invoked: ref, contextManifest: built.manifest, errorKind: error.kind, retriable: error.retriable, ...toolMeta } };
    }
    return { ok: true, items: parseAgentItems(text), reasoning, meta: { invoked: ref, contextManifest: built.manifest, ...toolMeta } };
  };
}

// ── Microproduct producer invoker (live, OAuth-first subscription) ───────────
// The producer leg for a deployable MICROPRODUCT output: it runs a read-only subagent on the
// founder's Claude subscription that designs a small static artifact (a demo/landing/tool cut from
// the real product) and returns it AS DATA — { artifactSpec, artifactFiles:[{path,contents}] }. It
// is the symmetric twin of createClaudeAgentInvoker: same read-only, no-key subscription call, and
// the SAME wall. The agent has only read tools (DEFAULT_AGENT_TOOLS via runClaudeQuery), so it
// CANNOT write the files to disk, deploy, publish, or push — it hands back file text the artifact
// execute connector stages behind the founder gate. There is no send/deploy path here by
// construction; deploying happens only after an explicit founder gate approval.
//
// The doctrine and the prompt are owned by microproduct-composer.mjs (mirroring how composition.mjs
// owns COMPOSE_PROMPT and calls runClaudeQuery here); this leg takes a fully-built prompt, runs it,
// and parses the artifact object out of the model's reply. `runQuery` is injectable so a fake
// subscription can be supplied in tests; it defaults to the real read-only subscription call.
function coerceArtifactFiles(raw) {
  if (!Array.isArray(raw)) return [];
  const files = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const filePath = typeof entry.path === "string" ? entry.path.trim() : "";
    const contents = typeof entry.contents === "string" ? entry.contents : (typeof entry.content === "string" ? entry.content : null);
    if (!filePath || contents == null) continue; // a file with no path or no body is dropped, never half-staged
    files.push({ path: filePath, contents });
  }
  return files;
}

export function createClaudeMicroproductInvoker({ cwd = process.cwd(), model, maxTurns = 24, onText, runQuery = runClaudeQuery } = {}) {
  return async function produce({ prompt }) {
    const { text, error, toolCalls = [] } = await runQuery({ prompt, cwd, model, maxTurns, onText });
    if (error) {
      return { ok: false, error: error.message, meta: { errorKind: error.kind, retriable: error.retriable, toolCalls } };
    }
    const parsed = parseAgentObject(text);
    if (!parsed) {
      return { ok: false, error: "Microproduct producer did not return a JSON { artifactSpec, artifactFiles } object.", meta: { toolCalls } };
    }
    const artifactSpec = parsed.artifactSpec ?? parsed.spec ?? null;
    const artifactFiles = coerceArtifactFiles(parsed.artifactFiles ?? parsed.files);
    return { ok: true, artifactSpec, artifactFiles, meta: { toolCalls } };
  };
}

// ── Founder-gate plain-language translator (live, OAuth-first subscription) ──
// The plain-language half of the watchable founder gate. It turns each staged item's SAFE framing
// (buildGateFraming in connectors/gate/default.mjs: subject / trigger / who / sourceUrl / field-NAMES —
// never the outbound body) into a founder-plain headline plus a one-line "what your yes does". SAFETY:
// it receives ONLY framings (no body), so it can never paraphrase what is being sent. Returns an array
// aligned by index to the input framings, or null on any failure — the gate connector wraps the call in
// a timeout and falls back to the raw subject, so a failure here never blocks a run from reaching the
// gate. `runQuery` is injectable so a fake subscription can be supplied in tests.
export function createGateTranslator({ cwd = process.cwd(), model, runQuery = runClaudeQuery } = {}) {
  return async function translate({ items = [], downstream = null } = {}) {
    if (!Array.isArray(items) || !items.length) return null;
    const prompt = buildGateTranslationPrompt(items, downstream);
    // maxTurns 1: a single structured reply, no tool use. Read-only default tools; nothing is sent.
    const { text, error } = await runQuery({ prompt, cwd, model, maxTurns: 1 });
    if (error) return null;
    const arr = parseAgentItems(text);
    return Array.isArray(arr) && arr.length ? arr : null;
  };
}

function buildGateTranslationPrompt(framings, downstream) {
  const doesHint = downstream?.willSend === false
    ? "Approving STAGES this locally — nothing sends. Say that plainly."
    : downstream?.verb === "send"
      ? "Approving SENDS this out — an email or message actually leaves."
      : downstream?.verb === "publish" || downstream?.verb === "deploy"
        ? "Approving PUBLISHES or DEPLOYS this to the outside world."
        : "Approving lets this go out.";
  return [
    "You translate staged go-to-market items into plain founder language for a review gate.",
    "You are given ONLY each item's framing: a subject, a trigger, who it is about, a source URL, and the NAMES of the fields it carries. You are NOT given the message body, and you must not invent one.",
    `What approving does: ${doesHint}`,
    "Write for a founder who is NOT a marketer — a stranger must understand each line at a glance.",
    "BANNED — never use: GTM jargon (long tail, highest-intent, programmatic, keystone, top-of-funnel, ICP, conversion), internal product terms (founder gate, the wall, pipeline, connector, node), startup clichés (streamline, empower, seamless, leverage, unlock), the \"not just X but Y\" shape, and the em-dash (—) — use a period or the word \"so\" instead.",
    "For EACH item return a plain-language headline (<= 50 characters, plain everyday words, no jargon and no code identifiers) and a one-line \"whatYourYesDoes\" describing what approving it does, grounded in the line above.",
    "Return ONLY a JSON array, one object per item IN THE SAME ORDER, each shaped { \"plainLanguageTitle\": string, \"whatYourYesDoes\": string }. No prose, no preamble.",
    `Items:\n${JSON.stringify(framings, null, 2)}`,
  ].join("\n\n");
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

// Resolve which server+tool an mcp node points at, from the persisted MCP store. A node
// carries either config.server + config.tool, or a `serverId/toolName` ref. We return the
// tool's EFFECTIVE class (founder override honored) so the run-path wall in step-runners
// decides read-runs-free vs write-is-gated against the founder's own stored decision.
function resolveMcpTool(node, _context, { store = { getServer } } = {}) {
  const cfg = node?.config ?? {};
  let serverId = cfg.server ?? cfg.serverId ?? null;
  let toolName = cfg.tool ?? cfg.toolName ?? null;
  if ((!serverId || !toolName) && typeof node?.ref === "string" && node.ref.includes("/")) {
    const cut = node.ref.lastIndexOf("/");
    serverId = serverId ?? node.ref.slice(0, cut);
    toolName = toolName ?? node.ref.slice(cut + 1);
  }
  if (!serverId || !toolName) return null;
  const server = store.getServer(serverId);
  if (!server) return null;
  const tool = (server.tools ?? []).find((t) => t.name === toolName);
  if (!tool) return null;
  return { server, tool, effectiveClass: effectiveClass(tool) };
}

// Live MCP transport: connect to the stdio server the store recorded and call the one tool,
// then close. Read-only by construction — the wall in step-runners has already refused any
// write-class tool before we get here, so this path never carries an outward-facing call.
async function callMcpTool({ server, name, args }) {
  if (!server?.command) throw new Error(`server "${server?.id ?? "?"}" has no stdio command to launch`);
  const { client } = await connectStdioServer({ command: server.command, args: server.args ?? [] });
  try {
    return await client.callTool(name, args ?? {});
  } finally {
    client.close();
  }
}

// Compose the live step runtime graph.mjs expects: a provider-aware agent invoker + skill loader
// + the MCP tool runner (read-only run path; writes stay behind the founder gate).
export function liveStepRuntime({ cwd, model, skillRoot, claudeInvoker, codexInvoker, codeTransforms = BUILTIN_CODE_TRANSFORMS } = {}) {
  return createStepRuntime({
    agentInvoker: createProviderAgentInvoker({ cwd, model, claudeInvoker, codexInvoker }),
    skillLoader: (ref) => loadSkillGuidance(ref, { root: skillRoot }),
    // The deterministic spine: `code` steps select a built-in transform by ref (dedupe / filter /
    // limit / sort / rename-fields). No arbitrary eval — only this fixed registry runs live.
    codeTransforms,
    mcpRunner: createMcpStepRunner({ resolveTool: resolveMcpTool, callTool: callMcpTool }),
  });
}
