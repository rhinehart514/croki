import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  createProject, listProjects, loadProject, loadProjectCatalog, saveProject,
} from "../src/project-store.mjs";
import { deleteProject, mergeProjects } from "../src/project-merge.mjs";
import { loadFeedbackLedger, saveFeedbackLedger } from "../src/feedback-ledger.mjs";
import { createOperatorSession, listOperatorSessions } from "../src/operator-store.mjs";
import { createGtmIdea, listGtmIdeas } from "../src/idea-store.mjs";
import { appendInput, listInputs } from "../src/inputs-store.mjs";
import { getCredential, setCredential } from "../src/credential-store.mjs";

describe("project merge + delete", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-merge-"));
    options = { root: parent };
    createProject({ name: "Alpha" }, options); // replaces the empty starter → catalog = [alpha]
    createProject({ name: "Beta" }, options); // → [alpha, beta]
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  function seed(projectId, { signalId, channelId } = {}) {
    if (signalId) {
      const ledger = loadFeedbackLedger(projectId, options);
      saveFeedbackLedger({ ...ledger, projectId, signals: [...ledger.signals, { id: signalId, projectId, kind: "gate_approved" }] }, options);
    }
    if (channelId) {
      const project = loadProject({ ...options, projectId });
      saveProject({ ...project, channels: [...(project.channels ?? []), { id: channelId, title: channelId }] }, options);
    }
  }

  it("folds a source project's records into the target and removes the source", () => {
    seed("beta", { signalId: "sig-beta", channelId: "chan-beta" });
    seed("alpha", { channelId: "chan-alpha" });
    createOperatorSession({ goal: "beta goal", projectId: "beta" }, options);

    mergeProjects(["beta"], "alpha", options);

    // Feedback signal moved.
    assert.deepEqual(loadFeedbackLedger("alpha", options).signals.map((s) => s.id), ["sig-beta"]);

    // Operator session repointed in place.
    assert.deepEqual(listOperatorSessions({ ...options, projectId: "alpha" }).map((s) => s.goal), ["beta goal"]);
    assert.equal(listOperatorSessions({ ...options, projectId: "beta" }).length, 0);

    // Channels unioned on the target.
    const channels = loadProject({ ...options, projectId: "alpha" }).channels.map((c) => c.id).sort();
    assert.deepEqual(channels, ["chan-alpha", "chan-beta"]);

    // Source gone from the catalog; target is active.
    const catalog = loadProjectCatalog(options);
    assert.deepEqual(catalog.projects.map((p) => p.id), ["alpha"]);
    assert.equal(catalog.activeProjectId, "alpha");

    // Source store files purged.
    assert.equal(fs.existsSync(path.join(parent, "feedback-ledger", "beta.json")), false);
  });

  it("repoints a source project's graded ideas (GtmIdea) to the target", () => {
    const idea = createGtmIdea({ projectId: "beta", goal: "5 pilots", pitch: "Buffalo-local outbound", verdict: "survived" }, options);

    mergeProjects(["beta"], "alpha", options);

    const alphaIdeas = listGtmIdeas({ ...options, projectId: "alpha" });
    assert.deepEqual(alphaIdeas.map((i) => i.id), [idea.id]);
    assert.equal(alphaIdeas[0].projectId, "alpha"); // repointed in place, not dropped
    assert.equal(listGtmIdeas({ ...options, projectId: "beta" }).length, 0);
  });

  it("moves a source project's captured inputs to the target, repointing projectId", () => {
    appendInput("beta", { kind: "signup", source: "landing-page", payload: { email: "x@y.z" } }, options);

    mergeProjects(["beta"], "alpha", options);

    const alphaInputs = listInputs("alpha", options);
    assert.equal(alphaInputs.length, 1);
    assert.equal(alphaInputs[0].kind, "signup");
    assert.equal(alphaInputs[0].projectId, "alpha"); // record repointed by the move
    assert.equal(listInputs("beta", options).length, 0); // source store purged
  });

  it("keeps the target's pasted credentials authoritative and purges the source's", () => {
    setCredential("alpha", { provider: "clay", token: "sk-alpha" }, options);
    setCredential("beta", { provider: "clay", token: "sk-beta" }, options);

    mergeProjects(["beta"], "alpha", options);

    // Target wins (credentials have no move step) and the source's pasted key is purged with its file.
    assert.equal(getCredential("alpha", "clay", options).token, "sk-alpha");
    assert.equal(getCredential("beta", "clay", options), null);
    assert.equal(fs.existsSync(path.join(parent, "credentials", "beta.json")), false);
  });

  it("is idempotent on re-running the same merge (dedupe by id)", () => {
    seed("beta", { signalId: "sig-beta" });
    mergeProjects(["beta"], "alpha", options);
    // Re-create beta with the same content and merge again — no duplicate records.
    createProject({ name: "Beta" }, options); // new beta id "beta" (alpha+beta exist → "beta")
    seed("beta", { signalId: "sig-beta" });
    mergeProjects(["beta"], "alpha", options);
    assert.equal(loadFeedbackLedger("alpha", options).signals.length, 1);
  });

  it("refuses to merge a project into itself or an unknown target", () => {
    assert.throws(() => mergeProjects(["alpha"], "alpha", options), /No source projects/);
    assert.throws(() => mergeProjects(["beta"], "ghost", options), /target not found/i);
    assert.throws(() => mergeProjects(["ghost"], "alpha", options), /source not found/i);
  });

  it("deletes a project and purges its stores, never the last one", () => {
    seed("beta", { signalId: "sig-beta" });
    deleteProject("beta", options);
    assert.deepEqual(listProjects(options).projects.map((p) => p.id), ["alpha"]);
    assert.equal(fs.existsSync(path.join(parent, "feedback-ledger", "beta.json")), false);
    assert.throws(() => deleteProject("alpha", options), /last remaining/i);
  });
});
