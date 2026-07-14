// Market returns are the only automatic signal written into a teammate's soul. Founder-authored
// lessons are promoted explicitly at the wall; this module never infers them from another model.

import { patternKeyFor } from "./teammate-soul.mjs";
import { teammateSoulStore } from "./teammate-soul-store.mjs";

function outcomePatch(outcomeKind) {
  const kind = String(outcomeKind || "").toLowerCase();
  if (/\b(repl|respond|answer)/.test(kind)) return { patch: { replies: 1 }, verb: "reply" };
  if (/\b(win|won|convert|conversion|custom|paid|purchase|sign\s*up|signup|deal|closed|subscrib)/.test(kind)) {
    return { patch: { wins: 1 }, verb: "win" };
  }
  return null;
}

export function recordOutcomeIntoSoul({
  ventureId = "default",
  teammateRef,
  outcomeKind,
  message = null,
  betId = null,
  templateRef = null,
} = {}, options = {}) {
  if (!teammateRef) return null;
  const mapped = outcomePatch(outcomeKind);
  if (!mapped) return null;

  teammateSoulStore.recordOutcome(ventureId, teammateRef, mapped.patch, { templateRef }, options);
  const body = String(message || "").trim();
  const observation = {
    patternKey: patternKeyFor(body || String(outcomeKind)),
    text: body ? `A ${mapped.verb} came back on: "${body}".` : `A ${mapped.verb} came back on your work.`,
    why: "A real result from the world.",
    source: "world",
    taskId: betId,
  };
  teammateSoulStore.record(ventureId, teammateRef, observation, { templateRef }, options);
  return { ref: teammateRef, patch: mapped.patch, patternKey: observation.patternKey };
}
