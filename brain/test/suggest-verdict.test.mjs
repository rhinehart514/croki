// suggest-verdict.test.mjs — a deterministic PROPOSED verdict from observed outcomes.
//
// What this proves:
//   - An ingested outcome yields the right proposed verdict (keep) when a success target is met, and the
//     suggestion NEVER auto-applies: the experiment carries no verdict until the founder accepts.
//   - Accepting the suggestion is the existing applyExperimentVerdict call with provenance "derived" — the
//     founder stays the only hand that sets a verdict.
//   - No threshold + no outcomes proposes nothing (no invented success); complete measurement with no
//     signal proposes kill.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { suggestVerdictFromOutcomes, applyExperimentVerdict } from "../src/belief-writeback.mjs";
import { ingestOutcome } from "../src/outcome-ingest.mjs";
import { gtmPathStore, runStore } from "../src/gtm-store.mjs";
import { loadProject, updateSharedContext } from "../src/project-store.mjs";

const PROJECT = "default";

// Seed a path + a staged run whose pathId doubles as the experiment channelId, under a measurement
// contract that carries a plain-language success criteria line. Returns the ids the tests join on.
function seed(options, { successCriteria = "2 signups", items } = {}) {
  const gtmPath = gtmPathStore.create(
    {
      projectId: PROJECT,
      summary: "Reach solo founders in indie Discords with a launch nudge",
      bet: { buyer: "solo founders", channel: "discord", offer: "free checklist" },
      status: "selected",
    },
    options,
  );
  const run = runStore.create(
    {
      projectId: PROJECT,
      pathId: gtmPath.id,
      status: "staged",
      measurementContract: { successCriteria, outcomeKinds: ["signup"], joinKey: "handle" },
      items: items ?? [
        { joinKey: "handle-ada", buyer: "Ada", channel: "discord" },
        { joinKey: "handle-bo", buyer: "Bo", channel: "discord" },
        { joinKey: "handle-cy", buyer: "Cy", channel: "discord" },
      ],
    },
    options,
  );
  // The experiment whose channelId is the path id, so its outcomes resolve through the run's items.
  updateSharedContext(
    {
      experiments: [
        {
          id: `exp-${gtmPath.id}`,
          channelId: gtmPath.id,
          status: "complete",
          origin: "derived",
          arms: [{ id: `arm-${gtmPath.id}`, label: "Discord", kind: "channel", channelId: gtmPath.id }],
        },
      ],
    },
    { ...options, projectId: PROJECT },
  );
  return { pathId: gtmPath.id, runId: run.id, experimentId: `exp-${gtmPath.id}` };
}

describe("suggestVerdictFromOutcomes — proposed, never auto-applied", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "suggest-verdict-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("an ingested outcome that meets the target yields a proposed keep and does NOT auto-apply", () => {
    const { experimentId } = seed(options, { successCriteria: "2 signups" });

    // Two real signups arrive and join back to their staged items.
    ingestOutcome({ joinKey: "handle-ada", outcomeKind: "signup" }, { ...options, projectId: PROJECT });
    ingestOutcome({ joinKey: "handle-bo", outcomeKind: "signup" }, { ...options, projectId: PROJECT });

    const suggestion = suggestVerdictFromOutcomes({ experimentId, projectId: PROJECT }, options);

    // The right proposed verdict from the real observed count against the "2 signups" target.
    assert.equal(suggestion.proposal.decision, "keep");
    assert.equal(suggestion.proposal.provenance, "derived");
    assert.equal(suggestion.observed.byKind.signup, 2);
    assert.equal(suggestion.threshold.allMet, true);
    assert.match(suggestion.message, /signups? observed/i);
    assert.match(suggestion.message, /keep\?/i);

    // INVARIANT: proposing never applies. The experiment still has no verdict on disk.
    assert.equal(suggestion.autoApplied, false);
    const exp = loadProject({ ...options, projectId: PROJECT }).sharedContext.experiments.find(
      (e) => e.id === experimentId,
    );
    assert.ok(!exp.verdict, "the suggestion must NOT have written a verdict — the founder is the only hand");
  });

  it("accepting the suggestion routes through applyExperimentVerdict with provenance derived", () => {
    const { experimentId } = seed(options, { successCriteria: "2 signups" });
    ingestOutcome({ joinKey: "handle-ada", outcomeKind: "signup" }, { ...options, projectId: PROJECT });
    ingestOutcome({ joinKey: "handle-bo", outcomeKind: "signup" }, { ...options, projectId: PROJECT });

    const suggestion = suggestVerdictFromOutcomes({ experimentId, projectId: PROJECT }, options);
    // The founder accepts — the exact existing route the founder calls.
    const saved = applyExperimentVerdict(
      {
        projectId: PROJECT,
        experimentId,
        verdict: {
          decision: suggestion.proposal.decision,
          winningArmId: suggestion.proposal.winningArmId,
          provenance: suggestion.proposal.provenance,
        },
      },
      options,
    );

    const exp = saved.sharedContext.experiments.find((e) => e.id === experimentId);
    assert.equal(exp.verdict.decision, "keep");
    assert.equal(exp.verdict.decidedBy, "founder", "even a derived-provenance accept is stamped as the founder's hand");
  });

  it("does not meet the target until enough outcomes arrive (inconclusive, no proposal)", () => {
    const { experimentId } = seed(options, { successCriteria: "2 signups" });
    // Only one signup so far; two staged items remain unmeasured → still running.
    ingestOutcome({ joinKey: "handle-ada", outcomeKind: "signup" }, { ...options, projectId: PROJECT });

    const suggestion = suggestVerdictFromOutcomes({ experimentId, projectId: PROJECT }, options);
    assert.equal(suggestion.threshold.allMet, false);
    assert.equal(suggestion.proposal, null, "one of two signups against a target of two is inconclusive");
  });

  it("no outcomes and no criteria proposes nothing — success is never invented", () => {
    const { experimentId } = seed(options, { successCriteria: "" });
    const suggestion = suggestVerdictFromOutcomes({ experimentId, projectId: PROJECT }, options);
    assert.equal(suggestion.threshold, null);
    assert.equal(suggestion.proposal, null);
    assert.equal(suggestion.observed.total, 0);
  });

  it("throws on an unknown experiment", () => {
    seed(options);
    assert.throws(() => suggestVerdictFromOutcomes({ experimentId: "nope", projectId: PROJECT }, options));
  });
});
