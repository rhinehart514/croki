import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { addClarity, clarityGrounding } from "../src/clarity-store.mjs";
import { createProject, loadProject } from "../src/project-store.mjs";
import {
  composeGraphForChannel,
  previewOpportunityChannel,
} from "../src/workflow-composer.mjs";

// A fake composer that records the grounding it is handed and returns a minimal, valid graph
// (a single self-sourcing agent + measure, no execute, so the gate wall is satisfied trivially).
function recordingComposer() {
  const calls = [];
  const compose = async (args) => {
    calls.push(args);
    return {
      ok: true,
      nodes: [
        { id: "find", kind: "agent", ref: "gtm-find-prospects", label: "Find", category: "source", contract: { accepts: [], emits: ["lead"] } },
        { id: "measure", category: "measure", connector: "default", label: "Measure", contract: { accepts: ["lead"], emits: [] } },
      ],
      edges: [{ source: "find", target: "measure", edgeType: "data" }],
    };
  };
  return { compose, calls };
}

describe("clarity grounding — founder pins reach the composer", () => {
  let parent;
  let options;
  const projectId = "acme";

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-clarity-grounding-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  describe("clarityGrounding shape", () => {
    it("returns null when the founder has pinned nothing", () => {
      assert.equal(clarityGrounding(projectId, options), null);
    });

    it("groups pins by kind under explicit founder-direction labels", () => {
      addClarity(projectId, { kind: "claim", text: "we cut onboarding to one day" }, options);
      addClarity(projectId, { kind: "icp", text: "seed-stage dev-tool founders" }, options);
      addClarity(projectId, { kind: "direction", text: "lead with the time-to-value" }, options);
      addClarity(projectId, { kind: "question", text: "do they trust an agent to draft?", note: "test in gate" }, options);

      const grounding = clarityGrounding(projectId, options);
      assert.equal(grounding.source, "founder-pinned-clarity");
      assert.deepEqual(grounding.claimsToHonor, ["we cut onboarding to one day"]);
      assert.deepEqual(grounding.icp, ["seed-stage dev-tool founders"]);
      assert.deepEqual(grounding.directions, ["lead with the time-to-value"]);
      // The optional note rides along inline so the founder's caveat is not lost.
      assert.deepEqual(grounding.openQuestions, ["do they trust an agent to draft? (test in gate)"]);
    });

    it("omits the kinds the founder did not pin", () => {
      addClarity(projectId, { kind: "direction", text: "only a direction" }, options);
      const grounding = clarityGrounding(projectId, options);
      assert.deepEqual(grounding.directions, ["only a direction"]);
      assert.ok(!("claimsToHonor" in grounding));
      assert.ok(!("icp" in grounding));
      assert.ok(!("openQuestions" in grounding));
    });
  });

  describe("composeGraphForChannel folds clarity into grounding", () => {
    it("passes founder direction to the composer under founderDirection", async () => {
      const { compose, calls } = recordingComposer();
      const clarity = { source: "founder-pinned-clarity", directions: ["go local-first"] };

      await composeGraphForChannel({
        channel: { id: "c1", title: "Outbound", objective: "land a pilot" },
        agents: [],
        grounding: { product: { name: "RodentRadar" } },
        clarity,
        compose,
      });

      assert.equal(calls.length, 1);
      const sentGrounding = calls[0].grounding;
      // The product grounding survives, and the founder's direction is added, clearly labeled.
      assert.deepEqual(sentGrounding.product, { name: "RodentRadar" });
      assert.deepEqual(sentGrounding.founderDirection, clarity);
    });

    it("leaves grounding untouched when there is no clarity", async () => {
      const { compose, calls } = recordingComposer();
      await composeGraphForChannel({
        channel: { id: "c1", title: "Outbound", objective: "land a pilot" },
        grounding: { product: { name: "RodentRadar" } },
        clarity: null,
        compose,
      });
      assert.ok(!("founderDirection" in calls[0].grounding));
    });
  });

  describe("previewOpportunityChannel — end to end through a real project", () => {
    it("injects the project's pinned clarity into the compose prompt grounding", async () => {
      createProject({ name: "GTM IDE" }, options);
      const project = loadProject(options);

      addClarity(project.id, { kind: "icp", text: "regional pest-control operators" }, options);
      addClarity(project.id, { kind: "claim", text: "per-site pricing beats per-seat" }, options);

      const { compose, calls } = recordingComposer();
      await previewOpportunityChannel(
        { title: "Operator outreach", objective: "land one pilot" },
        { ...options, projectId: project.id, compose },
      );

      assert.equal(calls.length, 1);
      const founderDirection = calls[0].grounding.founderDirection;
      assert.ok(founderDirection, "founder direction should be present in grounding");
      assert.deepEqual(founderDirection.icp, ["regional pest-control operators"]);
      assert.deepEqual(founderDirection.claimsToHonor, ["per-site pricing beats per-seat"]);
      // And it is serialized into what a real prompt would carry, not dropped.
      assert.match(JSON.stringify(calls[0].grounding), /regional pest-control operators/);
    });

    it("does not add a founderDirection key when the project has no pins", async () => {
      createProject({ name: "GTM IDE" }, options);
      const project = loadProject(options);

      const { compose, calls } = recordingComposer();
      await previewOpportunityChannel(
        { title: "Operator outreach", objective: "land one pilot" },
        { ...options, projectId: project.id, compose },
      );
      assert.ok(!("founderDirection" in (calls[0].grounding ?? {})));
    });
  });
});
