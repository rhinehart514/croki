import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { applyExperimentVerdict } from "../src/belief-writeback.mjs";
import { loadProject, updateSharedContext } from "../src/project-store.mjs";
import { recordExperimentFromRun } from "../src/experiment-derivation.mjs";

describe("applyExperimentVerdict — the founder resolves a belief, strictly post-gate", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-verdict-"));
    options = { root: parent };
    updateSharedContext({
      experiments: [
        {
          id: "exp-cold-outbound",
          channelId: "cold-outbound",
          targetLayer: "channels",
          hypothesis: "Personalized openers beat templates",
          status: "complete",
          origin: "derived",
        },
      ],
    }, options);
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("a keep-verdict stamps the experiment and crystallizes the belief into a claim", () => {
    const saved = applyExperimentVerdict({
      projectId: "default",
      experimentId: "exp-cold-outbound",
      verdict: { decision: "keep", evidence: [{ file: "src/x.ts", line: 4 }] },
    }, options);

    const exp = saved.sharedContext.experiments.find((e) => e.id === "exp-cold-outbound");
    assert.equal(exp.verdict.decision, "keep");
    assert.equal(exp.verdict.decidedBy, "founder");
    assert.ok(exp.verdict.decidedAt, "the verdict is timestamped");

    const claim = saved.sharedContext.claims.find((c) => c.text === "Personalized openers beat templates");
    assert.ok(claim, "the kept hypothesis became a durable claim");
    // With real evidence the derived claim stays derived (the truth valve does not demote it).
    assert.equal(claim.provenance, "derived");
  });

  it("an evidence-free derived belief self-demotes to speculative", () => {
    const saved = applyExperimentVerdict({
      projectId: "default",
      experimentId: "exp-cold-outbound",
      verdict: { decision: "double-down" },
    }, options);

    const claim = saved.sharedContext.claims.find((c) => c.text === "Personalized openers beat templates");
    assert.ok(claim, "the belief still crystallizes");
    // No evidence ⇒ normalizeClaimProvenance demotes derived → speculative (the one-way valve).
    assert.equal(claim.provenance, "speculative");
  });

  it("a kill-verdict records the decision but crystallizes no claim", () => {
    const saved = applyExperimentVerdict({
      projectId: "default",
      experimentId: "exp-cold-outbound",
      verdict: { decision: "kill" },
    }, options);
    const exp = saved.sharedContext.experiments.find((e) => e.id === "exp-cold-outbound");
    assert.equal(exp.verdict.decision, "kill");
    assert.ok(!saved.sharedContext.claims.some((c) => c.text === "Personalized openers beat templates"));
  });

  it("a re-run does not clobber a founder verdict", () => {
    applyExperimentVerdict({
      projectId: "default",
      experimentId: "exp-cold-outbound",
      verdict: { decision: "keep", evidence: [{ file: "src/x.ts", line: 1 }] },
    }, options);

    const graph = {
      id: "cold-outbound",
      name: "Cold outbound",
      objective: "Get 5 pilot conversations",
      nodes: [{ id: "gate", category: "gate", label: "Founder review" }],
    };
    recordExperimentFromRun({
      projectId: "default",
      graph,
      result: { graphId: "cold-outbound", pendingGates: [], nodes: { gate: { category: "gate", items: [{ id: "z", approvalStatus: "approved" }] } } },
    }, options);

    const exp = loadProject(options).sharedContext.experiments.find((e) => e.id === "exp-cold-outbound");
    assert.equal(exp.verdict?.decision, "keep", "the founder verdict survives a re-run");
  });

  it("rejects an unknown decision and a missing experiment", () => {
    assert.throws(() => applyExperimentVerdict({ projectId: "default", experimentId: "exp-cold-outbound", verdict: { decision: "maybe" } }, options));
    assert.throws(() => applyExperimentVerdict({ projectId: "default", experimentId: "nope", verdict: { decision: "keep" } }, options));
  });
});
