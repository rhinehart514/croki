// gmail-thread.mjs — the PURE Gmail thread-reading primitives, split out of inbox-reader.mjs so a
// caller that only needs deterministic classification (never the ingest/store side) can depend on
// this alone. Extracted for F9 (docs/firm-build/F9-DELETION-MANIFEST.md "Chain 1"): market-poll.mjs
// (F5) needs exactly extractEmail/classifyThread/createGmailReadTransport and NOTHING else —
// inbox-reader.mjs's own pollInboxOutcomes/ensureReplyInput pull in ingestOutcome, which transitively
// reaches unrelated product state. Before this split,
// market-poll.mjs's own import of inbox-reader.mjs dragged that whole chain in via ESM's eager
// loading, even though it never calls anything past these three functions.
//
// Zero network, zero store, zero model call in this file — every export here is a pure function (or,
// for createGmailReadTransport, a thin factory over an injectable fetch) over plain records, exactly
// the "deterministic halves" inbox-reader.mjs's own header comment already promised. inbox-reader.mjs
// re-exports these so its own callers/tests are unaffected — this is a pure extraction, not a rename.

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

// A bare email address out of a possibly-decorated header value ("Jo <jo@acme.com>" → "jo@acme.com").
// Deterministic, lower-cased so recipient equality is case-insensitive (email local parts are practically
// case-insensitive at every provider we send through).
export function extractEmail(value) {
  const raw = String(value ?? "");
  const angled = raw.match(/<([^>]+)>/);
  const candidate = angled ? angled[1] : raw;
  const at = candidate.match(/[^\s<>@]+@[^\s<>@]+/);
  return at ? at[0].trim().toLowerCase() : null;
}

// Gmail REST read endpoints. Listing/reading threads needs a read scope (gmail.readonly or
// gmail.metadata); the durable send grant is gmail.send only, so a send-scoped token gets a 403 here —
// surfaced honestly as needsReadScope, never a faked read.
const GMAIL_MESSAGE_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GMAIL_THREAD_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/threads";

// The provenance marker gmail.mjs/message-send.mjs stamp on every message they send
// (X-GTM-IDE-Provenance). A message in a thread carrying this marker is OURS (the outbound), so it is
// never mistaken for the recipient's reply.
export const PROVENANCE_HEADER = "X-GTM-IDE-Provenance";

// A single header value off a Gmail message payload, case-insensitive on the header name. Gmail returns
// headers as [{ name, value }]; missing → null.
function headerValue(message, name) {
  const headers = message?.payload?.headers;
  if (!Array.isArray(headers)) return null;
  const wanted = String(name).toLowerCase();
  for (const h of headers) {
    if (String(h?.name ?? "").toLowerCase() === wanted) return h?.value ?? null;
  }
  return null;
}

// A message is OURS (an outbound send) if it carries the provenance marker we stamp. Such a message is
// never counted as the recipient's reply — it is the thing we sent, sitting in the same thread.
function isOurOutbound(message) {
  return trimOrNull(headerValue(message, PROVENANCE_HEADER)) != null;
}

// Bounce detection — a delivery failure. The mailer-daemon convention (RFC 3464 / universal at Google):
// the From is a postmaster/mailer-daemon address, and/or the message carries a delivery-status content
// type. Deterministic over headers; no heuristic scoring.
function isBounce(message) {
  const from = extractEmail(headerValue(message, "From")) ?? "";
  if (/(^|[.@+])(mailer-daemon|postmaster)(@|$)/i.test(from)) return true;
  const contentType = String(headerValue(message, "Content-Type") ?? "").toLowerCase();
  if (contentType.includes("report-type=delivery-status")) return true;
  return false;
}

