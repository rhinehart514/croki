// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type { DesktopDiscoveredObsidianVault } from "@croki/contracts";

interface ObsidianVaultRecord {
  readonly path?: unknown;
  readonly ts?: unknown;
  readonly open?: unknown;
}

function decodeVaultPath(rawPath: string): string {
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

function isDirectory(path: string): boolean {
  try {
    return NodeFS.statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Reads Obsidian's own vault registry without scanning the user's filesystem. */
export function discoverObsidianVaultsFromConfig(
  configPath: string,
): readonly DesktopDiscoveredObsidianVault[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(NodeFS.readFileSync(configPath, "utf8"));
  } catch {
    return [];
  }

  if (typeof parsed !== "object" || parsed === null || !("vaults" in parsed)) {
    return [];
  }
  const vaults = parsed.vaults;
  if (typeof vaults !== "object" || vaults === null) {
    return [];
  }

  const discovered = new Map<string, DesktopDiscoveredObsidianVault>();
  for (const [id, rawRecord] of Object.entries(vaults)) {
    if (typeof rawRecord !== "object" || rawRecord === null) continue;
    const record = rawRecord as ObsidianVaultRecord;
    if (typeof record.path !== "string" || record.path.trim().length === 0) continue;

    const decodedPath = decodeVaultPath(record.path.trim());
    const absolutePath = NodePath.resolve(decodedPath);
    if (!isDirectory(absolutePath) || !isDirectory(NodePath.join(absolutePath, ".obsidian"))) {
      continue;
    }

    let canonicalPath = absolutePath;
    try {
      canonicalPath = NodeFS.realpathSync(absolutePath);
    } catch {
      // The validated absolute path remains a usable fallback.
    }

    const candidate: DesktopDiscoveredObsidianVault = {
      id,
      name: NodePath.basename(canonicalPath),
      path: canonicalPath,
      lastOpenedAt: typeof record.ts === "number" && Number.isFinite(record.ts) ? record.ts : null,
      isOpen: record.open === true,
    };
    const existing = discovered.get(canonicalPath);
    if (
      !existing ||
      candidate.isOpen ||
      (candidate.lastOpenedAt ?? 0) > (existing.lastOpenedAt ?? 0)
    ) {
      discovered.set(canonicalPath, candidate);
    }
  }

  return [...discovered.values()].toSorted((left, right) => {
    if (left.isOpen !== right.isOpen) return left.isOpen ? -1 : 1;
    const recent = (right.lastOpenedAt ?? 0) - (left.lastOpenedAt ?? 0);
    return recent !== 0 ? recent : left.name.localeCompare(right.name);
  });
}
