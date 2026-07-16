// outcome-report.mjs — surface a joined market outcome in the conversation as the teammate reporting it.
//
// This is the founder-facing half of "evidence to cause" (build contract §4A.4). The join itself already
// happened in market.mjs recordOutcome(): a returning reply matched its causing bet by joinKey, became
// evidence on that bet, and parked one decide-together wall item. That wall item is the DECISION surface
// and stays exactly as-is (FIRM-SPEC rail 5). This module adds the ALERT surface the founder actually
// watches: a plain-words line in the conversation, authored by the teammate who owns the effort, saying
// the market answered — linking down to the outcome record.
//
// Deterministic throughout: no model call. Which teammate speaks is the bet's own teammateRef; what they
// say is composed from the outcome's own fields (kind + who spoke + what they said). A model call here
// would be a bug — the words are a template over facts already on the record, not a fuzzy judgment.
//
// Founder language only (six nouns; AGENTS.md): "the market answered", "replied", "asked about" — never
// "outcome", "joinKey", "bet". The internal identifiers ride in the message's structured fields
// (target.betId, outcomeReport.outcomeId) as compatibility seams, never in the rendered content.

import { appendConversationMessage } from "./conversation.mjs";

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

// A short human name for whoever spoke, from an email or free-text `from`. "jo@acme.com" → "Jo";
// "Buffalo Wing Co <team@…>" → "Buffalo Wing Co". Honest, never invented: an empty from stays "Someone".
export function speakerLabel(from) {
  const raw = trimOrNull(from);
  if (!raw) return "Someone";
  const angled = raw.match(/^(.+?)\s*<[^>]+>$/);
  if (angled && trimOrNull(angled[1])) return trimOrNull(angled[1]);
  const email = raw.match(/^([^@\s]+)@/);
  if (email) {
    const local = email[1].replace(/[._-]+/g, " ").trim();
    return local ? local.replace(/\b\w/g, (c) => c.toUpperCase()) : raw;
  }
  return raw;
}

// The verb the founder reads, mapped from the outcome kind. Open vocabulary (an unrecognized kind falls
// through to a neutral "responded"), mirroring market.mjs's own open-label HAPPENED_TO_KIND fallback —
// a kind that doesn't exist yet still reads honestly rather than being dropped.
const KIND_VERB = {
  reply: "replied",
  meeting: "booked time",
  purchase: "paid",
  ignored: "went quiet",
  objection: "pushed back",
  churn: "churned",
  activation: "activated",
};

// Compose the one-line report the teammate speaks. Founder language: names the market's return and, when
// there is a body, quotes it plainly. Never a score, never a count (anti-cage guard on market surfaces).
export function composeOutcomeReport({ outcome, bet }) {
  const who = speakerLabel(outcome?.from);
  const kind = trimOrNull(outcome?.outcomeKind);
  const verb = (kind && KIND_VERB[kind]) || "responded";
  const body = trimOrNull(outcome?.body);
  const head = `${who} ${verb}`;
  if (body) return `${head} — “${body}”`;
  return `${head} on “${bet?.intent ?? "this direction"}”.`;
}

// reportJoinedOutcome — the one call market.mjs makes after a real join resolves. Appends a teammate-role
// conversation message attached to the causing effort (target.betId) and carrying the outcome record
// pointer (outcomeReport.outcomeId), so the UI can link the reported reply down to its full record.
//
// Only ever fires on a genuine, non-deduped join — an unattributed signal never speaks here (it would be
// guessing onto unrelated work, which market.mjs already refuses at the join). Returns the appended
// message, or null when there is nothing honest to say (no bet, no teammate to author it as).
export function reportJoinedOutcome({ ventureId, outcome, bet }, options = {}, deps = {}) {
  if (!trimOrNull(ventureId)) return null;
  if (!bet || !trimOrNull(bet.teammateRef)) return null; // no teammate to speak as — stay silent, not fake
  if (!outcome) return null;

  const append = deps.appendConversationMessage ?? appendConversationMessage;
  return append(
    {
      ventureId,
      role: "teammate",
      kind: "message",
      teammateRef: bet.teammateRef,
      betId: bet.id,
      content: composeOutcomeReport({ outcome, bet }),
      target: { betId: bet.id, workRef: outcome.workRef ?? null, teammateRefs: [bet.teammateRef] },
      outcomeReport: {
        outcomeId: outcome.id,
        outcomeKind: trimOrNull(outcome.outcomeKind),
        channel: trimOrNull(outcome.channel),
        from: trimOrNull(outcome.from),
      },
    },
    options,
  );
}