// ── The classifier ───────────────────────────────────────────────────────────────────────────────
// Given a thread (its messages) and the sent item it corresponds to, decide the ONE outcome signal it
// carries, deterministically. This is the whole "did it work" judgment, and it is a lookup, not a model
// call:
//   - a message from a mailer-daemon / a delivery-status report          → outcomeKind "bounce"  (negative)
//   - a genuine reply FROM the recipient, after we sent, not our own      → outcomeKind "reply"   (positive)
//   - nothing new beyond our own outbound(s)                              → null (no signal yet)
//
// It returns the SINGLE strongest signal (a bounce dominates — a bounced send cannot also be a real
// reply), or null. `sentItem.recipient` scopes "a reply" to the person we actually wrote to, so a
// vacation auto-reply from a *different* address in a group thread is not miscounted as their answer.
// When recipient is unknown (an older send that stored no recipient) we fall back to "any inbound message
// that is not ours and not a bounce" — still deterministic, just less precise, and never fabricated.
export function classifyThread(thread, sentItem = {}) {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const recipient = trimOrNull(sentItem.recipient);

  let bounceEventId = null;
  let replyEventId = null;
  let replyFrom = null;
  let replyBody = null;
  let sawBounce = false;
  let sawReply = false;
  for (const message of messages) {
    if (isOurOutbound(message)) continue; // our own outbound in the thread — never a signal
    if (isBounce(message)) {
      sawBounce = true;
      bounceEventId = trimOrNull(message?.id) ?? bounceEventId;
      continue;
    }
    const from = extractEmail(headerValue(message, "From"));
    if (!from) continue;
    // A reply is inbound-from-the-recipient (or, when we never stored who we wrote to, any non-bounce
    // inbound that is not our own). Either way it is a real message we did not send.
    if (!recipient || from === recipient) {
      sawReply = true;
      replyEventId = trimOrNull(message?.id) ?? replyEventId;
      replyFrom = from;
      replyBody = trimOrNull(message?.snippet) ?? replyBody;
    }
  }

  // A bounce dominates: a send that bounced did not reach a human, so it can never also be a reply.
  if (sawBounce) return {
    outcomeKind: "bounce",
    signal: "negative",
    ...(bounceEventId ? { providerEventId: bounceEventId } : {}),
  };
  if (sawReply) return {
    outcomeKind: "reply",
    signal: "positive",
    from: replyFrom,
    body: replyBody,
    ...(replyEventId ? { providerEventId: replyEventId } : {}),
  };
  return null;
}

// ── The Gmail read transport (injectable, mirrors createGmailTransport) ───────────────────────────
// A thin read-only client over the two Gmail REST reads a poller needs: fetch one message (to learn its
// threadId) and fetch a whole thread (to classify it). `fetchImpl`/`endpoints` are overridable so the
// test drives it with a mock and no network — the exact injectable shape the send transport uses. It only
// READS; there is deliberately no write/send/modify path here.
//
// A 401/403 is surfaced as a typed refusal ({ ok:false, needsReadScope|needsReconnect }) so the caller can
// report blind — the send-only grant genuinely cannot read threads, and that is stated, not worked around.
export function createGmailReadTransport({
  fetchImpl,
  messageEndpoint = GMAIL_MESSAGE_ENDPOINT,
  threadEndpoint = GMAIL_THREAD_ENDPOINT,
} = {}) {
  const doFetch = typeof fetchImpl === "function" ? fetchImpl : (typeof fetch === "function" ? fetch : null);

  async function readJson(url, token) {
    if (!doFetch) return { ok: false, error: "No fetch implementation available to reach the Gmail API." };
    let response;
    try {
      response = await doFetch(url, { method: "GET", headers: { Authorization: `Bearer ${token}` } });
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // A send-scoped token cannot read threads → 403. A revoked grant → 401. Both are honest refusals,
      // not a reason to invent a reply.
      const needsReadScope = response.status === 403;
      const needsReconnect = response.status === 401;
      const detail = payload?.error?.message || `Gmail API returned ${response.status}.`;
      return { ok: false, error: detail, ...(needsReadScope ? { needsReadScope: true } : {}), ...(needsReconnect ? { needsReconnect: true } : {}) };
    }
    return { ok: true, payload };
  }

  return {
    // Fetch one message's metadata — we only need its threadId to pull the surrounding thread.
    getMessage: (id, token) => readJson(`${messageEndpoint}/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From`, token),
    // Fetch a full thread with its messages' headers — enough to classify without downloading bodies.
    getThread: (id, token) =>
      readJson(`${threadEndpoint}/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Content-Type&metadataHeaders=${encodeURIComponent(PROVENANCE_HEADER)}`, token),
  };
}
