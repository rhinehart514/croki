// founding-crew.mjs — the firm's four named teammates as firm-level templates (FIRM-SPEC.md rail 6,
// Reading A of the ADE build contract §4A.6 / Phase 8).
//
// THE ASK. Yara, Mira, Soren, and Kai are the *same characters everywhere*: one name, one face, one
// accumulating lens across every venture the founder runs. A newly created venture opens with all four
// already present — not summoned lazily by the first work, and not four strangers reinvented per venture.
//
// HOW, WITHOUT BLEEDING VENTURES. The firm-level identity is a TEMPLATE soul (the "main agent on the
// bench") living under teammate-soul-store's reserved LIBRARY_VENTURE. Seeding a venture births a
// venture INSTANCE for each of the four, carrying its templateRef back to that template — so the instance
// starts with everything the character has already learned everywhere (template graduation, which already
// works), while its own scratch work stays strictly inside that one venture's directory. This is Reading A:
// firm-level identity, venture-data isolation preserved (rail 6 holds). Reading B — one shared soul object
// read/written across ventures — is BARRED here; it would bleed venture data and needs a FIRM-SPEC rail-6
// amendment before it may be built. This module never pools instance data across ventures.
//
// The refs are the compatibility seam (stable identifiers, never renamed); the names are the founder-facing
// identity. A ref is its own templateRef by the established convention (work-loop.mjs summons with
// { templateRef: teammateRef }), so a founding character's template soul lives at (LIBRARY_VENTURE, ref)
// and every venture instance lives at (ventureId, ref) pointing back to it.

import { LIBRARY_VENTURE, teammateSoulStore } from "../teammate-soul-store.mjs";
import { summon } from "./crew.mjs";

// The four named characters of the firm. `ref` is the durable identifier (never founder-facing, never
// renamed); `name` is what the founder sees; `perspective` and `voice` seed the character's lens and how it
// carries itself. These are open founder vocabulary (FIRM-SPEC "what stays open"), not a host role taxonomy —
// they impose no seniority, ownership, or org chart, only who these teammates are as characters.
export const FOUNDING_CREW = Object.freeze([
  Object.freeze({
    ref: "yara",
    name: "Yara",
    perspective: "the buyer's ear — who this is for, why they'd care, and what actually moves them to reply",
    voice: Object.freeze({
      register: "warm and specific, never salesy",
      stance:
        "I'm Yara. I start from the person on the other end — what they're already worried about — and I show you the exact words before anything goes out.",
      seededFrom: "founding-crew",
    }),
  }),
  Object.freeze({
    ref: "mira",
    name: "Mira",
    perspective: "the product's truth — what it really does today, cited from the repository, uncertainty labeled",
    voice: Object.freeze({
      register: "precise and grounded",
      stance:
        "I'm Mira. I read what the product actually does and tell you plainly what's proven versus what I'm inferring, so you never act on a guess dressed up as fact.",
      seededFrom: "founding-crew",
    }),
  }),
  Object.freeze({
    ref: "soren",
    name: "Soren",
    perspective: "the ways in — the channels and campaigns that could reach these people, and which to try first",
    voice: Object.freeze({
      register: "plain and decisive",
      stance:
        "I'm Soren. I lay out the handful of real ways to reach these people and make the case for which one to try first, so you're choosing between concrete moves, not staring at a blank page.",
      seededFrom: "founding-crew",
    }),
  }),
  Object.freeze({
    ref: "kai",
    name: "Kai",
    perspective: "the maker — turning a chosen direction into the concrete draft, page, or change, ready for your hand",
    voice: Object.freeze({
      register: "steady and hands-on",
      stance:
        "I'm Kai. I take the direction and build the real thing — the draft, the page, the change — and stage it for you to see and send, never sending it myself.",
      seededFrom: "founding-crew",
    }),
  }),
]);

// The refs of the founding four, for callers that only need identity membership (e.g. "is this a founding
// character?"). Order-stable, matching FOUNDING_CREW.
export const FOUNDING_CREW_REFS = Object.freeze(FOUNDING_CREW.map((member) => member.ref));

export function isFoundingRef(ref) {
  return FOUNDING_CREW_REFS.includes(String(ref || ""));
}

// Ensure the firm-level TEMPLATE soul exists for each founding character under LIBRARY_VENTURE. Idempotent:
// ensure() is a no-op when the template already exists, so it never wipes graduated lessons the templates
// have absorbed over time — it only births a template the first time the firm needs it. Voice is seeded onto
// the template so the character sounds like itself from its very first venture, before it has earned any
// conviction. Returns the four template souls.
//
// A template soul carries templateRef: null (it IS the template, not an instance of one) — the same shape
// newSoul() produces for a template and the same shape the two-tier graduation math expects.
export function ensureFoundingTemplates(options = {}) {
  return FOUNDING_CREW.map((member) => {
    const template = teammateSoulStore.ensure(
      LIBRARY_VENTURE,
      member.ref,
      { name: member.name },
      options,
    );
    // Seed the founder-safe voice onto the template once (setVoice is a no-op on an already-voiced soul only
    // if you pass nothing; here it stamps the seed, and re-stamping the same seed is harmless). It never
    // stores operating instructions — only register + stance, per the raw-prompt wall.
    if (!template.voice) {
      teammateSoulStore.setVoice(LIBRARY_VENTURE, member.ref, member.voice, options);
    }
    return teammateSoulStore.get(LIBRARY_VENTURE, member.ref, options);
  });
}

// Seed one venture's roster with the four founding characters, as venture INSTANCES of their firm-level
// templates. Each instance is born (via summon → teammateSoulStore.ensure with templateRef) carrying the
// template's graduated lessons, marked inherited, while its own scratch learnings stay empty and strictly
// venture-scoped. Idempotent: summon() reuses an existing instance and never duplicates a roster entry, so
// re-seeding an already-seeded venture changes nothing. Returns the four instance souls in FOUNDING_CREW
// order.
//
// This is the single new default the contract asks for: "seed every new venture's roster from the firm-level
// templates so they are the same characters everywhere." Nothing here reads or writes any OTHER venture's
// data — the only cross-venture read is the founding character's own TEMPLATE (the founder's cross-venture
// asset), never another venture's instance work.
export function seedFoundingCrew(ventureId, options = {}) {
  ensureFoundingTemplates(options);
  return FOUNDING_CREW.map((member) =>
    summon(ventureId, member.ref, { templateRef: member.ref, name: member.name }, options),
  );
}
