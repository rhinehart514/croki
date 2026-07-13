// Bounded, repo-local context discovery.
//
// A project repository is an approved surface, not trusted context. This module inventories likely
// evidence without persisting or treating it as true, explains why a small number of files may matter,
// and turns only a founder-confirmed candidate into an ordinary work artifact with source provenance.
// It deliberately is not an ingestion pipeline: no embeddings, watcher, index, special folder, or
// background write exists here.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createWorkArtifact, getWorkArtifact, loadWorkArtifactStore } from "./work-artifact-store.mjs";

const MAX_FILES = 4_000;
const MAX_DEPTH = 10;
const MAX_SAMPLE_BYTES = 64_000;
const MAX_HASH_BYTES = 12_000_000;
const DEFAULT_LIMIT = 6;

const SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", "dist", "build", "coverage", ".turbo", ".cache",
  ".vercel", ".playwright", ".playwright-cli", "vendor", "target", "out",
  ".claude", ".codex", ".agents", ".clerk", ".founder-os", ".bottleneck",
]);

const EVIDENCE_EXTENSIONS = new Set([
  ".csv", ".tsv", ".json", ".jsonl", ".ndjson", ".yaml", ".yml", ".md", ".mdx",
  ".txt", ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".html",
]);

const TEXT_EXTENSIONS = new Set([
  ".csv", ".tsv", ".json", ".jsonl", ".ndjson", ".yaml", ".yml", ".md", ".mdx",
  ".txt", ".html",
]);

const SENSITIVE_NAMES = /(^|[._-])(secret|secrets|credential|credentials|private[-_]?key|access[-_]?token|refresh[-_]?token)([._-]|$)/i;
const SENSITIVE_FILES = /(^|\/)(\.env(?:\.|$)|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)|.*\.(?:pem|p12|pfx|key))$/i;
const GENERATED_FILES = /(^|\/)(?:package-lock|pnpm-lock|yarn\.lock|bun\.lock|tsconfig.*\.tsbuildinfo)(?:\.|$)/i;

const SIGNALS = [
  { kind: "customer-voice", pattern: /\b(customer|client|buyer|user)[-_ ]?(interview|call|notes?|feedback|quote|research)\b/i, reason: "It may contain direct customer language or unmet needs." },
  { kind: "market-footprint", pattern: /\b(account|accounts|company|companies|domain|domains|lead|leads|prospect|prospects|footprint|installed[-_ ]?base|incumbent|verified)\b/i, reason: "It may reveal a reachable market, installed base, or displacement opportunity." },
  { kind: "campaign-result", pattern: /\b(campaign|outbound|sequence|launch|newsletter|ad[-_ ]?set|creative)[-_ ]?(result|results|report|export|performance|metrics?)?\b/i, reason: "It may show which message or distribution motion actually moved." },
  { kind: "analytics", pattern: /\b(analytics|events?|funnel|conversion|retention|cohort|traffic|attribution|signups?|revenue|mrr|arr)[-_ ]?(export|report|results?|data)?\b/i, reason: "It may contain observed behavior or an attributable product outcome." },
  { kind: "sales", pattern: /\b(sales|pitch|demo|discovery|objection|pipeline|win[-_ ]?loss|lost[-_ ]?deal|proposal|deck)\b/i, reason: "It may expose buyer objections, proof, or a sales motion worth reusing." },
  { kind: "competition", pattern: /\b(competitor|competitive|alternative|landscape|market[-_ ]?map|battlecard|positioning)\b/i, reason: "It may sharpen the category, differentiation, or incumbent to displace." },
  { kind: "experiment", pattern: /\b(experiment|test|hypothesis|pilot|prototype|abandoned|postmortem|retro|learning|learnings)\b/i, reason: "It may prevent Drover from repeating an old experiment or losing a useful learning." },
];

