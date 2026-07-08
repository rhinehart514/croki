// Artifact store — read/write the real GTM-engineering artifacts: subagents and skills.
//
// An `agent` or `skill` workflow step carries a `ref`. That ref is a real markdown file:
//   agent  → <claudeDir>/agents/<ref>.md           (frontmatter: name, description, tools, model)
//   skill  → <claudeDir>/skills/<ref>/SKILL.md      (frontmatter: name, description, ...)
//
// This is host territory: deterministic file I/O, no model. The raw markdown is the
// source of truth — callers edit the WHOLE file (frontmatter + body), so nothing is lost
// to a lossy reconstruction. We additionally parse the frontmatter for a legible list/
// summary view, but never re-serialize from the parsed form.
//
// Safety: refs are validated as plain slugs and resolved strictly inside the agents/
// skills directories — no traversal, no writing outside the artifact roots, .md only.

import fs from "node:fs";
import os from "node:os";
import { listServers, effectiveClass } from "./mcp-store.mjs";
import path from "node:path";

function claudeDir(options = {}) {
  return options.claudeDir || process.env.GTM_IDE_CLAUDE_DIR || path.join(os.homedir(), ".claude");
}

function rootFor(type, options = {}) {
  const dir = claudeDir(options);
  if (type === "agent") return path.join(dir, "agents");
  if (type === "skill") return path.join(dir, "skills");
  throw new Error(`Unknown artifact type: ${type}`);
}

// A ref must be a single safe slug — no slashes, no dots, no traversal. This is the whole
// path-safety story: a valid slug can only ever resolve to one file inside the root.
export function isValidRef(ref) {
  return typeof ref === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,80}$/.test(ref);
}

export function fileForArtifact(type, ref, options = {}) {
  if (!isValidRef(ref)) throw new Error(`Invalid artifact ref: ${JSON.stringify(ref)}`);
  const root = rootFor(type, options);
  return type === "skill"
    ? path.join(root, ref, "SKILL.md")
    : path.join(root, `${ref}.md`);
}

// Minimal frontmatter reader — enough for the summary view (name, description, tools,
// model). NOT a YAML library and NOT used to write files back; the raw markdown is the
// source of truth. Returns { meta, body } with meta = {} when there's no frontmatter.
export function parseFrontmatter(content) {
  const text = String(content ?? "");
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const kv = /^([a-zA-Z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[kv[1]] = value;
  }
  return { meta, body: match[2] };
}

function summarize(type, ref, content) {
  const { meta } = parseFrontmatter(content);
  return {
    type,
    ref,
    name: meta.name || ref,
    description: meta.description || "",
    tools: meta.tools || "",
    model: meta.model || "",
    provider: meta.provider || "claude",
  };
}

// List every agent and skill on disk, with parsed summaries. Missing roots are simply
// empty — a fresh machine isn't an error.
export function listArtifacts(options = {}) {
  const agents = [];
  const skills = [];

  const agentsRoot = rootFor("agent", options);
  if (fs.existsSync(agentsRoot)) {
    for (const entry of fs.readdirSync(agentsRoot)) {
      if (!entry.endsWith(".md")) continue;
      const ref = entry.slice(0, -3);
      if (!isValidRef(ref)) continue;
      try {
        agents.push(summarize("agent", ref, fs.readFileSync(path.join(agentsRoot, entry), "utf8")));
      } catch { /* skip unreadable */ }
    }
  }

  const skillsRoot = rootFor("skill", options);
  if (fs.existsSync(skillsRoot)) {
    for (const entry of fs.readdirSync(skillsRoot)) {
      if (!isValidRef(entry)) continue;
      const file = path.join(skillsRoot, entry, "SKILL.md");
      if (!fs.existsSync(file)) continue;
      try {
        skills.push(summarize("skill", entry, fs.readFileSync(file, "utf8")));
      } catch { /* skip unreadable */ }
    }
  }

  agents.sort((a, b) => a.ref.localeCompare(b.ref));
  skills.sort((a, b) => a.ref.localeCompare(b.ref));
  return { agents, skills };
}

// The live capability inventory — what the crew can ACTUALLY reach right now, from real sources:
// the on-disk agents and skills (listArtifacts) plus every connected MCP tool (mcp-store), each
// tool carrying the lane it really sits in (read runs free; write stays behind the founder gate).
// Wave 4: this is injected into the compose prompt so the model composes from what exists instead
// of inventing refs, and exposed over HTTP so the UI can show the same inventory. Pure aggregation
// over live stores — never seeded, empty when nothing is connected/authored.
export function listCapabilities(options = {}) {
  const { agents, skills } = listArtifacts(options);
  const tools = [];
  for (const server of listServers(options)) {
    for (const tool of server.tools ?? []) {
      tools.push({ serverId: server.id, toolName: tool.name, lane: effectiveClass(tool) });
    }
  }
  return {
    tools,
    agents: agents.map((a) => ({ ref: a.ref, label: a.name })),
    skills: skills.map((s) => ({ name: s.ref })),
  };
}

// Read one artifact's full raw markdown. `exists:false` (not an error) when the ref has
// no file yet — that's the create case (e.g. a workflow references an agent you haven't
// authored). A scaffold is returned so the editor opens on a sensible starting point.
export function readArtifact(type, ref, options = {}) {
  const file = fileForArtifact(type, ref, options);
  if (!fs.existsSync(file)) {
    return { type, ref, exists: false, content: scaffold(type, ref), meta: { name: ref } };
  }
  const content = fs.readFileSync(file, "utf8");
  return { type, ref, exists: true, content, meta: parseFrontmatter(content).meta };
}

// Write the full raw markdown back. Creates the skill directory if needed. Atomic write.
export function writeArtifact(type, ref, content, options = {}) {
  if (typeof content !== "string" || !content.trim()) throw new Error("Artifact content must be a non-empty string.");
  const file = fileForArtifact(type, ref, options);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, content.endsWith("\n") ? content : `${content}\n`);
  fs.renameSync(tmp, file);
  return { ok: true, type, ref, path: file, meta: parseFrontmatter(content).meta };
}

// Starting point for a brand-new artifact — real frontmatter, ready to prompt-engineer.
function scaffold(type, ref) {
  if (type === "skill") {
    return `---
name: ${ref}
description: One line on what this skill does and when to apply it.
---

# ${ref}

Describe the judgment this skill brings to a workflow.
`;
  }
  return `---
name: ${ref}
description: One line on what this subagent does and when to invoke it. The model reads this to decide when to call it.
tools: Read, WebSearch, WebFetch
model: sonnet
provider: claude
---

# ${ref}

Describe what this subagent does, the inputs it expects, and the JSON it returns.
`;
}
