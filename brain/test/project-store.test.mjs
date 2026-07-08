import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { recordFlowRun } from "../src/flow-store.mjs";
import {
  applySharedContextToGraph,
  createChannel,
  createProject,
  duplicateChannel,
  getAgentProfile,
  getProjectWithChannels,
  loadProject,
  listProjects,
  registerComposedChannel,
  setActiveProject,
  setActiveChannel,
  setChannelIcp,
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

  it("derives a per-agent taste profile from the project's run ledger, and reads honest zeros for an unseen agent", () => {
    createChannel({ name: "Founder outbound", objective: "Reach technical founders." }, options);
    const projectId = loadProject(options).id;
    const channel = getProjectWithChannels(options).channels[0];
    const graph = { id: channel.graphId, name: channel.name, nodes: [], edges: [] };
    recordFlowRun(graph, {
      runId: "run-1", ok: true, pendingGates: [], nodes: {
        gate: {
          nodeId: "gate", category: "gate", ok: true, items: [
            { name: "A", email: "a@x.com", draft: "warm note from Ada", approvalStatus: "approved", agentRef: "ada" },
            { name: "B", email: "b@x.com", draft: "stiff pitch from Boone", approvalStatus: "rejected", agentRef: "boone" },
          ],
        },
      },
    }, options);

    const ada = getAgentProfile(projectId, "ada", options);
    assert.equal(ada.hasRuns, true);
    assert.equal(ada.runCount, 1);
    assert.deepEqual(ada.counts, { approved: 1, rejected: 0, edits: 0 });
    assert.match(ada.voice, /warm note from Ada/);

    const ghost = getAgentProfile(projectId, "never-composed", options);
    assert.equal(ghost.hasRuns, false);
    assert.equal(ghost.runCount, 0);
    assert.deepEqual(ghost.counts, { approved: 0, rejected: 0, edits: 0 });
    assert.equal(ghost.note, "no runs yet");
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

  it("links a pipeline to an ICP and reverses the link, never touching autonomy/blessedPattern", () => {
    const { channel } = createChannel({ name: "PCO Outbound" }, options);
    assert.equal(channel.autonomy, "draft");

    const linked = setChannelIcp(channel.id, { key: "smb-owners", label: "SMB owners" }, options).channel;
    assert.deepEqual(linked.icp, { key: "smb-owners", label: "SMB owners" });
    assert.equal(linked.autonomy, "draft", "linking an ICP never promotes the pipeline");
    assert.equal(linked.blessedPattern, null, "linking an ICP never forges a blessed pattern");

    // A bare string key is accepted; the label is optional.
    const relinked = setChannelIcp(channel.id, "series-a", options).channel;
    assert.deepEqual(relinked.icp, { key: "series-a" });

    // Passing null — or a blank key — clears the link (reversible).
    const cleared = setChannelIcp(channel.id, null, options).channel;
    assert.equal(cleared.icp, undefined);
    const blanked = setChannelIcp(channel.id, { key: "  " }, options).channel;
    assert.equal(blanked.icp, undefined);
  });

  it("refuses to link an ICP on an unknown pipeline", () => {
    assert.throws(() => setChannelIcp("does-not-exist", { key: "x" }, options), /Channel not found/);
  });

  it("a pipeline carries its own offer in the founder's words — an open shape, cleared reversibly", () => {
    const { channel } = createChannel({ name: "Launch post" }, options);
    assert.equal(channel.offer, undefined, "no offer until the founder or composer states one");

    // A bare statement string is enough — no promo schema required.
    const stated = updateChannel(channel.id, { offer: "50% off, this post only, through Friday" }, options).channel;
    assert.deepEqual(stated.offer, { statement: "50% off, this post only, through Friday" });

    // The composer may attach whatever extra fields it chooses; they persist untouched.
    const shaped = updateChannel(channel.id, {
      offer: { statement: "First 10 signups get onboarding free", expires: "2026-07-04", code: "LAUNCH10" },
    }, options).channel;
    assert.equal(shaped.offer.statement, "First 10 signups get onboarding free");
    assert.equal(shaped.offer.expires, "2026-07-04");
    assert.equal(shaped.offer.code, "LAUNCH10");

    // Persisted on the channel and readable back off the project.
    const readBack = getProjectWithChannels(options).channels.find((c) => c.id === channel.id);
    assert.equal(readBack.offer.statement, "First 10 signups get onboarding free");

    // The project-level offer stays the standing default, untouched by a pipeline deal.
    const project = loadProject(options);
    assert.deepEqual(project.sharedContext.offer.price, "", "the project offer is not overwritten");

    // Clearing is one call; an offer needs a plain-words statement.
    const cleared = updateChannel(channel.id, { offer: null }, options).channel;
    assert.equal(cleared.offer, undefined);
    assert.throws(() => updateChannel(channel.id, { offer: { code: "NOPE" } }, options), /plain-words statement/);
  });

  it("a channel created or registered with an offer keeps it", () => {
    const created = createChannel({ name: "Demo push", offer: "Free migration for the first 5 teams" }, options).channel;
    assert.deepEqual(created.offer, { statement: "Free migration for the first 5 teams" });

    const registered = registerComposedChannel({
      id: "x-launch", graphId: "x-launch", name: "X launch",
      offer: { statement: "Redeem DROVER50 for half off" },
    }, options).channel;
    assert.equal(registered.offer.statement, "Redeem DROVER50 for half off");
  });

  it("the pipeline's offer rides into the run context, falling back to the project-level offer", () => {
    const project = loadProject(options);
    const graph = {
      id: "g1",
      nodes: [{ id: "ctx-learning", category: "context", connector: "product", label: "Learning", config: {} }],
      edges: [],
    };

    // With a channel offer, the run's context node carries the pipeline's own deal.
    const withChannel = applySharedContextToGraph(graph, project.sharedContext, {
      channelOffer: { statement: "50% off the first month" },
    });
    assert.equal(withChannel.nodes[0].config.offer.statement, "50% off the first month");

    // Without one, the project-level sharedContext.offer is the standing default.
    const withoutChannel = applySharedContextToGraph(graph, project.sharedContext);
    assert.deepEqual(withoutChannel.nodes[0].config.offer, project.sharedContext.offer);
  });
});
