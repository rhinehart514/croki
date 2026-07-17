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
  // Normalize an apply failure to the same { ok:false, executionError } contract message/deploy return, so
  // decide()'s persist-failure path handles a product-change failure identically: the still-queued wall item
  // keeps lastExecutionError and the founder can retry, instead of the throw bypassing that path entirely.
  // applyProductBetChange already rewound the "applying" flip in its own catch before rethrowing.
  try {
    const applied = applyProductBetChange(effect.workspaceId, effect.revisionId, actor, { confirm: true }, options);
    return { ok: true, revisionId: applied.id, status: applied.status };
  } catch (error) {
    return { ok: false, executionError: error instanceof Error ? error.message : String(error) };
  }
}

// deploy: the SECOND heavy outward class. Unlike message, no reusable transport exists in this tree yet
// (brain/src/connectors/execute/ holds only gmail-oauth.mjs — there is NO deploy.mjs). So this branch is
// built fail-closed FROM SCRATCH: it verifies the wall's release capability, re-verifies the founder's
// SECOND authorization on the item (defense in depth mirroring wall.mjs's own deployAuthorizedAt gate —
// so even a caller that reached this executor outside decide()'s path cannot ship a deploy the founder
// never authorized twice), then hands off to an INJECTED deploy transport (deployDeps.transport, the same
// test-injection seam messageDeps already uses). With no provider configured — the live default today —
// it returns an honest { ok:false, executionError } persisted on the receipt, NEVER a fake ok:true. This
// terminates the wall's deploy two-step in a real receipt instead of the old dead "unrecognized kind"
// throw, without ever pretending a deploy happened.
const NO_DEPLOY_PROVIDER = "No deploy provider is configured for this venture.";

function executeDeploy(effect, item, { deployDeps, options }) {
  assertReleased(effect, "deploy");
  // Re-verify the founder's second explicit authorization at the executor itself. wall.decide() already
  // refuses a release without it (wall.mjs), but an executor that trusted the effect alone would let a
  // deploy through if it were ever reached off that path; refuse fail-closed here too.
  if (!item?.deployAuthorizedAt) {
    return { ok: false, executionError: "Deploy is missing the founder's second authorization on this item." };
  }
  const transport = deployDeps?.transport ?? null;
  if (typeof transport !== "function") {
    // No real deploy transport exists yet. Honest failure, persisted — never a fabricated success.
    return { ok: false, executionError: NO_DEPLOY_PROVIDER };
  }
  const outcome = transport({ effect, ventureId: item?.ventureId ?? null, betId: item?.betId ?? null }, options);
  if (!outcome || outcome.ok !== true) {
    return {
      ok: false,
      executionError: outcome?.error ?? NO_DEPLOY_PROVIDER,
      ...(outcome?.needsReconnect ? { needsReconnect: true } : {}),
    };
  }
  return { ok: true, deploymentId: outcome.deploymentId ?? null, detail: outcome.detail ?? null };
}

// message/send: a real Gmail send through message-send.mjs, gated ONLY on hasWallRelease — the SAME
// discipline the product-change branch above already holds. ventureId is read off the wall item itself
// (every item park() writes carries it) rather than a new factory parameter, so this branch needs no
// signature change upstream of decide()'s own two-argument (effect, item) call. This executor never
// throws for an expected failure (no credential, no recipient, transport refusal) — it returns an
// honest { ok:false, executionError } so decide() can decide what to do with it. decide() (wall.mjs)
// does NOT consume the release on ok:false: it persists the failure onto the still-queued item and
// throws, so the founder can retry — a failed send is durable and retryable, never a silent drop and
// never a fake success. `messageDeps` (test injection: a fake synchronous transport/token mint) rides
// through createEffectExecutor's own closure exactly like founderActor/options already do.
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
// options every product-change/message call needs, messageDeps (test-only: a fake sync transport/
// token mint for the message branch — production never sets this, so message-send.mjs's real spawnSync
// transport is what actually runs), and deployDeps (a deploy transport; NONE is configured in this tree
// today, so the deploy branch returns an honest ok:false rather than a fake success). Keyed on
// effect.kind, the same open vocabulary a bet's staged content already uses — no closed effect-kind
// enum, just the branches this firm core can actually execute today. An unrecognized kind refuses
// rather than guessing.
export function createEffectExecutor({ founderActor = null, options = {}, messageDeps = {}, deployDeps = {} } = {}) {
  return function executeEffect(effect, item) {
    switch (effect?.kind) {
      case "product-change":
        return executeProductChange(effect, item, { founderActor, options });
      case "message":
      case "send":
        return executeMessage(effect, item, { messageDeps, options });
      case "deploy":
        return executeDeploy(effect, item, { deployDeps, options });
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
