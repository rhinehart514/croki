// Import an OpenClaw agent workspace as a Drover teammate TEMPLATE.
//
// An OpenClaw agent keeps its identity and earned memory in a small set of plain-markdown files —
// SOUL.md (who it is), AGENTS.md (how it operates), MEMORY.md (the durable rules it has settled on),
// TOOLS.md (what it can touch), and .learnings/LEARNINGS.md (rules still on probation). This module
// reads those files and turns them into a teammate DRAFT: a name + role + operating instructions, plus
// two lesson buckets — the durable MEMORY rules become already-blessed soul lessons, and the probation
// .learnings become scratch learnings still awaiting the founder's tap.
//
// PURE + draft-only. Parsing writes nothing; the route returns the draft and only persists on the
// founder's explicit accept — the same wall every teammate crosses. Provenance is kept honest: every
// imported lesson is stamped source:"imported", never dressed up as a real Drover gate decision or a
// fabricated reply/win. And the imported toolset is forced down to the read-only allowlist so an
// imported agent can never carry a send/deploy capability across the wall.

import fs from "node:fs";
import path from "node:path";
import { slugify, draftToMarkdown } from "./crew-composer.mjs";
import { patternKeyFor } from "./teammate-soul.mjs";
import { resolveAgentTools } from "./agent-bridge.mjs";

// ── Small markdown readers (deterministic, no model) ─────────────────────────
// Split leading `--- ... ---` frontmatter into a flat key→value map plus the remaining body.
function parseFrontmatter(text) {
  const s = String(text || "");
  const m = s.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return { meta: {}, body: s.trim() };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: s.slice(m[0].length).trim() };
}

