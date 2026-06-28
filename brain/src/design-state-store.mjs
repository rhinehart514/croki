// The DesignState store — the founder's front-end taste, made persistent and per-project.
//
// This is TASTE, not truth, and not the citation-governed ProductModel. The ProductModel holds the
// product's objects/IA/states with a pollution guard that demotes any claim lacking a file:line.
// DesignState holds something the codebase can never cite: how the founder wants front-end work to
// LOOK and FEEL — visual register, IA preference, component register, motion, copy — anchored to
// real reference screens the founder flagged (Mobbin curations + live sites). It rides with the
// taste ledger layer, not the grounding layer, so it is never forced to cite a line.
//
// One house style is the default (the global "Warm Calm" direction seeded below); a project layers
// its own references on top. Each dimension is marked `grounded` (anchored to >=1 real reference)
// or a seed default (a written-in principle not yet proven by a screen) — the same honest-blank
// discipline the providers and the ProductModel apply, so a reading agent never mistakes a seed
// default for a captured preference.
//
// Persistence uses the shared store-fs primitives (atomicWrite into ~/.gtm-ide/design-state/<id>.json),
// the lighter snapshot convention — DesignState is founder taste, not an event-sourced aggregate.

import path from "node:path";
import fs from "node:fs";
import { storeRoot, safeId, atomicWrite, now } from "./store-fs.mjs";

const SCHEMA_VERSION = 1;

// The cross-front-end dimensions. Design taste is not just "visual" — it shapes structure (IA),
// component register, motion, and copy. Every front-end task reads the same five.
export const DESIGN_DIMENSIONS = ["visual", "ia", "components", "motion", "copy"];

// Display labels for the dimensions — "ia" reads as "IA", the rest title-case.
const DIMENSION_LABELS = {
  visual: "Visual", ia: "IA", components: "Components", motion: "Motion", copy: "Copy",
};

function fileFor(projectId, options = {}) {
  return path.join(storeRoot(options), "design-state", `${safeId(projectId || "default")}.json`);
}

// The global house style, seeded from ~/.agents/global/DESIGN-TASTE.md ("Warm Calm"). This is the
// DEFAULT a project starts from; a founder edit or new reference layers on top. Dimensions anchored
// to a real reference are `grounded: true`; the ones not yet proven by a flagged screen are seeds.
export function houseStyleSeed() {
  return {
    houseStyle: "Warm Calm",
    feeling: "calm — reduce the surface to one thing, in a warm room, every edge rounded, motion that soothes",
    dimensions: {
      visual: {
        principle: "Warm or tinted grounds, never stark white; generous rounding and pills; soft hairline elevation; one rationed accent; big confident display type.",
        grounded: true,
      },
      ia: {
        principle: "One nameable center per surface; one primary thing the screen puts first; labels that predict their contents; structure matching the user's mental model, not container nouns.",
        grounded: true,
      },
      components: {
        principle: "Pill buttons, hairline-bordered cards, soft focus states; warm-neutral surfaces over white panels.",
        grounded: true,
      },
      motion: {
        principle: "Soft and settling — ease-out, ~180-280ms, no spring-bounce, no snap; motion orients and calms, never performs.",
        grounded: true,
      },
      copy: {
        principle: "Calm, plain, human; one confident line over a busy stack.",
        grounded: false,
      },
    },
    references: [
      { source: "mobbin", label: "Komoot", url: null, dimensions: ["visual"], proves: "warm cream ground, full-bleed hero card, olive accent, editorial calm" },
      { source: "mobbin", label: "Obvious", url: null, dimensions: ["visual", "ia"], proves: "one centered question as the whole IA; color-coded app chips; soft modal" },
      { source: "mobbin", label: "ElevenLabs", url: null, dimensions: ["components", "ia"], proves: "restrained dashboard, hairline borders, black primary button, predictable left-nav" },
      { source: "mobbin", label: "Base44", url: null, dimensions: ["visual"], proves: "pastel gradient wash, frosted bento cards, one headline + pill CTA" },
      { source: "url", label: "Titan Intake", url: "https://www.titanintake.com/", dimensions: ["visual", "motion"], proves: "clean modern SaaS, numbered process flow, strong type" },
      { source: "url", label: "Cofounder", url: "https://cofounder.co/", dimensions: ["visual", "motion"], proves: "warm light ground, rounded cards, chaptered flow, animated hero" },
    ],
  };
}

