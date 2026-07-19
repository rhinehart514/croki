// Pure Thread constructors for the canonical semantic model. A Thread is durable conversational
// organization: it references conversation messages, subjects, and participants but never copies message
// bodies. This module imports nothing from persistence, UI, routes, or providers — storage adapters call
// it and then persist the record through the atlas CAS boundary.

// Deterministic per-venture root thread identity. The atlas document is already venture-scoped, so a
// single reserved id is stable and collision-resistant against founder-authored records.
export const ROOT_THREAD_ID = "venture-root";

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function fail(message, code = "thread_invalid", status = 400) {
  throw Object.assign(new Error(message), { code, status });
}

function conversationRefs(values, label) {
  const refs = [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
  for (const ref of refs) if (!ref.startsWith("conversation:")) fail(`${label} can only reference conversation messages.`);
  return refs;
}

function refs(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

export function createThread({
  id,
  name,
  messageRefs = [],
  subjectRefs = [],
  participantRefs = [],
  parentThreadRef = null,
  originMessageRef = null,
  lifecycle = "open",
  reviewedThrough = null,
  properties = {},
  createdAt = null,
  updatedAt = null,
} = {}) {
  if (!text(id)) fail("A thread needs an id.");
  if (!text(name)) fail("A thread needs a name.");
  const parent = text(parentThreadRef);
  if (parent && parent === `thread:${text(id)}`) fail("A thread cannot reference itself as its parent.");
  const origin = text(originMessageRef);
  if (origin && !origin.startsWith("conversation:")) fail("A thread origin must reference a conversation message.");
  const normalizedLifecycle = text(lifecycle) ?? "open";
  if (!["open", "closed"].includes(normalizedLifecycle)) fail("A thread lifecycle must be open or closed.");
  const reviewCursor = text(reviewedThrough);
  const record = {
    id: text(id),
    name: text(name),
    messageRefs: conversationRefs(messageRefs, "A thread"),
    subjectRefs: refs(subjectRefs),
    participantRefs: refs(participantRefs),
    lifecycle: normalizedLifecycle,
    reviewedThrough: reviewCursor,
    properties: properties && typeof properties === "object" ? structuredClone(properties) : {},
    createdAt: createdAt ?? null,
    updatedAt: updatedAt ?? createdAt ?? null,
  };
  if (parent) record.parentThreadRef = parent;
  if (origin) record.originMessageRef = origin;
  return record;
}

export function createRootThread(ventureId, { at = null } = {}) {
  if (!text(ventureId)) fail("A root thread needs a ventureId.");
  return createThread({
    id: ROOT_THREAD_ID,
    name: "Venture conversation",
    subjectRefs: [`venture:${text(ventureId)}`],
    properties: { root: true },
    createdAt: at,
    updatedAt: at,
  });
}

// Append a message reference to an existing thread record without mutating the input. Callers must only
// pass a ref whose message was already durably written to the conversation collection.
export function withThreadMessage(thread, messageRef, { at = null } = {}) {
  if (!thread || typeof thread !== "object") fail("Adding a message needs a thread record.");
  const ref = text(messageRef);
  if (!ref || !ref.startsWith("conversation:")) fail("A thread message must reference a conversation message.");
  const next = structuredClone(thread);
  next.messageRefs = [...new Set([...(next.messageRefs ?? []), ref])];
  next.updatedAt = at ?? next.updatedAt ?? null;
  return next;
}

// Extend the durable organization around a direction without copying the referenced records. This is
// intentionally additive: a later run may reveal more subjects or return more conversation messages,
// but it must not silently erase the founder's earlier lineage.
export function withThreadReferences(thread, { messageRefs = [], subjectRefs = [], at = null } = {}) {
  if (!thread || typeof thread !== "object") fail("Extending a thread needs a thread record.");
  const next = structuredClone(thread);
  next.messageRefs = conversationRefs([...(next.messageRefs ?? []), ...messageRefs], "A thread");
  next.subjectRefs = refs([...(next.subjectRefs ?? []), ...subjectRefs]);
  next.updatedAt = at ?? next.updatedAt ?? null;
  return next;
}

// A review cursor is a stable ref to the latest consequence the founder actually saw. It is not a
// boolean badge: when later work produces a different consequence ref, unread derives true again.
export function withThreadReviewedThrough(thread, reviewedThrough, { at = null } = {}) {
  if (!thread || typeof thread !== "object") fail("Reviewing a thread needs a thread record.");
  const cursor = text(reviewedThrough);
  if (!cursor || !cursor.includes(":")) fail("A thread review cursor needs a typed reference.");
  return { ...structuredClone(thread), reviewedThrough: cursor, updatedAt: at ?? thread.updatedAt ?? null };
}

// Pinning is founder-owned navigation preference carried by the canonical Thread so it survives
// export/import without becoming a second rail database. Unpinning touches no lifecycle or work state.
export function withThreadPinnedAt(thread, pinnedAt, { at = null } = {}) {
  if (!thread || typeof thread !== "object") fail("Pinning a thread needs a thread record.");
  const next = structuredClone(thread);
  const properties = next.properties && typeof next.properties === "object" ? next.properties : {};
  const navigation = properties.navigation && typeof properties.navigation === "object"
    ? structuredClone(properties.navigation)
    : {};
  const pin = text(pinnedAt);
  if (pin) navigation.pinnedAt = pin;
  else delete navigation.pinnedAt;
  if (Object.keys(navigation).length) properties.navigation = navigation;
  else delete properties.navigation;
  next.properties = properties;
  next.updatedAt = at ?? next.updatedAt ?? null;
  return next;
}

export function withThreadLifecycle(thread, lifecycle, { at = null } = {}) {
  if (!thread || typeof thread !== "object") fail("Changing a lifecycle needs a thread record.");
  const nextLifecycle = text(lifecycle);
  if (!["open", "closed"].includes(nextLifecycle)) fail("A thread lifecycle must be open or closed.");
  return { ...structuredClone(thread), lifecycle: nextLifecycle, updatedAt: at ?? thread.updatedAt ?? null };
}
