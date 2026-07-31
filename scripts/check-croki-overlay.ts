#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - This is a synchronous, read-only repository policy boundary.

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";

import { RETAINED_T3_IDENTIFIER_ALLOWLIST } from "./lib/brand-policy.ts";

export const CROKI_TSX_MAX_LINES = 300;
export const CROKI_MODEL_SERVICE_MAX_LINES = 500;

export interface CrokiOverlayViolation {
  readonly code:
    | "archived-import"
    | "brand-policy"
    | "line-limit"
    | "missing-test"
    | "server-loader-owner"
    | "shared-context-owner";
  readonly path: string;
  readonly message: string;
}

export interface AddedOverlayLine {
  readonly path: string;
  readonly line: string;
}

const REQUIRED_FOCUSED_TESTS = [
  "apps/server/src/orchestration/Layers/CrokiContext.test.ts",
  "apps/web/src/branding.test.ts",
  "apps/web/src/components/croki/CrokiCanvasField.test.tsx",
  "apps/web/src/components/croki/crokiCanvasModel.test.ts",
  "packages/shared/src/crokiContext.test.ts",
  "scripts/lib/brand-policy.test.ts",
] as const;

const CROKI_SOURCE_ROOTS = [
  "apps/web/src/components/croki",
  "apps/mobile/src/features/croki",
  "apps/server/src/orchestration/Layers",
  "packages/shared/src",
] as const;

function toRepoPath(value: string): string {
  return value.replaceAll(NodePath.sep, "/").replace(/^\.\//u, "");
}

function isTestPath(path: string): boolean {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path);
}

function isTypeScriptSource(path: string): boolean {
  return /\.[cm]?tsx?$/u.test(path);
}

export function countSourceLines(contents: string): number {
  if (contents.length === 0) return 0;
  return contents.replace(/\r?\n$/u, "").split(/\r?\n/u).length;
}

export function isCrokiOwnedPath(path: string): boolean {
  const normalized = toRepoPath(path);
  const baseName = NodePath.posix.basename(normalized);
  return (
    normalized.startsWith(".croki/") ||
    normalized.startsWith("assets/croki/") ||
    normalized.includes("/croki/") ||
    normalized.startsWith("docs/croki") ||
    normalized === "scripts/lib/brand-policy.ts" ||
    normalized === "scripts/lib/brand-policy.test.ts" ||
    /^croki/iu.test(baseName) ||
    /croki-overlay/iu.test(baseName)
  );
}

export function isCrokiModelOrServicePath(path: string): boolean {
  const normalized = toRepoPath(path);
  if (isTestPath(normalized) || !normalized.endsWith(".ts")) return false;
  if (normalized.includes("/croki/")) return true;
  if (/^packages\/shared\/src\/croki[^/]*\.ts$/iu.test(normalized)) return true;
  return /^apps\/server\/src\/orchestration\/Layers\/Croki[^/]*\.ts$/u.test(normalized);
}

export function extractImportSpecifiers(contents: string): readonly string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/gu,
    /\bimport\s*["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of contents.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) specifiers.push(specifier);
    }
  }
  return specifiers;
}

export function isArchivedStandaloneImport(specifier: string): boolean {
  const normalized = specifier.replaceAll("\\", "/").toLowerCase();
  if (normalized.startsWith("@t3tools/")) return false;
  if (
    normalized.includes("croki-transition-archive") ||
    normalized.includes("gtm-ide") ||
    normalized.includes(".gtm-ide")
  ) {
    return true;
  }
  return normalized
    .split("/")
    .filter(Boolean)
    .some((segment) => segment === "brain" || segment === "relay" || segment === "runtime");
}

function matchesRetainedIdentifier(identifier: string): boolean {
  return RETAINED_T3_IDENTIFIER_ALLOWLIST.some((entry) => {
    switch (entry.match) {
      case "exact":
        return identifier === entry.value;
      case "prefix":
        return identifier.startsWith(entry.value);
      case "suffix":
        return identifier.endsWith(entry.value);
    }
  });
}

