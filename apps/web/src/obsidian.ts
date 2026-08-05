import type { DesktopDiscoveredObsidianVault } from "@croki/contracts";

function normalizeWorkspacePath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  return /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
}

export function isDiscoveredObsidianVault(
  workspacePath: string,
  vaults: readonly DesktopDiscoveredObsidianVault[],
): boolean {
  const normalizedWorkspace = normalizeWorkspacePath(workspacePath);
  return vaults.some((vault) => normalizeWorkspacePath(vault.path) === normalizedWorkspace);
}
