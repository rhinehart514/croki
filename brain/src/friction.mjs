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
import { execSync, execFile } from "node:child_process";
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

// Resolve the repo's git sha WITHOUT blocking the event loop, and cache it process-wide. The self-observing
// failure sink runs synchronously inside the run's node loop; letting reportFriction fall to the synchronous
// readGitSha (execSync spawns git and stalls the whole loop, 5-50ms and spiking to seconds under lock
// contention) would add latency to the run and every concurrent session on each first-occurrence failure.
// So the sink resolves the sha ONCE off the hot path via this async reader and threads it into options, and
// reportFriction's `"gitSha" in options` skip then fires — no execSync on the run path. The first call
// spawns `git rev-parse` non-blocking and memoizes the promise; every later call awaits the same resolved
// value. A failure resolves to null (honest absence), never a fake sha.
let gitShaPromise = null;
export function resolveGitShaAsync() {
  if (gitShaPromise) return gitShaPromise;
  gitShaPromise = new Promise((resolve) => {
    try {
      execFile("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT }, (err, stdout) => {
        resolve(err ? null : String(stdout).trim() || null);
      });
    } catch {
      resolve(null);
    }
  });
  return gitShaPromise;
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

// The dedup lookup the self-observing failure sink runs on the hot path — find the OPEN self-observed queue
// entry whose signature matches, or null. It is deliberately LIGHTER than listFrictionQueue: it reads only
// each file's frontmatter block (a bounded head slice, not the whole body), skips every file that carries no
// `signature:` line (manual friction — never a dedup target), and SHORT-CIRCUITS on the first match instead
// of building a report object for every file. The cost stays proportional to the self-observed queue up to
// the match, and it never parses item bodies. Returns { file, occurrences } or null.
export function findOpenFailureBySignature(signature, options = {}) {
  if (!signature) return null;
  const queueDir = options.queueDir ?? DEFAULT_QUEUE_DIR;
  let entries;
  try {
    entries = fs.readdirSync(queueDir).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return null;
  }
  for (const name of entries) {
    let head;
    try {
      // Read only the head of the file — the frontmatter block lives at the top, so a small slice is enough
      // to read status/signature/occurrences without pulling the whole body into memory.
      const fd = fs.openSync(path.join(queueDir, name), "r");
      try {
        const buf = Buffer.alloc(2048);
        const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
        head = buf.toString("utf8", 0, bytes);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      continue;
    }
    const m = head.match(/^---\n([\s\S]*?)\n---/);
    if (!m) continue;
    const front = m[1];
    // Skip manual friction fast — no signature line means it can never be a dedup target.
    const sigMatch = front.match(/^signature:\s*(.*)$/m);
    if (!sigMatch || sigMatch[1].trim() !== signature) continue;
    const statusMatch = front.match(/^status:\s*(.*)$/m);
    const status = statusMatch ? statusMatch[1].trim() : "open";
    if (status !== "open") continue;
    const occMatch = front.match(/^occurrences:\s*(.*)$/m);
    const occurrences = occMatch && Number.isFinite(Number(occMatch[1])) ? Number(occMatch[1]) : 1;
    return { file: name, occurrences };
  }
  return null;
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
