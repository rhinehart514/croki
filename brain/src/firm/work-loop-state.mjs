// Durable provider-resume state for one work-loop drive. The drive lease in
// work-loop-drive-lease.mjs makes these read/modify/write operations single-writer; this module
// keeps the persistence boundary small and always layers a checkpoint onto the freshest bet so
// tools, market returns, and founder decisions are never overwritten by an old drive snapshot.

import { getVentureDoc, setVentureDoc, now } from "./venture-store.mjs";

function workKey(teammateRef, workScopeRef = null) {
  return workScopeRef ? `work-scope:${String(workScopeRef).replace(/^work-scope:/, "")}` : `work:${teammateRef}`;
}

export function blankWork() {
  return { runtimeSessionId: null, resumeSessionAt: null, stepCount: 0, spentUsd: 0, pausedFor: null };
}

export function loadWork({ ventureId, teammateRef, betId, workScopeRef = null, options }) {
  if (betId) {
    const bet = getVentureDoc(ventureId, "bets", betId, options);
    if (!bet) throw new Error(`No such bet: ${betId}`);
    return { bet, work: bet.work ?? blankWork() };
  }
  const doc = getVentureDoc(ventureId, "crew", workKey(teammateRef, workScopeRef), options);
  return { bet: null, work: doc?.work ?? blankWork() };
}

export function saveWork({ ventureId, teammateRef, betId, workScopeRef = null, bet, work, options }) {
  const targetId = betId ?? bet?.id;
  if (targetId) {
    const target = getVentureDoc(ventureId, "bets", targetId, options);
    setVentureDoc(ventureId, "bets", targetId, { ...target, work, updatedAt: now() }, options);
    return work;
  }
  setVentureDoc(ventureId, "crew", workKey(teammateRef, workScopeRef), { work, updatedAt: now() }, options);
  return work;
}

export function prepareRuntimeResume({ work, goal, steerBrief, architectureContext, adapterId }) {
  const resumePrompt = work.runtimeSessionId
    ? [
        work.pausedFor ? `Prior pause context: ${work.pausedFor}` : null,
        `New founder direction: ${goal}`,
        steerBrief,
      ].filter(Boolean).join("\n\n")
    : null;
  const currentWork = {
    ...work,
    pausedFor: null,
    ...(architectureContext ? {
      architectureRevision: architectureContext.architectureRevision,
      architectureTarget: { id: architectureContext.selected.id, stepId: architectureContext.stepId },
    } : {}),
  };
  const stored = typeof currentWork.runtimeSessionId === "string" ? currentWork.runtimeSessionId : null;
  const separator = stored?.indexOf(":") ?? -1;
  const storedAdapter = separator > 0 ? stored.slice(0, separator) : null;
  const runtimeSessionId = storedAdapter
    ? (storedAdapter === adapterId ? stored.slice(separator + 1) : null)
    : stored;
  // The resume cursor's second half — the last assistant uuid — only travels with its own session.
  // An adapter change drops both together, and a missing cursor keeps resume behavior identical.
  const resumeSessionAt = runtimeSessionId && typeof currentWork.resumeSessionAt === "string" && currentWork.resumeSessionAt
    ? currentWork.resumeSessionAt
    : null;
  return { currentWork, resumePrompt, runtimeSessionId, resumeSessionAt };
}
