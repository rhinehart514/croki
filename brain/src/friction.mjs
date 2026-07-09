// Friction capture — the dogfood build queue for GTM IDE itself.
//
// This is feedback about the PRODUCT ("the gate card hid the citation"), never GTM taste
// ("too salesy" — that belongs to gate decisions and the feedback ledger). Two ledgers,
// two consumers: taste shapes the next RUN, friction shapes the next BUILD. Nothing here
// reads or writes taste memory.
//
// Reports land as one markdown file per item in dogfood/queue/ at the repo root — where a
// coding agent (a nightly Claude Code routine) can read them, work them into PRs, and the
// PRs wait at founder review. Capture must land where coding agents can read; a report that
// only lives in app state breaks the loop.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_QUEUE_DIR = path.join(REPO_ROOT, "dogfood", "queue");

const KINDS = new Set(["friction", "bug", "wish", "feature"]);

function readGitSha() {
  try {
    return execSync("git rev-parse HEAD", { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null; // honest absence — never a fake value
  }
}

export function slugify(text) {
  const slug = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "report";
}

// File a friction report. `input.snapshot` is whatever real state the caller could gather
// (project, pending gates, session ids) — absent pieces stay absent rather than invented.
export function reportFriction(input = {}, options = {}) {
  const report = String(input.report ?? "").trim();
  if (!report) throw new Error("A friction report needs the words — what got in the way?");

  const kind = KINDS.has(input.kind) ? input.kind : "friction";
  const context = String(input.context ?? "").trim();
  const snapshot = input.snapshot && typeof input.snapshot === "object" ? input.snapshot : {};
  const now = options.now ? new Date(options.now) : new Date();
  const gitSha = "gitSha" in options ? options.gitSha : readGitSha();
  const queueDir = options.queueDir ?? DEFAULT_QUEUE_DIR;

  fs.mkdirSync(queueDir, { recursive: true });

  const stamp = now.toISOString().replace(/\.\d+Z$/, "Z").replace(/[:]/g, "").replace("T", "-").replace("Z", "");
  const base = `${stamp}-${slugify(report)}`;
  let file = path.join(queueDir, `${base}.md`);
  for (let n = 2; fs.existsSync(file); n += 1) {
    file = path.join(queueDir, `${base}-${n}.md`);
  }

  const lines = [
    "---",
    `kind: ${kind}`,
    "status: open",
    `captured_at: ${now.toISOString()}`,
    `git_sha: ${gitSha ?? "unknown"}`,
    `source: ${input.source ?? "unknown"}`,
  ];
  // Optional observability frontmatter — emitted ONLY when the caller supplies it, and appended AFTER
  // the source line so every existing exact-prefix assertion (kind/status/captured_at/git_sha/source)
  // still matches byte-identically. A manual friction report (no signature/category) writes none of
  // these, so its file is unchanged. Auto-logged self-observed failures carry the full set.
  if (input.signature) lines.push(`signature: ${input.signature}`);
  if (input.category) lines.push(`category: ${input.category}`);
  if (input.failureClass) lines.push(`failure_class: ${input.failureClass}`);
  const occurrences = Number.isFinite(input.occurrences) ? input.occurrences : (input.signature ? 1 : null);
  if (occurrences != null) lines.push(`occurrences: ${occurrences}`);
  if (input.firstSeen) lines.push(`first_seen: ${input.firstSeen}`);
  if (input.lastSeen) lines.push(`last_seen: ${input.lastSeen ?? now.toISOString()}`);
  lines.push(
    "---",
    "",
    report,
    "",
  );
  if (context) {
    lines.push("## What was happening", "", context, "");
  }
  lines.push("## Snapshot", "", "```json", JSON.stringify(snapshot, null, 2), "```", "");

  fs.writeFileSync(file, lines.join("\n"));
  return {
    file,
    kind,
    capturedAt: now.toISOString(),
    gitSha: gitSha ?? null,
    signature: input.signature ?? null,
    category: input.category ?? null,
    failureClass: input.failureClass ?? null,
    queued: true,
  };
}

// Update a queue item in place: patch frontmatter fields (status, branch, …) and optionally
// append a markdown section. The SPINE writes these transitions — never the model — so the
// queue's status is always real process state, not a claim.
export function updateFrictionItem(file, { fields = {}, appendSection } = {}) {
  let text = fs.readFileSync(file, "utf8");
  const head = text.match(/^---\n([\s\S]*?)\n---/);
  if (!head) throw new Error(`Queue item has no frontmatter: ${file}`);
  let front = head[1];
  for (const [key, value] of Object.entries(fields)) {
    const line = `${key}: ${value}`;
    const pattern = new RegExp(`^${key}: .*$`, "m");
    front = pattern.test(front) ? front.replace(pattern, line) : `${front}\n${line}`;
  }
  text = `---\n${front}\n---${text.slice(head[0].length)}`;
  if (appendSection) {
    if (!text.endsWith("\n")) text += "\n";
    text += `\n${appendSection.trim()}\n`;
  }
  fs.writeFileSync(file, text);
  return { file };
}

// List open reports — lets a routine (or the founder) see the queue without parsing files.
export function listFrictionQueue(options = {}) {
  const queueDir = options.queueDir ?? DEFAULT_QUEUE_DIR;
  let entries;
  try {
    entries = fs.readdirSync(queueDir).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return { queueDir, reports: [] };
  }
  const reports = entries.map((name) => {
    const text = fs.readFileSync(path.join(queueDir, name), "utf8");
    const head = text.match(/^---\n([\s\S]*?)\n---/);
    const meta = {};
    for (const line of (head?.[1] ?? "").split("\n")) {
      const m = line.match(/^([a-z_]+):\s*(.*)$/);
      if (m) meta[m[1]] = m[2];
    }
    const body = text.slice(head ? head[0].length : 0);
    const firstLine = body.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#")) ?? "";
    // The raw error/output snippet a self-observed failure wrote under "## What broke" — the one line a
    // founder surface renders in monospace. Absent (manual friction) → null, never invented.
    const brokeMatch = body.match(/##\s*What broke\s*\n+([^\n]+)/);
    return {
      file: name,
      kind: meta.kind ?? "friction",
      status: meta.status ?? "open",
      capturedAt: meta.captured_at ?? null,
      summary: firstLine,
      // Observability fields (present only on self-observed failures; null on manual friction). occurrences
      // is coerced to a Number so the surface can compare/format it; the rest stay strings.
      signature: meta.signature ?? null,
      category: meta.category ?? null,
      failureClass: meta.failure_class ?? null,
      occurrences: meta.occurrences != null ? Number(meta.occurrences) : null,
      firstSeen: meta.first_seen ?? null,
      lastSeen: meta.last_seen ?? null,
      gitSha: meta.git_sha ?? null,
      errorSnippet: brokeMatch ? brokeMatch[1].trim() : null,
    };
  });
  return { queueDir, reports };
}
