export const VIEW_KINDS = Object.freeze(["disposable", "live", "snapshot"]);
const KIND_SET = new Set(VIEW_KINDS);

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function fail(message, code = "view_semantics_invalid", status = 400) {
  throw Object.assign(new Error(message), { code, status });
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

function freeze(value) {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (value && typeof value === "object") Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

export function createViewSpec({ id, name, kind = "disposable", rootRefs = [], relationshipRefs = [], query = null, filter = null, createdAt = new Date().toISOString() } = {}) {
  if (!text(id) || !text(name) || !KIND_SET.has(kind)) fail("A view needs identity, name, and disposable/live/snapshot semantics.");
  return freeze({ id: text(id), name: text(name), kind, rootRefs: unique(rootRefs), relationshipRefs: unique(relationshipRefs), query: structuredClone(query), filter: structuredClone(filter), createdAt });
}

export function createSourceFrame({ viewId, kind, sources = [], capturedAt = new Date().toISOString() } = {}) {
  if (!text(viewId) || !KIND_SET.has(kind)) fail("A source frame needs a view and valid view kind.");
  const normalized = sources.map((source) => {
    const ref = text(source?.ref);
    if (!ref) fail("Every source-frame entry needs a canonical ref.");
    const revision = Number.isInteger(source.revision) && source.revision >= 0 ? source.revision : null;
    const digest = text(source.digest);
    if (kind === "snapshot" && revision == null && !digest) fail("Snapshot sources must pin a revision or digest.");
    return { ref, revision, digest };
  });
  return freeze({ viewRef: `view:${text(viewId)}`, kind, sources: normalized, capturedAt });
}

export function resolveSourceFrame(frame, { load } = {}) {
  if (!frame?.viewRef || typeof load !== "function") fail("Resolving a source frame needs a frame and loader.");
  return frame.sources.map((source) => {
    const record = load(source.ref);
    if (!record) return { source, state: "unresolved", record: null };
    if (frame.kind !== "snapshot") return { source, state: "resolved", record };
    const revision = Number.isInteger(record.revision) ? record.revision : null;
    const digest = text(record.digest);
    const stale = (source.revision != null && revision !== source.revision) || (source.digest && digest !== source.digest);
    return { source, state: stale ? "stale" : "resolved", record };
  });
}

export function createViewPresentation({ viewId, placementRef = null, camera = null, reviewCursor = null, selectionRefs = [], updatedAt = new Date().toISOString() } = {}) {
  if (!text(viewId)) fail("A view presentation needs a view identity.");
  return {
    viewRef: `view:${text(viewId)}`,
    placementRef: text(placementRef),
    camera: camera ? structuredClone(camera) : null,
    reviewCursor: text(reviewCursor),
    selectionRefs: unique(selectionRefs),
    updatedAt,
  };
}

export function updateViewPresentation(presentation, changes = {}, { updatedAt = new Date().toISOString() } = {}) {
  if (!presentation?.viewRef) fail("Updating view presentation needs an existing presentation.");
  return createViewPresentation({
    viewId: presentation.viewRef.slice("view:".length),
    placementRef: changes.placementRef ?? presentation.placementRef,
    camera: changes.camera ?? presentation.camera,
    reviewCursor: changes.reviewCursor ?? presentation.reviewCursor,
    selectionRefs: changes.selectionRefs ?? presentation.selectionRefs,
    updatedAt,
  });
}
