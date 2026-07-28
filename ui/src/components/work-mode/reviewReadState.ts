const PREFIX = "drover:review-read-paths:v1:";

function key(workspaceId: string, patchHash: string) {
  return `${PREFIX}${workspaceId}:${patchHash}`;
}

export function readReviewedPaths(workspaceId: string, patchHash: string): Set<string> {
  try {
    const value = JSON.parse(window.localStorage.getItem(key(workspaceId, patchHash)) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : []);
  } catch {
    return new Set();
  }
}

export function rememberReviewedPath(workspaceId: string, patchHash: string, path: string) {
  const reviewed = readReviewedPaths(workspaceId, patchHash);
  reviewed.add(path);
  try { window.localStorage.setItem(key(workspaceId, patchHash), JSON.stringify([...reviewed])); }
  catch { /* Unread presentation state is recoverable. */ }
  return reviewed;
}
