import crypto from "node:crypto";
import { persistence } from "./persistence.mjs";
import { now, safeId } from "./store-fs.mjs";

// Person — the keystone object. A durable, project-scoped, shared identity promoted from real run
// entrants. It is real GTM state derived from runs, NEVER seeded, and it NEVER sends. The same human
// is ONE Person across channels because identity collapses to a single stable key. The store mirrors
// the persistence conventions of feedback-ledger.mjs / program-store.mjs (atomic write, per-project
// JSON under ~/.gtm-ide/people/<projectId>.json, sane list caps).

const SCHEMA_VERSION = 1;

// Cap the durable list so an unbounded run history can never blow up a project file. People are kept
// far longer than the rolling 50-run window precisely because they are durable, so the cap is large.
const MAX_PEOPLE = 5000;
const MAX_APPEARANCES = 500;

// Generic URLs we never treat as an org domain — a social/profile host is not the company.
const SOCIAL_HOSTS = new Set([
  "linkedin.com", "twitter.com", "x.com", "github.com", "facebook.com",
  "instagram.com", "youtube.com", "medium.com", "substack.com", "t.co",
]);

const COLLECTION = "people";

function emptyStore(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, people: [] };
}

export function loadPersonStore(projectId = "default", options = {}) {
  const stored = persistence(options).get(COLLECTION, safeId(projectId));
  if (!stored) return emptyStore(projectId);
  if (stored?.schemaVersion === SCHEMA_VERSION && Array.isArray(stored.people)) return stored;
  return {
    ...emptyStore(projectId),
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    people: Array.isArray(stored?.people) ? stored.people : [],
  };
}

export function savePersonStore(store, options = {}) {
  const durable = {
    ...store,
    schemaVersion: SCHEMA_VERSION,
    people: Array.isArray(store.people) ? store.people.slice(-MAX_PEOPLE) : [],
  };
  persistence(options).set(COLLECTION, safeId(durable.projectId), durable);
  return durable;
}

