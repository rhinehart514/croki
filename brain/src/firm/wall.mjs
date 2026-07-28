// wall.mjs — the one decision surface for everything outward (FIRM-SPEC.md "The one harness" —
// The wall; firm rail #3: "The founder releases each outward act with one decision.").
//
// Anything a bet's next act would touch the world with — a send, a publish, a deploy, a spend — pauses
// here as a queue item, alongside the two non-outward decisions that are still the founder's alone: a
// question the crew needs answered, and a kill proposal. There is no separate schema per kind: an item
// is `{ id, ventureId, betId, workRef, effect, parkedAt, decision, decidedAt, decidedBy, note, releasedAt,
// deployAuthorizedAt, deployAuthorizedBy }`, and `effect` is whatever the caller staged — open, exactly
// like a bet (see firm-build/04-F3-wall-queue.md "Build" step 1) — EXCEPT any field that claims a
// founder authorization (deployConfirmed and its kin), which park() strips on the way in: the parker is
// never the founder, so authorization state can never ride in on content it authored. `decision` stays
// null while queued; `queue()`/`queueAll()` only ever return items with `decision === null`, so a
// decided item falls out of the list the moment `decide()` writes it — no second "queue vs. history"
// store, the same one document through its whole life.
//
// Outward release uses a module-private Symbol rebuilt inside decide(), threaded only onto the effect
// being executed, never persisted, and never reachable from a bet's own content.
//
// Founder authority is NOT reimplemented here. Every decision runs through the shared local-page
// boundary: a real unstamped HTTP request is accepted, model/MCP traffic bearing the agent stamp is
// refused, and a missing request fails closed. The wall then preserves its separate outward capability,
// presence hold, venture isolation, and deploy confirmation.

import crypto from "node:crypto";
import { now, getVentureDoc, setVentureDoc, listVentureDocs } from "./venture-store.mjs";
import { end as endBet } from "./bet.mjs";
import { authorizeFounderWriteForRequest } from "../routes/founder-authority.mjs";
import { isFounderPresent as defaultIsFounderPresent } from "../presence.mjs";
import { stampKnownEffectConsequences } from "./effect-consequences.mjs";
import { stampDeployContract } from "./deploy-contract.mjs";
import { emitFirmEvent } from "./firm-events.mjs";
import { loadWork, saveWork } from "./work-loop-state.mjs";
import { applyProviderInterventionDecision } from "./provider-interventions.mjs";
import { recordInterventionTranscript } from "./founder-turn-queue.mjs";
import { recordInterventionResolved } from "./work-journal-runtime.mjs";

function genId(prefix) {
  const stamp = now().replace(/\D/g, "").slice(0, 14);
  return `${prefix}-${stamp}-${crypto.randomBytes(4).toString("hex")}`;
}

// ─── Outward-release capability ──────────────────────────────────────────────────────────────────────
// Minted fresh inside decide(), threaded only onto the one released effect's execution context, never
// persisted to the queue item or the decision receipt. An executor checks hasWallRelease before it acts;
// a missing/forged value fails closed, so neither a stored queue item nor a model-driven caller can carry
// this capability forward to a later, unreviewed call.
const WALL_RELEASE = Symbol("firm.wall-release-capability");

export function hasWallRelease(context) {
  return context?.runtime?.outwardRelease === WALL_RELEASE;
}

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

// A queue item is addressed by (ventureId, itemId) and lives in the venture's own "decisions"
// collection — the same collection decide() writes its receipt back into, because a queue item and its
// eventual receipt are the same document across its life, not two records to keep in sync.
function loadItem(ventureId, itemId, options) {
  return getVentureDoc(ventureId, "decisions", itemId, options);
}

function saveItem(ventureId, item, options) {
  setVentureDoc(ventureId, "decisions", item.id, item, options);
  return item;
}

// The parker is whoever staged the bet's work — a teammate, a composed run, in time a model. None of
// them are the founder, so no field they write can ever BE a founder authorization. Stripped on the way
// in; the effect a parker controls must never carry the confirmation.
// preAuthorizedGrantId is a HOST-stamped pre-authorization marker (a live founder grant lets an act skip the
// WAIT — grant-stage-outward.mjs). Like deployConfirmed and its kin it is an authorization claim, so the
// parker must never be able to ride it in on the effect it authored: a forged preAuthorizedGrantId would
// display a bet's own act as founder-blessed. It is stripped here and re-stamped only by park()'s own
// host-side `preAuthorizedGrantId` parameter, never from parker-controlled content.
const AUTHORIZATION_CLAIM_FIELDS = ["deployConfirmed", "deployAuthorization", "deployAuthorized", "authorized", "preAuthorizedGrantId"];

function stripAuthorizationClaims(effect) {
  const clean = { ...effect };
  for (const field of AUTHORIZATION_CLAIM_FIELDS) delete clean[field];
  return clean;
}

