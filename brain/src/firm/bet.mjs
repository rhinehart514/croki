// bet.mjs — the open unit of trying (FIRM-SPEC.md "The three nouns" — Bet).
//
// A bet has no required fields beyond what makes it addressable and joinable, no kind, no status,
// no stage. It is a pointer to live work plus its evidence plus its eventual outcome. Its position
// — live, at-wall, or ended — is never stored; it is derived from whether the bet has been ended
// and, if not, whether it currently holds a staged item waiting at the wall queue. Storing a
// lifecycle field here is the exact cage FIRM-SPEC.md's anti-cage guards exist to catch (see
// brain/test/firm/anti-cage.test.mjs).
//
// fork() is the one verb: a teammate facing a goal forks genuinely divergent bets, a winning bet
// forks again, a killed bet forks into a mutation carrying its learning. end() is the only terminal
// write, and it is the founder's alone — mirroring the founder-only kill boundary already proven at
// the routes layer (routes/founder-authority.mjs, brain/test/firm/security-matrix.test.mjs). This
// module has no HTTP surface, so it takes an already-resolved actor rather than a request; the wall
// (F3) is what stands between an HTTP caller and this function, exactly as measure.mjs's verdict
// route stands between HTTP and stated-experiment.mjs today.

import crypto from "node:crypto";
import { now } from "./venture-store.mjs";

function genId(prefix) {
  const stamp = now().replace(/\D/g, "").slice(0, 14);
  return `${prefix}-${stamp}-${crypto.randomBytes(4).toString("hex")}`;
}

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

// A reference to anything else in the firm or the wider repo — { type, id }, both open strings.
// Same shape as gtm-store.mjs's normalizeRefs: a bet can point at a teammate, a prior bet, a piece of
// evidence, a repo file, or anything a teammate names, without a closed ref-type enum.
function normalizeRefs(list) {
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw) => {
    if (!raw) return [];
    if (typeof raw === "string") return [{ type: null, id: raw }];
    const id = trimOrNull(raw.id);
    if (!id) return [];
    return [{ type: trimOrNull(raw.type), id }];
  });
}

function normalizeList(list) {
  return Array.isArray(list) ? list.filter((item) => item != null) : [];
}

function configurationRevision(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

// The founder-only boundary this store enforces. `actor` is whatever the caller (the wall, a test)
// has already resolved a decision-maker to be — this module never reads a request itself. An actor
// that stamps itself as an agent/model, or carries no founder marker at all, is refused. Mirrors the
// resolved-actor shape of the route boundary one layer down: the HTTP origin check happens above this
// call, not here.
function assertFounderActor(actor, action) {
  const kind = typeof actor === "string" ? actor : actor?.kind;
  if (String(kind ?? "").trim().toLowerCase() !== "founder") {
    const error = new Error(`${action} is founder-only. Only the founder can end a bet.`);
    error.code = "bet_end_forbidden";
    throw error;
  }
}

// A bet is created live, with a lineage pointer (forkedFrom) and nothing else assumed about its
// content — `refs`, `evidence`, and `staged` are open lists a teammate fills as work happens.
export function createBet(input = {}) {
  const createdAt = input.createdAt || now();
  if (!trimOrNull(input.ventureId)) throw new Error("A bet must carry a ventureId.");
  if (!trimOrNull(input.intent)) throw new Error("A bet needs an intent — whoever's words made it.");
  return {
    id: input.id || genId("bet"),
    ventureId: trimOrNull(input.ventureId),
    intent: trimOrNull(input.intent),
    forkedFrom: trimOrNull(input.forkedFrom),
    teammateRef: trimOrNull(input.teammateRef),
    configurationRevision: configurationRevision(input.configurationRevision),
    refs: normalizeRefs(input.refs),
    evidence: normalizeList(input.evidence),
    staged: normalizeList(input.staged),
    joinKey: trimOrNull(input.joinKey) || genId("join"),
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    endedAt: null,
    endedBy: null,
    learning: null,
  };
}

// Fork is the one structural verb (FIRM-SPEC.md "The one verb"). A teammate diverging from a goal,
// a winner scaling or varying, or a killed bet mutating with its learning are all this same call —
// only `intent` and, for a mutation, `learning` differ. The child always carries forkedFrom = the
// parent's id and a fresh joinKey of its own (a fork is a new pointer into live work, not a
// continuation of the parent's outcome join).
export function fork(parentBet, intent, { teammateRef = null, learning = null, configurationRevision: revision = null } = {}) {
  if (!parentBet?.id) throw new Error("fork() needs a parent bet to fork from.");
  return createBet({
    ventureId: parentBet.ventureId,
    intent,
    forkedFrom: parentBet.id,
    teammateRef: teammateRef ?? parentBet.teammateRef,
    configurationRevision: revision ?? parentBet.configurationRevision,
    refs: learning ? [{ type: "learning-source", id: parentBet.id }] : [],
  });
}

// end() is the only terminal write, and it is the founder's alone (FIRM-SPEC.md firm rail #2: "Only
// the founder kills a bet"). Records what was learned so the fork it provokes carries that learning
// forward; a killed bet stays fully readable, never deleted.
export function end(bet, actor, { learning = null } = {}) {
  if (!bet?.id) throw new Error("end() needs a bet.");
  assertFounderActor(actor, "Ending a bet");
  const endedAt = now();
  return {
    ...bet,
    updatedAt: endedAt,
    endedAt,
    endedBy: typeof actor === "string" ? actor : (actor?.ref ?? "founder"),
    learning: trimOrNull(learning),
  };
}

// positionOf derives a bet's position from the loop itself — never a stored field. `wallQueue` is
// whatever the wall (F3) considers "currently parked" for this bet: an array of entries, or a
// predicate-bearing object with a `has(betId)` method, so callers can pass either a plain snapshot
// or a live queue index without this module knowing the wall's shape.
export function positionOf(bet, wallQueue = []) {
  if (bet?.endedAt) return "ended";
  const atWall = typeof wallQueue?.has === "function"
    ? wallQueue.has(bet.id)
    : Array.isArray(wallQueue) && wallQueue.some((entry) => {
      if ((entry?.betId ?? entry) !== bet.id) return false;
      return typeof entry === "object" ? entry.blocksBet !== false : true;
    });
  return atWall ? "at-wall" : "live";
}
