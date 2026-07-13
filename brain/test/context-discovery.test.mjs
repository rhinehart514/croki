import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { discoverContextCandidates, promoteContextCandidate } from "../src/context-discovery.mjs";
import { buildRunGrounding } from "../src/run-grounding.mjs";
import { closePersistence } from "../src/persistence.mjs";
import { listWorkArtifacts, loadWorkArtifactStore } from "../src/work-artifact-store.mjs";

describe("bounded context discovery and promotion", () => {
  let root;
  let repository;
  let options;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "context-discovery-"));
    repository = path.join(root, "repo");
    fs.mkdirSync(path.join(repository, "whatever", "old-scout"), { recursive: true });
    fs.writeFileSync(
      path.join(repository, "whatever", "old-scout", "consolidated-verified-footprint.csv"),
      "domain,confidence\na.example,verified\nb.example,verified\nc.example,verified\n",
    );
    fs.writeFileSync(path.join(repository, "customer-interview-notes.md"), "Customer interview: the buyer cannot replace the incumbent safely.");
    fs.writeFileSync(path.join(repository, ".env"), "API_SECRET=never-read");
    options = { root: path.join(root, "store"), backend: "json" };
  });

  afterEach(() => {
    closePersistence(options);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("finds valuable evidence without a folder convention and persists nothing", () => {
    const discovery = discoverContextCandidates({
      root: repository,
      project: { name: "Example", sharedContext: { icp: { description: "teams replacing an incumbent" } } },
      question: "Could an incumbent-displacement ICP work?",
    });

    assert.equal(discovery.candidates[0].path, "whatever/old-scout/consolidated-verified-footprint.csv");
    assert.equal(discovery.candidates[0].shape.rows, 3);
    assert.match(discovery.candidates[0].finding, /3 possible accounts/);
    assert.match(discovery.candidates[0].whyItMayMatter, /incumbent-displacement ICP/);
    assert.ok(discovery.candidates.some((candidate) => candidate.path === "customer-interview-notes.md"));
    assert.ok(discovery.candidates.every((candidate) => candidate.path !== ".env"));
    assert.equal(listWorkArtifacts("project", options).length, 0, "scouting is read-only");
  });

  it("promotes only the confirmed candidate with provenance and carries it into run grounding", () => {
    const discovery = discoverContextCandidates({ root: repository, question: "incumbent displacement accounts" });
    const candidate = discovery.candidates.find((item) => item.path.endsWith("consolidated-verified-footprint.csv"));
    const expectedStoreRevision = loadWorkArtifactStore("project", options).revision;
    const promoted = promoteContextCandidate({
      projectId: "project",
      root: repository,
      candidate,
      expectedStoreRevision,
      idempotencyKey: "accept-footprint",
    }, options);

    assert.equal(promoted.created, true);
    assert.equal(promoted.artifact.kind, "context-evidence");
    assert.equal(promoted.artifact.status, "accepted");
    assert.equal(promoted.artifact.provenance, "observed");
    assert.equal(promoted.artifact.content.source.path, candidate.path);
    assert.equal(promoted.artifact.content.source.fingerprint, candidate.source.fingerprint);

    const grounding = buildRunGrounding({ id: "project", name: "Example", sharedContext: {} }, null, options);
    assert.equal(grounding.acceptedContext.length, 1);
    assert.match(grounding.acceptedContext[0].finding, /3 possible accounts/);
    assert.equal(grounding.acceptedContext[0].source.path, candidate.path);

    const retry = promoteContextCandidate({
      projectId: "project",
      root: repository,
      candidate,
      expectedStoreRevision,
      idempotencyKey: "accept-footprint",
    }, options);
    assert.equal(retry.created, false);
    assert.equal(listWorkArtifacts("project", options).length, 1);
  });

  it("refuses a candidate that changed after discovery", () => {
    const discovery = discoverContextCandidates({ root: repository, question: "verified accounts" });
    const candidate = discovery.candidates.find((item) => item.path.endsWith("consolidated-verified-footprint.csv"));
    fs.appendFileSync(path.join(repository, candidate.path), "d.example,verified\n");

    assert.throws(() => promoteContextCandidate({
      projectId: "project",
      root: repository,
      candidate,
      expectedStoreRevision: 0,
    }, options), /changed after discovery/);
  });
});
