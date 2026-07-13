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
import { persistence } from "../../persistence.mjs";
import { ingestOutcome } from "../../outcome-ingest.mjs";
import { appendInput, listInputs } from "../../inputs-store.mjs";

// The flow store's collection name (flow-store.mjs COLLECTION). Read directly here rather than importing
// flow-store's writer, so this read-only reader never pulls in the write path.
const FLOW_COLLECTION = "flows";

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
        pathId: trimOrNull(run?.pathId),
        sentAt: item.sentAt ?? null,
        providerMessageId: messageId,
      });
    }
  }
  return byMessageId;
}

// ── Where a REAL live send actually lands ──────────────────────────────────────────────────────────
// The path-compile pipeline persists approved runs to runStore with a flat `items` array (what
// joinSentItems above walks). But the THREE live send paths — the direct and streaming graph runs
// (routes/graph.mjs) and the operator gate-resume (operator-runtime.mjs) — do NOT write runStore. They
// persist through recordFlowRun into the FLOW store, and a real send's delivery facts (providerMessageId,
// sentAt) live inside that run's transient graph result, on the EXECUTE node's output items
// (result.nodes[executeNodeId].items[].providerMessageId), NOT on any flat top-level items array.
//
// So the poller's sent-item index, if it only read runStore, would be permanently empty for every live
// send — the exact inertness this closes. This projects each stored flow run into the SAME flat sent-item
// shape joinSentItems consumes: for each flow run, walk its result's execute-node output items and surface
// every one that carries a real providerMessageId AND a durable joinKey (i.e. was truly delivered). The
// run's id comes from the flow record so a projected sent item attributes to its run exactly as a runStore
// item does. Pure over the flow records passed in; no network, no model — the test drives it with plain
// records shaped exactly like recordFlowRun writes.
export function projectFlowRunsToSentRuns(flowRecords, { projectId = null } = {}) {
  const requestedProjectId = trimOrNull(projectId);
  const sentRuns = [];
  for (const record of Array.isArray(flowRecords) ? flowRecords : []) {
    for (const flowRun of Array.isArray(record?.runs) ? record.runs : []) {
      const snapshot = flowRun?.graphSnapshot ?? record?.graph ?? {};
      const ownerProjectId = trimOrNull(
        flowRun?.projectId
        ?? flowRun?.result?.projectId
        ?? flowRun?.result?.workContext?.projectId
        ?? snapshot?.projectId
        ?? record?.projectId
        ?? record?.graph?.projectId,
      );
      // Flow documents are keyed by graph, not venture. A poll for one venture must never index an
      // explicitly-owned send from another venture, even when graph ids or join keys overlap. Legacy
      // unowned receipts are excluded from project-scoped polling because attributing them would be a guess.
      if (requestedProjectId && ownerProjectId !== requestedProjectId) continue;
      const nodes = flowRun?.result?.nodes ?? {};
      const items = [];
      for (const nodeResult of Object.values(nodes)) {
        // A send lands on an execute node's output. Guard on category when present, but stay tolerant:
        // any node result carrying items with a provider id + joinKey is a real delivery fact, never faked.
        if (nodeResult?.category && nodeResult.category !== "execute" && !Array.isArray(nodeResult?.items)) continue;
        for (const item of Array.isArray(nodeResult?.items) ? nodeResult.items : []) {
          const messageId = trimOrNull(item?.providerMessageId);
          const joinKey = trimOrNull(item?.joinKey);
          // Only a truly-sent, joinable item contributes — a staged-locally / blocked / rate-limited item
          // has no provider id and is skipped, exactly as joinSentItems skips an unsent runStore item.
          if (!messageId || !joinKey) continue;
          items.push(item);
        }
      }
      if (items.length) {
        // Carry the compiled topology through so the downstream ingest derives the motion dimension from
        // the run's own shape exactly as it does for a runStore run — nodes in `steps`, wiring in `edges`.
        // The flow run stores a graphSnapshot; the flow record carries the live graph as a fallback.
        sentRuns.push({
          id: trimOrNull(flowRun?.id) ?? trimOrNull(flowRun?.result?.runId),
          projectId: ownerProjectId,
          steps: Array.isArray(snapshot.nodes) ? snapshot.nodes : [],
          edges: Array.isArray(snapshot.edges) ? snapshot.edges : [],
          pathId: trimOrNull(snapshot.id) ?? trimOrNull(record?.graph?.id),
          items,
        });
      }
    }
  }
  return sentRuns;
}