const STOP_WORDS = new Set([
  "about", "after", "again", "against", "also", "and", "because", "before", "being", "between",
  "could", "drover", "from", "have", "into", "more", "most", "other", "over", "should", "that",
  "their", "there", "these", "they", "this", "through", "under", "what", "when", "where", "which",
  "with", "would", "your", "product", "question", "current",
  "can", "shape", "evidence", "movement", "gtm", "market",
]);

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function realDirectory(input) {
  const resolved = fs.realpathSync(path.resolve(String(input ?? "")));
  if (!fs.statSync(resolved).isDirectory()) throw new Error("The approved context surface must be a directory.");
  return resolved;
}

function safeRelative(root, file) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  if (!relative || relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error("Context evidence must stay inside the approved repository.");
  }
  return relative;
}

function isSensitive(relative) {
  const normalized = relative.split(path.sep).join("/");
  return SENSITIVE_FILES.test(normalized) || SENSITIVE_NAMES.test(path.basename(normalized));
}

function walk(root, options = {}) {
  const maxFiles = clamp(Number(options.maxFiles) || MAX_FILES, 1, MAX_FILES);
  const files = [];
  const stack = [{ directory: root, depth: 0 }];
  let truncated = false;

  while (stack.length && files.length < maxFiles) {
    const { directory, depth } = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= maxFiles) { truncated = true; break; }
      if (entry.isSymbolicLink()) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH && !SKIP_DIRS.has(entry.name)) stack.push({ directory: full, depth: depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      const relative = safeRelative(root, full);
      const extension = path.extname(entry.name).toLowerCase();
      if (!EVIDENCE_EXTENSIONS.has(extension) || isSensitive(relative) || GENERATED_FILES.test(relative)) continue;
      try {
        const stat = fs.statSync(full);
        if (stat.size === 0) continue;
        files.push({ full, relative, extension, bytes: stat.size, modifiedAt: stat.mtime.toISOString() });
      } catch { /* file disappeared while scouting */ }
    }
  }
  return { files, truncated: truncated || stack.length > 0 };
}

function readSample(file) {
  if (!TEXT_EXTENSIONS.has(file.extension)) return "";
  try {
    const size = Math.min(file.bytes, MAX_SAMPLE_BYTES);
    const handle = fs.openSync(file.full, "r");
    try {
      const buffer = Buffer.alloc(size);
      const count = fs.readSync(handle, buffer, 0, size, 0);
      return buffer.subarray(0, count).toString("utf8").replace(/\0/g, " ");
    } finally { fs.closeSync(handle); }
  } catch { return ""; }
}

