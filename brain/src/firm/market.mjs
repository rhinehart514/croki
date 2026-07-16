// market.mjs — the market's outcome, joined to the bet that provoked it (FIRM-SPEC.md "The three
// nouns" — Outcome: "A reply, a no-reply, a churn, an activation, a close — joined to the bet that
// provoked it. Positive, negative, and zero results are equally first-class; unjoined signals stay
// unattributed rather than being claimed.").
//
// The join key is a bet's own joinKey. A joined outcome becomes evidence on that bet; an unjoined
// outcome is recorded honestly as unattributed and is never guessed onto unrelated work.
//
// Every outcome — joined or not — also parks one decide-together item at the wall, because rail 5
// ("On a real reply, the machine alerts the founder and they decide together") applies regardless of
// whether the join resolved. Deciding that item NEVER auto-replies or runs work: it is the founder's
// own read of the market, nothing more.
//
// Scoreboards are NOT ported (FIRM-SPEC.md "What stays open": "no sentiment scores, no aggregate
// numbers surfaced to the founder"). There is no count, rate, or score anywhere in this file's return
// shapes — see anti-cage.test.mjs's guard for market.mjs.

import { now, getVentureDoc, setVentureDoc, listVentureDocs } from "./venture-store.mjs";
import { recordOutcomeIntoSoul } from "../soul-wiring.mjs";
import { park } from "./wall.mjs";

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

