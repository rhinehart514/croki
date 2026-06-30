import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { upsertStatedExperiment } from "../src/stated-experiment.mjs";
import { applyExperimentVerdict } from "../src/belief-writeback.mjs";
import { getBoard } from "../src/board.mjs";
import { loadProject } from "../src/project-store.mjs";

// The keystone loop: a founder GROUPS two motions into the arms of one ICP experiment (post-hoc
// context, no verdict), the board shows them racing on the Market band, the founder renders a verdict,
// and the Market belief flips testing → validated with the experiment pinned as provenance. Belief →
// gated motion → measured result → verdict → belief update, the gate the only wall.
describe("stated ICP experiment → verdict → board flips the Market belief to validated", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-stated-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("groups two channels as arms, never sets a verdict, and lands on the Market / ICP band", () => {
    const { experiment } = upsertStatedExperiment({
      projectId: "default",
      experiment: {
        targetLayer: "market",
        hypothesis: "PCO owners convert on the $49 pilot better than restaurants",
        heldConstant: "$49 pilot",
        arms: [
          { label: "PCO Outbound", kind: "channel", channelId: "pco-outbound" },
          { label: "Restaurant Outbound", kind: "channel", channelId: "restaurant-outbound" },
        ],
      },
    }, options);

    assert.equal(experiment.origin, "stated", "a grouping is stated, not derived");
    assert.equal(experiment.arms.length, 2);
    assert.ok(!experiment.verdict, "grouping NEVER sets a verdict — that is the founder's hand");

    const board = getBoard({ projectId: "default" }, options);
    const icp = board.layers.find((l) => l.layer === "icp");
    assert.equal(icp.experiments.length, 1, "the market-targeted grouping lands on the ICP band");
    assert.equal(icp.experiments[0].arms.length, 2);
    assert.notEqual(icp.status, "validated", "before a verdict the belief is not yet validated");
    assert.notEqual(icp.status, "blind", "a running experiment is a real belief, not blind");
  });

  it("a keep-PCO verdict flips the ICP band to validated with the experiment pinned as provenance", () => {
    const { experiment } = upsertStatedExperiment({
      projectId: "default",
      experiment: {
        targetLayer: "market",
        hypothesis: "PCO owners convert on the $49 pilot better than restaurants",
        heldConstant: "$49 pilot",
        arms: [
          { label: "PCO Outbound", kind: "channel", channelId: "pco-outbound" },
          { label: "Restaurant Outbound", kind: "channel", channelId: "restaurant-outbound" },
        ],
      },
    }, options);

    const pcoArm = experiment.arms.find((a) => a.channelId === "pco-outbound");
    applyExperimentVerdict({
      projectId: "default",
      experimentId: experiment.id,
      verdict: { decision: "keep", winningArmId: pcoArm.id },
    }, options);

    const board = getBoard({ projectId: "default" }, options);
    const icp = board.layers.find((l) => l.layer === "icp");

    assert.equal(icp.status, "validated", "the founder verdict flips the Market belief to validated");
    assert.ok(icp.confidence >= 45, "a founder verdict is the strongest confidence signal");

    const pinned = icp.experiments.find((e) => e.id === experiment.id);
    assert.equal(pinned.verdict.decision, "keep", "the experiment is pinned as provenance with the verdict");
    assert.equal(pinned.verdict.winningArmId, pcoArm.id, "the winning arm is the kept PCO arm");

    // The kept hypothesis crystallized into a durable claim (no evidence ⇒ speculative, the truth valve).
    const claim = loadProject(options).sharedContext.claims.find((c) => c.text.includes("PCO owners"));
    assert.ok(claim, "the kept belief becomes a durable claim");
  });
});
