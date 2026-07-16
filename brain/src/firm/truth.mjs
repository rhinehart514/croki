// A bounded, cited snapshot of a venture repository. It reports only files and manifest facts that
// exist; interpretation stays with the teammate consuming it.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const IGNORED = new Set([".git", ".next", "dist", "node_modules", "release", ".dogfood-worktrees"]);
const MAX_FILES = 2_000;
const MAX_SEARCH_RESULTS = 50;
const MAX_SEARCH_FILE_BYTES = 512_000;
const MAX_EXCERPT_LINES = 120;
const MAX_EXCERPT_BYTES = 24_000;

function walk(directory, root, files) {
  if (files.length >= MAX_FILES) return;
  let entries = [];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (files.length >= MAX_FILES) break;
    if (IGNORED.has(entry.name) || entry.name.startsWith(".env")) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, root, files);
    else if (entry.isFile()) files.push(path.relative(root, absolute));
  }
}

function fail(message, code = "repository_path_invalid", status = 400) {
  throw Object.assign(new Error(message), { code, status });
}

function repositoryRoot(inputRoot) {
  const requested = path.resolve(inputRoot || process.cwd());
  if (!fs.existsSync(requested) || !fs.statSync(requested).isDirectory()) {
    fail(`Repository directory does not exist: ${requested}`, "repository_not_found", 404);
  }
  return fs.realpathSync(requested);
}

function safeRepositoryFile(root, requestedPath) {
  const relative = String(requestedPath ?? "").trim().replaceAll("\\", "/");
  if (!relative || path.isAbsolute(relative) || relative.split("/").some((part) => !part || part === ".." || IGNORED.has(part) || part.startsWith(".env"))) {
    fail("Repository reads need a safe relative path outside ignored and secret-bearing locations.");
  }
  const joined = path.resolve(root, relative);
  let real;
  try {
    real = fs.realpathSync(joined);
  } catch {
    fail(`Repository file does not exist: ${relative}`, "repository_file_not_found", 404);
  }
  if (real !== root && !real.startsWith(`${root}${path.sep}`)) fail("Repository path escapes the venture repository.", "repository_path_escape", 403);
  const stat = fs.statSync(real);
  if (!stat.isFile()) fail(`Repository path is not a file: ${relative}`);
  return { absolute: real, path: path.relative(root, real).split(path.sep).join("/"), stat };
}

function wildcard(pattern) {
  const source = String(pattern ?? "").trim().replaceAll("\\", "/");
  if (!source) return null;
  const escaped = source.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("**", "\u0000").replaceAll("*", "[^/]*").replaceAll("\u0000", ".*").replaceAll("?", "[^/]");
  return new RegExp(`^${escaped}$`, "i");
}

function searchable(text) {
  return !text.includes("\u0000");
}

export function searchRepository(inputRoot, { query, include = [], maxResults = MAX_SEARCH_RESULTS } = {}) {
  const needle = String(query ?? "").trim();
  if (!needle || needle.length > 200) fail("Repository search needs a query between 1 and 200 characters.", "repository_search_invalid");
  const root = repositoryRoot(inputRoot);
  const files = [];
  walk(root, root, files);
  const patterns = (Array.isArray(include) ? include : [include]).map(wildcard).filter(Boolean).slice(0, 12);
  const limit = Math.max(1, Math.min(MAX_SEARCH_RESULTS, Number(maxResults) || MAX_SEARCH_RESULTS));
  const matches = [];
  let truncated = files.length >= MAX_FILES;
  for (const candidate of files.sort()) {
    if (matches.length >= limit) { truncated = true; break; }
    const relative = candidate.split(path.sep).join("/");
    if (patterns.length && !patterns.some((pattern) => pattern.test(relative))) continue;
    let file;
    try { file = safeRepositoryFile(root, relative); } catch { continue; }
    if (file.stat.size > MAX_SEARCH_FILE_BYTES) continue;
    let body;
    try { body = fs.readFileSync(file.absolute, "utf8"); } catch { continue; }
    if (!searchable(body)) continue;
    const lines = body.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].toLocaleLowerCase().includes(needle.toLocaleLowerCase())) continue;
      matches.push({ path: file.path, line: index + 1, excerpt: lines[index].slice(0, 500) });
      if (matches.length >= limit) { truncated = index + 1 < lines.length || truncated; break; }
    }
  }
  return { query: needle, matches, truncated, searchedFiles: Math.min(files.length, MAX_FILES) };
}

export function readRepositoryExcerpt(inputRoot, { file: requestedPath, startLine = 1, endLine = null } = {}) {
  const root = repositoryRoot(inputRoot);
  const file = safeRepositoryFile(root, requestedPath);
  if (file.stat.size > 2_000_000) fail("Repository excerpt source is too large to read safely.", "repository_file_too_large", 413);
  const body = fs.readFileSync(file.absolute, "utf8");
  if (!searchable(body)) fail("Repository excerpt source is not text.", "repository_file_not_text");
  const lines = body.split(/\r?\n/);
  const from = Number(startLine);
  const requestedEnd = endLine == null ? from + 39 : Number(endLine);
  if (!Number.isInteger(from) || !Number.isInteger(requestedEnd) || from < 1 || requestedEnd < from || requestedEnd - from + 1 > MAX_EXCERPT_LINES) {
    fail(`Repository excerpts need a valid range of at most ${MAX_EXCERPT_LINES} lines.`, "repository_excerpt_invalid");
  }
  if (from > lines.length) fail(`Repository excerpt begins beyond ${file.path}'s ${lines.length} lines.`, "repository_excerpt_invalid");
  const to = Math.min(requestedEnd, lines.length);
  const excerpt = lines.slice(from - 1, to).join("\n");
  if (Buffer.byteLength(excerpt, "utf8") > MAX_EXCERPT_BYTES) fail("Repository excerpt is too large; request a narrower line range.", "repository_excerpt_too_large", 413);
  const digest = crypto.createHash("sha256").update(excerpt).digest("hex");
  const ref = `repository:${file.path}#L${from}-L${to}:${digest.slice(0, 12)}`;
  return { ref, kind: "repository", path: file.path, startLine: from, endLine: to, excerpt, digest, observedAt: new Date().toISOString() };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function firstReadable(root, names) {
  for (const name of names) {
    const file = path.join(root, name);
    try {
      const text = fs.readFileSync(file, "utf8").trim();
      if (text) return { file: name, line: 1, excerpt: text.slice(0, 2_000) };
    } catch {
      // Missing context is honest absence.
    }
  }
  return null;
}

export function readRepositoryTruth(inputRoot) {
  const root = repositoryRoot(inputRoot);
  const files = [];
  walk(root, root, files);
  files.sort();
  const manifest = readJson(path.join(root, "package.json"));
  const context = firstReadable(root, ["README.md", "docs/STATE.md", "pyproject.toml", "Cargo.toml"]);
  const citations = [];
  if (manifest) {
    citations.push({
      file: "package.json",
      line: 1,
      excerpt: JSON.stringify({ name: manifest.name, description: manifest.description, scripts: manifest.scripts ?? {} }),
    });
  }
  if (context) citations.push(context);
  return {
    evidenceState: citations.length ? "grounded" : "blind",
    repository: root,
    observedAt: new Date().toISOString(),
    files,
    manifest: manifest ? {
      name: manifest.name ?? null,
      description: manifest.description ?? null,
      scripts: manifest.scripts ?? {},
      dependencies: Object.keys(manifest.dependencies ?? {}).sort(),
    } : null,
    citations,
  };
}