const PURPOSE_DECISIONS = Object.freeze({
  release: new Set(["release", "reject", "authorize-deploy"]),
  answer: new Set(["answer", "dismiss"]),
  "review-outcome": new Set(["acknowledge"]),
  "end-bet": new Set(["kill", "keep"]),
});
const ALL_DECISIONS = new Set(Object.values(PURPOSE_DECISIONS).flatMap((values) => [...values]));

function inferPurpose(effect) {
  if (effect?.question) return "answer";
  if (effect?.outcome || effect?.kind === "outcome") return "review-outcome";
  if (effect?.kill === true || effect?.kind === "kill-proposal") return "end-bet";
  return "release";
}

// park() — an outward effect, a founder question, or a kill proposal enters the queue. `effect` is
// whatever the caller staged (FIRM-SPEC.md: "The effect names its exact difference — message +
// recipients, page + destination, diff + environment, amount + recipient"); this module has no opinion
// on its shape beyond carrying it through untouched — EXCEPT any field that claims a founder
// authorization (deployConfirmed and friends), which is stripped before the item is ever saved. The
// parker is never the founder, so authorization state can never ride in on the effect it authored; the
// founder's second deploy confirmation is its own act, stamped on the ITEM by decide() below, never
// content the effect's author supplies.
export function park({ ventureId, betId = null, workRef = null, purpose = null, blocksBet = null, configurationRevision = null, architectureRevision = null, architectureTarget = null, preAuthorizedGrantId = null, effect }, options = {}) {
  if (!trimOrNull(ventureId)) throw new Error("park() needs a ventureId.");
  if (!effect || typeof effect !== "object") throw new Error("park() needs an effect to queue.");
  const parkedAt = now();
  // Stamp the bet's OWN joinKey onto an effect that doesn't already carry one — the one join target
  // market.mjs's returning voices match back to (bet.mjs:78 mints a joinKey on every bet at creation).
  // Never overwrites an explicit joinKey the caller already set (e.g. a founder note keying to its own
  // one-off join). A betId with no such bet, or no betId at all (a question, a kill proposal), leaves
  // the effect untouched — nothing to stamp.
  const clean = stampDeployContract(
    ventureId,
    stampKnownEffectConsequences(stripAuthorizationClaims(effect), options),
    options,
  );
  const resolvedPurpose = purpose ?? inferPurpose(clean);
  if (!PURPOSE_DECISIONS[resolvedPurpose]) {
    throw new Error(`Unknown founder-attention purpose: ${resolvedPurpose}`);
  }
  const bet = betId ? getVentureDoc(ventureId, "bets", betId, options) : null;
  const stampedEffect = bet?.joinKey && !clean.joinKey ? { ...clean, joinKey: bet.joinKey } : clean;
  const itemId = genId("wall");
  const item = {
    id: itemId,
    ventureId: trimOrNull(ventureId),
    betId: trimOrNull(betId),
    workRef: trimOrNull(workRef) ?? itemId,
    configurationRevision: Number.isInteger(configurationRevision) && configurationRevision > 0
      ? configurationRevision
      : (Number.isInteger(bet?.configurationRevision) ? bet.configurationRevision : null),
    architectureRevision: Number.isInteger(architectureRevision) && architectureRevision >= 0
      ? architectureRevision
      : (Number.isInteger(bet?.architectureRevision) ? bet.architectureRevision : null),
    architectureTarget: architectureTarget?.id
      ? { id: trimOrNull(architectureTarget.id), stepId: trimOrNull(architectureTarget.stepId) }
      : (bet?.architectureTarget ?? null),
    purpose: resolvedPurpose,
    blocksBet: blocksBet == null ? resolvedPurpose !== "review-outcome" : blocksBet === true,
    effect: stampedEffect,
    // Host-stamped pre-authorization marker — set only by grant-stage-outward's own host path, never from
    // the parker's effect content (which has any preAuthorizedGrantId stripped above). null when no live grant.
    preAuthorizedGrantId: trimOrNull(preAuthorizedGrantId),
    parkedAt,
    decision: null,
    decidedAt: null,
    decidedBy: null,
    note: null,
    releasedAt: null,
    deployAuthorizedAt: null,
    deployAuthorizedBy: null,
  };
  const saved = saveItem(ventureId, item, options);
  emitFirmEvent(trimOrNull(ventureId), "wall", { betId });
  return saved;
}

// The one list the founder reviews — every item still awaiting a decision in this venture, oldest
// first (the order the founder should clear them in).
export function queue(ventureId, options = {}) {
  return listVentureDocs(ventureId, "decisions", options)
    .filter((item) => item?.decision == null)
    .sort((a, b) => String(a.parkedAt).localeCompare(String(b.parkedAt)));
}

