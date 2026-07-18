// views-store.mjs — saved live views + snapshots (Experience Law 12: views are disposable; useful
// questions persist).
//
// A saved view preserves a WAY OF LOOKING at the venture, never a second copy of venture truth. The
// substrate holds exactly two durable shapes, both venture-scoped and both riding export/import through
// venture-store's own collection loop:
//
//   LIVE VIEW  — an arrangement-function id + the atlasTrace SCOPE it was framed over (a set of object
//                refs) + a name. It stays SYNCHRONIZED with the venture: reopening it re-runs the named
//                arrangement over that scope against the founder's CURRENT positions and current records.
//                It stores NO node positions — positions live in placement; re-deriving the arrangement
//                from where the founder has things now is the entire point.
//
//   SNAPSHOT   — an immutable scene-revision manifest. A SourceFrame pins the exact record versions and
//                digests at capture time; resolving it later fails VISIBLY (state: "stale"/"unresolved")
//                if any pinned ref has drifted. A snapshot is never mutated after capture; it is an
//                historical moment, not a live lens.
//
// Both are PROJECTION references: a live view names an arrangement over refs; a snapshot pins refs +
// digests. Neither copies the records they point at. Cross-venture refs fail closed — a saved view can
// only ever frame its own venture's objects.
//
// Storage invariant (the receipt-drift lesson): a view record's `.id` IS its storage key, so
// importVenture's re-keying (storageKeyFor keys by doc.id) round-trips it unchanged. The SourceFrame is
// FOLDED INTO the snapshot record rather than living as its own id-less doc, so it can never hit the
// silent-import-drop bug that lost placement/crew singletons and receipts.

import crypto from "node:crypto";
import { getVentureDoc, listVentureDocs, setVentureDoc, venturePersistence, safeId } from "./venture-store.mjs";
import { createViewSpec, createSourceFrame, resolveSourceFrame } from "./view-semantics.mjs";

export const VIEWS_COLLECTION = "views";
export const FINDINGS_COLLECTION = "findings";

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function fail(message, code = "view_invalid", status = 400) {
  throw Object.assign(new Error(message), { code, status });
}

function genId(prefix) {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `${prefix}-${stamp}-${crypto.randomBytes(4).toString("hex")}`;
}

function genViewId() {
  return genId("view");
}

// The canonical ref → durable venture record resolver. A saved view's scope is a set of ref strings
// ("bet:<id>", "outcome:<id>", "decision:<id>", "conversation:<id>", plus the atlas singletons); this
// maps each to the (collection, key) it actually lives at so a snapshot can pin — and later re-resolve —
// the exact record. It is deliberately CONSERVATIVE: a ref it does not recognize resolves to null, and a
// snapshot pinning an unrecognized ref reports "unresolved" rather than pretending it settled.
//
// Two kinds of ref are structurally NOT loadable and must never be pinned into a snapshot:
//   - UI pseudo-refs ("atlas:wall", "atlas:intent", "theory:*") — no durable backing at all.
//   - work:<ref> — work items live INSIDE bet documents (staged/evidence arrays), not as their own docs.
// isDurableRef filters these out before a scope is ever accepted, so a snapshot frame never carries a
// ref that would resolve "unresolved" forever.
const REF_LOADERS = Object.freeze({
  bet: (ventureId, id, options) => getVentureDoc(ventureId, "bets", id, options),
  outcome: (ventureId, id, options) => getVentureDoc(ventureId, "outcomes", id, options),
  decision: (ventureId, id, options) => getVentureDoc(ventureId, "decisions", id, options),
  "wall-item": (ventureId, id, options) => getVentureDoc(ventureId, "decisions", id, options),
  conversation: (ventureId, id, options) => getVentureDoc(ventureId, "conversation", id, options),
  architecture: (ventureId, _id, options) => getVentureDoc(ventureId, "architecture", "atlas", options),
  placement: (ventureId, _id, options) => getVentureDoc(ventureId, "placement", "canvas", options),
});

function refParts(ref) {
  const value = String(ref ?? "");
  const prefix = value.split(":")[0];
  // Strip a "#step" suffix (architecture element steps) and re-join any ":" in the id itself.
  const rest = value.slice(prefix.length + 1).split("#")[0];
  return { prefix, id: rest };
}

export function isDurableRef(ref) {
  const { prefix, id } = refParts(ref);
  if (!prefix || !REF_LOADERS[prefix]) return false;
  // Singleton refs need no id; every other durable ref must name a record.
  if (prefix === "architecture" || prefix === "placement") return true;
  return Boolean(text(id));
}

