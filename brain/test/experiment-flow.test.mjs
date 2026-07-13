import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { graphForExperimentProposal, greenlightExperimentArtifact } from "../src/experiment-flow.mjs";
import { loadFlow } from "../src/flow-store.mjs";
import { gtmPathStore, runStore } from "../src/gtm-store.mjs";
import { createProject } from "../src/project-store.mjs";
import { closePersistence } from "../src/persistence.mjs";
import { createWorkArtifact, loadWorkArtifactStore } from "../src/work-artifact-store.mjs";

describe("canonical experiment proposal flow", () => {
  let root;
  let options;
  let artifact;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "experiment-flow-"));
    options = { root, backend: "json" };
    createProject({ id: "atlas", name: "Atlas" }, options);
    artifact = createWorkArtifact("atlas", {
      id: "incumbent-test",
      kind: "experiment-proposal",
      title: "Displace the incumbent",
      status: "proposed",
      content: { intent: "Test whether the verified installed base responds to a migration offer." },
      expectedStoreRevision: loadWorkArtifactStore("atlas", options).revision,
      createdBy: { type: "founder", id: "founder" },
    }, options);
  });

  afterEach(() => {
    closePersistence(options);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("materializes one ordinary flow and one flow-run receipt without path or compiled-run records", async () => {
    const result = await greenlightExperimentArtifact({
      projectId: "atlas",
      artifactId: artifact.artifactId,
      expectedArtifactRevision: artifact.revision,
    }, options);

    assert.equal(result.created, true);
    assert.equal(result.artifact.status, "greenlit");
    assert.equal(result.artifact.content.lifecycle.flowId, result.flow.id);
    assert.equal(result.artifact.content.lifecycle.runId, result.run.id);
    assert.deepEqual(result.result.pendingGates, []);
    assert.equal(result.result.nodes.work.ok, true, "greenlight begins the local work");
    assert.equal(loadFlow(result.flow.id, null, options).runs.length, 1);
    assert.equal(gtmPathStore.list(options).length, 0, "no parallel GTM path is minted");
    assert.equal(runStore.list(options).length, 0, "no parallel compiled-run record is minted");
  });

  it("is retry-safe and never records a second run", async () => {
    const first = await greenlightExperimentArtifact({ projectId: "atlas", artifactId: artifact.artifactId, expectedArtifactRevision: 1 }, options);
    const retry = await greenlightExperimentArtifact({ projectId: "atlas", artifactId: artifact.artifactId, expectedArtifactRevision: 1 }, options);

    assert.equal(retry.created, false);
    assert.equal(retry.run.id, first.run.id);
    assert.equal(loadFlow(first.flow.id, null, options).runs.length, 1);
  });

  it("builds a local-only graph with the founder gate still in the topology", () => {
    const graph = graphForExperimentProposal("atlas", artifact);
    assert.deepEqual(graph.nodes.map((node) => [node.id, node.category, node.connector]), [
      ["proposal", "source", "manual"],
      ["greenlight", "gate", "default"],
      ["work", "execute", "local"],
      ["outcome", "measure", "default"],
    ]);
    assert.ok(graph.nodes.every((node) => !["gmail", "http", "deploy", "slack"].includes(node.connector)));
  });
});
