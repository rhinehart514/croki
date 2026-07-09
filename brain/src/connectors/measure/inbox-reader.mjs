// inbox-reader.mjs — the AUTOMATIC outcome reader that closes the measurement loop without the founder
// hand-entering a win.
//
// TODAY the loop closes only by hand: the founder has to notice a reply landed, then POST it to the
// measure door. Everything downstream of that POST is already real — routes/measure.mjs ingests it,
// outcome-ingest.mjs joins it back to the run item that produced it, a Result + Learning is written, and
// the honest readback counts it. The one missing leg is the READ: nothing polls the founder's connected
// inbox and pulls replies / booked meetings / bounces back on its own.
//
// THIS module is that read leg, and NOTHING else. It:
//   1. Mints a fresh access token from the SAME banked Gmail OAuth credential the sender uses
//      (getFreshAccessToken over the stored refresh token) — read-only reuse of the send auth, no new
//      credential, no new connect flow. It never sends, publishes, gates, or charges.
//   2. Walks the founder's own runs, gathers the items Drover actually SENT (each carrying the Gmail
//      message id we got back at send time, the recipient, and the durable joinKey), and asks Gmail for
//      each sent message's thread.
//   3. Classifies each thread with DETERMINISTIC code (classifyThread) — a human reply from the
//      recipient, a bounce from a mailer-daemon, or nothing new — never a model call. Detection is a
//      lookup over headers + sender, not a judgment.
//   4. Feeds every detected signal through the EXISTING ingestOutcome path keyed on the sent item's
//      joinKey, so a win attributes to its exact run automatically.
//
// HONEST-BLIND, exactly like connectors/measure/default.mjs. Two ways this stays truthful:
//   - A signal it cannot attribute (a thread it can read but whose sent message maps to no known
//     joinKey) is reported as `blind`/unattributed and is NEVER fabricated into an attribution. It still
//     ingests honestly (ingestOutcome records runId null, joined false) — an out-of-band reply is
//     captured, never silently credited to a run it did not come from.
//   - If Gmail refuses the read (the durable grant is send-only — gmail.send scope cannot list threads —
//     or is revoked), the poller returns `{ ok:false, reason, needsReadScope|needsReconnect }` and
//     ingests NOTHING. It reports blind rather than inventing a reply. Re-consenting with a read scope is
//     a founder decision surfaced honestly, never worked around.
//
// The deterministic halves (joinSentItems, classifyThread) are pure functions over plain records and are
// what the focused test drives — no network, no store, no model.

import { getCredential } from "../../credential-store.mjs";
import { getFreshAccessToken } from "../execute/gmail-oauth.mjs";
import { runStore, resultStore } from "../../gtm-store.mjs";
import { ingestOutcome } from "../../outcome-ingest.mjs";

// Gmail REST read endpoints. Listing/reading threads needs a read scope (gmail.readonly or
// gmail.metadata); the durable send grant is gmail.send only, so a send-scoped token gets a 403 here —
// surfaced honestly as needsReadScope, never a faked read.
const GMAIL_MESSAGE_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GMAIL_THREAD_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/threads";

// The provenance marker gmail.mjs stamps on every message it sends (X-GTM-IDE-Provenance). A message in a
// thread carrying this marker is OURS (the outbound), so it is never mistaken for the recipient's reply.
const PROVENANCE_HEADER = "X-GTM-IDE-Provenance";

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

// ── The sent-item index ──────────────────────────────────────────────────────────────────────────
// Walk the project's runs and collect every item Drover actually SENT: one that carries a real Gmail
// message id (providerMessageId, handed back by the send transport) AND a durable joinKey. Keyed by the
// Gmail message id so a polled thread — which reports the ids of the messages it contains — joins back to
// the exact sent item, and through it to the run item's joinKey. Pure over the runs passed in (the poller
// reads the store once and hands the snapshot here), so the test drives it with plain objects.
//
// Returns a Map: gmailMessageId → { joinKey, recipient, runId, sentAt, providerMessageId }.
export function joinSentItems(runs) {
  const byMessageId = new Map();
  for (const run of Array.isArray(runs) ? runs : []) {
    for (const item of Array.isArray(run?.items) ? run.items : []) {
      const messageId = trimOrNull(item?.providerMessageId);
      const joinKey = trimOrNull(item?.joinKey);
      // Only a message we truly sent (has a provider id) AND can join (has a key) is trackable. A staged-
      // but-unsent item, or one from a transport that returned no id, is honestly skipped — not guessed.
      if (!messageId || !joinKey) continue;
      // Recipient the outbound went to — used to tell a real reply FROM the recipient apart from an
      // auto-response or our own follow-up in the same thread.
      const recipient = extractEmail(item.to ?? item.buyer ?? item.recipient ?? item.email);
      byMessageId.set(messageId, {
        joinKey,
        recipient,
        runId: trimOrNull(run?.id),
        sentAt: item.sentAt ?? null,
        providerMessageId: messageId,
      });
    }
  }
  return byMessageId;
}

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