function loadRef(ventureId, ref, options) {
  const { prefix, id } = refParts(ref);
  const loader = REF_LOADERS[prefix];
  if (!loader) return null;
  return loader(ventureId, id, options) ?? null;
}

// A content digest for a record whose collection carries no CAS revision (bets, outcomes, decisions,
// conversation). persistence.mjs only stamps a revision on the CAS path, so most records have neither a
// revision nor a digest to pin — a snapshot computes and stores its own digest at capture time, which
// resolveSourceFrame already knows how to compare on the way back. The digest is over the record's own
// content with any prior digest field removed, so re-digesting a re-read record is stable.
export function digestRecord(record) {
  const { digest: _drop, ...content } = record ?? {};
  return crypto.createHash("sha256").update(JSON.stringify(content ?? null)).digest("hex").slice(0, 32);
}

// Fail-closed cross-venture guard: a saved view can only frame refs that resolve inside THIS venture.
// A durable ref that does not load here is a scope error, not a silently-dropped entry — a view that
// framed another venture's object (or a stale/deleted one at save time) must fail visibly.
function assertScopeResolves(ventureId, refs, options) {
  for (const ref of refs) {
    if (!isDurableRef(ref)) {
      fail(`A saved view scope cannot include the non-durable ref "${ref}".`, "view_scope_non_durable");
    }
    if (!loadRef(ventureId, ref, options)) {
      fail(`A saved view scope references an object this venture does not hold: "${ref}".`, "view_scope_cross_venture", 404);
    }
  }
}

function normalizeScope(rootRefs) {
  const refs = Array.isArray(rootRefs) ? rootRefs.map(text).filter(Boolean) : [];
  return [...new Set(refs)];
}

// Save a LIVE VIEW: an arrangement id + its atlasTrace scope + name. Stores no positions. The scope is
// validated to resolve inside this venture (fail-closed) at save time; reopening re-runs the arrangement
// over the founder's current positions, so the record is a way of looking, not a frozen frame.
export function saveLiveView(ventureId, { id = null, name, arrangement, rootRefs = [], relationshipRefs = [], query = null, filter = null } = {}, options = {}) {
  const arrangementId = text(arrangement);
  if (!text(name) || !arrangementId) fail("A live view needs a name and an arrangement to re-run.");
  const scope = normalizeScope(rootRefs);
  assertScopeResolves(ventureId, scope, options);
  const relationships = normalizeScope(relationshipRefs);
  const viewId = text(id) ?? genViewId();
  const spec = createViewSpec({ id: viewId, name, kind: "live", rootRefs: scope, relationshipRefs: relationships, query, filter });
  const record = {
    id: viewId,
    kind: "live",
    name: spec.name,
    arrangement: arrangementId,
    spec,
    createdAt: spec.createdAt,
  };
  setVentureDoc(ventureId, VIEWS_COLLECTION, viewId, record, options);
  return record;
}

// Capture a SNAPSHOT: an immutable manifest. Every ref in scope is pinned by a freshly computed digest
// (records carry no CAS revision to pin), so resolving the frame later reports "stale" the moment any
// pinned record's content drifts. Optional imageRef records a static image the UI captured; the manifest
// never copies record content. Immutable after capture.
export function captureSnapshot(ventureId, { id = null, name, arrangement = null, rootRefs = [], relationshipRefs = [], imageRef = null, query = null, filter = null } = {}, options = {}) {
  if (!text(name)) fail("A snapshot needs a name.");
  const scope = normalizeScope(rootRefs);
  if (scope.length === 0) fail("A snapshot must pin at least one object ref.");
  assertScopeResolves(ventureId, scope, options);
  const viewId = text(id) ?? genViewId();
  const spec = createViewSpec({
    id: viewId,
    name,
    kind: "snapshot",
    rootRefs: scope,
    relationshipRefs: normalizeScope(relationshipRefs),
    query,
    filter,
  });
  const sources = scope.map((ref) => {
    const record = loadRef(ventureId, ref, options);
    const revision = Number.isInteger(record?.revision) && record.revision >= 0 ? record.revision : null;
    // Pin a revision when the record actually carries one (CAS singletons); otherwise pin a content digest
    // computed now. createSourceFrame requires one or the other for snapshot sources.
    return revision != null ? { ref, revision } : { ref, digest: digestRecord(record) };
  });
  const frame = createSourceFrame({ viewId, kind: "snapshot", sources });
  const record = {
    id: viewId,
    kind: "snapshot",
    name: spec.name,
    arrangement: text(arrangement),
    imageRef: text(imageRef),
    spec,
    frame,
    createdAt: spec.createdAt,
  };
  setVentureDoc(ventureId, VIEWS_COLLECTION, viewId, record, options);
  return record;
}

