// Durable provider-resume state for one work-loop drive. The drive lease in
// work-loop-drive-lease.mjs makes these read/modify/write operations single-writer; this module
// keeps the persistence boundary small and always layers a checkpoint onto the freshest bet so
// tools, market returns, and founder decisions are never overwritten by an old drive snapshot.

import { getVentureDoc, setVentureDoc, now } from "./venture-store.mjs";

function workKey(teammateRef) {
  return `work:${teammateRef}`;
}

export function blankWork() {
  return { runtimeSessionId: null, stepCount: 0, spentUsd: 0, pausedFor: null };
}

export function loadWork({ ventureId, teammateRef, betId, options }) {
  if (betId) {
    const bet = getVentureDoc(ventureId, "bets", betId, options);
    if (!bet) throw new Error(`No such bet: ${betId}`);
    return { bet, work: bet.work ?? blankWork() };
  }
  const doc = getVentureDoc(ventureId, "crew", workKey(teammateRef), options);
  return { bet: null, work: doc?.work ?? blankWork() };
}

export function saveWork({ ventureId, teammateRef, betId, bet, work, options }) {
  const targetId = betId ?? bet?.id;
  if (targetId) {
    const target = getVentureDoc(ventureId, "bets", targetId, options);
    setVentureDoc(ventureId, "bets", targetId, { ...target, work, updatedAt: now() }, options);
    return work;
  }
  setVentureDoc(ventureId, "crew", workKey(teammateRef), { work, updatedAt: now() }, options);
  return work;
}