const T3_IDENTIFIER_PATTERN =
  /T3CODE_[A-Z0-9_]+|@t3tools\/[A-Za-z0-9._/-]+|com\.t3tools\.t3code(?:\.[A-Za-z0-9-]+)*|t3-resource-monitor(?:\.exe)?|t3codeCommitHash|t3code-(?:dev|preview)|t3code|t3-code|(?:[A-Za-z0-9-]+\.)*t3\.codes|t3\.json|desktop:[A-Za-z0-9:._-]+|t3\.[A-Za-z0-9._-]+/gu;

export function findUnretainedT3Identifiers(value: string): readonly string[] {
  if (/\b(?:font|text|bg|border)-t3-/u.test(value)) return [];
  if (/\bT3 (?:Code|Tools)\b/u.test(value)) {
    return [value.match(/\bT3 (?:Code|Tools)\b/u)?.[0] ?? value];
  }
  const identifiers = [...value.matchAll(T3_IDENTIFIER_PATTERN)].map((match) => match[0]);
  const unretained = identifiers.filter((identifier) => !matchesRetainedIdentifier(identifier));
  if (unretained.length > 0) return [...new Set(unretained)];
  if (identifiers.length > 0) return [];

  const unknownCompactIdentifier = value.match(/\bt3[a-z0-9._:-]+\b/iu)?.[0];
  return unknownCompactIdentifier ? [unknownCompactIdentifier] : [];
}

export function findBrandPolicyViolations(lines: readonly AddedOverlayLine[]) {
  const violations: CrokiOverlayViolation[] = [];
  for (const entry of lines) {
    const path = toRepoPath(entry.path);
    if (!isBrandSurfacePath(path) || isTestPath(path)) continue;
    for (const match of entry.line.matchAll(/["'`]([^"'`]*(?:T3|t3)[^"'`]*)["'`]/gu)) {
      const value = match[1];
      if (!value) continue;
      const unknown = findUnretainedT3Identifiers(value);
      if (unknown.length === 0) continue;
      violations.push({
        code: "brand-policy",
        path,
        message: `Added visible or unretained T3 value: ${unknown.join(", ")}`,
      });
    }
  }
  return violations;
}

function isBrandSurfacePath(path: string): boolean {
  if (!/\.(?:html|json|[cm]?[jt]sx?)$/u.test(path)) return false;
  if (path.startsWith(".croki/") || path.startsWith("docs/")) return false;
  if (
    path === "scripts/check-croki-overlay.ts" ||
    path === "scripts/report-croki-overlay.ts" ||
    path === "scripts/lib/brand-policy.ts"
  ) {
    return false;
  }
  return (
    isCrokiOwnedPath(path) ||
    path === "apps/mobile/app.config.ts" ||
    path === "apps/desktop/package.json" ||
    path === "apps/web/src/branding.ts" ||
    path === "scripts/build-desktop-artifact.ts" ||
    path === "scripts/lib/brand-assets.ts" ||
    path.startsWith("apps/desktop/") ||
    path.startsWith("apps/mobile/src/") ||
    path.startsWith("apps/web/")
  );
}

function walkFiles(repoRoot: string, relativeRoot: string): readonly string[] {
  const absoluteRoot = NodePath.join(repoRoot, relativeRoot);
  if (!NodeFS.existsSync(absoluteRoot)) return [];
  const paths: string[] = [];
  const visit = (absoluteDirectory: string) => {
    const entries = NodeFS.readdirSync(absoluteDirectory, { withFileTypes: true }).toSorted(
      (a, b) => a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const absolutePath = NodePath.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        paths.push(toRepoPath(NodePath.relative(repoRoot, absolutePath)));
      }
    }
  };
  visit(absoluteRoot);
  return paths;
}

