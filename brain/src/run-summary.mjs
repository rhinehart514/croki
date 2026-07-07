// The run summary — "What happened", derived READ-ONLY from the existing engine.
//
// This is all that survived the cockpit: the one organ worth keeping. It folds the latest run's real
// numbers (what went out, and what joined back to it) into the plain shape the canvas renders. The
// mad-lib "Best Next Move", the belief dump, the learnings, and the upgrades were cut — they were
// generic by construction and never read this specific product.
//
// Honesty discipline (same rule board.mjs holds): a part with no real signal reports null, never a
// fabricated number. Nothing joined back to a run ⇒ every outcome bucket stays honestly null. Revenue
// is not tracked as a distinct dollar amount at this layer, so it stays null rather than reusing a
// count as if it were money.

import { loadProjectRuns } from "./project-store.mjs";
import { resultStore } from "./gtm-store.mjs";

// ── Latest run (run gate items + joined Results → What happened) ────────────────────────────────────
const REPLY_KINDS = new Set(["reply", "replies", "response", "responded", "answered"]);
const CALL_KINDS = new Set(["meeting", "meetings", "call", "calls", "booked", "demo", "demos"]);
const SIGNUP_KINDS = new Set(["signup", "signups", "sign-up", "sign up", "signed up", "registered", "trial", "activated"]);
const PAID_KINDS = new Set(["purchase", "paid", "payment", "deal", "pilot", "won", "deposit"]);
// A recorded "nothing came back" is a real, honest signal — a sent item the founder marked as silent.
// It is neither positive nor a fabricated number: it counts the items that went out and drew no response.
const NO_REPLY_KINDS = new Set(["no-response", "no response", "no-reply", "no reply", "noreply", "ignored", "silence"]);

function bucketOutcomes(results) {
  let replies = null;
  let calls = null;
  let signups = null;
  let paid = null;
  let noReply = null;
  for (const result of results) {
    const kind = String(result.outcomeKind ?? "").trim().toLowerCase();
    const value = Number(result.value);
    const step = Number.isFinite(value) && value > 0 ? value : 1;
    if (REPLY_KINDS.has(kind)) replies = (replies ?? 0) + step;
    else if (CALL_KINDS.has(kind)) calls = (calls ?? 0) + step;
    else if (SIGNUP_KINDS.has(kind)) signups = (signups ?? 0) + step;
    else if (PAID_KINDS.has(kind)) paid = (paid ?? 0) + step;
    else if (NO_REPLY_KINDS.has(kind)) noReply = (noReply ?? 0) + step;
  }
  return { replies, calls, signups, paid, noReply, revenue: null };
}

function latestRunNote({ sent, replies, calls, signups, paid, noReply }) {
  const parts = [];
  if (sent != null) parts.push(`${sent} approved to go out`);
  if (replies != null) parts.push(`${replies} replied`);
  if (calls != null) parts.push(`${calls} booked a call`);
  if (signups != null) parts.push(`${signups} signed up`);
  if (paid != null) parts.push(`${paid} paid`);
  if (noReply != null) parts.push(`${noReply} no reply yet`);
  if (!parts.length) return null;
  return `${parts.join(", ")}.`;
}

// One read that returns the whole "What happened" summary for a project. Pure over stored state; safe
// to call as often as the canvas re-renders. Returns null when no run has happened yet. Tests inject an
// isolated store via `options.root`.
export function deriveRunSummary(projectId = "default", options = {}) {
  const runs = loadProjectRuns(projectId, options);
  if (!runs.length) return null;
  const newest = [...runs].sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""))).at(-1);
  const nodes = newest?.result?.nodes ?? {};
  let approved = 0;
  let executed = 0;
  const joinKeys = new Set();
  // An item's durable identity for the outcome join is its joinKey when the Phase-5 run store minted one,
  // else the gtmActionId the founder gate stamps on every item. A founder-entered outcome recorded on a
  // sent item joins on that same provenance id, so this fallback is what lets it show up here.
  const itemJoinId = (item) => item?.joinKey ?? item?.gtmActionId ?? null;
  for (const node of Object.values(nodes)) {
    const items = Array.isArray(node?.items) ? node.items : [];
    if (node?.category === "gate") {
      for (const item of items) {
        if (item?.approvalStatus === "approved") approved += 1;
        const key = itemJoinId(item);
        if (key) joinKeys.add(key);
      }
    } else if (node?.category === "execute") {
      executed += items.length;
      for (const item of items) {
        const key = itemJoinId(item);
        if (key) joinKeys.add(key);
      }
    }
  }
  // What actually went out: items that moved through an execute step, else what the founder approved.
  const sent = executed > 0 ? executed : (approved > 0 ? approved : null);
  // Outcomes that join back to THIS run's items — never the whole project's outcomes attributed to one
  // run. Nothing joined ⇒ every outcome bucket stays null (honestly unmeasured).
  const results = resultStore.list({ ...options, projectId }).filter((result) => result.joinKey && joinKeys.has(result.joinKey));
  const buckets = bucketOutcomes(results);
  return {
    sent,
    replies: buckets.replies,
    calls: buckets.calls,
    signups: buckets.signups,
    paid: buckets.paid,
    noReply: buckets.noReply,
    revenue: buckets.revenue,
    note: latestRunNote({ sent, ...buckets }),
  };
}
