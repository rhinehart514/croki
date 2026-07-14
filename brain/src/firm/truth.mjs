// A bounded, cited snapshot of a venture repository. It reports only files and manifest facts that
// exist; interpretation stays with the teammate consuming it.

import fs from "node:fs";
import path from "node:path";

const IGNORED = new Set([".git", ".next", "dist", "node_modules", "release", ".dogfood-worktrees"]);
const MAX_FILES = 2_000;

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
  const root = path.resolve(inputRoot || process.cwd());
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Repository directory does not exist: ${root}`);
  }
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