// ── Administrative-receipt exclusion ────────────────────────────────────────────────────────────────
// A founder approval or release receipt belongs to the decision ledger, never the market ledger.
// Letting one in would make approval look like the market
// speaking — teaching taste, souls, or a later mutation that the world responded before it actually did.
function isAdministrativeReceipt(outcome = {}) {
  const kind = String(outcome.outcomeKind ?? outcome.kind ?? outcome.type ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  return /^(?:founder-)?(?:approval|approved|release|released)$/.test(kind);
}

// ── Cross-tick dedupe identity ───────────────────────────────────────────────────────────────────────
// One real reply observed repeatedly by a poller must record as ONE outcome, not one per tick. An explicit
// provider event identity is authoritative; otherwise a (joinKey, outcomeKind, messageId, source) tuple
// is the fallback — deliberately excluding founder-entered outcomes from the message fallback, since a
// founder's own note may reuse a contextual message id across genuinely separate observations.
function providerEventId(outcome = {}) {
  return trimOrNull(outcome.providerEventId ?? outcome.sourceEventId ?? outcome.eventId);
}

function outcomeIdentity({ joinKey, outcomeKind, messageId, source, providerEventId: eventId, providerSourceId }) {
  const providerEvent = trimOrNull(eventId);
  if (providerEvent) {
    return ["provider-event", trimOrNull(source) ?? "", trimOrNull(providerSourceId) ?? "", providerEvent].join("::");
  }
  return ["message-fallback", trimOrNull(joinKey) ?? "", trimOrNull(outcomeKind) ?? "", trimOrNull(messageId) ?? "", trimOrNull(source) ?? ""].join("::");
}

// Every outcome already recorded on any bet in this venture — the durable seen-state a poller's repeated
// tick checks against, exactly like outcome-ingest.mjs's persisted Result ledger. Outcomes live as
// evidence entries tagged `type: "outcome"`; this is a plain scan, no separate index to keep in sync.
function allRecordedOutcomes(ventureId, options) {
  return listVentureDocs(ventureId, "outcomes", options);
}

function findExistingOutcome(ventureId, outcome, options) {
  const explicitProviderIdentity = providerEventId(outcome);
  const messageFallback = trimOrNull(outcome.source) !== "founder-entered" && trimOrNull(outcome.messageId);
  if (!explicitProviderIdentity && !messageFallback) return null;
  const identity = outcomeIdentity(outcome);
  return allRecordedOutcomes(ventureId, options).find((existing) => outcomeIdentity(existing) === identity) ?? null;
}

// The join: a bet's own joinKey, minted once at createBet (bet.mjs:78) and stamped onto an outward
// effect when it's parked (wall.mjs's park()), is the one key a returning outcome matches back to. A
// pure lookup over the venture's own bets — never a model call, exactly like outcome-ingest's joinToRun.
function joinToBet(ventureId, joinKey, options) {
  const key = trimOrNull(joinKey);
  if (!key) return null;
  return listVentureDocs(ventureId, "bets", options).find((bet) => trimOrNull(bet.joinKey) === key) ?? null;
}

// ── Outcome objects (Build step 2) ────────────────────────────────────────────────────────────────────
// One record per return: who spoke, what they said, which bet it answers, when. Positive, negative, and
// zero (a no-reply window, recordable by the founder or a poller) are all just outcomes — no severity
// field, no score. `structural`/`identifying` mirrors outcome-ingest.mjs's writeLearningForResult split
// (Build step 1's "keep the split"): structural (channel, outcomeKind, whether it joined) is safe to
// pool across ventures later; identifying (the body, who spoke, the bet's own intent) never is.
function buildOutcome({ ventureId, joinKey, workRef, outcomeKind, body, from, source, channel, messageId, observedAt, providerEventId: eventId, providerSourceId, configurationRevision, architectureRevision, architectureTarget }, bet, release = null) {
  return {
    type: "outcome",
    id: `outcome-${(observedAt ?? now()).replace(/\D/g, "").slice(0, 14)}-${Math.random().toString(16).slice(2, 10)}`,
    ventureId,
    betId: bet?.id ?? null,
    workRef: trimOrNull(workRef),
    configurationRevision: Number.isInteger(configurationRevision) && configurationRevision > 0
      ? configurationRevision
      : (Number.isInteger(bet?.configurationRevision) ? bet.configurationRevision : null),
    architectureRevision: Number.isInteger(architectureRevision) && architectureRevision >= 0
      ? architectureRevision
      : (Number.isInteger(release?.architectureRevision) ? release.architectureRevision : (Number.isInteger(bet?.architectureRevision) ? bet.architectureRevision : null)),
    architectureTarget: architectureTarget?.id ? architectureTarget : (release?.architectureTarget ?? bet?.architectureTarget ?? null),
    joinKey: trimOrNull(joinKey),
    outcomeKind: trimOrNull(outcomeKind),
    from: trimOrNull(from),
    body: trimOrNull(body),
    source: trimOrNull(source),
    channel: trimOrNull(channel),
    messageId: trimOrNull(messageId),
    providerEventId: trimOrNull(eventId),
    providerSourceId: trimOrNull(providerSourceId),
    observedAt: observedAt ?? now(),
    attribution: bet ? "joined" : "unattributed",
    joined: Boolean(bet),
    structural: { channel: trimOrNull(channel), outcomeKind: trimOrNull(outcomeKind), joined: Boolean(bet) },
    identifying: { betId: bet?.id ?? null, workRef: trimOrNull(workRef), betIntent: bet?.intent ?? null, from: trimOrNull(from), body: trimOrNull(body) },
  };
}

// recordOutcome() — take one raw outcome from any source (connected-account poll, product event, founder
// note), dedupe it against what is already recorded, join it to the bet whose joinKey matches, append it
// to that bet's evidence, and park ONE decide-together item at the wall regardless of whether the join
// resolved. Returns { outcome, joined, bet, queued, deduped }.
export function recordOutcome(outcome = {}, options = {}) {
  const ventureId = trimOrNull(outcome.ventureId);
  if (!ventureId) throw new Error("recordOutcome() needs a ventureId.");
  if (isAdministrativeReceipt(outcome)) {
    throw new Error("A wall decision receipt is not a market outcome.");
  }

  const already = findExistingOutcome(ventureId, outcome, options);
  if (already) {
    return {
      outcome: already,
      joined: already.attribution === "joined",
      bet: already.betId ? getVentureDoc(ventureId, "bets", already.betId, options) : null,
      queued: null,
      deduped: true,
    };
  }

  const bet = joinToBet(ventureId, outcome.joinKey, options);
  const release = outcome.workRef
    ? listVentureDocs(ventureId, "decisions", options).find((item) => item.workRef === outcome.workRef && item.decision === "release")
    : null;
  const recorded = buildOutcome(outcome, bet, release);
  setVentureDoc(ventureId, "outcomes", recorded.id, recorded, options);

  if (bet) {
    const evidence = [
      ...(Array.isArray(bet.evidence) ? bet.evidence : []),
      { type: "outcome", id: recorded.id },
    ];
    setVentureDoc(ventureId, "bets", bet.id, { ...bet, evidence, updatedAt: now() }, options);

    // Soul writeback — folds a real result into the teammate's track record + a scratch lesson. Only
    // fires when the bet names the teammate that made it; never fatal (recording the outcome is the truth
    // that must hold even if the soul write hiccups — same posture as outcome-ingest.mjs).
    if (bet.teammateRef) {
      try {
        recordOutcomeIntoSoul(
          { ventureId, teammateRef: bet.teammateRef, outcomeKind: recorded.outcomeKind, message: recorded.body, betId: bet.id },
          options,
        );
      } catch (error) {
        console.warn(`[firm/market] soul writeback skipped: ${error?.message ?? error}`);
      }
    }
  }

  // Rail 5, always: a real reply alerts the founder to decide together, whether or not the join
  // resolved. deciding this item never sends, replies, or runs anything — it is the founder's own read.
  const queued = park({
    ventureId,
    betId: bet?.id ?? null,
    workRef: recorded.workRef,
    purpose: "review-outcome",
    blocksBet: false,
    configurationRevision: recorded.configurationRevision,
    architectureRevision: recorded.architectureRevision,
    architectureTarget: recorded.architectureTarget,
    effect: { kind: "outcome", outcome: recorded },
  }, options);

  return { outcome: recorded, joined: Boolean(bet), bet, queued, deduped: false };
}

// ── Founder outcome entry (Build step 5; ports recordFounderOutcome's open-label mapping) ─────────────
// The founder's own plain-words note on a bet: what happened, and what it taught. `happened` is an open
// label (never a closed enum — an unrecognized label passes through lowercased, exactly like
// outcome-capture.mjs's HAPPENED_TO_KIND fallback), so a label that doesn't exist yet still records
// honestly rather than being rejected.
const HAPPENED_TO_KIND = {
  "got replies": "reply", replies: "reply",
  "booked calls": "meeting", calls: "meeting",
  "got paid": "purchase", paid: "purchase",
  "got ignored": "ignored", ignored: "ignored",
  "got objections": "objection", objections: "objection",
  other: "other",
};

export function recordFounderOutcome({ ventureId, betId, workRef = null, happened, learned }, options = {}) {
  if (!trimOrNull(ventureId)) throw new Error("recordFounderOutcome() needs a ventureId.");
  const bet = trimOrNull(betId) ? getVentureDoc(ventureId, "bets", betId, options) : null;
  if (trimOrNull(betId) && !bet) throw new Error(`No such bet: ${betId}`);
  const label = String(happened ?? "").trim();
  const outcomeKind = HAPPENED_TO_KIND[label.toLowerCase()] ?? (label ? label.toLowerCase() : "other");
  // A founder note always has somewhere honest to join: the bet's own joinKey when named, or a fresh
  // one-off key when the founder is recording something unattributed on purpose.
  const joinKey = bet?.joinKey ?? `founder-${now()}`;
  return recordOutcome(
    { ventureId, joinKey, workRef, outcomeKind, body: trimOrNull(learned), source: "founder-entered" },
    options,
  );
}

// ── Kill → mutation (Build step 4) ──────────────────────────────────────────────────────────────────
// When the founder kills a bet at the wall, hand the learning to the crew as an ORDINARY driveTeammate
// goal — never a host-picked dimension (ports the restraint of loser-mutation.mjs: "which dimension
// should change remains crew judgment; the host never hardcodes a fixed taxonomy and pretends that is
// strategy"). `deps.driveTeammate` is injectable; production lazily imports work-loop.mjs at call time
// so this module never statically depends on F2's file (its own, separate module).
export async function mutateKilledBet({ ventureId, bet, teammateRef, model = null }, options = {}, deps = {}) {
  if (!bet?.endedAt) throw new Error("mutateKilledBet() needs an already-ended bet.");
  const ref = trimOrNull(teammateRef) ?? trimOrNull(bet.teammateRef);
  if (!ref) throw new Error("mutateKilledBet() needs a teammateRef to hand the mutation goal to.");
  const goal = `"${bet.intent}" died${bet.learning ? ` — here's what we learned: ${bet.learning}` : ""}. ` +
    `What is the smallest meaningful mutation worth trying next? Fork it as a new bet with forkedFrom set to ${bet.id}.`;
  const driveTeammate = deps.driveTeammate ?? (await import("./work-loop.mjs")).driveTeammate;
  return driveTeammate({ ventureId, teammateRef: ref, goal, model, options, deps });
}
