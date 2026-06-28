/**
 * mcp-classifier.mjs — the read/write wall, applied to an arbitrary MCP tool.
 *
 * GTM IDE's spine is "vibe up to the gate, never past it." When connectors become
 * external MCP servers Claude calls, the host must decide — for every tool it has
 * never seen — whether it only READS (safe to call freely) or can ACT on the world
 * (must wait behind the founder gate). That single bit is what lets the wall stand
 * over tools nobody at GTM IDE ever hand-audited.
 *
 * The rule is fail-safe: unknown classifies as WRITE (gated). A tool's own
 * `readOnlyHint` is treated as a CLAIM, never a permission — if the name or the
 * destructive hint says it acts, the tool is gated no matter what it calls itself.
 * This is deliberate: the April-2026 MCP supply-chain reality means a tool named
 * `get_*` can lie, and the cost of wrongly trusting a writer is an un-gated send.
 *
 * Pure module — no I/O, no process. The store decides persistence; this decides class.
 */

export const READ_CLASS = "read";
export const WRITE_CLASS = "write";

// Verbs that act on the outside world. Superset of the engine's SEND_VERB
// (send|publish|deploy) so the wall and the engine's sender-detection agree.
const WRITE_VERBS = [
  "send", "publish", "deploy", "create", "update", "delete", "remove", "push",
  "write", "set", "add", "post", "put", "patch", "charge", "pay", "email",
  "message", "dm", "trigger", "run", "exec", "execute", "enrich", "upsert",
  "archive", "move", "rename", "invite", "schedule", "cancel", "approve",
  "submit", "sync", "export", "share", "upload", "modify", "edit", "insert",
  "draft", "reply", "comment", "assign", "close", "merge", "revoke", "grant",
];

// Verbs that only observe. Used to lift a tool OUT of the gated default — but only
// when nothing write-class fires first.
const READ_VERBS = [
  "get", "list", "search", "find", "read", "fetch", "lookup", "query",
  "describe", "count", "view", "check", "resolve", "retrieve", "scan",
  "browse", "show", "inspect", "preview", "summarize", "analyze", "match",
];

// Tokenize a tool name into whole words across both namespace separators and
// camelCase: `crm.pushDeal` → [crm, push, deal], `get_table` → [get, table].
// Whole-token matching avoids the substring trap where `frobnicate_widget`
// looks like a "get" and a writer hides inside a noun.
function tokens(name) {
  return String(name || "")
    .split(/[._:/\s-]+/)
    .filter(Boolean)
    .flatMap((part) => part.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/\s+/))
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

// Does any whole token match one of the verbs?
function nameHas(name, verbs) {
  const set = new Set(verbs);
  return tokens(name).some((token) => set.has(token));
}

// The matched verb (for the reason string), or a fallback label.
function matchedVerb(name, verbs, fallback) {
  const set = new Set(verbs);
  return tokens(name).find((token) => set.has(token)) || fallback;
}

/**
 * Classify one tool.
 *
 * @param {object} tool - an MCP tool descriptor: { name, description?, annotations? }
 *   annotations may carry the MCP hints: readOnlyHint, destructiveHint (booleans).
 * @returns {{ class: "read"|"write", reason: string, source: "annotation"|"name"|"default",
 *             declaredReadOnly: boolean|null, declaredDestructive: boolean|null }}
 */
export function classifyTool(tool) {
  const name = tool?.name ?? "";
  const ann = tool?.annotations ?? {};
  const declaredReadOnly = typeof ann.readOnlyHint === "boolean" ? ann.readOnlyHint : null;
  const declaredDestructive = typeof ann.destructiveHint === "boolean" ? ann.destructiveHint : null;

  // 1. A declared-destructive tool is gated, full stop. The strongest write signal.
  if (declaredDestructive === true) {
    return gated("declares it can be destructive", "annotation", declaredReadOnly, declaredDestructive);
  }

  // 2. A write verb in the name gates it — even if the tool calls itself read-only.
  //    The claim does not override the wall; a mislabeled writer must not slip free.
  if (nameHas(name, WRITE_VERBS)) {
    const verb = matchedVerb(name, WRITE_VERBS, "write");
    const claim = declaredReadOnly === true ? " (overrides its read-only claim)" : "";
    return gated(`acts on the world — "${verb}"${claim}`, "name", declaredReadOnly, declaredDestructive);
  }

  // 3. No write signal. A trustworthy-looking read can now run free:
  //    a declared read-only tool, or a clear read verb in the name.
  if (declaredReadOnly === true) {
    return free("declares itself read-only", "annotation", declaredReadOnly, declaredDestructive);
  }
  if (nameHas(name, READ_VERBS)) {
    const verb = matchedVerb(name, READ_VERBS, "read");
    return free(`reads only — "${verb}"`, "name", declaredReadOnly, declaredDestructive);
  }

  // 4. Couldn't read it. Unknown falls behind the gate — never the other way.
  return gated("couldn't classify — gated by default", "default", declaredReadOnly, declaredDestructive);
}

/** Classify a list, returning the two lanes plus the count we had to default. */
export function classifyTools(tools = []) {
  const classified = tools.map((tool) => ({ ...tool, ...classifyTool(tool) }));
  return {
    read: classified.filter((t) => t.class === READ_CLASS),
    write: classified.filter((t) => t.class === WRITE_CLASS),
    defaulted: classified.filter((t) => t.source === "default"),
    tools: classified,
  };
}

function free(reason, source, declaredReadOnly, declaredDestructive) {
  return { class: READ_CLASS, reason, source, declaredReadOnly, declaredDestructive };
}
function gated(reason, source, declaredReadOnly, declaredDestructive) {
  return { class: WRITE_CLASS, reason, source, declaredReadOnly, declaredDestructive };
}
