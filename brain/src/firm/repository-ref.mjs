// Pure structural validator for the compact repository citation refs that truth.mjs mints as
// `repository:<path>#L<from>-L<to>:<digest>`. Reference integrity must fail closed: a bare
// `repository:` prefix is never sufficient. A real citation carries a repository-relative path, an
// ordered line range, and a captured source digest. Verifying the digest against a live file is the
// on-demand job of the evidence resolver; this layer verifies the citation is structurally a citation.

const REPOSITORY_REF = /^repository:(?<path>[^#\n]+)#L(?<from>\d+)-L(?<to>\d+):(?<digest>[0-9a-f]{6,})$/;

export function parseRepositoryRef(value) {
  const match = REPOSITORY_REF.exec(String(value ?? ""));
  if (!match) return null;
  const path = match.groups.path.trim();
  const from = Number(match.groups.from);
  const to = Number(match.groups.to);
  if (!path || path.startsWith("/") || path.includes("..") || from < 1 || to < from) return null;
  return { path, from, to, digest: match.groups.digest };
}

export function isRepositoryRef(value) {
  return parseRepositoryRef(value) != null;
}
