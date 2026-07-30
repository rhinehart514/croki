#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - This is a synchronous, read-only Git report boundary.

import * as NodeChildProcess from "node:child_process";
import * as NodeProcess from "node:process";

import { isCrokiOwnedPath } from "./check-croki-overlay.ts";

export interface OverlayChange {
  readonly status: string;
  readonly oldPath: string | null;
  readonly path: string;
}

export interface CrokiOverlayReport {
  readonly base: string;
  readonly overlappingUpstreamFiles: readonly OverlayChange[];
  readonly crokiOwnedAdditions: readonly OverlayChange[];
  readonly crokiOwnedRemovals: readonly OverlayChange[];
}

function runGit(repoRoot: string, args: readonly string[]): string {
  return NodeChildProcess.execFileSync("git", [...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function parseNameStatusZ(output: string): readonly OverlayChange[] {
  const fields = output.split("\0").filter(Boolean);
  const changes: OverlayChange[] = [];
  for (let index = 0; index < fields.length; ) {
    const status = fields[index++];
    if (!status) break;
    if (status.startsWith("R") || status.startsWith("C")) {
      const oldPath = fields[index++];
      const path = fields[index++];
      if (oldPath && path) changes.push({ status, oldPath, path });
      continue;
    }
    const path = fields[index++];
    if (path) changes.push({ status, oldPath: status === "D" ? path : null, path });
  }
  return changes;
}

export function classifyCrokiOverlayChanges(input: {
  readonly base: string;
  readonly basePaths: ReadonlySet<string>;
  readonly changes: readonly OverlayChange[];
  readonly untrackedPaths?: readonly string[];
}): CrokiOverlayReport {
  const changes = [
    ...input.changes,
    ...(input.untrackedPaths ?? []).map(
      (path): OverlayChange => ({ status: "?", oldPath: null, path }),
    ),
  ];
  const overlappingUpstreamFiles = changes.filter((change) => {
    const basePath = change.oldPath ?? change.path;
    return input.basePaths.has(basePath);
  });
  const crokiOwnedAdditions = changes.filter(
    (change) =>
      change.status !== "D" && !input.basePaths.has(change.path) && isCrokiOwnedPath(change.path),
  );
  const crokiOwnedRemovals = changes.filter(
    (change) =>
      change.status === "D" && input.basePaths.has(change.path) && isCrokiOwnedPath(change.path),
  );
  const sortChanges = (entries: readonly OverlayChange[]) =>
    entries.toSorted(
      (left, right) =>
        left.path.localeCompare(right.path) ||
        (left.oldPath ?? "").localeCompare(right.oldPath ?? "") ||
        left.status.localeCompare(right.status),
    );

  return {
    base: input.base,
    overlappingUpstreamFiles: sortChanges(overlappingUpstreamFiles),
    crokiOwnedAdditions: sortChanges(crokiOwnedAdditions),
    crokiOwnedRemovals: sortChanges(crokiOwnedRemovals),
  };
}

export function createCrokiOverlayReport(repoRoot: string, base: string): CrokiOverlayReport {
  const resolvedBase = runGit(repoRoot, ["rev-parse", "--verify", `${base}^{commit}`]).trim();
  const basePaths = new Set(
    runGit(repoRoot, ["ls-tree", "-r", "--name-only", "-z", resolvedBase])
      .split("\0")
      .filter(Boolean),
  );
  const changes = parseNameStatusZ(
    runGit(repoRoot, ["diff", "--name-status", "--find-renames", "-z", resolvedBase, "--"]),
  );
  const untrackedPaths = runGit(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean);
  return classifyCrokiOverlayChanges({
    base: resolvedBase,
    basePaths,
    changes,
    untrackedPaths,
  });
}

function formatSection(title: string, changes: readonly OverlayChange[]): readonly string[] {
  const lines = [`${title} (${changes.length})`];
  if (changes.length === 0) return [...lines, "  (none)"];
  return [
    ...lines,
    ...changes.map((change) => {
      const rename =
        change.oldPath && change.oldPath !== change.path ? `${change.oldPath} -> ` : "";
      return `  ${change.status.padEnd(4)} ${rename}${change.path}`;
    }),
  ];
}

export function formatCrokiOverlayReport(report: CrokiOverlayReport): string {
  return [
    "Croki overlay report",
    `Base: ${report.base}`,
    "",
    ...formatSection("Overlapping modified upstream files", report.overlappingUpstreamFiles),
    "",
    ...formatSection("Croki-owned additions", report.crokiOwnedAdditions),
    "",
    ...formatSection("Croki-owned removals", report.crokiOwnedRemovals),
    "",
  ].join("\n");
}

function readRequiredBase(args: readonly string[]): string {
  const index = args.indexOf("--base");
  const value =
    index >= 0
      ? args[index + 1]
      : args.find((argument) => argument.startsWith("--base="))?.slice("--base=".length);
  if (!value?.trim()) {
    throw new Error("Usage: report:croki-overlay -- --base <commit>");
  }
  return value.trim();
}

if (import.meta.main) {
  try {
    const base = readRequiredBase(NodeProcess.argv.slice(2));
    console.log(formatCrokiOverlayReport(createCrokiOverlayReport(NodeProcess.cwd(), base)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    NodeProcess.exit(1);
  }
}