// A message is OURS (an outbound Drover sent) if it carries the provenance marker we stamp. Such a message
// is never counted as the recipient's reply — it is the thing we sent, sitting in the same thread.
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

  let sawBounce = false;
  let sawReply = false;
  for (const message of messages) {
    if (isOurOutbound(message)) continue; // our own outbound in the thread — never a signal
    if (isBounce(message)) {
      sawBounce = true;
      continue;
    }
    const from = extractEmail(headerValue(message, "From"));
    if (!from) continue;
    // A reply is inbound-from-the-recipient (or, when we never stored who we wrote to, any non-bounce
    // inbound that is not our own). Either way it is a real message we did not send.
    if (!recipient || from === recipient) {
      sawReply = true;
    }
  }

  // A bounce dominates: a send that bounced did not reach a human, so it can never also be a reply.
  if (sawBounce) return { outcomeKind: "bounce", signal: "negative" };
  if (sawReply) return { outcomeKind: "reply", signal: "positive" };
  return null;
}

// ── The Gmail read transport (injectable, mirrors createGmailTransport) ───────────────────────────
// A thin read-only client over the two Gmail REST reads the poller needs: fetch one message (to learn its
// threadId) and fetch a whole thread (to classify it). `fetchImpl`/`endpoints` are overridable so the
// test drives it with a mock and no network — the exact injectable shape the send transport uses. It only
// READS; there is deliberately no write/send/modify path here.
//
// A 401/403 is surfaced as a typed refusal ({ ok:false, needsReadScope|needsReconnect }) so the poller can
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

// Resolve a fresh Gmail access token from the SAME banked OAuth credential the sender mints from —
// read-only reuse of the send auth. No banked durable credential → honest null (there is nothing to poll
// with), never a guess. Injectable fetch/endpoint so the test drives minting without touching Google.
async function resolveReadToken(projectId, options = {}) {
  const credential = getCredential(projectId, "gmail", options) ?? getCredential(projectId, "google", options);
  if (!(credential?.authType === "oauth" && credential.refreshToken && credential.clientId && credential.clientSecret)) {
    return { token: null, reason: "No connected Gmail account to read outcomes from." };
  }
  try {
    const token = await getFreshAccessToken({
      clientId: credential.clientId,
      clientSecret: credential.clientSecret,
      refreshToken: credential.refreshToken,
      fetchImpl: options.oauthFetch,
      tokenEndpoint: options.oauthTokenEndpoint,
    });
    return token ? { token } : { token: null, needsReconnect: true, reason: "Gmail connection returned no access token." };
  } catch (err) {
    if (err?.needsReconnect) return { token: null, needsReconnect: true, reason: err.message };
    return { token: null, reason: err instanceof Error ? err.message : String(err) };
  }
}

