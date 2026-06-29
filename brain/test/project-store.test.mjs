import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { recordFlowRun } from "../src/flow-store.mjs";
import {
  createChannel,
  createProject,
  duplicateChannel,
  getProjectWithChannels,
  loadProject,
  listProjects,
  setActiveProject,
  setActiveChannel,
  updateChannel,
  updateSharedContext,
} from "../src/project-store.mjs";

describe("multi-channel GTM project", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-project-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("starts without imposing a channel portfolio", () => {
    const project = getProjectWithChannels(options);
    assert.equal(project.channels.length, 0);
    assert.equal(project.activeChannelId, null);
    assert.ok(project.sharedContext.product);
    assert.ok(project.sharedContext.founderTaste);
  });

  it("creates, duplicates, updates, and activates founder-defined channels", () => {
    const first = createChannel({
      name: "Founder field notes",
      objective: "Turn product learning into useful market narratives.",
    }, options);
    assert.equal(first.channel.id, "founder-field-notes");
    const copy = duplicateChannel(first.channel.id, {
      name: "Partner field notes",
      objective: "Adapt the motion for aligned partners.",
    }, options);
    updateChannel(copy.channel.id, { kind: "partner", enabled: true }, options);
    setActiveChannel(copy.channel.id, options);
    updateSharedContext({
      positioning: {
        category: "GTM operating environment",
        audience: "technical founders",
        status: "inferred",
      },
    }, options);
    const rawProject = loadProject(options);
    const project = getProjectWithChannels(options);
    assert.equal(rawProject.channels.length, 2, "channels are flows stored directly on the project");
    assert.equal(project.channels.length, 2);
    assert.equal(project.activeChannelId, copy.channel.id);
    assert.equal(project.channels.find((channel) => channel.id === copy.channel.id).kind, "partner");
    assert.equal(project.sharedContext.positioning.category, "GTM operating environment");
    assert.equal(project.channels.find((channel) => channel.id === copy.channel.id).positioning, undefined);
    assert.ok(project.channels.every((channel) => channel.graphId), "each channel is backed by an executable workflow graph");
  });

  it("surfaces what the last run produced on each channel (results back on the overview)", () => {
    const created = createChannel({ name: "Review mining", objective: "Mine reviews for signal." }, options);
    const before = getProjectWithChannels(options).channels.find((channel) => channel.id === created.channel.id);
    assert.equal(before.lastRunResult, null, "a never-run channel reports no results, not a seeded number");

    // A real run produces items across categories; empty categories must not appear as zeroes.
    const graph = { id: before.graphId, name: before.name, nodes: [], edges: [] };
    recordFlowRun(graph, {
      runId: "run-1", ok: true, pendingGates: [], nodes: {
        src: { nodeId: "src", category: "source", ok: true, items: [{}, {}, {}] },
        draft: { nodeId: "draft", category: "generate", ok: true, items: [{}, {}] },
        empty: { nodeId: "empty", category: "filter", ok: true, items: [] },
      },
    }, options);

    const after = getProjectWithChannels(options).channels.find((channel) => channel.id === created.channel.id);
    assert.deepEqual(after.lastRunResult, { produced: 5, byCategory: { source: 3, generate: 2 } });
  });

  it("persists and switches independent product projects", () => {
    const buffalo = createProject({ name: "Buffalo Projects" }, options).project;
    createChannel({ name: "Community proof", objective: "Turn outcomes into public proof." }, options);
    const ide = createProject({ name: "GTM IDE" }, options).project;
    createChannel({ name: "Founder outbound", objective: "Reach technical founders." }, options);

    let catalog = listProjects(options);
    assert.equal(catalog.projects.length, 2);
    assert.equal(catalog.activeProjectId, ide.id);
    assert.equal(getProjectWithChannels(options).channels[0].name, "Founder outbound");

    setActiveProject(buffalo.id, options);
    assert.equal(getProjectWithChannels(options).channels[0].name, "Community proof");
    catalog = listProjects(options);
    assert.equal(catalog.activeProjectId, buffalo.id);
  });
});
