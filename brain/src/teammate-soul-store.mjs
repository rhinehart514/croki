// Persistence for teammate souls — the durable home of the layer teammate-soul.mjs computes.
//
// One document per (venture, teammate ref). The SAME store serves both tiers:
//   - A TEMPLATE (the reusable "main agent" on the bench) lives under the reserved LIBRARY venture.
//   - A VENTURE INSTANCE (a template "thrown into a venture and redefined for it") lives under the
//     real ventureId and carries templateRef back to its template.
// A lesson graduates within an instance (founder-blessed), and once it is promoted across enough
// distinct instances it graduates again, up into the template — so main agents get smarter over time.
//
// All graduation math lives in the pure module; this file is only the clock (Date.now, in ms, matching
// the soul model's internal timestamps) and the disk. It follows the crew-roster-store / persistence
// conventions exactly: address by (collection, key), filter list() by the ventureId stamped on each doc.

import { persistence } from "./persistence.mjs";
import { safeId } from "./store-fs.mjs";
import {
  newSoul,
  assignName,
  recordLearning,
  graduationCandidates,
  promote as promoteLesson,
  dismiss as dismissLesson,
  bumpRecord,
  templateCandidates,
  promoteToTemplate,
  normalizeVoice,
  deriveVoiceBrief,
} from "./teammate-soul.mjs";

const COLLECTION = "teammate-soul";

// Templates live under this reserved venture id so one store, one list() scan serves both tiers.
export const LIBRARY_VENTURE = "__library__";

function keyFor(ventureId, ref) {
  return `${safeId(ventureId)}__${safeId(ref)}`;
}

function nowMs() {
  return Date.now();
}