function normalizeReference(ref, index) {
  const label = String(ref?.label || ref?.url || `ref-${index + 1}`).slice(0, 80);
  const dims = Array.isArray(ref?.dimensions)
    ? ref.dimensions.filter((d) => DESIGN_DIMENSIONS.includes(d))
    : [];
  return {
    id: ref?.id || `ref-${safeId(label).toLowerCase()}`,
    source: ref?.source === "url" ? "url" : "mobbin",
    label,
    url: typeof ref?.url === "string" ? ref.url : null,
    dimensions: dims.length ? dims : ["visual"],
    proves: String(ref?.proves || "").slice(0, 200),
  };
}

// Normalize ids/timestamps/dimension keys; dedupe references by id; mark a dimension `grounded`
// only when at least one reference actually anchors it (a seed principle with no screen stays a
// labelled default, never a captured preference).
export function normalizeDesignState(state = {}, options = {}) {
  const seed = houseStyleSeed();
  const dimensions = {};
  for (const key of DESIGN_DIMENSIONS) {
    const incoming = state?.dimensions?.[key];
    dimensions[key] = {
      principle: String(incoming?.principle || seed.dimensions[key].principle).slice(0, 400),
      grounded: false,
    };
  }

  const seenIds = new Set();
  const references = [];
  for (const [i, ref] of (Array.isArray(state?.references) ? state.references : []).entries()) {
    const normalized = normalizeReference(ref, i);
    if (seenIds.has(normalized.id)) continue;
    seenIds.add(normalized.id);
    references.push(normalized);
    for (const dim of normalized.dimensions) {
      if (dimensions[dim]) dimensions[dim].grounded = true;
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: state?.projectId || options.projectId || "default",
    houseStyle: String(state?.houseStyle || seed.houseStyle).slice(0, 80),
    feeling: String(state?.feeling || seed.feeling).slice(0, 200),
    dimensions,
    references,
    updatedAt: state?.updatedAt || now(),
  };
}

// Build a fresh DesignState for a project, seeded from the global house style unless the caller
// supplies its own dimensions/references.
export function buildDesignState({ projectId, houseStyle, feeling, dimensions, references } = {}, options = {}) {
  const seed = houseStyleSeed();
  return normalizeDesignState({
    projectId,
    houseStyle: houseStyle || seed.houseStyle,
    feeling: feeling || seed.feeling,
    dimensions: dimensions || seed.dimensions,
    references: references || seed.references,
    updatedAt: now(),
  }, { projectId });
}

export function saveDesignState(state, options = {}) {
  const normalized = normalizeDesignState({ ...state, updatedAt: now() }, options);
  atomicWrite(fileFor(normalized.projectId, options), normalized);
  return normalized;
}

// Load a project's DesignState. A project with none yet falls back to the seeded house style, so
// every front-end task has the founder's default direction from day one (the floor), even before
// a single project-specific reference is added.
export function getDesignState(projectId, options = {}) {
  const file = fileFor(projectId, options);
  if (!fs.existsSync(file)) return buildDesignState({ projectId }, options);
  try {
    return normalizeDesignState(JSON.parse(fs.readFileSync(file, "utf8")), { projectId });
  } catch {
    return buildDesignState({ projectId }, options);
  }
}

// Add (or replace, by id) a reference to a project's DesignState and persist. Returns the saved
// state. This is the curation move — the founder flags a screen, it joins the library and re-marks
// whatever dimensions it anchors as grounded.
export function addReference(projectId, ref, options = {}) {
  const state = getDesignState(projectId, options);
  const normalized = normalizeReference(ref, state.references.length);
  const references = state.references.filter((r) => r.id !== normalized.id).concat(normalized);
  return saveDesignState({ ...state, references }, options);
}

// ── Queried design (E2.2) ─────────────────────────────────────────────────────
// A precision instrument: instead of handing the full design state to every prompt, the agent
// asks a specific question ("motion on mobile", "button component style") and gets only the
// dimensions and references that overlap with it. Same deterministic keyword-overlap logic as
// queryTaste (ENGINEERING.md: if code can answer, code answers — no model call). Falls back to
// the full render when no question is supplied, so get_design stays backward-compatible.
const DESIGN_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "is", "it", "this", "that",
  "with", "you", "your", "their", "they", "we", "our", "be", "are", "as", "at", "by", "from",
]);

function designTokens(value) {
  return (String(value ?? "").toLowerCase().match(/[a-z0-9]+/g) || []).filter(
    (w) => w.length > 2 && !DESIGN_STOPWORDS.has(w),
  );
}

function designOverlap(text, questionTokens) {
  const present = new Set(designTokens(text));
  let score = 0;
  for (const q of questionTokens) if (present.has(q)) score += 1;
  return score;
}

