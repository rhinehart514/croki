// Mutation-from-a-loser (rail 2) — the hard guarantee: proposing a variant NEVER auto-kills the loser
// and NEVER auto-runs the variant. The founder killed the bet; the machine learns and proposes forward.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  acceptVariantProposal,
  isLoser,
  deriveVariantFromLoser,
  projectLoserMutations,
  proposeVariantFromLoser,
  rejectVariantProposal,
} from "../src/loser-mutation.mjs";
import { loadProject, updateSharedContext } from "../src/project-store.mjs";
import { getWorkArtifact, listWorkArtifacts } from "../src/work-artifact-store.mjs";
import { getPendingInbox } from "../src/pending-inbox.mjs";
import { gtmPathStore, runStore } from "../src/gtm-store.mjs";

function gatedComposer() {
  return async () => ({
    ok: true,
    nodes: [
      { id: "src", category: "source", connector: "manual", label: "Input" },
      { id: "draft", kind: "agent", ref: "drafter", label: "Prepare", agentPrompt: "prepare the variant" },
      { id: "gate", category: "gate", connector: "default", label: "Founder review" },
      { id: "out", category: "execute", connector: "local", label: "Stage" },
    ],
    edges: [
      { source: "src", target: "draft", edgeType: "data" },
      { source: "draft", target: "gate", edgeType: "data" },
      { source: "gate", target: "out", edgeType: "data" },
    ],
  });
}

