// The trust-grant + wall-park branch of the stage_outward tool, lifted out of work-loop-tools.mjs to keep
// that service under its size budget and to give this distinct responsibility its own home.
//
// TRUST GRANT CHECK (deterministic, host-owned; §4A.3). Before parking a BLOCKING wait, ask whether the
// founder already blessed this exact act type in remembered dialogue. A live grant lets the effort proceed
// WITHOUT waiting on the founder — but a grant is NOT a new authority (grants.mjs) and NEVER mints the
// wall's release capability (invariant §5.8). The wall's release capability is minted ONLY inside
// wall.decide(), reachable only from a real founder request; a background drive holds no such request and
// MUST NOT forge one. So a grant skips the WAIT, not the RELEASE: the act still parks as a durable record,
// stamped pre-authorized and non-blocking, and the founder still releases it through their own authority.
// The teammate says so HONESTLY — it never claims to have sent something it never sent. A grant NEVER skips
// a deploy (deploy keeps its second authorization).

import { grantSkipsWait } from "./grants.mjs";
import { appendConversationMessage } from "./conversation.mjs";
import { stampKnownEffectConsequences } from "./effect-consequences.mjs";

export async function parkOutwardAtWall({
  ventureId,
  betId,
  bet,
  lane,
  effect,
  requestedWorkRef,
  unambiguousWorkRef,
  configurationRevision,
  architectureRevision,
  target,
  options,
  deps,
  appendEvent,
}) {
  const { skip: grantSkips, actType, grant } = grantSkipsWait(ventureId, effect, options);
  const park = deps?.park ?? (await import("./wall.mjs")).park;
  const queueItem = await park({
    ventureId, betId, workRef: requestedWorkRef ?? unambiguousWorkRef,
    purpose: "release", configurationRevision, architectureRevision,
    ...(grantSkips ? { blocksBet: false } : {}),
    architectureTarget: target?.architectureId ? { id: target.architectureId, stepId: target.architectureStepId ?? null } : null,
    effect: grantSkips
      ? stampKnownEffectConsequences({ ...effect, preAuthorizedGrantId: grant.id, actType }, options)
      : stampKnownEffectConsequences(effect, options),
  }, options);
  if (grantSkips) {
    appendEvent(ventureId, betId, { type: "parked_pre_authorized", detail: actType }, options);
    // Honest: the act is READY and won't block the effort, but the send itself is still the founder's
    // release. Never claim "Sending this" — nothing is sent here; the founder releases it.
    appendConversationMessage({
      ventureId,
      role: "teammate",
      content: "This is ready to go — you told me I could, so it's not blocking. It's waiting for your release.",
      teammateRef: bet.teammateRef ?? null,
      betId,
    }, options);
    return { lane, parked: true, waiting: false, preAuthorized: true, sent: false, actType, queueItem };
  }
  appendEvent(ventureId, betId, { type: "parked", detail: null }, options);
  return { lane, parked: true, waiting: true, queueItem };
}