// Read every stored flow run for a project's poll and project its truly-sent items into the flat
// sent-run shape. The flow store is keyed per graph (not per project) and a flow record carries no
// projectId, so this reads all flows in the store — matching how the live send paths persist (they write
// recordFlowRun with no project scoping). An out-of-band item still ingests honestly as unattributed
// downstream, so reading broadly never fabricates an attribution. Injectable via options.flowRecords so
// the test drives it with plain records and no store.
function loadSentRunsFromFlowStore(options = {}) {
  if (Array.isArray(options.flowRecords)) {
    return projectFlowRunsToSentRuns(options.flowRecords, { projectId: options.projectId });
  }
  let records = [];
  try {
    records = persistence(options).list(FLOW_COLLECTION) ?? [];
  } catch {
    records = [];
  }
  return projectFlowRunsToSentRuns(records, { projectId: options.projectId });
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

function replyInputId(classification, threadId) {
  const eventIdentity = trimOrNull(classification?.providerEventId) ?? trimOrNull(threadId);
  if (!eventIdentity) return null;
  return `input-gmail-${String(eventIdentity).replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 120)}`;
}

// Result creation and Input capture are two durable writes. If the Result lands and the Input write fails,
// the next poll sees the Result as a duplicate but must still repair the missing founder-decision Input.
// A deterministic id plus a pre-write lookup makes that repair exactly-once across every later poll.
function ensureReplyInput(projectId, { classification, threadId, sent }, options = {}) {
  if (classification?.outcomeKind !== "reply") return { inputId: null, created: false };
  const inputId = replyInputId(classification, threadId);
  if (!inputId) return { inputId: null, created: false };
  const list = typeof options.listInputs === "function" ? options.listInputs : listInputs;
  const append = typeof options.appendInput === "function" ? options.appendInput : appendInput;
  const existing = list(projectId, options).find((input) => input?.id === inputId);
  if (existing) return { inputId, created: false };
  append(projectId, {
    id: inputId,
    kind: "reply",
    source: "gmail",
    payload: {
      from: classification.from,
      body: classification.body,
      threadId,
      joinKey: sent.joinKey,
      runId: sent.runId,
      pipelineId: sent.pathId,
      providerEventId: classification.providerEventId,
    },
    provenance: {
      source: "connected-account",
      provider: "gmail",
      providerEventId: classification.providerEventId,
    },
  }, { ...options, projectId });
  return { inputId, created: true };
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
  // The sent-item substrate is the UNION of both stores a delivery can land in:
  //   - runStore — the path-compile pipeline's approved runs (flat items[]).
  //   - the flow store — where the three LIVE send paths actually persist (direct + streaming graph runs
  //     and the operator gate-resume), whose delivery facts live on execute-node output items inside each
  //     run's result. Without this half the index is permanently empty on every real live send.
  // The union is what BOTH the sent-item index AND the downstream ingest join walk, so a flow-store-sent
  // item joins back to its own run exactly as a runStore item does.
  const runStoreRuns = options.runs ?? runStore.list({ ...options, projectId });
  const flowSentRuns = loadSentRunsFromFlowStore({ ...options, projectId });
  const runs = [...runStoreRuns, ...flowSentRuns];
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
  let repairedInputs = 0;
  let pendingInputRepairs = 0;
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
        providerEventId: classification.providerEventId,
        providerSourceId: threadId,
      },
      { ...options, projectId, runs, existingResults },
    );
    // A reply's founder-decision Input is repaired independently of Result dedupe. This covers the crash
    // window where the Result write succeeded but the Input write failed: the next poll dedupes measurement
    // and creates the missing Input once. A later poll sees both durable identities and writes nothing.
    let input = { inputId: null, created: false };
    let inputRepairPending = false;
    try {
      input = ensureReplyInput(projectId, { classification, threadId, sent }, options);
    } catch {
      inputRepairPending = classification.outcomeKind === "reply";
    }

    // A signal already recorded on an earlier tick is a durable measurement no-op. It may still have
    // repaired the missing Input above; report that separately without pretending a new outcome arrived.
    if (result.deduped) {
      deduped += 1;
      if (input.created) repairedInputs += 1;
      if (inputRepairPending) pendingInputRepairs += 1;
      continue;
    }
    // Add the just-created Result to the pass's seen-state so a second thread within THIS same tick that
    // resolves to the same identity is also deduped (belt-and-braces with the cross-tick ledger read).
    existingResults.push(result.result);
    if (!result.joined) unattributed += 1;
    if (inputRepairPending) pendingInputRepairs += 1;
    ingested.push({
      joinKey: sent.joinKey,
      outcomeKind: classification.outcomeKind,
      joined: result.joined,
      ...(input.inputId ? { inputId: input.inputId } : {}),
      ...(inputRepairPending ? { inputRepairPending: true } : {}),
    });
  }

  return { ok: true, ingested, unattributed, deduped, repairedInputs, pendingInputRepairs };
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