// Returns `{ text, meta }` (same shape as queryTaste / provider.contribute) or null when nothing
// matches (and no state at all). `dimension` can pin to one DESIGN_DIMENSIONS key; `question`
// scores by keyword overlap. Both together: dimension-filter first, then keyword rank within that.
export function queryDesign(designState, { question = "", dimension = null } = {}) {
  if (!designState) return null;

  const q = designTokens(question);
  const allDims = DESIGN_DIMENSIONS.filter((k) => designState.dimensions?.[k]?.principle);
  const references = Array.isArray(designState.references) ? designState.references : [];

  // If no question and no dimension, fall back to the full render.
  if (!q.length && !dimension) {
    const text = renderDesignState(designState);
    return text
      ? { text, meta: { mode: "full", dimensions: allDims.length, references: references.length } }
      : null;
  }

  // Pin to a single dimension when the caller specifies one.
  const targetDims = dimension && DESIGN_DIMENSIONS.includes(dimension)
    ? [dimension]
    : allDims;

  // Score dimensions: any principle text that overlaps the question gets included.
  const scoredDims = targetDims
    .map((key) => {
      const dim = designState.dimensions[key];
      const score = q.length
        ? designOverlap(dim.principle, q)
        : 1; // pinned dimension with no question — include it unconditionally
      return { key, dim, score };
    })
    .filter((x) => x.score > 0 || (dimension && x.key === dimension));

  // Score references: include those covering a matched dimension or overlapping the question.
  const matchedDimKeys = new Set(scoredDims.map((x) => x.key));
  const scoredRefs = references
    .map((ref) => {
      const dimHit = ref.dimensions?.some((d) => matchedDimKeys.has(d)) ? 1 : 0;
      const textHit = q.length ? designOverlap(`${ref.label} ${ref.proves}`, q) : 0;
      return { ref, score: dimHit + textHit };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scoredDims.length && !scoredRefs.length) {
    return {
      text: `No design state matches "${question}"${dimension ? ` in dimension "${dimension}"` : ""}. House style: "${designState.houseStyle}".`,
      meta: { mode: "no-match", question, dimension: dimension ?? null },
    };
  }

  // Render only the relevant slice.
  const lines = [
    `DESIGN STATE (slice) — house style: "${designState.houseStyle}" / ${designState.feeling}.`,
  ];
  const DIMENSION_LABELS_LOCAL = { visual: "Visual", ia: "IA", components: "Components", motion: "Motion", copy: "Copy" };
  for (const { key, dim } of scoredDims) {
    const tag = dim.grounded ? "" : " [seed default — not yet anchored to a flagged screen]";
    lines.push(`${DIMENSION_LABELS_LOCAL[key] ?? key}: ${dim.principle}${tag}`);
  }
  if (scoredRefs.length) {
    lines.push("Matching references:");
    for (const { ref } of scoredRefs) {
      const where = ref.url ? ` (${ref.url})` : " (Mobbin)";
      lines.push(`- ${ref.label} [${ref.dimensions.join(", ")}] — ${ref.proves}${where}`);
    }
  }
  return {
    text: lines.join("\n"),
    meta: {
      mode: "query",
      question: question || null,
      dimension: dimension ?? null,
      matchedDimensions: scoredDims.length,
      matchedReferences: scoredRefs.length,
    },
  };
}

// Render the DesignState into a compact base-layer prompt block — the same shape the taste provider
// uses: a high-signal map, not a dump. A grounded dimension shows its anchoring references; a seed
// dimension is labelled so the model never treats a default as a captured preference.
export function renderDesignState(state) {
  const references = Array.isArray(state?.references) ? state.references : [];
  const dimKeys = state?.dimensions
    ? Object.keys(state.dimensions).filter((k) => state.dimensions[k]?.principle)
    : [];
  // Honest blank: nothing founder-specific and no house-style principle to contribute.
  if (!references.length && !dimKeys.length) return null;
  const lines = [
    `DESIGN STATE — the founder's front-end house style ("${state.houseStyle}"), the DEFAULT direction for any UI this project builds. A floor, not a ceiling: start here, override only with a product reason.`,
    `The feeling: ${state.feeling}.`,
  ];
  for (const key of DESIGN_DIMENSIONS) {
    const dim = state.dimensions?.[key];
    if (!dim) continue;
    const tag = dim.grounded ? "" : " [seed default — not yet anchored to a flagged screen]";
    lines.push(`${DIMENSION_LABELS[key] ?? key}: ${dim.principle}${tag}`);
  }
  if (references.length) {
    lines.push("References (real screens the founder flagged; pull the live screen for detail):");
    for (const ref of references) {
      const where = ref.url ? ` (${ref.url})` : " (Mobbin)";
      lines.push(`- ${ref.label} [${ref.dimensions.join(", ")}] — ${ref.proves}${where}`);
    }
  }
  return lines.join("\n");
}