function firstHeading(body) {
  const m = String(body || "").match(/^#{1,6}\s+(.+?)\s*$/m);
  return m ? cleanInline(m[1]) : "";
}

function firstParagraph(body) {
  for (const block of String(body || "").split(/\n\s*\n/)) {
    const t = block.replace(/^#{1,6}\s+.*$/gm, "").trim();
    if (t) return oneLine(cleanInline(t));
  }
  return "";
}

// Strip the markdown that would read as noise on a founder surface: link syntax down to its label,
// inline-code backticks, and bold/italic markers.
function cleanInline(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .trim();
}

function oneLine(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 240);
}

// ── Rule extraction (MEMORY.md / .learnings) ─────────────────────────────────
// Pull the individual rules out of a durable-memory file. Prefers explicit list items (the common
// shape); falls back to heading sections / paragraphs when there are no bullets. Each rule can carry a
// short "why" split off a trailing em/en-dash clause ("use plain English — consultant voice reads as
// filler"). Returns [{ text, why }].
function extractRules(text) {
  const { body } = parseFrontmatter(text);
  if (!body) return [];
  const rules = [];
  const bulletRe = /^\s*(?:[-*+]|\d+[.)])\s+(.+)$/gm;
  let m;
  while ((m = bulletRe.exec(body))) {
    const rule = splitRule(cleanInline(m[1]));
    if (rule.text) rules.push(rule);
  }
  if (rules.length) return rules;
  for (const block of body.split(/\n\s*\n/)) {
    const t = cleanInline(block.replace(/^#{1,6}\s+/gm, "").replace(/\s+/g, " ").trim());
    if (t) rules.push(splitRule(t));
  }
  return rules;
}

function splitRule(line) {
  const m = String(line || "").match(/^(.*?\S)\s+[—–]\s+(.+)$/);
  if (m) return { text: m[1].trim(), why: m[2].trim() };
  return { text: String(line || "").trim(), why: "" };
}

// A durable rule → an imported lesson. Keyed the same way the soul model keys any correction, so an
// imported rule and a later live correction of the same pattern collapse to one lesson, not two.
function toLesson(rule) {
  const text = oneLine(rule.text);
  const key = patternKeyFor(text);
  return key && text ? { patternKey: key, text, why: oneLine(rule.why), source: "imported" } : null;
}

function dedupeByKey(lessons) {
  const seen = new Set();
  const out = [];
  for (const l of lessons) {
    if (!l || seen.has(l.patternKey)) continue;
    seen.add(l.patternKey);
    out.push(l);
  }
  return out;
}

// ── Tool reduction (the wall) ────────────────────────────────────────────────
// Pull the declared tool names out of TOOLS.md, then force them through the SAME read-only allowlist
// the live run enforces (agent-bridge.resolveAgentTools). Anything outside the allowlist — Write,
// Edit, and every send/deploy capability — is dropped and recorded, never silently kept. With no
// TOOLS.md the teammate gets the conservative read-only default.
function reduceTools(text) {
  const names = extractToolNames(text);
  const definition = names.length ? `---\ntools: ${names.join(", ")}\n---\n` : "";
  const resolved = resolveAgentTools(definition);
  return { allowed: resolved.allowed, dropped: resolved.dropped };
}

function extractToolNames(text) {
  const { body } = parseFrontmatter(text);
  const names = new Set();
  for (const m of body.matchAll(/`([A-Za-z][A-Za-z0-9]*)`/g)) names.add(m[1]);
  for (const m of body.matchAll(/^\s*(?:[-*+]|\d+[.)])\s+([A-Za-z][A-Za-z0-9]*)/gm)) names.add(m[1]);
  if (names.size === 0) {
    // An inline `tools: A, B, C` line, or a bare capitalized-token scan as the last resort.
    const inline = body.match(/tools?:\s*(.+)/i);
    const source = inline ? inline[1] : body;
    for (const m of source.matchAll(/\b([A-Z][A-Za-z0-9]+)\b/g)) names.add(m[1]);
  }
  return [...names];
}

// ── Combined-paste splitter ──────────────────────────────────────────────────
// The minimal UI lets a founder paste one blob. Recognize file-name delimiter lines (`# SOUL.md`,
// `=== AGENTS.md ===`, `FILE: MEMORY.md`, `.learnings/LEARNINGS.md`) and route the text between them to
// the right slot. With no markers the whole paste is treated as SOUL.md.
const FILE_KEYS = {
  "soul.md": "soul",
  "agents.md": "agents",
  "agent.md": "agents",
  "memory.md": "memory",
  "tools.md": "tools",
  "learnings.md": "learnings",
};

export function splitWorkspaceText(text) {
  const lines = String(text || "").split("\n");
  const files = {};
  let current = "soul";
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    const joined = buf.join("\n").trim();
    if (joined) files[current] = files[current] ? `${files[current]}\n${joined}` : joined;
    buf = [];
  };
  const markerRe = /^\s*(?:#{1,6}\s*|[-=*]{2,}\s*)?(?:FILE:\s*)?([A-Za-z0-9_./-]+\.md)\s*[-=*]*\s*$/i;
  for (const line of lines) {
    const m = line.match(markerRe);
    const base = m ? path.basename(m[1]).toLowerCase() : null;
    if (base && FILE_KEYS[base]) {
      flush();
      current = FILE_KEYS[base];
      continue;
    }
    buf.push(line);
  }
  flush();
  return files;
}

// ── Public API ───────────────────────────────────────────────────────────────
// Parse an OpenClaw workspace into a teammate draft spec. `input` is either the files object
// { soul, agents, memory, tools, learnings } (each a string of file text) or a single combined-paste
// string. Returns { ref, name, description, systemPrompt, tools:{allowed,dropped}, promoted, scratch }.
export function parseOpenClawWorkspace(input = {}) {
  const files = typeof input === "string" ? splitWorkspaceText(input) : (input || {});
  const soul = parseFrontmatter(files.soul || "");
  const agents = parseFrontmatter(files.agents || "");

  const name = oneLine(
    soul.meta.name || agents.meta.name || firstHeading(soul.body) || firstHeading(agents.body) || "Imported Teammate",
  );
  const description = oneLine(
    soul.meta.description || soul.meta.role || agents.meta.description ||
    firstParagraph(soul.body) || firstParagraph(agents.body) || "",
  );
  // The operating instructions: AGENTS.md is the how; fall back to SOUL.md when that is where the
  // agent kept its doctrine.
  const systemPrompt = (agents.body || soul.body || "").trim();

  const promoted = dedupeByKey(extractRules(files.memory || "").map(toLesson).filter(Boolean));
  const scratch = dedupeByKey(extractRules(files.learnings || "").map(toLesson).filter(Boolean));
  const tools = reduceTools(files.tools || "");

  return { ref: slugify(name, "imported-teammate"), name, description, systemPrompt, tools, promoted, scratch };
}

// Read an OpenClaw workspace off disk into the files object parseOpenClawWorkspace expects. Missing
// files simply read as empty — an agent without a MEMORY.md still imports (thin), never throws.
export function importFromDirectory(dirPath) {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(dirPath, rel), "utf8");
    } catch {
      return "";
    }
  };
  return {
    soul: read("SOUL.md"),
    agents: read("AGENTS.md") || read("AGENT.md"),
    memory: read("MEMORY.md"),
    tools: read("TOOLS.md"),
    learnings: read(path.join(".learnings", "LEARNINGS.md")) || read("LEARNINGS.md"),
  };
}

