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
  const record = {
    id: text(id),
    name: text(name),
    messageRefs: conversationRefs(messageRefs, "A thread"),
    subjectRefs: refs(subjectRefs),
    participantRefs: refs(participantRefs),
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