export const teammateSoulStore = {
  collection: COLLECTION,

  // The stored soul for one teammate in one venture, or null if it has never been born.
  get(ventureId, ref, options = {}) {
    if (!ref) return null;
    return persistence(options).get(COLLECTION, keyFor(ventureId, ref)) ?? null;
  },

  // Every soul in a venture (for the crew view). Filters the flat collection by the stamped ventureId.
  listForVenture(ventureId, options = {}) {
    const want = safeId(ventureId);
    return persistence(options)
      .list(COLLECTION)
      .filter((doc) => doc && safeId(doc.ventureId) === want);
  },

  // Every venture INSTANCE that descends from one template (for cross-venture graduation).
  listInstancesOfTemplate(templateRef, options = {}) {
    return persistence(options)
      .list(COLLECTION)
      .filter((doc) => doc && doc.templateRef === templateRef && doc.ventureId !== LIBRARY_VENTURE);
  },

  // Persist a soul, stamping updatedAt. Returns the saved soul.
  save(soul, options = {}) {
    if (!soul || !soul.ref) throw new Error("A teammate soul needs a ref.");
    const value = { ...soul, ventureId: soul.ventureId ?? "default", updatedAt: nowMs() };
    persistence(options).set(COLLECTION, keyFor(value.ventureId, value.ref), value);
    return value;
  },

  // Load an existing soul or birth one thin. A fresh instance gets a regular name
  // that avoids the names already taken by its venturemates, so two teammates never collide.
  //
  // Inheritance: if this is a VENTURE INSTANCE (templateRef set, not the library itself) and a library
  // TEMPLATE soul already exists for that ref, the instance is born carrying the template's graduated
  // lessons — the "main agent thrown into a venture" starts with what it has already learned everywhere.
  // Inherited entries keep their deterministic id (so a later local promotion of the same pattern is a
  // no-op, never a duplicate) and are marked inherited so a founder surface can tell them apart. They
  // live only in `soul` (never `learnings`), so they are never re-counted toward this venture's own
  // graduation. Nothing is fabricated: with no template soul, the instance is born thin.
  ensure(ventureId, ref, { templateRef = null, name = null, bornAtDrive = 0 } = {}, options = {}) {
    const existing = this.get(ventureId, ref, options);
    if (existing) return existing;
    const taken = this.listForVenture(ventureId, options).map((d) => d.name).filter(Boolean);
    const chosenName = name || assignName(ref, { taken });
    let soul = newSoul({ ref, name: chosenName, ventureId: ventureId ?? "default", templateRef, bornAtDrive, now: nowMs() });
    if (templateRef && ventureId !== LIBRARY_VENTURE) {
      const template = this.get(LIBRARY_VENTURE, templateRef, options);
      const inherited = (Array.isArray(template?.soul) ? template.soul : []).map((entry) => ({
        ...entry,
        source: "template",
        inherited: true,
      }));
      if (inherited.length > 0) soul = { ...soul, soul: inherited };
    }
    return this.save(soul, options);
  },

  // Record one wall correction or world signal into the teammate's scratch learnings.
  // Births the soul if needed. Returns the saved soul.
  record(ventureId, ref, observation, { templateRef = null } = {}, options = {}) {
    const soul = this.ensure(ventureId, ref, { templateRef }, options);
    const learnings = recordLearning(soul.learnings, observation, { now: nowMs() });
    return this.save({ ...soul, learnings }, options);
  },

  // The scratch learnings that have earned a graduation and await the founder's one-tap blessing.
  listReady(ventureId, ref, gradOptions = {}, options = {}) {
    const soul = this.get(ventureId, ref, options);
    if (!soul) return [];
    return graduationCandidates(soul.learnings, gradOptions, nowMs());
  },

  // Bless a graduation: move a ready learning into the teammate's permanent soul.
  promote(ventureId, ref, patternKey, { drive = null } = {}, options = {}) {
    const soul = this.get(ventureId, ref, options);
    if (!soul) return null;
    return this.save(promoteLesson(soul, patternKey, { now: nowMs(), drive }), options);
  },

  // Set a lesson aside ("not yet / never").
  dismiss(ventureId, ref, patternKey, options = {}) {
    const soul = this.get(ventureId, ref, options);
    if (!soul) return null;
    return this.save(dismissLesson(soul, patternKey, { now: nowMs() }), options);
  },

  // Fold one drive's real outcome into the track record (drives / sent / replies / wins).
  recordOutcome(ventureId, ref, patch, { templateRef = null } = {}, options = {}) {
    const soul = this.ensure(ventureId, ref, { templateRef }, options);
    return this.save({ ...soul, record: bumpRecord(soul.record, patch) }, options);
  },

  // Rename a teammate (the founder always may; the auto name is only a default).
  setName(ventureId, ref, name, options = {}) {
    const soul = this.ensure(ventureId, ref, {}, options);
    return this.save({ ...soul, name: String(name || "").trim() || soul.name }, options);
  },

  // Stamp a founder-safe VOICE seed onto a teammate's soul (how it sounds + its first-person stance).
  // Normalized to the allowlisted { register, stance, seededFrom }; a no-op on empty/invalid input, so it
  // never wipes an existing voice. Births the soul only when there is a real voice to store. Returns the
  // saved soul, or the existing one (or null) when the input carries nothing to seed.
  setVoice(ventureId, ref, voice, options = {}) {
    const normalized = normalizeVoice(voice);
    if (!normalized) return this.get(ventureId, ref, options);
    const soul = this.ensure(ventureId, ref, {}, options);
    return this.save({ ...soul, voice: normalized }, options);
  },

  // The narration SEAM (consumed by WI-3): the founder-safe voice brief for one teammate in one venture.
  // Births a thin soul if needed so a new teammate can narrate off its deterministic fallback.
  // `definition` is the teammate's on-disk spec — ONLY its name is read (never its systemPrompt). Returns
  // the allowlisted brief { ref, name, register, stance, standing, convictions[], record }.
  voiceBriefFor(ventureId, ref, { definition = null } = {}, options = {}) {
    if (!ref) return null;
    const soul = this.ensure(ventureId, ref, {}, options);
    return deriveVoiceBrief(soul, { definition });
  },

  // Cross-venture graduation: the lessons a template has proven across enough instances and is ready to
  // absorb. The template soul lives under LIBRARY_VENTURE; birth it if this is its first graduation.
  templateReady(templateRef, gradOptions = {}, options = {}) {
    const template = this.get(LIBRARY_VENTURE, templateRef, options) ?? { soul: [] };
    const instances = this.listInstancesOfTemplate(templateRef, options);
    return templateCandidates(instances, gradOptions, template);
  },

  // After blessing a lesson inside an instance, this is the check to surface: has that lesson (or any
  // other) now proven itself across enough distinct instances to graduate up into the template? Resolves
  // the instance's own templateRef so a caller holding only (ventureId, ref) can ask. Never promotes —
  // it only returns what is READY, so the founder still gives the one tap that absorbs it (the wall).
  templateReadyForInstance(ventureId, ref, gradOptions = {}, options = {}) {
    const instance = this.get(ventureId, ref, options);
    const templateRef = instance?.templateRef || ref;
    if (!templateRef) return [];
    return this.templateReady(templateRef, gradOptions, options);
  },

  // Bless a cross-venture graduation: absorb one proven lesson into the template ("main agent").
  promoteTemplate(templateRef, patternKey, options = {}) {
    const candidate = this.templateReady(templateRef, {}, options).find((c) => c.patternKey === patternKey);
    if (!candidate) return null;
    const template = this.ensure(LIBRARY_VENTURE, templateRef, {}, options);
    return this.save(promoteToTemplate(template, candidate, { now: nowMs() }), options);
  },

  // Test/maintenance helper — remove a soul.
  remove(ventureId, ref, options = {}) {
    return persistence(options).delete(COLLECTION, keyFor(ventureId, ref));
  },
};
