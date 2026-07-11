import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createTerrainCrewReader, normalizeTerrainCrewPositions, TERRAIN_CREW_PROMPT } from "../src/terrain-crew.mjs";

const INPUT = {
  projectId: "project-a",
  hypothesis: {
    id: "h-1",
    claim: "A public brief may improve activation.",
    evidenceRefs: [{ type: "evidence", id: "ev-1" }],
    counterEvidenceRefs: [{ type: "evidence", id: "ev-2" }],
  },
  crew: [{ ref: "activation-lead" }, { ref: "distribution-lead" }],
};

const POSITIONS = [
  {
    participantRef: "activation-lead",
    claim: "Start inside onboarding.",
    uncertainty: "Whether the brief arrives early enough.",
    recommendation: "Test one onboarding placement.",
    falsifier: "Activation remains flat.",
    evidenceRefs: [{ type: "evidence", id: "ev-1" }],
    disagreesWith: ["distribution-lead"],
  },
  {
    participantRef: "distribution-lead",
    claim: "Make the brief travel outside the product.",
    uncertainty: "Whether anyone shares it.",
    recommendation: "Test a public artifact.",
    falsifier: "No qualified visits arrive.",
    evidenceRefs: [{ type: "evidence", id: "ev-2" }],
    disagreesWith: ["activation-lead"],
  },
];

describe("terrain crew read", () => {
  it("preserves distinct positions while dropping foreign crew and evidence refs", () => {
    const read = normalizeTerrainCrewPositions([
      ...POSITIONS,
      { participantRef: "foreign-agent", claim: "Should not cross projects." },
      { ...POSITIONS[0], participantRef: "activation-lead", claim: "Unsupported receipt", evidenceRefs: [{ type: "evidence", id: "fake" }] },
    ], INPUT, { id: "codex", model: "gpt-test" }, { now: () => "2026-07-10T12:00:00Z" });
    assert.equal(read.projectId, "project-a");
    assert.equal(read.positions.length, 3);
    assert.notEqual(read.positions[0].claim, read.positions[1].claim);
    assert.deepEqual(read.positions[0].disagreesWith, ["distribution-lead"]);
    assert.deepEqual(read.positions[2].evidenceRefs, []);
    assert.ok(read.positions.every((position) => position.participantRef !== "foreign-agent"));
  });

  it("uses the provider-neutral read-only structured task seam", async () => {
    let request;
    const read = createTerrainCrewReader({
      runTask: async (value) => {
        request = value;
        return { ok: true, value: POSITIONS, runtime: "claude-code", model: "claude-test" };
      },
    });
    const result = await read(INPUT);
    assert.equal(result.ok, true);
    assert.equal(result.terrainCrew.positions.length, 2);
    assert.equal(request.task, "terrain-crew");
    assert.equal(request.output, "items");
    assert.equal(request.readOnly, true);
    assert.match(request.prompt, /Do not blend the crew into consensus/);
  });

  it("keeps the deliberation advisory and outside approval authority", () => {
    assert.match(TERRAIN_CREW_PROMPT, /cannot approve, compose, publish, or send/);
  });
});
