import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { loadFlow, recordFlowRun, saveFlow } from "../src/flow-store.mjs";
import {
  compareChannelRuns,
  createPortfolioArtifact,
  derivePortfolioBrief,
  recordExperiment,
  recordObservedOutcome,
} from "../src/portfolio-intelligence.mjs";
import { createChannel, loadProject } from "../src/project-store.mjs";

describe("portfolio intelligence", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-intelligence-"));
    options = { root: parent };
    loadProject(options);
    createChannel({ name: "Founder outbound", objective: "Prepare grounded one-to-one outreach." }, options);
    createChannel({ name: "LinkedIn content", objective: "Turn product learning into useful posts." }, options);
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("creates meaningful graph and result diffs between runs", () => {
    const flow = loadFlow("founder-outbound", null, options);
    const initial = {
      ...flow.graph,
      nodes: [{
        id: "src-inputs",
        category: "source",
        connector: "exa",
        label: "Inputs",
        config: { limit: 3 },
      }],
      edges: [],
    };
    saveFlow(initial, options);
    const first = recordFlowRun(initial, {
      runId: "run-a", ok: false, pendingGates: [], nodes: {
        "src-inputs": { nodeId: "src-inputs", category: "source", ok: false, items: [], error: "missing key" },
      },
    }, options);
    const changed = {
      ...first.graph,
      revision: 1,
      nodes: first.graph.nodes.map((node) => node.id === "src-inputs"
        ? { ...node, config: { ...node.config, limit: 5 } } : node),
    };
    saveFlow(changed, options);
    recordFlowRun(changed, {
      runId: "run-b", ok: true, pendingGates: [], nodes: {
        "src-inputs": { nodeId: "src-inputs", category: "source", ok: true, items: [{ type: "prospect" }] },
      },
    }, options);
    const runs = loadFlow("founder-outbound", null, options).runs;
    const diff = compareChannelRuns(runs[0], runs[1]);
    assert.ok(diff.graphChanges.some((change) => change.type === "config_changed"));
    assert.equal(diff.resultChanges[0].after.itemCount, 1);
  });

  it("records only explicitly observed attributable outcomes and product feedback", () => {
    const recorded = recordObservedOutcome({
      channelId: "founder-outbound",
      gtmActionId: "action-123",
      type: "reply",
      detail: "Asked for more information.",
      productFeedback: "Needs a clearer team workflow.",
      source: { connector: "gmail", pointer: "message-456" },
    }, options);
    assert.equal(recorded.outcome.observation, "observed");
    const brief = derivePortfolioBrief(options);
    assert.equal(brief.observedOutcomes.length, 1);
    assert.equal(brief.productFeedback.length, 1);
  });

  it("preserves explicit experiment hypotheses without inventing results", () => {
    const result = recordExperiment({
      channelId: "linkedin-content",
      hypothesis: "Code-evidence posts create more qualified product visits.",
      variable: "post angle",
      heldConstant: ["audience", "CTA"],
      successSignal: "attributed product_created",
    }, options);
    assert.equal(result.experiment.status, "draft");
    assert.equal(result.experiment.result, null);
  });

  it("records an experiment's variant against its control, and stays backward compatible", () => {
    const withVariant = recordExperiment({
      channelId: "linkedin-content",
      hypothesis: "A code-evidence opener beats a generic outcome opener.",
      variable: "opener",
      variant: "code-evidence opener",
      control: "generic outcome opener",
      successSignal: "reply rate",
    }, options);
    assert.equal(withVariant.experiment.variant, "code-evidence opener");
    assert.equal(withVariant.experiment.control, "generic outcome opener");

    // An experiment recorded without variant/control still loads and runs — the fields are null,
    // not missing-key errors.
    const withoutVariant = recordExperiment({
      channelId: "linkedin-content",
      hypothesis: "Shorter posts lift dwell time.",
      variable: "length",
      successSignal: "dwell",
    }, options);
    assert.equal(withoutVariant.experiment.variant, null);
    assert.equal(withoutVariant.experiment.control, null);

    const stored = loadProject(options).sharedContext.experiments;
    assert.equal(stored.find((e) => e.id === withVariant.experiment.id).variant, "code-evidence opener");
  });

  it("creates a proof brief derived from current portfolio state", () => {
    const first = createPortfolioArtifact(options);
    const second = createPortfolioArtifact(options);
    assert.equal(first.artifact.observation, "derived");
    assert.equal(first.artifact.content.channels.length, 2);
    assert.equal(second.artifact.content.artifacts.length, 1);
    assert.equal("content" in second.artifact.content.artifacts[0], false);
  });
});
