#!/usr/bin/env node

// Keep GitHub Actions dependency declarations honest. setup-node validates cache paths before the
// application suite can run, so a removed workspace must fail this local acceptance check instead of
// leaving main red with no product tests executed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowRoot = path.join(root, ".github", "workflows");
const workflowFiles = fs.readdirSync(workflowRoot)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .map((name) => path.join(workflowRoot, name));
const declaredLocks = new Set();
const issues = [];

function literal(value) {
  const clean = value.trim().replace(/^["']|["']$/g, "");
  return clean && !clean.includes("${{") && !/[?*[\]]/.test(clean) ? clean : null;
}

for (const workflowFile of workflowFiles) {
  const relativeWorkflow = path.relative(root, workflowFile);
  const lines = fs.readFileSync(workflowFile, "utf8").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const cacheStart = line.match(/^(\s*)cache-dependency-path:\s*(.*)$/);
    if (cacheStart) {
      const inline = literal(cacheStart[2]);
      if (inline && inline !== "|") declaredLocks.add(inline);
      if (cacheStart[2].trim() === "|") {
        const indentation = cacheStart[1].length;
        for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
          const candidate = lines[cursor];
          if (!candidate.trim()) continue;
          const candidateIndentation = candidate.match(/^\s*/)?.[0].length ?? 0;
          if (candidateIndentation <= indentation) break;
          const dependencyPath = literal(candidate);
          if (dependencyPath) declaredLocks.add(dependencyPath);
        }
      }
    }

    const install = line.match(/\bnpm\s+(?:--prefix\s+([^\s]+)\s+)?ci\b/);
    if (install) {
      const prefix = literal(install[1] ?? "");
      declaredLocks.add(prefix ? path.posix.join(prefix, "package-lock.json") : "package-lock.json");
    }
  }

  if (!lines.some((line) => line.includes("scripts/check-workflow-lockfiles.mjs"))) {
    issues.push(`${relativeWorkflow} does not run the workflow dependency-path check.`);
  }
}

for (const dependencyPath of declaredLocks) {
  if (!fs.existsSync(path.join(root, dependencyPath))) {
    issues.push(`Workflow dependency path does not exist: ${dependencyPath}`);
  }
}

if (issues.length) {
  process.stderr.write(`${issues.map((issue) => `- ${issue}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Workflow dependency paths verified (${declaredLocks.size} lockfiles).\n`);
}