describe("mutation-from-a-loser — never auto-kills, never auto-runs", () => {
  let root;
  let options;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-loser-mut-"));
    options = { root };
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  // Seed a killed experiment — the founder's verdict is the ONLY hand that kills (belief-writeback).
  function seedKilledExperiment(patch = {}) {
    const killed = {
      id: "exp-cold-outbound",
      variable: "Personalized opener",
      heldConstant: "Founder list",
      targetLayer: "message",
      status: "complete",
      origin: "derived",
      verdict: { decision: "kill", decidedAt: "2026-07-10T00:00:00Z", decidedBy: "founder" },
      ...patch,
    };
    updateSharedContext({ experiments: [killed] }, options);
    return killed;
  }

  it("only a founder-killed bet is a loser — an operational failure is not market evidence", () => {
    assert.equal(isLoser({ verdict: { decision: "kill" } }), true);
    assert.equal(isLoser({ status: "failed" }), false);
    assert.equal(isLoser({ verdict: { decision: "keep" } }), false);
    assert.equal(isLoser({ status: "running" }), false);
    assert.equal(isLoser({}), false);
  });

  it("asks the crew for one evidence-grounded change without hard-coding a strategy taxonomy", () => {
    const loser = { id: "exp-1", variable: "opener", targetLayer: "message", heldConstant: "Founder list",
      verdict: { decision: "kill" } };
    const variant = deriveVariantFromLoser(loser);
    assert.ok(variant, "a killed bet yields a variant");
    assert.equal(variant.origin, "proposed");
    assert.equal(variant.status, "proposed");
    assert.ok(!variant.verdict, "a proposed variant NEVER carries a verdict — that is the founder's hand");
    assert.equal(variant.targetLayer, undefined, "the host does not choose a fixed message/ICP/channel/product bucket");
    assert.match(variant.crewInstruction, /smallest meaningful change/i);
    assert.equal(variant.mutatedFrom, "exp-1", "the variant points back at the bet it learned from");
  });

  it("proposing a variant NEVER touches the loser and NEVER runs the variant", () => {
    const killed = seedKilledExperiment();
    const before = loadProject(options).sharedContext.experiments.find((e) => e.id === killed.id);

    const { variant, created } = proposeVariantFromLoser({ projectId: "default", experimentId: killed.id }, options);
    assert.equal(created, true);

    const after = loadProject(options).sharedContext.experiments;
    // The loser is UNTOUCHED — same verdict, same status, not re-killed, not ended by the machine.
    const loserAfter = after.find((e) => e.id === killed.id);
    assert.deepEqual(loserAfter.verdict, before.verdict, "the loser's verdict is untouched");
    assert.equal(loserAfter.status, before.status, "the loser's status is untouched — the machine never ends it");

    // The variant is editable canvas material, not a hidden second experiment authority. It awaits
    // greenlight there — not running, no receipt, no verdict.
    assert.equal(after.length, 1, "no hidden shared-context experiment was appended");
    const artifacts = listWorkArtifacts("default", options);
    assert.equal(artifacts.length, 1);
    const variantAfter = getWorkArtifact("default", artifacts[0].artifactId, options);
    assert.equal(variantAfter.kind, "experiment-proposal");
    assert.equal(variantAfter.status, "proposed", "the variant is proposed, never auto-run");
    assert.equal(variantAfter.content.id, variant.id);
    assert.ok(!variantAfter.content.verdict, "the variant carries no verdict");
  });

  it("is idempotent — proposing the same variant twice adds nothing", () => {
    const killed = seedKilledExperiment();
    const first = proposeVariantFromLoser({ projectId: "default", experimentId: killed.id }, options);
    assert.equal(first.created, true);
    const second = proposeVariantFromLoser({ projectId: "default", experimentId: killed.id }, options);
    assert.equal(second.created, false, "a re-propose is a no-op");
    assert.equal(loadProject(options).sharedContext.experiments.length, 1, "the legacy experiment list is untouched");
    const variants = listWorkArtifacts("default", options).filter((item) => item.artifactId === first.artifact.artifactId);
    assert.equal(variants.length, 1, "no duplicate variant artifact");
  });

  it("keeps a materialized loser variant pending and accepts it into one lineage-preserving staged run", async () => {
    const killed = seedKilledExperiment();
    const proposed = proposeVariantFromLoser({ projectId: "default", experimentId: killed.id }, options);
    let inbox = getPendingInbox({ projectId: "default" }, options);
    assert.ok(inbox.decisions.some((item) => item.proposalArtifactId === proposed.artifact.artifactId), "materialized variant remains pending");

    const accepted = await acceptVariantProposal({
      projectId: "default",
      artifactId: proposed.artifact.artifactId,
      experiment: { intent: "Try a proof-first opener" },
      compose: gatedComposer(),
    }, options);
    assert.equal(accepted.experiment.intent, "Try a proof-first opener");
    assert.ok(accepted.path.restsOn.some((ref) => ref.type === "experiment" && ref.id === killed.id), "loser lineage reaches the path");
    assert.equal(accepted.run.pathId, accepted.path.id);
    assert.equal(runStore.get(accepted.run.id, options).id, accepted.run.id);
    assert.equal(gtmPathStore.get(accepted.path.id, options).id, accepted.path.id);
    const artifact = getWorkArtifact("default", proposed.artifact.artifactId, options);
    assert.equal(artifact.content.mutatedFrom, killed.id);
    assert.equal(artifact.content.lifecycle.runId, accepted.run.id);
    assert.deepEqual(loadProject(options).sharedContext.experiments.find((item) => item.id === killed.id).verdict, killed.verdict, "accepting the variant never touches the loser");
    inbox = getPendingInbox({ projectId: "default" }, options);
    assert.ok(!inbox.decisions.some((item) => item.proposalArtifactId === proposed.artifact.artifactId));
  });

  it("rejects a materialized variant durably without creating an experiment, path, or run", () => {
    const killed = seedKilledExperiment();
    const proposed = proposeVariantFromLoser({ projectId: "default", experimentId: killed.id }, options);
    const rejected = rejectVariantProposal({
      projectId: "default",
      artifactId: proposed.artifact.artifactId,
      reason: "Not the next bet",
    }, options);
    assert.equal(rejected.artifact.status, "rejected");
    assert.equal(rejected.artifact.content.mutatedFrom, killed.id);
    assert.equal(rejected.artifact.content.lifecycle.reason, "Not the next bet");
    assert.equal(gtmPathStore.list({ ...options, projectId: "default" }).length, 0);
    assert.equal(runStore.list({ ...options, projectId: "default" }).length, 0);
    assert.equal(loadProject(options).sharedContext.experiments.length, 1, "rejection does not state the variant");
    assert.ok(!getPendingInbox({ projectId: "default" }, options).decisions.some((item) => item.proposalArtifactId === proposed.artifact.artifactId));
  });

  it("projects a variant proposal for a loser that hasn't had one yet, and stops once proposed", () => {
    const killed = seedKilledExperiment();
    let proposals = projectLoserMutations({ projectId: "default" }, options);
    assert.equal(proposals.length, 1, "the loser surfaces a variant proposal");

    proposeVariantFromLoser({ projectId: "default", experimentId: killed.id }, options);
    proposals = projectLoserMutations({ projectId: "default" }, options);
    assert.equal(proposals.length, 0, "once proposed, it is not re-projected");
  });
});
