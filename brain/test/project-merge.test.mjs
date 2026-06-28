import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  createProject, listProjects, loadProject, loadProjectCatalog, saveProject,
} from "../src/project-store.mjs";
import { deleteProject, mergeProjects } from "../src/project-merge.mjs";
import { listOutcomePrograms, loadProgramStore, saveProgramStore } from "../src/program-store.mjs";
import { loadFeedbackLedger, saveFeedbackLedger } from "../src/feedback-ledger.mjs";
import { createOperatorSession, listOperatorSessions } from "../src/operator-store.mjs";

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

  function seed(projectId, { programName, signalId, channelId } = {}) {
    if (programName) {
      const store = loadProgramStore(projectId, options);
      saveProgramStore({
        ...store,
        projectId,
        programs: [...store.programs, { id: `program-${projectId}`, projectId, name: programName, graphId: `${projectId}--flow` }],
      }, options);
    }
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
    seed("beta", { programName: "Beta program", signalId: "sig-beta", channelId: "chan-beta" });
    seed("alpha", { channelId: "chan-alpha" });
    createOperatorSession({ goal: "beta goal", projectId: "beta" }, options);

    mergeProjects(["beta"], "alpha", options);

    // Programs moved and repointed.
    const programs = listOutcomePrograms("alpha", options);
    assert.equal(programs.length, 1);
    assert.equal(programs[0].name, "Beta program");
    assert.equal(programs[0].projectId, "alpha");

    // Feedback signal moved.
    assert.deepEqual(loadFeedbackLedger("alpha", options).signals.map((s) => s.id), ["sig-beta"]);

    // Operator session repointed in place.
    assert.deepEqual(listOperatorSessions({ ...options, projectId: "alpha" }).map((s) => s.goal), ["beta goal"]);
    assert.equal(listOperatorSessions({ ...options, projectId: "beta" }).length, 0);

    // Legacy channels unioned on the target.
    const channels = loadProject({ ...options, projectId: "alpha" }).channels.map((c) => c.id).sort();
    assert.deepEqual(channels, ["chan-alpha", "chan-beta"]);

    // Source gone from the catalog; target is active.
    const catalog = loadProjectCatalog(options);
    assert.deepEqual(catalog.projects.map((p) => p.id), ["alpha"]);
    assert.equal(catalog.activeProjectId, "alpha");

    // Source store files purged.
    assert.equal(fs.existsSync(path.join(parent, "programs", "beta.json")), false);
    assert.equal(fs.existsSync(path.join(parent, "feedback-ledger", "beta.json")), false);
  });

  it("is idempotent on re-running the same merge (dedupe by id)", () => {
    seed("beta", { programName: "Beta program", signalId: "sig-beta" });
    mergeProjects(["beta"], "alpha", options);
    // Re-create beta with the same content and merge again — no duplicate records.
    createProject({ name: "Beta" }, options); // new beta id "beta" (alpha+beta exist → "beta")
    seed("beta", { programName: "Beta program", signalId: "sig-beta" });
    mergeProjects(["beta"], "alpha", options);
    assert.equal(listOutcomePrograms("alpha", options).length, 1);
    assert.equal(loadFeedbackLedger("alpha", options).signals.length, 1);
  });

  it("refuses to merge a project into itself or an unknown target", () => {
    assert.throws(() => mergeProjects(["alpha"], "alpha", options), /No source projects/);
    assert.throws(() => mergeProjects(["beta"], "ghost", options), /target not found/i);
    assert.throws(() => mergeProjects(["ghost"], "alpha", options), /source not found/i);
  });

  it("deletes a project and purges its stores, never the last one", () => {
    seed("beta", { programName: "Beta program" });
    deleteProject("beta", options);
    assert.deepEqual(listProjects(options).projects.map((p) => p.id), ["alpha"]);
    assert.equal(fs.existsSync(path.join(parent, "programs", "beta.json")), false);
    assert.throws(() => deleteProject("alpha", options), /last remaining/i);
  });
});