// ── The poller ────────────────────────────────────────────────────────────────────────────────────
// One automatic read pass for a project. Reads the runs once, indexes what was sent, resolves a read
// token from the banked Gmail credential, and — thread by thread — classifies each sent message's thread
// and ingests any detected signal through ingestOutcome keyed on the sent item's joinKey.
//
// Returns an honest report: { ok, ingested, unattributed, reason?, needsReadScope?, needsReconnect? }.
// It NEVER fabricates. No token, or Gmail refuses the read → ok:false with the reason and zero ingested.
// A thread with no new signal is simply skipped. A signal whose sent item maps to no joinKey is counted
// as unattributed and still ingested honestly (joined:false), never credited to a run it did not come
// from — the same honest-blind posture as connectors/measure/default.mjs.
export async function pollInboxOutcomes(projectId = "default", options = {}) {
  const runs = options.runs ?? runStore.list({ ...options, projectId });
  const sentIndex = joinSentItems(runs);
  if (sentIndex.size === 0) {
    return { ok: true, ingested: [], unattributed: 0, reason: "Nothing sent to read outcomes for yet." };
  }

  const resolved = options.token ? { token: options.token } : await resolveReadToken(projectId, options);
  if (!resolved.token) {
    // Honest blind: no credential, or minting failed. Ingest nothing, report why.
    return {
      ok: false,
      ingested: [],
      unattributed: 0,
      reason: resolved.reason ?? "No Gmail read access.",
      ...(resolved.needsReconnect ? { needsReconnect: true } : {}),
    };
  }

  const read = options.readTransport ?? createGmailReadTransport({ fetchImpl: options.gmailFetch });
  const token = resolved.token;

  // Read the Result ledger ONCE for this pass so cross-tick dedupe is a lookup: every signal ingest below
  // checks this snapshot, and one already recorded on an earlier tick is skipped rather than re-minted.
  // The ledger IS the durable seen-state — no separate cursor to keep in sync.
  const existingResults = options.existingResults ?? resultStore.list({ ...options, projectId });

  const ingested = [];
  let unattributed = 0;
  let deduped = 0;
  // Cache thread reads so multiple sent messages in one thread cost one thread fetch, and one signal per
  // thread ingests once (not once per sent message that shares the thread).
  const seenThreads = new Set();

  for (const [messageId, sent] of sentIndex) {
    // Learn the thread the sent message lives in.
    const msg = await read.getMessage(messageId, token);
    if (!msg.ok) {
      // A read refusal is fatal to the whole pass in the same way for every message (same token/scope):
      // surface it once and stop, reporting blind. Never partially fabricate.
      return {
        ok: false,
        ingested,
        unattributed,
        reason: msg.error,
        ...(msg.needsReadScope ? { needsReadScope: true } : {}),
        ...(msg.needsReconnect ? { needsReconnect: true } : {}),
      };
    }
    const threadId = trimOrNull(msg.payload?.threadId);
    if (!threadId || seenThreads.has(threadId)) continue;
    seenThreads.add(threadId);

    const threadRes = await read.getThread(threadId, token);
    if (!threadRes.ok) {
      return {
        ok: false,
        ingested,
        unattributed,
        reason: threadRes.error,
        ...(threadRes.needsReadScope ? { needsReadScope: true } : {}),
        ...(threadRes.needsReconnect ? { needsReconnect: true } : {}),
      };
    }

    const classification = classifyThread(threadRes.payload, sent);
    if (!classification) continue; // no new signal on this thread yet

    // Feed the detected signal through the EXISTING ingest path, keyed on the sent item's joinKey so it
    // joins back to its exact run item. source is "connected-account" — the automatic reader, distinct
    // from a founder-entered note. observedAt is honest (now); the join, not the timestamp, attributes it.
    const result = ingestOutcome(
      {
        joinKey: sent.joinKey,
        outcomeKind: classification.outcomeKind,
        source: "connected-account",
        channel: "gmail",
        messageId: sent.providerMessageId,
      },
      { ...options, projectId, runs, existingResults },
    );
    // A signal already recorded on an earlier tick is a durable no-op — do not count it as a fresh ingest
    // and do not add it to the pass's seen-state again (it is already there).
    if (result.deduped) {
      deduped += 1;
      continue;
    }
    // Add the just-created Result to the pass's seen-state so a second thread within THIS same tick that
    // resolves to the same identity is also deduped (belt-and-braces with the cross-tick ledger read).
    existingResults.push(result.result);
    if (!result.joined) unattributed += 1;
    ingested.push({ joinKey: sent.joinKey, outcomeKind: classification.outcomeKind, joined: result.joined });
  }

  return { ok: true, ingested, unattributed, deduped };
}

// Run the automatic outcome read for EVERY project that has a connected inbox, on the heartbeat. Mirrors
// the scheduler's other drivers: each project is isolated so one failure never stops the others, and the
// whole thing is read-only — it ingests what already happened, never sends. Returns the per-project
// reports so a caller can observe/log. `projectIds` is injectable for the test; the live scheduler passes
// the active projects.
export async function runDueInboxOutcomeReads({ projectIds = [], ...options } = {}) {
  const reports = [];
  for (const projectId of Array.isArray(projectIds) ? projectIds : []) {
    try {
      reports.push({ projectId, report: await pollInboxOutcomes(projectId, options) });
    } catch (error) {
      // One project's read failing (a broken thread, a mint throw) never stops the others; report it blind.
      reports.push({ projectId, report: { ok: false, ingested: [], unattributed: 0, reason: error instanceof Error ? error.message : String(error) } });
    }
  }
  return reports;
}
