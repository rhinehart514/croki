// Object identity — a single deterministic key for ANY GTM object, so the same geo, keyword, page,
// partner, or product change collapses to one identity across every motion exactly as a Person already
// does. This is the identity half of Area 1's shared object graph (GTM-MACHINE.md §"Area 1"): the touch
// ledger keys on what this returns.
//
// Design rules (the same open-shape discipline the rest of the spine holds to):
//   - `kind` is an OPEN string. There is NO closed kind enum here — a novel kind composes a key from its
//     natural identifier fields and is never rejected. People are the one kind that delegates to the
//     existing durable-Person rule (extractIdentity) so a derived object key and a stored Person's
//     identityKey are the SAME string.
//   - Deterministic code only. No model call. Same fields in → same key out, always.
//   - Identifier-less items fall back to a private per-call key exactly as dedupeAcrossChannels already
//     does, so an object with no stable natural identifier survives as its own identity rather than
//     silently merging into or dropping against others.

import { extractIdentity } from "./person-store.mjs";

// Normalize a free-text natural identifier into a stable key segment: trimmed, lowercased, and with
// runs of non-alphanumerics (excluding the few path/host characters we keep) collapsed to a single dash.
// Returns "" when nothing usable remains.
function slugSegment(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._#/|@-]+/g, "-")
    .replace(/^-|-$/g, "");
}

// A hostname reduced to its registrable form (www. stripped, lowercased). Tolerant of a bare domain or a
// full URL; returns "" when the input is not a usable host.
function hostnameOf(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = raw.includes("://") ? raw : `https://${raw}`;
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return slugSegment(raw);
  }
}

// A URL/route path reduced to its pathname when a full URL was passed; otherwise the raw path lowercased.
// A page's identity is its route, not its host+query, so two links to the same route collapse.
function pathOf(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    if (raw.includes("://")) return new URL(raw).pathname.toLowerCase().replace(/\/$/, "") || "/";
  } catch {
    /* not a URL — treat as a bare path */
  }
  const cleaned = raw.toLowerCase().replace(/\/$/, "");
  return cleaned || "/";
}

// The per-kind natural-identifier composers. Each reads an item's conventional fields and returns the
// identifying segment(s), or null when the item carries no stable identifier of that kind. Open by
// construction: an unknown kind is handled by the generic fallback below, never rejected.
const KIND_COMPOSERS = {
  geo(fields) {
    const locality = slugSegment(fields.locality || fields.geo || fields.city || fields.location || fields.place || fields.region);
    return locality ? `geo:${locality}` : null;
  },
  keyword(fields) {
    const query = slugSegment(fields.query || fields.keyword || fields.term || fields.phrase);
    if (!query) return null;
    const geo = slugSegment(fields.geo || fields.locality || fields.location);
    return geo ? `keyword:${query}|${geo}` : `keyword:${query}`;
  },
  page(fields) {
    const route = pathOf(fields.path || fields.route || fields.page || fields.url || fields.href);
    return route ? `page:${route}` : null;
  },
  partner(fields) {
    const domain = hostnameOf(fields.domain || fields.partner || fields.website || fields.url || fields.org);
    return domain ? `partner:${domain}` : null;
  },
  change(fields) {
    const repo = slugSegment(fields.repo || fields.repository);
    const filePath = String(fields.path || fields.file || fields.filepath || "").trim();
    if (!filePath) return null;
    // change:<repo>#<path> — the SAME key Area 5's build path records touches against, so a proposed
    // change and the win that later joins to it collapse to one lifecycle object (GTM-MACHINE.md §Area 5).
    return repo ? `change:${repo}#${filePath}` : `change:#${filePath}`;
  },
};

// A private, per-call key for an item with no stable natural identifier. Mirrors dedupeAcrossChannels'
// `unidentified:<n>` convention so an anonymous object never collides with another anonymous object.
let privateCounter = 0;
function privateKey(kind) {
  return `${slugSegment(kind) || "object"}:private-${privateCounter++}`;
}

// The one public function: given an OPEN kind string and an item's natural-identifier fields, return the
// deterministic object key. People delegate to the durable-Person rule so a derived key equals a stored
// Person's identityKey. Every other kind composes from its natural identifier; a kind with no dedicated
// composer falls back to a generic id/name/label segment. Identifier-less items get a private key.
//
//   objectKey("person", { email: "a@b.com" })       → "email:a@b.com"       (extractIdentity)
//   objectKey("geo", { locality: "Buffalo, NY" })    → "geo:buffalo-ny"
//   objectKey("keyword", { query: "estate sale", geo: "buffalo" }) → "keyword:estate-sale|buffalo"
//   objectKey("page", { path: "/estate-sales/buffalo" })           → "page:/estate-sales/buffalo"
//   objectKey("partner", { domain: "https://www.acme.com/x" })     → "partner:acme.com"
//   objectKey("change", { repo: "estatesaleusa", path: "app/page.tsx" }) → "change:estatesaleusa#app/page.tsx"
//   objectKey("some_new_kind", { id: "x" })          → "some_new_kind:x"    (generic, never rejected)
export function objectKey(kind, fields = {}) {
  const openKind = String(kind ?? "").trim();
  const item = fields && typeof fields === "object" ? fields : {};

  if (openKind === "person") {
    const identity = extractIdentity(item);
    return identity?.identityKey ?? privateKey("person");
  }

  const composer = KIND_COMPOSERS[openKind];
  if (composer) {
    const key = composer(item);
    if (key) return key;
    return privateKey(openKind);
  }

  // A novel/open kind: compose from a generic natural identifier so the model can key any object it
  // discovers without a host-side kind registry. Still deterministic; still identity-less → private.
  const generic = slugSegment(item.id || item.key || item.name || item.label || item.identifier);
  const prefix = slugSegment(openKind) || "object";
  return generic ? `${prefix}:${generic}` : privateKey(openKind);
}

// Infer a plausible OPEN kind from a raw run item when the item did not carry one explicitly. Used by the
// touch deriver to file discovered objects onto the ledger. People are recognized by a stable identity;
// everything else reads the item's own `kind`/`type` tag, then falls back to the natural field present.
// Returns null only for an item with nothing to key on. This is a hint, never a closed classifier.
export function inferKind(item = {}) {
  if (!item || typeof item !== "object") return null;
  const stated = String(item.kind || item.type || "").trim();
  if (stated) return stated;
  if (extractIdentity(item)) return "person";
  if (item.repo && (item.path || item.file)) return "change";
  if (item.query || item.keyword || item.term) return "keyword";
  if (item.path || item.route || item.href) return "page";
  if (item.locality || item.city || item.region) return "geo";
  if (item.partner) return "partner";
  return null;
}
