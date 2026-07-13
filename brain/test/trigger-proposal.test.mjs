// Outside-trigger → proposed experiment (fourth birth source) — the hard guarantee: an outside trigger
// PROPOSES an experiment, it never runs one, never sends, never routes the input into a live channel.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  acceptExperimentProposal,
  deriveExperimentFromTrigger,
  projectTriggerProposals,
  proposeExperimentFromTrigger,
} from "../src/trigger-proposal.mjs";
import { appendInput, listInputs } from "../src/inputs-store.mjs";
import { loadProject } from "../src/project-store.mjs";
import { getPendingInbox } from "../src/pending-inbox.mjs";
import { getWorkArtifact, listWorkArtifacts } from "../src/work-artifact-store.mjs";
import { gtmPathStore, runStore } from "../src/gtm-store.mjs";

function gatedComposer() {
  return async () => ({
    ok: true,
    nodes: [
      { id: "src", category: "source", connector: "manual", label: "Input" },
      { id: "draft", kind: "agent", ref: "drafter", label: "Prepare", agentPrompt: "prepare the experiment" },
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

describe("outside-trigger → proposed experiment — proposes, never runs", () => {
  let root;
  let options;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-trigger-"));
    options = { root };
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("derives a PROPOSED open experiment off a trigger — never a verdict, never running", () => {
    const input = { id: "input-1", kind: "signup", source: "landing-page", status: "unrouted", payload: {} };
    const experiment = deriveExperimentFromTrigger(input);
    assert.ok(experiment, "an outside trigger yields a proposed experiment");
    assert.equal(experiment.origin, "proposed");
    assert.equal(experiment.status, "proposed", "born as a proposal, not running");
    assert.ok(!experiment.verdict, "a trigger-born experiment carries no verdict");
    assert.equal(experiment.bornFrom.id, "input-1", "it points back at the input that triggered it");
  });

  it("proposing off a trigger appends a proposal and NEVER runs or routes into a live channel", () => {
    const input = appendInput("default", { kind: "signup", source: "landing-page", payload: { email: "a@b.com" } }, options);

    const { experiment, artifact, created } = proposeExperimentFromTrigger({ projectId: "default", inputId: input.id }, options);
    assert.equal(created, true);

    // The experiment is visible, editable canvas material awaiting greenlight — not a hidden legacy
    // experiment record, not running, and carrying no verdict.
    assert.equal(loadProject(options).sharedContext.experiments?.length ?? 0, 0);
    assert.equal(listWorkArtifacts("default", options).length, 1);
    const proposed = getWorkArtifact("default", artifact.artifactId, options);
    assert.equal(proposed.kind, "experiment-proposal");
    assert.equal(proposed.status, "proposed", "the experiment is proposed, never auto-run");
    assert.equal(proposed.content.id, experiment.id);
    assert.ok(!proposed.content.verdict);

    // The input is stamped routed-to-PROPOSAL — NOT routed into a live channel, and never run/sent.
    const after = listInputs("default", options).find((i) => i.id === input.id);
    assert.equal(after.status, "routed", "the input leaves the raw inbox");
    assert.equal(after.routedTo, `work-artifact:${artifact.artifactId}`, "routed to its canvas proposal, NOT a live channel");
    assert.equal(listInputs("default", options).length, 1, "no run, no second input, nothing sent");
  });

  it("surfaces the trigger proposal in the pending inbox for greenlight, with a no-run promise", () => {
    appendInput("default", { kind: "fork", source: "github", payload: {} }, options);
    const inbox = getPendingInbox({ projectId: "default" }, options);
    const row = inbox.decisions.find((d) => d.kind === "trigger-proposal");
    assert.ok(row, "an outside trigger surfaces a trigger-proposal decision");
    assert.match(row.summary, /Nothing runs until you greenlight/i);
  });

  it("is idempotent — projecting after proposing does not re-propose", () => {
    const input = appendInput("default", { kind: "signup", source: "webhook", payload: {} }, options);
    let proposals = projectTriggerProposals({ projectId: "default" }, options);
    assert.equal(proposals.length, 1);
    proposeExperimentFromTrigger({ projectId: "default", inputId: input.id }, options);
    // Once proposed, the input is routed, so it is no longer an unrouted trigger to re-propose.
    proposals = projectTriggerProposals({ projectId: "default" }, options);
    assert.equal(proposals.length, 0, "a proposed trigger is not re-projected");
  });

  it("keeps a materialized proposal pending, then accepts an edit into a stated experiment, path, and staged run", async () => {
    const input = appendInput("default", { kind: "signup", source: "webhook", payload: {} }, options);
    const proposed = proposeExperimentFromTrigger({ projectId: "default", inputId: input.id }, options);

    let inbox = getPendingInbox({ projectId: "default" }, options);
    const pending = inbox.decisions.find((item) => item.proposalArtifactId === proposed.artifact.artifactId);
    assert.ok(pending, "materialization does not make the founder decision disappear");
    assert.equal(pending.experimentId, proposed.experiment.id);
    assert.deepEqual(pending.lineage, proposed.experiment.bornFrom);

    const accepted = await acceptExperimentProposal({
      projectId: "default",
      artifactId: proposed.artifact.artifactId,
      experiment: { intent: "Test a guided signup follow-up" },
      compose: gatedComposer(),
    }, options);

    assert.equal(accepted.experiment.intent, "Test a guided signup follow-up");
    assert.equal(accepted.experiment.status, "staged");
    assert.equal(accepted.path.status, "selected");
    assert.ok(accepted.path.restsOn.some((ref) => ref.type === "input" && ref.id === input.id), "trigger lineage reaches the path");
    assert.equal(accepted.run.status, "staged");
    assert.equal(accepted.run.pathId, accepted.path.id);
    assert.equal(runStore.get(accepted.run.id, options).id, accepted.run.id);
    assert.equal(gtmPathStore.get(accepted.path.id, options).id, accepted.path.id);

    const artifact = getWorkArtifact("default", proposed.artifact.artifactId, options);
    assert.equal(artifact.status, "accepted");
    assert.equal(artifact.content.bornFrom.id, input.id, "the founder edit cannot erase trigger lineage");
    assert.equal(artifact.content.lifecycle.runId, accepted.run.id, "greenlight receives the staged run identity");
    inbox = getPendingInbox({ projectId: "default" }, options);
    assert.ok(!inbox.decisions.some((item) => item.proposalArtifactId === proposed.artifact.artifactId));

    const retry = await acceptExperimentProposal({
      projectId: "default",
      artifactId: proposed.artifact.artifactId,
      compose: gatedComposer(),
    }, options);
    assert.equal(retry.created, false);
    assert.equal(retry.run.id, accepted.run.id, "acceptance retry does not stage a second run");
  });

  it("a founder-entered note is a SEED, not an outside trigger — not force-proposed", () => {
    const note = { kind: "note", source: "founder-entered", status: "unrouted", payload: {} };
    assert.equal(deriveExperimentFromTrigger(note), null, "a founder seed is a distinct birth source");
  });
});
