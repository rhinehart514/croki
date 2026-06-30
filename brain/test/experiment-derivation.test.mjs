import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveExperimentFromRun } from "../src/experiment-derivation.mjs";

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
    assert.equal(exp.hypothesis, "Get 5 pilot conversations without paid ads");
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
});