// The portfolio wall (F8 groundwork): every venture's queue, concatenated — each item still carries its
// own ventureId, so a caller can group by venture without this module owning a portfolio store of its
// own. `listVentureIds` is injected (F1's venture-store.listVentures shape: an array of manifests, or a
// caller-supplied array of ids) so this module never has to import a portfolio listing itself.
export function queueAll({ listVentureIds } = {}, options = {}) {
  if (typeof listVentureIds !== "function") {
    throw new Error("queueAll() needs a listVentureIds() to know which ventures to scan.");
  }
  const ids = listVentureIds(options) ?? [];
  return ids.flatMap((ventureId) => queue(ventureId, options));
}

function assertItemInVenture(item, ventureId, itemId) {
  if (!item || item.ventureId !== ventureId) {
    const error = new Error(`No such wall item in this venture: ${itemId}`);
    error.code = "wall_item_not_in_venture";
    error.status = 404;
    throw error;
  }
}

// decide() is the founder act this whole module protects. `auth.req` is the live HTTP request
// (or an equivalent already-shaped object) — this function is the seam between a real caller and every
// write below, so every door (browser, API, MCP, a model narrating a decision) is checked here, not
// downstream. `isFounderPresent`/`executeEffect`/`actor` are injectable for tests and for the caller to
// wire real connectors; production defaults to the real presence lease and a no-op executor override is
// an error (a release must always be able to actually reach an executor).
export function decide(
  { ventureId, itemId, decision, note = null },
  auth = {},
  {
    isFounderPresent = defaultIsFounderPresent,
    executeEffect = null,
    endBetActor = "founder",
  } = {},
  options = {},
) {
  // THE FOUNDER-AUTHORITY BOUNDARY. Every decide() call — release, kill, reject, or authorize-deploy — is
  // a founder-only write. The local Croki page needs no unlock ceremony; an agent-stamped request or a
  // direct call with no real HTTP request is refused before any effect, bet, or receipt is touched.
  authorizeFounderWriteForRequest(auth?.req, "Deciding a wall item");
  if (!ALL_DECISIONS.has(decision)) {
    throw new Error("decide() needs a decision; use a recognized decision for this wall item.");
  }

  const item = loadItem(ventureId, itemId, options);
  assertItemInVenture(item, trimOrNull(ventureId), itemId);
  const purpose = item.purpose ?? inferPurpose(item.effect);
  if (!PURPOSE_DECISIONS[purpose]?.has(decision)) {
    throw new Error(`Decision "${decision}" is not valid for a ${purpose} wall item.`);
  }

  // authorize-deploy is the founder's SECOND explicit act, stamped on the item itself, not the effect —
  // it does not decide the item (the item stays queued), it only clears the way for a later "release" to
  // actually ship a deploy effect. Re-stamping is harmless (still founder-only, still one decide() call).
  if (decision === "authorize-deploy") {
    if (item.effect?.kind !== "deploy") {
      throw new Error(`Wall item ${itemId} is not a deploy effect — nothing to authorize.`);
    }
    const stamped = { ...item, deployAuthorizedAt: now(), deployAuthorizedBy: typeof auth?.actor === "string" ? auth.actor : "founder" };
    return saveItem(ventureId, stamped, options);
  }

  if (item.decision != null) {
    throw new Error(`Wall item ${itemId} was already decided.`);
  }

  // PRESENCE HOLD. Passing the founder-authority check proves the request came through the local page
  // boundary, but a release ALSO needs the founder to be actually present — the volatile lease that
  // lapses to away the moment heartbeats stop. This is what makes "away holds all outward effects" real
  // even for a call from a stale tab left open on a
  // machine the founder walked away from): a release while away is refused; kill and reject touch nothing
  // outward and are never held by presence.
  if (decision === "release" && isFounderPresent() !== true) {
    const error = new Error("The founder is away. Outward releases hold until presence returns.");
    error.code = "wall_release_while_away";
    error.status = 409;
    throw error;
  }

  // DEPLOY KEEPS ITS SECOND EXPLICIT AUTHORIZATION. A deploy effect is heavier than an ordinary send —
  // its two-authorization contract is re-seated so the SECOND
  // authorization is the founder's own act on the ITEM (a prior decide({decision:"authorize-deploy"})
  // call), never a field the parker could pre-stamp onto the effect it authored. The founder's release
  // call is authorization #1; `deployAuthorizedAt` on the item — writable only through this same
  // founder-gated decide() — is authorization #2. Missing it refuses the release outright, never a
  // silent downgrade to a lesser send, and no content on the effect can ever satisfy it.
  if (decision === "release" && item.effect?.kind === "deploy" && !item.deployAuthorizedAt) {
    const error = new Error("Deploying requires a second explicit founder authorization on this item (decide with authorize-deploy first).");
    error.code = "wall_deploy_needs_confirmation";
    error.status = 409;
    throw error;
  }

  const decidedAt = now();
  const decidedBy = typeof auth?.actor === "string" ? auth.actor : "founder";
  const normalizedNote = trimOrNull(note);
  if (decision === "answer" && !normalizedNote) {
    throw new Error("Answering a teammate requires the founder's answer.");
  }
  let receipt = {
    ...item,
    purpose,
    decision,
    decidedAt,
    decidedBy,
    note: normalizedNote,
    resolution: { action: decision, note: normalizedNote, decidedAt, decidedBy },
  };

  if (decision === "release") {
    // Mint the outward capability fresh for exactly this one execution, thread it only onto the effect
    // context handed to the executor — never onto the persisted item, never returned to the caller.
    const released = { ...item.effect, runtime: { outwardRelease: WALL_RELEASE } };
    if (typeof executeEffect !== "function") {
      throw new Error("decide() cannot release without an executeEffect executor wired for this effect.");
    }
    const executionResult = executeEffect(released, item);
    // A failed transport (Gmail 500, revoked token, missing or changed deploy contract) must NOT be recorded as a
    // completed release. Do not consume the decision: persist the failure onto the still-QUEUED item so
    // it stays in the founder's queue for an explicit retry/reconnect, and throw so the release call
    // reports failure honestly instead of returning a success the world never saw. Only a genuine
    // success below stamps releasedAt and decides the item.
    if (executionResult && executionResult.ok === false) {
      const failedItem = {
        ...item,
        decision: null,
        lastExecutionError: executionResult.executionError ?? "The outward release failed.",
        needsReconnect: executionResult.needsReconnect === true,
        lastAttemptAt: decidedAt,
      };
      saveItem(ventureId, failedItem, options);
      // Surface the durable failure to live surfaces just like a decided item — the item document changed.
      emitFirmEvent(trimOrNull(ventureId), "wall", { betId: item.betId });
      const error = new Error(executionResult.executionError ?? "The outward release failed to execute.");
      error.code = "wall_release_execution_failed";
      error.status = 502;
      error.needsReconnect = executionResult.needsReconnect === true;
      throw error;
    }
    // A genuine success clears any failure markers a prior failed attempt persisted on this item, so the
    // release receipt does not carry a stale error/reconnect flag for a send the world actually saw.
    receipt = { ...receipt, releasedAt: decidedAt, executionResult: executionResult ?? null, lastExecutionError: null, needsReconnect: false, lastAttemptAt: null };
  }

  if (decision === "kill") {
    // Kill is the founder's alone (FIRM-SPEC.md firm rail #2), and bet.end() enforces that same boundary
    // one layer down. fork()/end() do not persist (F1 note) — this call is what persists the ended bet
    // and hands the learning back for the crew's mutation fork (F5).
    if (!trimOrNull(item.betId)) throw new Error(`Wall item ${itemId} has no bet to kill.`);
    const bet = getVentureDoc(ventureId, "bets", item.betId, options);
    if (!bet) throw new Error(`No such bet to kill: ${item.betId}`);
    const ended = endBet(bet, endBetActor, { learning: note });
    setVentureDoc(ventureId, "bets", ended.id, ended, options);
    receipt = { ...receipt, learning: ended.learning };
  }

  if ((decision === "answer" || decision === "dismiss") && item.effect?.continuation?.teammateRef) {
    const continuation = item.effect.continuation;
    const loaded = loadWork({
      ventureId,
      teammateRef: continuation.teammateRef,
      betId: item.betId,
      workScopeRef: continuation.target?.workScopeRef ?? null,
      options,
    });
    const nextWork = applyProviderInterventionDecision(
      loaded.work, item, decision, normalizedNote, decidedAt,
    );
    saveWork({
      ventureId,
      teammateRef: continuation.teammateRef,
      betId: item.betId,
      workScopeRef: continuation.target?.workScopeRef ?? null,
      bet: loaded.bet,
      work: nextWork,
      options,
    });
  } else if (decision === "answer" && item.betId) {
    const bet = getVentureDoc(ventureId, "bets", item.betId, options);
    if (bet) setVentureDoc(ventureId, "bets", bet.id, {
      ...bet,
      work: { ...(bet.work ?? {}), pausedFor: `The founder answered: ${normalizedNote}` },
      updatedAt: decidedAt,
    }, options);
  }

  const decided = saveItem(ventureId, receipt, options);
  recordInterventionResolved(ventureId, decided, options);
  if (item.effect?.kind === "provider-question" || item.effect?.kind === "provider-permission") {
    recordInterventionTranscript(ventureId, item, decision, normalizedNote, options);
  }
  emitFirmEvent(trimOrNull(ventureId), "wall", { betId: item.betId });
  return decided;
}
