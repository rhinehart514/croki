// effect-executors.mjs — the real executeEffect wall.decide() needs to actually release something.
// wall.mjs never assumes an executor (a release with none wired throws "cannot release without an
// executeEffect executor" — see wall-routes.test.mjs); this module is the dispatcher a caller (a
// route, work-loop, a test) injects as decide()'s `executeEffect` option.
//
// decide() calls executeEffect(released, item) synchronously, with exactly those two arguments — see
// wall.mjs:229. Anything an executor needs beyond the effect and its wall item (the acting founder's
// identity, store options) must be closed over ahead of time; createEffectExecutor below does that,
// so the function actually handed to decide() matches its real two-argument call site.
//
// Every branch first verifies hasWallRelease(effect) — the module-private capability wall.mjs mints
// fresh inside decide() and threads only onto the one effect being released (never persisted, never
// forgeable). An executor that skipped this check would let ANY caller who can shape an effect object
// with the right `kind` execute it without ever going through decide()'s founder-authority/presence
// wall — the exact self-approval hole this boundary exists to close.
//
// PRODUCT-CHANGE: the two founder acts stay genuinely separate, without any change to wall.mjs's
// decision enum. Act #1 is the founder's own review/approve on the staged revision
// (product-routes.mjs's review endpoint, gated by authorizeFounderWriteForRequest, done BEFORE the
// item ever reaches decide()). Act #2 is the release itself — decide({decision:"release"}), gated by
// authorizeFounderWriteForRequest + presence. applyProductBetChange's readiness check
// (revision.status === "approved") means release can only ever succeed on a revision the founder
// already separately approved; a release attempted on an unapproved revision fails exactly the same
// way a two-authorization deploy would, just enforced by the revision's own state instead of a
// second wall-item stamp (wall.mjs's authorize-deploy pattern is specific to effect.kind === "deploy"
// and cannot be extended here without editing wall.mjs, which this task forbids).
//
// MESSAGE/SEND: message-send.mjs is the real Gmail send transport. This branch verifies
// hasWallRelease before calling it, exactly like the product-change branch below.

import { hasWallRelease } from "./wall.mjs";
import { applyProductBetChange } from "./product-change-decide.mjs";
import { sendReleasedMessage } from "./message-send.mjs";

function assertReleased(effect, kind) {
  if (!hasWallRelease(effect)) {
    const error = new Error(`${kind} effect execution requires the wall's release capability — refusing an unreleased effect.`);
    error.code = "effect_execution_forbidden";
    throw error;
  }
}

// The product-change branch: apply the bet's approved diff onto the real source repository.
// `founderActor` is the SAME founder identity decide() already resolved for this release (threaded
// in from createEffectExecutor's closure — the decide() receipt's decidedBy, or the auth.actor a
// caller passed in) — never re-derived or re-authorized here, since decide() is the one place that
// authority is established.
function executeProductChange(effect, item, { founderActor, options }) {
  assertReleased(effect, "product-change");
  if (!effect.workspaceId || !effect.revisionId) {
    throw new Error("product-change effect is missing workspaceId/revisionId — nothing to apply.");
  }
  const actor = founderActor ?? item?.decidedBy ?? "founder";
  return applyProductBetChange(effect.workspaceId, effect.revisionId, actor, { confirm: true }, options);
}

// message/send: a real Gmail send through message-send.mjs, gated ONLY on hasWallRelease — the SAME
// discipline the product-change branch above already holds. ventureId is read off the wall item itself
// (every item park() writes carries it) rather than a new factory parameter, so this branch needs no
// signature change upstream of decide()'s own two-argument (effect, item) call. Never throws for an
// expected failure (no credential, no recipient, transport refusal) — those land honestly on the receipt
// as an executionError, never a retry loop and never a fake success. `messageDeps` (test injection: a
// fake synchronous transport/token mint) rides through createEffectExecutor's own closure exactly like
// founderActor/options already do.
function executeMessage(effect, item, { messageDeps, options }) {
  assertReleased(effect, "message");
  const result = sendReleasedMessage({ ventureId: item?.ventureId ?? null, effect, betId: item?.betId ?? null }, options, messageDeps);
  if (!result.ok) {
    return { ok: false, executionError: result.error, ...(result.needsReconnect ? { needsReconnect: true } : {}) };
  }
  return { ok: true, messageId: result.messageId, provenance: result.provenance };
}

// Builds the exact (effect, item) => result function decide() calls as executeEffect, closing over
// whatever this venture/request already knows: the founder actor to attribute the apply to, the store
// options every product-change/message call needs, and messageDeps (test-only: a fake sync transport/
// token mint for the message branch — production never sets this, so message-send.mjs's real spawnSync
// transport is what actually runs). Keyed on effect.kind, the same open vocabulary a bet's staged
// content already uses — no closed effect-kind enum, just the branches this firm core can actually
// execute today. An unrecognized kind refuses rather than guessing.
export function createEffectExecutor({ founderActor = null, options = {}, messageDeps = {} } = {}) {
  return function executeEffect(effect, item) {
    switch (effect?.kind) {
      case "product-change":
        return executeProductChange(effect, item, { founderActor, options });
      case "message":
      case "send":
        return executeMessage(effect, item, { messageDeps, options });
      default: {
        const error = new Error(`No executor is wired for effect kind "${effect?.kind ?? "unknown"}".`);
        error.code = "effect_execution_unrecognized";
        throw error;
      }
    }
  };
}

// A thin composed helper for routes/callers that want one call: decide(), with a fresh executor
// built from this same request's founder actor and store options, so a caller never has to wire
// createEffectExecutor itself. Not required — a caller may build and inject its own executor — but
// this is the one place the composition is spelled out for product-routes.mjs and any later caller.
export function decideWithExecution(decideFn, args, auth = {}, deps = {}, options = {}) {
  const executeEffect = deps.executeEffect ?? createEffectExecutor({
    founderActor: typeof auth?.actor === "string" ? auth.actor : null,
    options,
  });
  return decideFn(args, auth, { ...deps, executeEffect }, options);
}