// ── Identity normalization — the one rule that makes a human ONE Person ──────────────────────────

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function slug(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeEmail(value) {
  const v = normalizeText(value);
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : "";
}

function normalizeHandle(value) {
  const v = normalizeText(value).replace(/^@+/, "");
  const cleaned = v.replace(/[^a-z0-9_.-]/g, "");
  return cleaned.length >= 2 ? cleaned : "";
}

function hostnameOf(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = raw.includes("://") ? raw : `https://${raw}`;
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// Derive a stable org domain. Email domain is strongest; then an explicit domain field; then a real
// company website. Social/profile hosts (linkedin.com etc.) are never an org domain.
function deriveDomain(item, email) {
  if (email) return email.split("@")[1];
  const explicit = hostnameOf(item.domain || item.companyDomain);
  if (explicit && !SOCIAL_HOSTS.has(explicit)) return explicit;
  const web = hostnameOf(item.website || item.companyWebsite || item.url);
  if (web && !SOCIAL_HOSTS.has(web)) return web;
  return "";
}

// Extract a normalized identity from a varied run item. Returns null when no stable identifier of any
// tier is present — those items are skipped, never promoted. identityKey precedence:
// email > handle > domain(+name) > name > org. The strongest available identifier wins so the same
// human collapses to one key across channels.
export function extractIdentity(item) {
  if (!item || typeof item !== "object") return null;
  const email = normalizeEmail(item.email || item.contactEmail || item.workEmail);
  const handle = normalizeHandle(item.handle || item.twitter || item.github || item.username);
  const name = String(item.name || item.decisionMaker || item.contact || item.fullName || item.person || "").trim();
  const org = String(item.org || item.company || item.organization || item.account || "").trim();
  const domain = deriveDomain(item, email);
  const nameSlug = slug(name);
  const orgSlug = slug(org);

  let identityKey = null;
  if (email) identityKey = `email:${email}`;
  else if (handle) identityKey = `handle:${handle}`;
  else if (domain && nameSlug) identityKey = `domain:${domain}|name:${nameSlug}`;
  else if (domain) identityKey = `domain:${domain}`;
  else if (nameSlug) identityKey = `name:${nameSlug}`;
  else if (orgSlug) identityKey = `org:${orgSlug}`;
  if (!identityKey) return null;

  return {
    identityKey,
    name: name || null,
    org: org || null,
    handle: handle || null,
    email: email || null,
    domain: domain || null,
  };
}

// ── In-store mutation (single load/save per batch) ───────────────────────────────────────────────

function mergeField(current, next) {
  // Never overwrite a known value with an empty one; fill gaps as later runs learn more.
  return next != null && String(next).trim() ? next : current ?? null;
}

function upsertInStore(store, identity, at) {
  const existing = store.people.find((person) => person.identityKey === identity.identityKey);
  if (existing) {
    existing.name = mergeField(existing.name, identity.name);
    existing.org = mergeField(existing.org, identity.org);
    existing.handle = mergeField(existing.handle, identity.handle);
    existing.email = mergeField(existing.email, identity.email);
    existing.domain = mergeField(existing.domain, identity.domain);
    existing.lastSeenAt = at;
    return existing;
  }
  const person = {
    id: `person-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    projectId: store.projectId,
    identityKey: identity.identityKey,
    name: identity.name,
    org: identity.org,
    handle: identity.handle,
    email: identity.email,
    domain: identity.domain,
    appearances: [],
    firstSeenAt: at,
    lastSeenAt: at,
  };
  store.people.push(person);
  return person;
}

function appendAppearanceInStore(person, appearance) {
  // Dedup by channelId+runId: one appearance per person per run. A person surfacing in several nodes
  // of the same run is still one appearance.
  const exists = person.appearances.some(
    (a) => a.channelId === appearance.channelId && a.runId === appearance.runId,
  );
  if (exists) return false;
  person.appearances.push(appearance);
  if (person.appearances.length > MAX_APPEARANCES) {
    person.appearances = person.appearances.slice(-MAX_APPEARANCES);
  }
  return true;
}

// ── Public API ───────────────────────────────────────────────────────────────────────────────────

export function listPeople(projectId = "default", options = {}) {
  return loadPersonStore(projectId, options).people;
}

export function getPerson(projectId = "default", id, options = {}) {
  return loadPersonStore(projectId, options).people.find((person) => person.id === id) ?? null;
}

export function findPersonByIdentity(projectId = "default", identity, options = {}) {
  const key = typeof identity === "string" ? identity : extractIdentity(identity)?.identityKey;
  if (!key) return null;
  return loadPersonStore(projectId, options).people.find((person) => person.identityKey === key) ?? null;
}

// Upsert one Person from a person/org-like input. Returns the stored Person, or null when the input
// carries no stable identity. Loads and saves the store; for batch promotion use promoteEntrants.
export function upsertPerson(projectId = "default", input = {}, options = {}) {
  const identity = extractIdentity(input);
  if (!identity) return null;
  const store = loadPersonStore(projectId, options);
  const at = String(input.at || now());
  const person = upsertInStore(store, identity, at);
  savePersonStore(store, options);
  return person;
}

// Append an appearance to an existing Person. Dedups by channelId+runId. Returns the updated Person,
// or null when the person is unknown.
export function appendAppearance(projectId = "default", personId, appearance = {}, options = {}) {
  const store = loadPersonStore(projectId, options);
  const person = store.people.find((item) => item.id === personId);
  if (!person) return null;
  const at = String(appearance.at || now());
  appendAppearanceInStore(person, {
    channelId: appearance.channelId ?? null,
    runId: appearance.runId ?? null,
    role: appearance.role ?? "entrant",
    trigger: appearance.trigger ?? null,
    at,
  });
  person.lastSeenAt = at;
  savePersonStore(store, options);
  return person;
}

// Promote run entrants into durable People. Extracts identity from varied item shapes, upserts each
// Person, and appends one appearance carrying the per-appearance why-now trigger. Items with no
// identity are skipped. Tolerant by design — a malformed item never throws. Single save for the batch.
export function promoteEntrants(projectId = "default", channelId, runId, items = [], options = {}) {
  const store = loadPersonStore(projectId, options);
  const at = now();
  const promoted = [];
  let appearancesAdded = 0;
  for (const item of Array.isArray(items) ? items : []) {
    const identity = extractIdentity(item);
    if (!identity) continue;
    const person = upsertInStore(store, identity, at);
    const trigger = String(item?.nowTrigger || item?.trigger || item?.personalFact || "").trim() || null;
    const role = String(item?.role || "").trim() || "entrant";
    const added = appendAppearanceInStore(person, {
      channelId: channelId ?? null,
      runId: runId ?? null,
      role,
      trigger,
      at,
    });
    if (added) appearancesAdded += 1;
    person.lastSeenAt = at;
    if (!promoted.includes(person)) promoted.push(person);
  }
  if (promoted.length) savePersonStore(store, options);
  return { promoted, peopleCount: promoted.length, appearancesAdded };
}

// Pull every entrant/output item out of a run result, each tagged with the role/category of the node it
// came from. This is the ONE extraction loop shared by the person promoter and Area 1's touch deriver
// (run-derivation.mjs) so both read exactly the same items out of a run — never two divergent readers.
// Best-effort: a malformed result yields [], never throws.
export function extractRunItems(result) {
  try {
    const nodes = result?.nodes ?? {};
    const items = [];
    for (const nodeResult of Object.values(nodes)) {
      for (const item of nodeResult?.items ?? []) {
        if (item && typeof item === "object") {
          items.push({ ...item, role: item.role || nodeResult.category || "entrant" });
        }
      }
    }
    return items;
  } catch {
    return [];
  }
}

// Run-completion bridge: pull every entrant item out of a run result and promote it. Best-effort and
// never throws, so a promotion failure can never break a run. This is the seam wired into the
// run-completion path next to feedback recording — promotion is read-derived GTM state, NOT health.
export function promoteEntrantsFromRun({ projectId = "default", channelId, runId, result } = {}, options = {}) {
  try {
    const items = extractRunItems(result);
    if (!items.length) return { promoted: [], peopleCount: 0, appearancesAdded: 0 };
    return promoteEntrants(projectId, channelId, runId ?? result?.runId ?? null, items, options);
  } catch {
    return { promoted: [], peopleCount: 0, appearancesAdded: 0 };
  }
}