function readRepoFile(repoRoot: string, path: string): string {
  return NodeFS.readFileSync(NodePath.join(repoRoot, path), "utf8");
}

function runGit(repoRoot: string, args: readonly string[]): string {
  return NodeChildProcess.execFileSync("git", [...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function resolveOverlayBase(repoRoot: string, explicitBase?: string): string {
  const candidates = [
    explicitBase?.trim(),
    NodeProcess.env.CROKI_OVERLAY_BASE_SHA?.trim(),
    "main",
    "HEAD^",
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      return runGit(repoRoot, ["rev-parse", "--verify", `${candidate}^{commit}`]).trim();
    } catch {
      // Try the next local-only candidate.
    }
  }
  throw new Error("Could not resolve a local Croki overlay base commit.");
}

export function readAddedOverlayLines(repoRoot: string, base: string): readonly AddedOverlayLine[] {
  const diff = runGit(repoRoot, ["diff", "--no-ext-diff", "--no-color", "--unified=0", base, "--"]);
  const lines: AddedOverlayLine[] = [];
  let currentPath: string | null = null;
  for (const line of diff.split(/\r?\n/u)) {
    if (line.startsWith("+++ b/")) {
      currentPath = line.slice("+++ b/".length);
      continue;
    }
    if (currentPath && line.startsWith("+") && !line.startsWith("+++")) {
      lines.push({ path: currentPath, line: line.slice(1) });
    }
  }

  const untracked = runGit(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)
    .map(toRepoPath)
    .filter((path) => NodeFS.statSync(NodePath.join(repoRoot, path)).isFile());
  for (const path of untracked) {
    if (!isBrandSurfacePath(path)) continue;
    for (const line of readRepoFile(repoRoot, path).split(/\r?\n/u)) {
      lines.push({ path, line });
    }
  }
  return lines;
}

function findDeclarationOwners(
  repoRoot: string,
  roots: readonly string[],
  pattern: RegExp,
): readonly string[] {
  return roots
    .flatMap((root) => walkFiles(repoRoot, root))
    .filter((path) => isTypeScriptSource(path) && !isTestPath(path))
    .filter((path) => pattern.test(readRepoFile(repoRoot, path)))
    .toSorted();
}

export function checkCrokiOverlay(
  repoRoot: string,
  options: { readonly base?: string } = {},
): {
  readonly base: string;
  readonly checkedComponentCount: number;
  readonly checkedModelServiceCount: number;
  readonly violations: readonly CrokiOverlayViolation[];
} {
  const violations: CrokiOverlayViolation[] = [];
  const crokiWebFiles = walkFiles(repoRoot, "apps/web/src/components/croki");
  const componentFiles = crokiWebFiles.filter((path) => path.endsWith(".tsx") && !isTestPath(path));
  for (const path of componentFiles) {
    const lineCount = countSourceLines(readRepoFile(repoRoot, path));
    if (lineCount > CROKI_TSX_MAX_LINES) {
      violations.push({
        code: "line-limit",
        path,
        message: `${lineCount} lines exceeds the ${CROKI_TSX_MAX_LINES}-line Croki component limit.`,
      });
    }
  }

  const modelServiceFiles = CROKI_SOURCE_ROOTS.flatMap((root) => walkFiles(repoRoot, root))
    .filter(isCrokiModelOrServicePath)
    .filter((path, index, paths) => paths.indexOf(path) === index)
    .toSorted();
  for (const path of modelServiceFiles) {
    const contents = readRepoFile(repoRoot, path);
    const lineCount = countSourceLines(contents);
    if (lineCount > CROKI_MODEL_SERVICE_MAX_LINES) {
      violations.push({
        code: "line-limit",
        path,
        message: `${lineCount} lines exceeds the ${CROKI_MODEL_SERVICE_MAX_LINES}-line Croki model/service limit.`,
      });
    }
  }

  const crokiProductionFiles = CROKI_SOURCE_ROOTS.flatMap((root) => walkFiles(repoRoot, root))
    .filter((path) => isTypeScriptSource(path) && !isTestPath(path) && isCrokiOwnedPath(path))
    .filter((path, index, paths) => paths.indexOf(path) === index)
    .toSorted();
  for (const path of crokiProductionFiles) {
    const contents = readRepoFile(repoRoot, path);
    for (const specifier of extractImportSpecifiers(contents)) {
      if (!isArchivedStandaloneImport(specifier)) continue;
      violations.push({
        code: "archived-import",
        path,
        message: `Imports archived standalone module "${specifier}".`,
      });
    }
  }

  const sharedOwners = findDeclarationOwners(
    repoRoot,
    ["packages/shared/src"],
    /\bexport\s+interface\s+CrokiContext\b/u,
  );
  const sharedPackageJsonPath = "packages/shared/package.json";
  const sharedPackageJson = JSON.parse(readRepoFile(repoRoot, sharedPackageJsonPath)) as {
    readonly exports?: Record<string, { readonly import?: string; readonly types?: string }>;
  };
  const sharedExport = sharedPackageJson.exports?.["./crokiContext"];
  if (
    sharedOwners.length !== 1 ||
    sharedOwners[0] !== "packages/shared/src/crokiContext.ts" ||
    sharedExport?.import !== "./src/crokiContext.ts" ||
    sharedExport.types !== "./src/crokiContext.ts"
  ) {
    violations.push({
      code: "shared-context-owner",
      path: sharedPackageJsonPath,
      message: `Expected one shared Croki context owner/export; found owners: ${sharedOwners.join(", ") || "none"}.`,
    });
  }

  const serverLoaderOwners = findDeclarationOwners(
    repoRoot,
    ["apps/server/src"],
    /\bexport\s+function\s+loadCrokiAgentContext\b/u,
  );
  if (
    serverLoaderOwners.length !== 1 ||
    serverLoaderOwners[0] !== "apps/server/src/orchestration/Layers/CrokiContext.ts"
  ) {
    violations.push({
      code: "server-loader-owner",
      path: "apps/server/src/orchestration/Layers/CrokiContext.ts",
      message: `Expected one server loader owner; found: ${serverLoaderOwners.join(", ") || "none"}.`,
    });
  }

  for (const path of REQUIRED_FOCUSED_TESTS) {
    if (NodeFS.existsSync(NodePath.join(repoRoot, path))) continue;
    violations.push({
      code: "missing-test",
      path,
      message: "Required focused Croki test is missing.",
    });
  }

  const base = resolveOverlayBase(repoRoot, options.base);
  violations.push(...findBrandPolicyViolations(readAddedOverlayLines(repoRoot, base)));

  return {
    base,
    checkedComponentCount: componentFiles.length,
    checkedModelServiceCount: modelServiceFiles.length,
    violations: violations.toSorted(
      (left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code),
    ),
  };
}

function readBaseArgument(args: readonly string[]): string | undefined {
  const index = args.indexOf("--base");
  if (index >= 0) return args[index + 1];
  return args.find((arg) => arg.startsWith("--base="))?.slice("--base=".length);
}

if (import.meta.main) {
  const repoRoot = NodeProcess.cwd();
  try {
    const base = readBaseArgument(NodeProcess.argv.slice(2));
    const result = checkCrokiOverlay(repoRoot, base ? { base } : {});
    if (result.violations.length > 0) {
      console.error(`Croki overlay check failed against ${result.base}:`);
      for (const violation of result.violations) {
        console.error(`- [${violation.code}] ${violation.path}: ${violation.message}`);
      }
      NodeProcess.exit(1);
    } else {
      console.log(
        `Croki overlay check passed against ${result.base} (${result.checkedComponentCount} components, ${result.checkedModelServiceCount} model/service files).`,
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    NodeProcess.exit(1);
  }
}
