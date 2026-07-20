// Reply capture reads released Gmail messages from the venture's wall decisions, classifies their
// threads deterministically, and hands new signals to recordOutcome. A released wall item with a real
// messageId is the sent record; no second sent-item store exists.
//
// Honest no-op, always: no released send with a messageId yet (F9 hasn't wired a real send executor —
// effect-executors.mjs's executeMessage refuses "not wired yet" today, so this genuinely finds nothing
// until that lands), no connected Gmail credential, or Gmail refusing the read all return
// { polled: 0, reason } — never an error, so the always-on heat tick (which calls this every tick,
// regardless of heat) stays cheap and never breaks on a venture with nothing to poll yet.

import { getCredential } from "../credential-store.mjs";
import { getFreshAccessToken } from "../connectors/execute/gmail-oauth.mjs";
import {
  extractEmail,
  classifyThread,
  createGmailReadTransport,
} from "../connectors/measure/gmail-thread.mjs";
import { listVentureDocs } from "./venture-store.mjs";
import { recordOutcome } from "./market.mjs";

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

// ── The sent-item index (replaces inbox-reader.mjs's joinSentItems, re-targeted at the wall) ───────────
// Every wall item in this venture that was actually RELEASED and whose executionResult carries a real
// Gmail messageId is a sent record. `effect` is open-shaped (FIRM-SPEC.md: no schema on what a bet
// stages), so the recipient is read defensively across the aliases a teammate might have staged under —
// mirrors joinSentItems' own `item.to ?? item.buyer ?? item.recipient ?? item.email` fallback.
//
// Returns a Map: gmailMessageId → { joinKey, betId, workRef, recipient }. joinKey comes from the BET the item
// parked against (bet.mjs's own joinKey, minted once at createBet) — never a per-item key — because a
// released item's own effect carries no join pointer of its own; the bet it parked against is the join.
export function buildSentIndex(ventureId, options = {}) {
  const byMessageId = new Map();
  const decisions = listVentureDocs(ventureId, "decisions", options);
  const betsById = new Map();
  for (const item of decisions) {
    if (!item?.releasedAt || !item.betId) continue;
    const messageId = trimOrNull(item.executionResult?.messageId ?? item.executionResult?.providerMessageId);
    if (!messageId) continue;
    if (!betsById.has(item.betId)) {
      betsById.set(item.betId, listVentureDocs(ventureId, "bets", options).find((b) => b.id === item.betId) ?? null);
    }
    const bet = betsById.get(item.betId);
    if (!bet?.joinKey) continue; // no joinKey to attribute back through — never guessed
    const effect = item.effect ?? {};
    const recipient = extractEmail(effect.to ?? effect.recipient ?? effect.recipients ?? effect.email);
    byMessageId.set(messageId, {
      decisionId: item.id,
      joinKey: bet.joinKey,
      betId: bet.id,
      workRef: trimOrNull(item.workRef),
      recipient,
      configurationRevision: Number.isInteger(item.configurationRevision)
        ? item.configurationRevision
        : (bet.configurationRevision ?? null),
    });
  }
  return byMessageId;
}

// Resolve a fresh Gmail access token off the SAME banked credential the send executor will use —
// read-only reuse, no new connect flow. Keyed by ventureId exactly like every other venture-scoped
// credential read in this tree (credential-store.mjs itself is provider-agnostic on the id it's keyed
// by). Honest null when nothing is connected — never a guess.
async function resolveReadToken(ventureId, options = {}) {
  const credential = getCredential("gmail", options) ?? getCredential("google", options);
  if (!(credential?.authType === "oauth" && credential.refreshToken && credential.clientId && credential.clientSecret)) {
    return { token: null, reason: "No connected Gmail account to read replies from." };
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

// pollReplies(ventureId, options) — exactly the signature heat.mjs's tick already calls defensively
// (deps.pollReplies, lazy-default-imported from this module). One pass: build the sent-item index off
// the venture's own released wall items, mint a read token, and — thread by thread, deduped by
// threadId within the pass — classify each sent message's thread and hand any detected signal to
// market.mjs's recordOutcome (source "connected-account"), which owns dedupe/join/park itself. Returns
// { polled, ingested, reason?, needsReadScope?, needsReconnect? }. `polled` counts threads actually
// read this pass — the heat tick's own honest receipt that the poller ran, never an aggregate metric
// (it is a process count, not a founder-facing signal — see anti-cage's guard on market.mjs, which
// this module never surfaces a payload to directly).
export async function pollReplies(ventureId, options = {}) {
  const sentIndex = options.sentIndex ?? buildSentIndex(ventureId, options);
  if (sentIndex.size === 0) {
    return { polled: 0, ingested: [], reason: "Nothing released with a real send yet — nothing to read outcomes for." };
  }

  const resolved = options.token ? { token: options.token } : await resolveReadToken(ventureId, options);
  if (!resolved.token) {
    return {
      polled: 0,
      ingested: [],
      reason: resolved.reason ?? "No Gmail read access.",
      ...(resolved.needsReconnect ? { needsReconnect: true } : {}),
    };
  }

  const read = options.readTransport ?? createGmailReadTransport({ fetchImpl: options.gmailFetch });
  const token = resolved.token;
  const seenThreads = new Set();
  const ingested = [];
  let polled = 0;

  for (const [messageId, sent] of sentIndex) {
    const msg = await read.getMessage(messageId, token);
    if (!msg.ok) {
      return {
        polled,
        ingested,
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
        polled,
        ingested,
        reason: threadRes.error,
        ...(threadRes.needsReadScope ? { needsReadScope: true } : {}),
        ...(threadRes.needsReconnect ? { needsReconnect: true } : {}),
      };
    }
    polled += 1;

    const classification = classifyThread(threadRes.payload, sent);
    if (!classification) continue; // no new signal on this thread yet

    const result = recordOutcome(
      {
        ventureId,
        joinKey: sent.joinKey,
        outcomeKind: classification.outcomeKind,
        source: "connected-account",
        channel: "gmail",
        from: classification.from,
        body: classification.body,
        messageId,
        providerEventId: classification.providerEventId,
        providerSourceId: threadId,
        workRef: sent.workRef,
        configurationRevision: sent.configurationRevision,
        releaseRef: sent.releaseRef,
        observationContractRef: sent.observationContractRef,
      },
      options,
    );
    ingested.push({ threadId, outcomeKind: classification.outcomeKind, deduped: result.deduped, joined: result.joined });
  }

  return { polled, ingested };
}