// Turn a parsed spec into the teammate DRAFT the crew flow carries: the agent-file markdown (with the
// reduced toolset in its frontmatter) plus the two imported lesson buckets the accept step seeds into
// the template soul. Nothing is persisted here.
export function createOpenClawDraft(parsed) {
  const draft = {
    ref: parsed.ref,
    name: parsed.name,
    description: parsed.description,
    systemPrompt: parsed.systemPrompt,
    tools: parsed.tools,
    importedPromoted: parsed.promoted || [],
    importedScratch: parsed.scratch || [],
    source: "openclaw",
  };
  return {
    ...draft,
    markdown: draftToMarkdown({ ...draft, tools: parsed.tools?.allowed }),
  };
}

// Seed a (freshly-ensured, possibly thin) template soul with the imported lessons: durable MEMORY
// rules land directly in the permanent `soul` as blessed-on-import entries; probation .learnings land
// in `learnings` as scratch, still needing the founder's tap to graduate. Idempotent — re-seeding the
// same ref never duplicates a lesson. Pure: returns a new soul object; the caller saves it. Entry
// shapes mirror teammate-soul.mjs (the `soul:<key>` id and the watching-learning shape) so a later
// live correction of the same pattern is a no-op, never a duplicate.
export function applyImportedSoul(soul = {}, { promoted = [], scratch = [] } = {}, { now = Date.now() } = {}) {
  const entries = Array.isArray(soul.soul) ? [...soul.soul] : [];
  const learnings = Array.isArray(soul.learnings) ? soul.learnings.map((l) => ({ ...l })) : [];

  for (const p of promoted) {
    const key = p?.patternKey || patternKeyFor(p?.text);
    const text = oneLine(p?.text);
    if (!key || !text) continue;
    const id = `soul:${key}`;
    if (entries.some((e) => e.id === id)) continue;
    entries.push({
      id,
      patternKey: key,
      text,
      why: oneLine(p?.why),
      source: "imported",
      graduatedAt: now,
      graduatedAtRun: null,
    });
  }

  for (const s of scratch) {
    const key = s?.patternKey || patternKeyFor(s?.text);
    const text = oneLine(s?.text);
    if (!key || !text) continue;
    if (learnings.some((l) => l.patternKey === key)) continue;
    learnings.push({
      patternKey: key,
      text,
      why: oneLine(s?.why),
      source: "imported",
      occurrences: [{ at: now, taskId: "import" }],
      status: "watching",
    });
  }

  return { ...soul, soul: entries, learnings };
}
