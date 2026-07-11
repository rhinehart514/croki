// A read-only crew deliberation over one terrain hypothesis. The model owns each position; the host
// only keeps project-scoped crew/evidence references and preserves disagreement as separate records.
// Nothing here pins a question, composes a pipeline, records a founder decision, or grants approval.

import crypto from "node:crypto";
import { runStructuredTask } from "./structured-task-runtime.mjs";

export const TERRAIN_CREW_PROMPT = `Take distinct positions on ONE product-market terrain hypothesis.
Do not blend the crew into consensus. Each participating teammate should state its own claim, uncertainty,
recommended next move, concrete falsifier, and any supplied evidence it relies on. Use only exact crew refs
and evidence refs supplied below. This is read-only advice: it cannot approve, compose, publish, or send.

Return ONLY a JSON array. Each item has:
{
  "participantRef": "an exact supplied crew ref",
  "claim": "the teammate's position",
  "uncertainty": "what remains uncertain, or null",
  "recommendation": "what this teammate would do next, or null",
  "falsifier": "what would change this teammate's mind, or null",
  "evidenceRefs": [{ "type": "an exact supplied type", "id": "an exact supplied id" }],
  "disagreesWith": ["another exact supplied crew ref"]
}`;

function text(value) {
  const result = String(value ?? "").replace(/\s+/g, " ").trim();
  return result || null;
}

function refKey(ref) {
  const type = text(ref?.type);
  const id = text(ref?.id);
  return type && id ? `${type}:${id}` : null;
}

function stableId(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 20);
}

export function normalizeTerrainCrewPositions(items, input = {}, runtime = {}, { now = () => new Date().toISOString() } = {}) {
  const projectId = text(input.projectId) ?? "default";
  const hypothesis = input.hypothesis && typeof input.hypothesis === "object" ? input.hypothesis : {};
  const allowedCrew = new Set((Array.isArray(input.crew) ? input.crew : []).map((member) => text(member?.ref ?? member?.id ?? member)).filter(Boolean));
  const evidenceByKey = new Map();
  for (const ref of [...(hypothesis.evidenceRefs ?? []), ...(hypothesis.counterEvidenceRefs ?? [])]) {
    const key = refKey(ref);
    if (key) evidenceByKey.set(key, { type: text(ref.type), id: text(ref.id) });
  }
  const positions = (Array.isArray(items) ? items : []).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const participantRef = text(raw.participantRef ?? raw.crewRef ?? raw.teammateRef);
    const claim = text(raw.claim ?? raw.statement);
    if (!participantRef || !claim || !allowedCrew.has(participantRef)) return [];
    const evidenceRefs = (Array.isArray(raw.evidenceRefs) ? raw.evidenceRefs : [])
      .map((ref) => evidenceByKey.get(refKey(ref)))
      .filter(Boolean);
    const disagreesWith = [...new Set((Array.isArray(raw.disagreesWith) ? raw.disagreesWith : [])
      .map(text)
      .filter((ref) => ref && ref !== participantRef && allowedCrew.has(ref)))];
    return [{
      id: `terrain-position-${stableId({ projectId, hypothesisId: hypothesis.id, participantRef, claim })}`,
      participantRef,
      claim,
      uncertainty: text(raw.uncertainty),
      recommendation: text(raw.recommendation),
      falsifier: text(raw.falsifier),
      evidenceRefs,
      disagreesWith,
    }];
  });
  return {
    schemaVersion: 1,
    projectId,
    hypothesisRef: { type: "terrain-hypothesis", id: text(hypothesis.id) ?? "unknown" },
    generatedAt: now(),
    runtime: { id: text(runtime.id) ?? "blank", model: text(runtime.model) },
    positions,
  };
}

export function createTerrainCrewReader({ runTask = runStructuredTask, cwd = process.cwd(), model, runtime, maxTurns = 18, now } = {}) {
  return async function readTerrainCrew(input = {}) {
    const result = await runTask({
      task: "terrain-crew",
      prompt: `${TERRAIN_CREW_PROMPT}\n\nProject-scoped context:\n${JSON.stringify({
        projectId: input.projectId,
        hypothesis: input.hypothesis,
        crew: input.crew ?? [],
      }, null, 2)}`,
      cwd: input.cwd ?? cwd,
      model: input.model ?? model,
      runtime: input.runtime ?? runtime,
      output: "items",
      readOnly: true,
      maxTurns: input.maxTurns ?? maxTurns,
    });
    const terrainCrew = normalizeTerrainCrewPositions(result.ok ? result.value : [], input, {
      id: result.runtime ?? "blank",
      model: result.model ?? input.model ?? model ?? null,
    }, { ...(now ? { now } : {}) });
    return { ok: result.ok, terrainCrew, ...(result.error ? { error: result.error } : {}) };
  };
}