export function listViews(ventureId, options = {}) {
  return listVentureDocs(ventureId, VIEWS_COLLECTION, options)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function getView(ventureId, viewId, options = {}) {
  return getVentureDoc(ventureId, VIEWS_COLLECTION, viewId, options);
}

export function deleteView(ventureId, viewId, options = {}) {
  const id = text(viewId);
  if (!id) fail("Deleting a view needs its id.");
  const existing = getView(ventureId, id, options);
  if (!existing) fail(`No such saved view: ${viewId}`, "view_not_found", 404);
  return venturePersistence(options, ventureId).delete(VIEWS_COLLECTION, safeId(id));
}

// Reopen a saved view. A LIVE view returns its arrangement + current scope so the caller re-runs the
// arrangement over the founder's CURRENT positions/records — no positions were ever stored. A SNAPSHOT
// resolves its pinned frame against the venture's current records and reports each source's state
// ("resolved"/"stale"/"unresolved"); a stale or missing pin surfaces visibly rather than silently
// resolving to whatever the record says now.
export function reopenView(ventureId, viewId, options = {}) {
  const record = getView(ventureId, viewId, options);
  if (!record) fail(`No such saved view: ${viewId}`, "view_not_found", 404);
  if (record.kind === "snapshot") {
    // resolveSourceFrame compares the pinned revision/digest against the LOADED record's own
    // revision/digest fields. Venture records carry no stored digest (persistence.mjs only stamps a CAS
    // revision), so the loader re-computes the SAME content digest captureSnapshot pinned and attaches it —
    // drift then surfaces as "stale", a deleted record as "unresolved", exactly as the frame intends.
    const resolution = resolveSourceFrame(record.frame, {
      load: (ref) => {
        const loaded = loadRef(ventureId, ref, options);
        if (!loaded) return null;
        // Always recompute over stripped content (digestRecord ignores any prior digest field), so the
        // comparison matches what captureSnapshot pinned regardless of whether the record carries its own.
        return { ...loaded, digest: digestRecord(loaded) };
      },
    });
    const stale = resolution.filter((entry) => entry.state !== "resolved");
    return {
      view: record,
      resolution,
      stale: stale.map((entry) => ({ ref: entry.source.ref, state: entry.state })),
      intact: stale.length === 0,
    };
  }
  return {
    view: record,
    arrangement: record.arrangement,
    rootRefs: record.spec.rootRefs,
    relationshipRefs: record.spec.relationshipRefs,
  };
}

// Promote a FINDING out of a temporary/saved view into durable venture truth (Law 11: findings remain
// local to the view until individually promoted; Law 12: promotion is the intentional act that lets a
// useful question persist). The finding carries its statement, the subject refs it concerns (validated
// fail-closed to this venture's own objects), and PROVENANCE — the source view ref and who promoted it —
// so a canonicalized finding always names where it came from. It is inferred by default: a finding
// promoted by an agent stays "inferred"; only the founder can establish it.
export function promoteFinding(ventureId, { id = null, viewId = null, statement, subjectRefs = [], condition = "inferred", promotedBy = null } = {}, options = {}) {
  if (!text(statement)) fail("A promoted finding needs a statement.");
  const sourceViewRef = text(viewId) ? `view:${text(viewId)}` : null;
  if (text(viewId) && !getView(ventureId, viewId, options)) {
    fail(`A finding cannot be promoted from a view this venture does not hold: ${viewId}`, "view_not_found", 404);
  }
  const subjects = normalizeScope(subjectRefs);
  assertScopeResolves(ventureId, subjects, options);
  const actor = { authority: text(promotedBy?.authority) ?? "agent", id: text(promotedBy?.id) ?? "unknown" };
  // Only the founder can establish a finding; every other promoter leaves it inferred (Law 9: authority
  // is earned). An agent asking for "established" is corrected to "inferred" rather than smuggling authority.
  const truthCondition = actor.authority === "founder" && condition === "established" ? "established" : "inferred";
  const findingId = text(id) ?? genId("finding");
  const record = Object.freeze({
    id: findingId,
    ventureId: text(ventureId),
    statement: text(statement),
    subjectRefs: subjects,
    condition: truthCondition,
    provenance: Object.freeze({ sourceViewRef, promotedBy: actor }),
    createdAt: new Date().toISOString(),
  });
  setVentureDoc(ventureId, FINDINGS_COLLECTION, findingId, record, options);
  return record;
}

export function listFindings(ventureId, options = {}) {
  return listVentureDocs(ventureId, FINDINGS_COLLECTION, options)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}
