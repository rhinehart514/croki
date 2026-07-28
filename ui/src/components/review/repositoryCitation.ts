export type RepositoryCitation = {
  path: string;
  startLine: number;
  endLine: number;
  digest?: string;
};

const DURABLE_REFERENCE = /^repository:(.+?)#L(\d+)-L(\d+):[0-9a-f]{6,}$/i;
const LINE_SUFFIX = /:(\d+)(?::\d+)?$/;
const LINE_FRAGMENT = /#L(\d+)(?:-L?(\d+))?$/i;

function decoded(value: string) {
  try { return decodeURIComponent(value); }
  catch { return value; }
}

function validRange(path: string, startLine: number, endLine: number, digest?: string): RepositoryCitation | null {
  if (!path || path.startsWith("/") || path.includes("\0") || path.includes("?") || path.includes("#")) return null;
  if (path.split("/").some((part) => !part || part === "." || part === "..")) return null;
  if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 1 || endLine < startLine) return null;
  return { path, startLine, endLine, ...(digest ? { digest } : {}) };
}

// Historic provider turns often cite the exact local path (`/repo/src/file.ts:42`) while newer
// durable truth uses `repository:<path>#L42-L42:<digest>`. Both resolve into the same bounded,
// repository-relative request; everything outside the active venture root fails closed.
export function repositoryCitationFromHref(href: string | undefined, repositoryRoot?: string): RepositoryCitation | null {
  let value = decoded(String(href ?? "").trim());
  if (!value || value.includes("\0") || value.includes("?")) return null;
  const durable = DURABLE_REFERENCE.exec(value);
  if (durable) {
    const digest = value.slice(value.lastIndexOf(":") + 1).toLowerCase();
    return validRange(durable[1].trim(), Number(durable[2]), Number(durable[3]), digest);
  }

  if (!repositoryRoot) return null;
  const root = decoded(repositoryRoot).replace(/\/+$/, "");
  if (!root || root.includes("\0")) return null;
  if (value.startsWith("file://")) {
    const fileUrl = /^file:\/\/([^/]*)(\/.*)$/.exec(value);
    if (!fileUrl || fileUrl[1]) return null;
    value = fileUrl[2];
  }
  // Other URI schemes remain ordinary links under Streamdown's safety policy.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith("/")) return null;

  let referencedPath = value;
  let startLine = 1;
  let endLine = 1;
  const fragment = LINE_FRAGMENT.exec(referencedPath);
  if (fragment) {
    startLine = Number(fragment[1]);
    endLine = Number(fragment[2] ?? fragment[1]);
    referencedPath = referencedPath.slice(0, fragment.index);
  } else {
    const suffix = LINE_SUFFIX.exec(referencedPath);
    if (suffix) {
      startLine = Number(suffix[1]);
      endLine = startLine;
      referencedPath = referencedPath.slice(0, suffix.index);
    }
  }
  if (referencedPath.startsWith("/")) {
    if (!referencedPath.startsWith(`${root}/`)) return null;
    referencedPath = referencedPath.slice(root.length + 1);
  }
  return validRange(referencedPath, startLine, endLine);
}
