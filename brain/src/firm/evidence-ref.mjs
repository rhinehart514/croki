export const EVIDENCE_REF_KINDS = Object.freeze([
  "outcome",
  "repository-citation",
  "conversation",
  "work",
  "wall-item",
  "architecture-revision",
]);

const KIND_SET = new Set(EVIDENCE_REF_KINDS);

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function fail(message, code = "evidence_ref_invalid", status = 400, details = {}) {
  throw Object.assign(new Error(message), { code, status, ...details });
}

export function createEvidenceRef({ ventureId, kind, id, version = null, digest = null } = {}) {
  const normalized = {
    ventureId: text(ventureId),
    kind: text(kind),
    id: text(id),
    version: Number.isInteger(version) && version >= 0 ? version : null,
    digest: text(digest),
  };
  if (!normalized.ventureId || !KIND_SET.has(normalized.kind) || !normalized.id) {
    fail("Evidence references need a venture, supported kind, and record id.");
  }
  if (normalized.kind === "repository-citation" && !normalized.digest) {
    fail("Repository evidence needs the captured source digest.");
  }
  return Object.freeze(normalized);
}

export function parseEvidenceRef(value, { ventureId } = {}) {
  if (value && typeof value === "object") return createEvidenceRef({ ventureId, ...value });
  const raw = text(value);
  const splitAt = raw?.indexOf(":") ?? -1;
  if (splitAt < 1 || splitAt === raw.length - 1) fail("Evidence references use kind:id syntax.");
  return createEvidenceRef({ ventureId, kind: raw.slice(0, splitAt), id: raw.slice(splitAt + 1) });
}

export function formatEvidenceRef(value) {
  const ref = createEvidenceRef(value);
  return `${ref.kind}:${ref.id}`;
}

function recordVersion(record) {
  return Number.isInteger(record?.revision) ? record.revision : (Number.isInteger(record?.version) ? record.version : null);
}

export function resolveEvidenceRef(value, { ventureId, load, currentDigest = null } = {}) {
  const ref = createEvidenceRef(value);
  if (ref.ventureId !== ventureId) fail("Evidence reference crosses venture scope.", "evidence_ref_cross_scope", 404);
  if (typeof load !== "function") fail("Evidence resolution needs a venture-scoped loader.");
  const record = load(ref.kind, ref.id);
  if (!record) return { state: "unresolved", ref, record: null, reason: "missing-record" };
  if (record.ventureId && record.ventureId !== ventureId) fail("Evidence record crosses venture scope.", "evidence_ref_cross_scope", 404);
  if (ref.version != null && recordVersion(record) !== ref.version) {
    return { state: "stale", ref, record, reason: "version-mismatch" };
  }
  if (ref.digest) {
    const observed = typeof currentDigest === "function" ? text(currentDigest(record)) : text(record.digest);
    if (!observed) return { state: "unresolved", ref, record, reason: "digest-unavailable" };
    if (observed !== ref.digest) return { state: "stale", ref, record, reason: "digest-mismatch" };
  }
  return { state: "resolved", ref, record, reason: null };
}
