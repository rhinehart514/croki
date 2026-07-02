import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { deriveExperimentFromRun, normalizeExperiment, recordExperimentFromRun } from "../src/experiment-derivation.mjs";
import { loadProject, updateSharedContext } from "../src/project-store.mjs";

describe("deriveExperimentFromRun", () => {
  const graph = {
    id: "cold-outbound",
    name: "Cold outbound",
    objective: "Get 5 pilot conversations without paid ads",
    nodes: [
      { id: "src", category: "source", label: "Founder list" },
      { id: "draft", kind: "agent", label: "Draft personalized opener", config: { claimId: "claim-1" } },
      { id: "gate", category: "gate", label: "Founder review" },
    ],
  };

  it("derives a running experiment from a paused gate", () => {
    const result = {
      graphId: "cold-outbound",
      pendingGates: ["gate"],
      nodes: { gate: { category: "gate", items: [{ id: "a" }, { id: "b" }] } },
    };
    const exp = deriveExperimentFromRun({ graph, result, sharedContext: { icp: { label: "Dev-tool founders" } } });
    assert.equal(exp.id, "exp-cold-outbound");
    assert.equal(exp.channelId, "cold-outbound");
    assert.equal(exp.status, "running");
    // The founder's typed goal is a goal, not a hypothesis — a derived experiment never echoes it back.
    // The variable (the drafting step's own label) names what is really under test.
    assert.ok(!("hypothesis" in exp), "a derived experiment carries no hypothesis, never the goal text");
    assert.equal(exp.variable, "Draft personalized opener");
    assert.equal(exp.heldConstant, "Founder list");
    assert.equal(exp.claimId, "claim-1");
    assert.equal(exp.icp, "Dev-tool founders");
    assert.equal(exp.result, "2 staged · awaiting review");
  });

  it("derives a complete experiment with gate decisions", () => {
    const result = {
      graphId: "cold-outbound",
      pendingGates: [],
      nodes: {
        gate: {
          category: "gate",
          items: [
            { id: "a", approvalStatus: "approved" },
            { id: "b", approvalStatus: "approved" },
            { id: "c", approvalStatus: "rejected" },
          ],
        },
      },
    };
    const exp = deriveExperimentFromRun({ graph, result, sharedContext: {} });
    assert.equal(exp.status, "complete");
    assert.equal(exp.result, "3 staged · 2 approved · 1 rejected");
    assert.equal(exp.successSignal, 'Founder approval at "Founder review"');
    assert.ok(!("icp" in exp), "icp left blank when no ICP label");
  });

  it("returns null without a channel id", () => {
    assert.equal(deriveExperimentFromRun({ graph: {}, result: {} }), null);
  });

  it("carries the open shape: a single channel arm and origin — and NO force-filed targetLayer", () => {
    const result = { graphId: "cold-outbound", pendingGates: [], nodes: {} };
    const exp = deriveExperimentFromRun({ graph, result, sharedContext: {} });
    // A run does not know which strategic layer it tests — force-filing "channels" misfiled everything.
    assert.ok(!("targetLayer" in exp), "a derived experiment carries no invented layer");
    assert.equal(exp.origin, "derived");
    assert.equal(exp.arms.length, 1);
    assert.equal(exp.arms[0].kind, "channel");
    assert.equal(exp.arms[0].channelId, "cold-outbound");
    // A derivation NEVER emits a verdict or updates — those are the founder's, never clobbered on re-run.
    assert.ok(!("verdict" in exp), "derived patch must omit verdict");
    assert.ok(!("updates" in exp), "derived patch must omit updates");
  });
});

describe("normalizeExperiment — read-time back-fill", () => {
  it("back-fills a single channel arm on a legacy experiment without inventing a targetLayer", () => {
    const norm = normalizeExperiment({ id: "exp-x", channelId: "x", variable: "Opener A" });
    assert.ok(!("targetLayer" in norm) || !norm.targetLayer, "no layer is invented on read — layers stay open");
    assert.equal(norm.origin, "derived");
    assert.equal(norm.arms.length, 1);
    assert.equal(norm.arms[0].channelId, "x");
  });

  it("never overwrites a real targetLayer, arms, or verdict", () => {
    const original = {
      id: "exp-x",
      targetLayer: "positioning",
      arms: [{ id: "a1", kind: "claim" }, { id: "a2", kind: "claim" }],
      verdict: { decision: "keep", decidedAt: "t", decidedBy: "founder" },
      origin: "stated",
    };
    const norm = normalizeExperiment(original);
    assert.equal(norm.targetLayer, "positioning");
    assert.equal(norm.arms.length, 2);
    assert.equal(norm.verdict.decision, "keep");
    assert.equal(norm.origin, "stated");
  });
});

describe("recordExperimentFromRun — a re-run never clobbers a founder verdict", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-exp-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("preserves a verdict set between two runs of the same channel", () => {
    const graph = {
      id: "cold-outbound",
      name: "Cold outbound",
      objective: "Get 5 pilot conversations",
      nodes: [
        { id: "src", category: "source", label: "Founder list" },
        { id: "draft", kind: "agent", label: "Draft opener" },
        { id: "gate", category: "gate", label: "Founder review" },
      ],
    };
    const firstResult = {
      graphId: "cold-outbound",
      pendingGates: [],
      nodes: { gate: { category: "gate", items: [{ id: "a", approvalStatus: "approved" }] } },
    };
    const first = recordExperimentFromRun({ projectId: "default", graph, result: firstResult }, options);
    assert.equal(first.id, "exp-cold-outbound");

    // The founder resolves the experiment — the ONLY hand that sets a verdict.
    const project = loadProject(options);
    const experiments = project.sharedContext.experiments.map((e) =>
      e.id === "exp-cold-outbound"
        ? { ...e, verdict: { decision: "keep", decidedAt: "2026-06-29T00:00:00Z", decidedBy: "founder" } }
        : e,
    );
    updateSharedContext({ experiments }, options);

    // A second run of the same channel re-derives and upserts the experiment.
    const secondResult = {
      graphId: "cold-outbound",
      pendingGates: [],
      nodes: { gate: { category: "gate", items: [{ id: "b", approvalStatus: "approved" }, { id: "c", approvalStatus: "rejected" }] } },
    };
    recordExperimentFromRun({ projectId: "default", graph, result: secondResult }, options);

    const after = loadProject(options).sharedContext.experiments.find((e) => e.id === "exp-cold-outbound");
    assert.ok(after, "the experiment still exists after the re-run");
    assert.equal(after.verdict?.decision, "keep", "the founder's verdict survives the re-run");
    assert.equal(after.result, "2 staged · 1 approved · 1 rejected", "the re-run still updates the derived result");
  });
});
