// crew.mjs — the venture's teammate roster (FIRM-SPEC.md "The three nouns" — Teammate).
//
// A teammate is a persistent character with a soul (memory of lessons), a voice, and a track
// record — no roles, no seniority, no org chart, no manager agents. This module adds nothing to
// that: it is the roster list over teammate-soul-store.mjs. The roster document it persists
// carries only { ref, summonedAt } per teammate — everything else about a teammate (name, voice,
// lessons, record) is read live from the soul store, never duplicated here, so there is exactly one
// place a teammate's memory lives.

import { getVentureDoc, setVentureDoc } from "./venture-store.mjs";
import { teammateSoulStore } from "../teammate-soul-store.mjs";

const ROSTER_KEY = "roster";

function now() {
  return new Date().toISOString();
}

function loadRoster(ventureId, options) {
  return getVentureDoc(ventureId, "crew", ROSTER_KEY, options)?.teammates ?? [];
}

function saveRoster(ventureId, teammates, options) {
  setVentureDoc(ventureId, "crew", ROSTER_KEY, { teammates, updatedAt: now() }, options);
  return teammates;
}

// Summon a teammate into the venture: births (or reuses) its soul and adds it to the roster if it
// isn't already on it. Teammates are summoned by the work, not configured in advance — there is no
// fixed crew size and no pre-declared list of allowed refs.
export function summon(ventureId, ref, { templateRef = null, name = null } = {}, options = {}) {
  if (!ref) throw new Error("summon() needs a teammate ref.");
  const soul = teammateSoulStore.ensure(ventureId, ref, { templateRef, name }, options);
  const roster = loadRoster(ventureId, options);
  if (!roster.some((entry) => entry.ref === ref)) {
    saveRoster(ventureId, [...roster, { ref, summonedAt: now() }], options);
  }
  return soul;
}

// Every teammate currently on the venture's roster, each carrying its live soul (name, voice,
// lessons) — the roster document itself only ever stamps ref + summonedAt.
export function listCrew(ventureId, options = {}) {
  return loadRoster(ventureId, options).map((entry) => ({
    ...entry,
    soul: teammateSoulStore.get(ventureId, entry.ref, options),
  }));
}
