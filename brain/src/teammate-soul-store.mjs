// Persistence for teammate souls — the durable home of the layer teammate-soul.mjs computes.
//
// One document per (project, teammate ref). The SAME store serves both tiers:
//   - A TEMPLATE (the reusable "main agent" on the bench) lives under the reserved LIBRARY project.
//   - A PROJECT INSTANCE (a template "thrown into a project and redefined for it") lives under the
//     real projectId and carries templateRef back to its template.
// A lesson graduates within an instance (founder-blessed), and once it is promoted across enough
// distinct instances it graduates again, up into the template — so main agents get smarter over time.
//
// All graduation math lives in the pure module; this file is only the clock (Date.now, in ms, matching
// the soul model's internal timestamps) and the disk. It follows the crew-roster-store / persistence
// conventions exactly: address by (collection, key), filter list() by the projectId stamped on each doc.

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

// Templates live under this reserved project id so one store, one list() scan serves both tiers.
export const LIBRARY_PROJECT = "__library__";

function keyFor(projectId, ref) {
  return `${safeId(projectId)}__${safeId(ref)}`;
}

function nowMs() {
  return Date.now();
}

export const teammateSoulStore = {
  collection: COLLECTION,

  // The stored soul for one teammate in one project, or null if it has never been born.
  get(projectId, ref, options = {}) {
    if (!ref) return null;
    return persistence(options).get(COLLECTION, keyFor(projectId, ref)) ?? null;
  },

  // Every soul in a project (for the crew view). Filters the flat collection by the stamped projectId.
  listForProject(projectId, options = {}) {
    const want = safeId(projectId);
    return persistence(options)
      .list(COLLECTION)
      .filter((doc) => doc && safeId(doc.projectId) === want);
  },

  // Every project INSTANCE that descends from one template (for cross-project graduation).
  listInstancesOfTemplate(templateRef, options = {}) {
    return persistence(options)
      .list(COLLECTION)
      .filter((doc) => doc && doc.templateRef === templateRef && doc.projectId !== LIBRARY_PROJECT);
  },

  // Persist a soul, stamping updatedAt. Returns the saved soul.
  save(soul, options = {}) {
    if (!soul || !soul.ref) throw new Error("A teammate soul needs a ref.");
    const value = { ...soul, projectId: soul.projectId ?? "default", updatedAt: nowMs() };
    persistence(options).set(COLLECTION, keyFor(value.projectId, value.ref), value);
    return value;
  },

  // Load an existing soul or BIRTH one thin (the "run 0" state). A fresh instance gets a regular name
  // that avoids the names already taken by its projectmates, so two teammates never collide.
  //
  // Inheritance: if this is a PROJECT INSTANCE (templateRef set, not the library itself) and a library
  // TEMPLATE soul already exists for that ref, the instance is born carrying the template's graduated
  // lessons — the "main agent thrown into a project" starts with what it has already learned everywhere.
  // Inherited entries keep their deterministic id (so a later local promotion of the same pattern is a
  // no-op, never a duplicate) and are marked inherited so a founder surface can tell them apart. They
  // live only in `soul` (never `learnings`), so they are never re-counted toward this project's own
  // graduation. Nothing is fabricated: with no template soul, the instance is born thin.
  ensure(projectId, ref, { templateRef = null, name = null, bornAtRun = 0 } = {}, options = {}) {
    const existing = this.get(projectId, ref, options);
    if (existing) return existing;
    const taken = this.listForProject(projectId, options).map((d) => d.name).filter(Boolean);
    const chosenName = name || assignName(ref, { taken });
    let soul = newSoul({ ref, name: chosenName, projectId: projectId ?? "default", templateRef, bornAtRun, now: nowMs() });
    if (templateRef && projectId !== LIBRARY_PROJECT) {
      const template = this.get(LIBRARY_PROJECT, templateRef, options);
      const inherited = (Array.isArray(template?.soul) ? template.soul : []).map((entry) => ({
        ...entry,
        source: "template",
        inherited: true,
      }));
      if (inherited.length > 0) soul = { ...soul, soul: inherited };
    }
    return this.save(soul, options);
  },

  // Record one observation (a gate correction or a world signal) into the teammate's scratch learnings.
  // Births the soul if needed. Returns the saved soul.
  record(projectId, ref, observation, { templateRef = null } = {}, options = {}) {
    const soul = this.ensure(projectId, ref, { templateRef }, options);
    const learnings = recordLearning(soul.learnings, observation, { now: nowMs() });
    return this.save({ ...soul, learnings }, options);
  },

  // The scratch learnings that have earned a graduation and await the founder's one-tap blessing.
  listReady(projectId, ref, gradOptions = {}, options = {}) {
    const soul = this.get(projectId, ref, options);
    if (!soul) return [];
    return graduationCandidates(soul.learnings, gradOptions, nowMs());
  },

  // Bless a graduation: move a ready learning into the teammate's permanent soul.
  promote(projectId, ref, patternKey, { run = null } = {}, options = {}) {
    const soul = this.get(projectId, ref, options);
    if (!soul) return null;
    return this.save(promoteLesson(soul, patternKey, { now: nowMs(), run }), options);
  },

  // Set a lesson aside ("not yet / never").
  dismiss(projectId, ref, patternKey, options = {}) {
    const soul = this.get(projectId, ref, options);
    if (!soul) return null;
    return this.save(dismissLesson(soul, patternKey, { now: nowMs() }), options);
  },

  // Fold one run's real outcome into the track record (runs / sent / replies / wins).
  recordOutcome(projectId, ref, patch, { templateRef = null } = {}, options = {}) {
    const soul = this.ensure(projectId, ref, { templateRef }, options);
    return this.save({ ...soul, record: bumpRecord(soul.record, patch) }, options);
  },

  // Rename a teammate (the founder always may; the auto name is only a default).
  setName(projectId, ref, name, options = {}) {
    const soul = this.ensure(projectId, ref, {}, options);
    return this.save({ ...soul, name: String(name || "").trim() || soul.name }, options);
  },

  // Stamp a founder-safe VOICE seed onto a teammate's soul (how it sounds + its first-person stance).
  // Normalized to the allowlisted { register, stance, seededFrom }; a no-op on empty/invalid input, so it
  // never wipes an existing voice. Births the soul only when there is a real voice to store. Returns the
  // saved soul, or the existing one (or null) when the input carries nothing to seed.
  setVoice(projectId, ref, voice, options = {}) {
    const normalized = normalizeVoice(voice);
    if (!normalized) return this.get(projectId, ref, options);
    const soul = this.ensure(projectId, ref, {}, options);
    return this.save({ ...soul, voice: normalized }, options);
  },

  // The narration SEAM (consumed by WI-3): the founder-safe voice brief for one teammate in one project.
  // Births a thin soul if needed so a never-run teammate can still narrate off its deterministic fallback.
  // `definition` is the teammate's on-disk spec — ONLY its name is read (never its systemPrompt). Returns
  // the allowlisted brief { ref, name, register, stance, standing, convictions[], record }.
  voiceBriefFor(projectId, ref, { definition = null } = {}, options = {}) {
    if (!ref) return null;
    const soul = this.ensure(projectId, ref, {}, options);
    return deriveVoiceBrief(soul, { definition });
  },

  // Cross-project graduation: the lessons a template has proven across enough instances and is ready to
  // absorb. The template soul lives under LIBRARY_PROJECT; birth it if this is its first graduation.
  templateReady(templateRef, gradOptions = {}, options = {}) {
    const template = this.get(LIBRARY_PROJECT, templateRef, options) ?? { soul: [] };
    const instances = this.listInstancesOfTemplate(templateRef, options);
    return templateCandidates(instances, gradOptions, template);
  },

  // After blessing a lesson inside an instance, this is the check to surface: has that lesson (or any
  // other) now proven itself across enough distinct instances to graduate up into the template? Resolves
  // the instance's own templateRef so a caller holding only (projectId, ref) can ask. Never promotes —
  // it only returns what is READY, so the founder still gives the one tap that absorbs it (the wall).
  templateReadyForInstance(projectId, ref, gradOptions = {}, options = {}) {
    const instance = this.get(projectId, ref, options);
    const templateRef = instance?.templateRef || ref;
    if (!templateRef) return [];
    return this.templateReady(templateRef, gradOptions, options);
  },

  // Bless a cross-project graduation: absorb one proven lesson into the template ("main agent").
  promoteTemplate(templateRef, patternKey, options = {}) {
    const candidate = this.templateReady(templateRef, {}, options).find((c) => c.patternKey === patternKey);
    if (!candidate) return null;
    const template = this.ensure(LIBRARY_PROJECT, templateRef, {}, options);
    return this.save(promoteToTemplate(template, candidate, { now: nowMs() }), options);
  },

  // Test/maintenance helper — remove a soul.
  remove(projectId, ref, options = {}) {
    return persistence(options).delete(COLLECTION, keyFor(projectId, ref));
  },
};