function csvShape(file, sample) {
  if (file.extension !== ".csv" && file.extension !== ".tsv") return null;
  const delimiter = file.extension === ".tsv" ? "\t" : ",";
  const lines = sample.split(/\r?\n/).filter(Boolean);
  const header = String(lines[0] ?? "").split(delimiter).map((value) => value.replace(/^\s*["']|["']\s*$/g, "").trim()).filter(Boolean).slice(0, 16);
  let rows = Math.max(0, lines.length - 1);
  let exact = file.bytes <= MAX_HASH_BYTES;
  if (exact) {
    try {
      const text = fs.readFileSync(file.full, "utf8");
      rows = Math.max(0, text.split(/\r?\n/).filter(Boolean).length - 1);
    } catch { exact = false; }
  }
  return { rows, exact, columns: header };
}

function words(value) {
  return [...new Set(String(value ?? "").toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [])]
    .filter((word) => !STOP_WORDS.has(word))
    .slice(0, 40);
}

function projectLanguage(project) {
  const sc = project?.sharedContext ?? {};
  return [
    project?.name, sc.product?.name, sc.product?.description, sc.repository?.headline,
    sc.icp?.description, sc.icp?.buyer, sc.icp?.summary,
    sc.positioning?.promise, sc.positioning?.category, sc.positioning?.summary,
  ].filter(Boolean).join(" ");
}

function findingFor(file, shape, kind) {
  const label = path.basename(file.relative).replace(/[-_]+/g, " ").replace(/\.[^.]+$/, "").trim();
  if (shape?.rows) {
    const noun = kind === "market-footprint" ? "possible accounts" : "records";
    return `I found ${shape.exact ? shape.rows : `at least ${shape.rows}`} ${noun} in “${label}.”`;
  }
  return `I found “${label},” a ${kind.replace(/-/g, " ")} artifact in the approved repository.`;
}

function inspectFile(root, file, contextWords) {
  const sample = readSample(file);
  const pathText = file.relative.replace(/[-_/\.]+/g, " ");
  const contentText = sample.slice(0, 24_000);
  const searchable = `${pathText} ${contentText}`;
  const pathSignals = SIGNALS.filter((signal) => signal.pattern.test(pathText));
  const contentSignals = SIGNALS.filter((signal) => signal.pattern.test(contentText));
  const signals = pathSignals.length ? [...pathSignals, ...contentSignals.filter((signal) => !pathSignals.includes(signal))] : contentSignals;
  const pathContext = contextWords.filter((word) => pathText.toLowerCase().includes(word));
  const contentContext = contextWords.filter((word) => contentText.toLowerCase().includes(word));
  const matchedContext = [...new Set([...pathContext, ...contentContext])];
  const shape = csvShape(file, sample);
  const primary = signals[0] ?? (matchedContext.length ? { kind: "context", reason: "It overlaps the current product or GTM question and may change the work." } : null);
  if (!primary) return null;

  let score = pathSignals.length * 25
    + Math.min(18, contentSignals.length * 6)
    + Math.min(18, pathContext.length * 6)
    + Math.min(12, contentContext.length * 2);
  if (shape?.rows) score += 22 + Math.min(20, Math.log10(shape.rows + 1) * 7);
  if ([".pdf", ".ppt", ".pptx", ".doc", ".docx", ".xls", ".xlsx"].includes(file.extension)) score += 5;
  if (/\b(result|results|verified|interview|research|export|footprint|learning|postmortem)\b/i.test(pathText)) score += 18;
  // Prose can mention many GTM nouns incidentally. Keep content-only documents visible but below
  // purpose-shaped evidence such as an interview note, campaign result, or verified data export.
  if (!pathSignals.length && !shape && !pathContext.length) score = Math.min(score, 42);
  score = Math.round(clamp(score, 1, 100));

  const whyItMayMatter = primary.kind === "market-footprint" && shape?.rows
    ? `A footprint of ${shape.exact ? shape.rows : `at least ${shape.rows}`} possible accounts may support an incumbent-displacement ICP or an outbound experiment.`
    : primary.reason;

  const digest = crypto.createHash("sha256");
  digest.update(file.relative);
  digest.update("\0");
  digest.update(String(file.bytes));
  digest.update("\0");
  digest.update(file.modifiedAt);
  // Hash the full artifact while it is reasonably bounded. Large files still use their sampled bytes,
  // size, and mtime so discovery never turns into a universal ingestion job.
  if (file.bytes <= MAX_HASH_BYTES) {
    try { digest.update(fs.readFileSync(file.full)); } catch { if (sample) digest.update(sample); }
  } else if (sample) digest.update(sample);
  const fingerprint = digest.digest("hex");

  return {
    id: `context-candidate-${fingerprint.slice(0, 16)}`,
    path: file.relative,
    kind: primary.kind,
    finding: findingFor(file, shape, primary.kind),
    whyItMayMatter,
    relevance: score,
    matchedContext,
    shape,
    source: { surface: "repository", path: file.relative, bytes: file.bytes, modifiedAt: file.modifiedAt, fingerprint },
  };
}

export function discoverContextCandidates({ root, project = null, question = "", limit = DEFAULT_LIMIT } = {}, options = {}) {
  const approvedRoot = realDirectory(root);
  const { files, truncated } = walk(approvedRoot, options);
  const contextWords = words(`${question} ${projectLanguage(project)}`);
  const ranked = files
    .map((file) => inspectFile(approvedRoot, file, contextWords))
    .filter(Boolean)
    .sort((a, b) => b.relevance - a.relevance || a.path.localeCompare(b.path));
  const wanted = clamp(Number(limit) || DEFAULT_LIMIT, 1, 12);
  const candidates = [];
  const perDirectory = new Map();
  for (const candidate of ranked) {
    const directory = path.posix.dirname(candidate.path);
    const count = perDirectory.get(directory) ?? 0;
    if (count >= 3) continue;
    candidates.push(candidate);
    perDirectory.set(directory, count + 1);
    if (candidates.length >= wanted) break;
  }
  return {
    surface: { kind: "repository", root: approvedRoot },
    question: String(question ?? "").trim() || null,
    candidates,
    scannedFiles: files.length,
    truncated,
    note: "These are candidates, not accepted facts. Nothing was persisted.",
  };
}

function candidateFile(root, candidate) {
  const approvedRoot = realDirectory(root);
  const requested = path.resolve(approvedRoot, String(candidate?.path ?? ""));
  const relative = safeRelative(approvedRoot, requested);
  if (isSensitive(relative)) throw new Error("Sensitive files cannot be promoted into shared context.");
  const real = fs.realpathSync(requested);
  safeRelative(approvedRoot, real);
  const stat = fs.statSync(real);
  if (!stat.isFile()) throw new Error("The context candidate is no longer a file.");
  const inspected = inspectFile(approvedRoot, {
    full: real,
    relative,
    extension: path.extname(real).toLowerCase(),
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  }, words(candidate?.question));
  if (!inspected) throw new Error("The file no longer qualifies as context evidence.");
  if (candidate?.source?.fingerprint && candidate.source.fingerprint !== inspected.source.fingerprint) {
    throw new Error("The context candidate changed after discovery. Scout it again before promoting it.");
  }
  return inspected;
}

export function promoteContextCandidate({ projectId, root, candidate, expectedStoreRevision, idempotencyKey } = {}, options = {}) {
  if (!projectId) throw new Error("projectId is required.");
  if (!Number.isInteger(expectedStoreRevision) || expectedStoreRevision < 0) throw new Error("expectedStoreRevision must be a non-negative integer.");
  const inspected = candidateFile(root, candidate);
  const artifactId = `context-evidence-${inspected.source.fingerprint.slice(0, 16)}`;
  try {
    return { artifact: getWorkArtifact(projectId, artifactId, { ...options, includeRetired: false }), created: false };
  } catch {
    const current = loadWorkArtifactStore(projectId, options);
    if (current.revision !== expectedStoreRevision) throw new Error(`Stale work artifact store revision: expected ${expectedStoreRevision}, current ${current.revision}.`);
    const artifact = createWorkArtifact(projectId, {
      id: artifactId,
      kind: "context-evidence",
      title: path.basename(inspected.path),
      summary: inspected.finding,
      format: "json",
      contentType: "application/json",
      status: "accepted",
      content: {
        finding: inspected.finding,
        whyItMatters: String(candidate?.whyItMayMatter ?? inspected.whyItMayMatter).trim(),
        source: inspected.source,
        shape: inspected.shape,
      },
      refs: [{ type: "repository-file", id: inspected.path }],
      evidence: [{ type: "repository-file", ref: inspected.path, fingerprint: inspected.source.fingerprint }],
      // The file + fingerprint are direct observations. Founder acceptance promotes relevance, not the
      // truth of every row, so this is deliberately "observed" rather than a minted "proven" claim.
      provenance: "observed",
      createdBy: { type: "founder", id: "founder" },
      revisionAuthor: { type: "founder", id: "founder" },
      expectedStoreRevision,
      idempotencyKey: String(idempotencyKey ?? `promote-context:${projectId}:${inspected.source.fingerprint}`),
    }, options);
    return { artifact, created: true };
  }
}
