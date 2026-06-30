// The durable home for ideation output — a GtmIdea per generated, graded idea.
//
// Ideation used to be ephemeral: the operator could brainstorm, but nothing it produced survived the
// turn, so a killed idea could be re-proposed and a survivor could not be wired into a build later. This
// store makes an idea a first-class, durable, project-scoped object: what the angle was, the pitch, the
// bar's score and verdict (survived / killed), how it wired into a build, and what came of it.
//
// Per-id store keyed by the idea's own id, filtered to a project on list — the same shape as
// operator-store.mjs. Real ideation state derived from runs of the bar, never seeded, never sends.

import crypto from "node:crypto";
import { persistence } from "./persistence.mjs";
import { safeId } from "./store-fs.mjs";

const SCHEMA_VERSION = 1;
const COLLECTION = "gtm-ideas";

function now() {
  return new Date().toISOString();
}

// The two verdicts the bar can hand down. A GtmIdea is either a survivor (cleared the floor) or killed
// (a fatal gap or a Dead grade) — never a soft "low score". A kill is dead, not deprioritized.
const VERDICTS = new Set(["survived", "killed"]);

function normalizeVerdict(input) {
  // killed wins: an explicit killed flag, or a "killed" verdict, makes the idea dead.
  if (input.killed === true || input.verdict === "killed") return { verdict: "killed", killed: true };
  const verdict = VERDICTS.has(input.verdict) ? input.verdict : "survived";
  return { verdict, killed: verdict === "killed" };
}

// Create and persist a GtmIdea. The pitch (the idea itself) is required — there is no empty idea. The
// verdict/killed pair is kept consistent so a reader never sees a "survived" idea flagged killed.
export function createGtmIdea(input = {}, options = {}) {
  const pitch = String(input.pitch || "").trim();
  if (!pitch) throw new Error("A GtmIdea pitch is required.");
  const createdAt = now();
  const id = input.id
    || `idea-${createdAt.replace(/\D/g, "").slice(0, 14)}-${crypto.randomBytes(4).toString("hex")}`;
  const { verdict, killed } = normalizeVerdict(input);
  const idea = {
    schemaVersion: SCHEMA_VERSION,
    id,
    projectId: input.projectId ?? null,
    goal: String(input.goal || "").trim(),
    angle: input.angle ?? null,
    pitch,
    barScore: Number.isFinite(input.barScore) ? input.barScore : null,
    axes: input.axes && typeof input.axes === "object" ? input.axes : null,
    verdict,
    killed,
    // How a survived idea wired into a real build (e.g. a composed graph / channel id), set when the
    // founder turns the idea into work. Null until then; a killed idea never gets wiring.
    buildWiring: input.buildWiring ?? null,
    // What the build did once it ran (measurement, gate result) — closes the loop back to the idea.
    outcome: input.outcome ?? null,
    createdAt,
    updatedAt: createdAt,
  };
  persistence(options).set(COLLECTION, safeId(id), idea);
  return idea;
}

export function saveGtmIdea(idea, options = {}) {
  const updated = { ...idea, schemaVersion: SCHEMA_VERSION, updatedAt: now() };
  persistence(options).set(COLLECTION, safeId(updated.id), updated);
  return updated;
}

export function getGtmIdea(id, options = {}) {
  const idea = persistence(options).get(COLLECTION, safeId(id));
  if (!idea) throw new Error(`GtmIdea not found: ${id}`);
  return idea;
}

// Every idea, newest first. A projectId scopes the list to that project's ideas; legacy ideas written
// before project scoping have projectId === null and surface only in the unscoped list. Mirrors
// listOperatorSessions.
export function listGtmIdeas(options = {}) {
  const projectFilter = options.projectId ?? null;
  return persistence(options).list(COLLECTION)
    .flatMap((idea) => {
      if (!idea || !idea.id) return [];
      if (projectFilter && (idea.projectId ?? null) !== projectFilter) return [];
      return [idea];
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// Wire a survived idea into a build. Refuses to wire a killed idea — a dead idea does not become work.
export function attachBuildWiring(id, buildWiring, options = {}) {
  const idea = getGtmIdea(id, options);
  if (idea.killed) throw new Error(`GtmIdea ${id} was killed; a killed idea is not wired into a build.`);
  return saveGtmIdea({ ...idea, buildWiring }, options);
}

// Record what the wired build actually did — the loop back from the run to the idea that spawned it.
export function recordIdeaOutcome(id, outcome, options = {}) {
  const idea = getGtmIdea(id, options);
  return saveGtmIdea({ ...idea, outcome }, options);
}
