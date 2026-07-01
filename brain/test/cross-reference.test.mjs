import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createChannel, updateSharedContext, setChannelIcp, getProjectChannels, loadProject } from "../src/project-store.mjs";
import { promoteEntrants } from "../src/person-store.mjs";
import { loadFlow, saveFlow } from "../src/flow-store.mjs";
import { applyGraphOperations } from "../src/graph-operations.mjs";
import { findReferences, listSharedKernel, deriveChannelFeeds, deriveDirectedFeeds, createDerivedSourceLoader } from "../src/cross-reference.mjs";

describe("cross-reference index — where does X appear across channels", () => {
  let parent;
  let options;
  const projectId = "default";

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-xref-"));
    options = { root: parent };
    createChannel({ name: "Outbound", objective: "Reach operators who value attribution clarity." }, options);
    createChannel({ name: "Events", objective: "Show up where buyers gather." }, options);
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("traces a person to its durable cross-channel appearances", () => {
    promoteEntrants(projectId, "outbound", "run-1", [{ name: "Jane Roe", email: "jane@acme.com", nowTrigger: "hiring" }], options);
    const { promoted } = promoteEntrants(projectId, "events", "run-9", [{ name: "Jane Roe", email: "jane@acme.com", nowTrigger: "spoke" }], options);
    const ref = findReferences(projectId, { kind: "person", id: promoted[0].id }, options);
    assert.equal(ref.kind, "person");
    assert.equal(ref.referenceCount, 2);
    assert.deepEqual(ref.channelIds.sort(), ["events", "outbound"]);
    assert.equal(ref.references.every((r) => r.where === "appearance"), true);
  });

  it("returns no references for an unknown person id", () => {
    const ref = findReferences(projectId, { kind: "person", id: "person-nope" }, options);
    assert.equal(ref.referenceCount, 0);
    assert.equal(ref.person, null);
  });

  it("finds the channel an experiment runs in, plus same-variable siblings", () => {
    updateSharedContext({
      experiments: [
        { id: "exp-1", channelId: "outbound", variable: "subject-line", hypothesis: "Shorter subjects lift replies." },
        { id: "exp-2", channelId: "events", variable: "subject-line", hypothesis: "Same variable, other channel." },
        { id: "exp-3", channelId: "events", variable: "send-time", hypothesis: "Unrelated." },
      ],
    }, options);
    const ref = findReferences(projectId, { kind: "experiment", id: "exp-1" }, options);
    assert.deepEqual(ref.channelIds.sort(), ["events", "outbound"]); // exp-1 + same-variable exp-2
    assert.equal(ref.experiment.id, "exp-1");
  });

  it("finds channels whose metadata carries a claim", () => {
    const ref = findReferences(projectId, { kind: "claim", id: "attribution clarity" }, options);
    assert.deepEqual(ref.channelIds, ["outbound"]);
    assert.equal(ref.claim, "attribution clarity");
  });

  it("resolves a structured claim by id and by index, then traces it to channels", () => {
    updateSharedContext({
      claims: [{ text: "attribution clarity" }, { text: "show up where buyers gather" }],
    }, options);
    const byId = findReferences(projectId, { kind: "claim", id: "claim-attribution-clarity-0" }, options);
    assert.equal(byId.claim, "attribution clarity");
    assert.equal(byId.claimId, "claim-attribution-clarity-0");
    assert.deepEqual(byId.channelIds, ["outbound"]);

    const byIndex = findReferences(projectId, { kind: "claim", id: 1 }, options);
    assert.equal(byIndex.claim, "show up where buyers gather");
    assert.deepEqual(byIndex.channelIds, ["events"]);
  });

  it("treats the ICP as shared across every channel when it has no narrowing identifier", () => {
    const ref = findReferences(projectId, { kind: "icp", id: "" }, options);
    assert.equal(ref.channelCount, 2);
  });

  it("rejects an unsupported reference kind", () => {
    assert.throws(() => findReferences(projectId, { kind: "widget", id: "x" }, options), /Unsupported cross-reference kind/);
  });
});

describe("channel feeds — undirected linkage between channels", () => {
  let parent;
  let options;
  const projectId = "default";

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-feeds-"));
    options = { root: parent };
    createChannel({ name: "Outbound", objective: "Reach operators who value attribution clarity." }, options);
    createChannel({ name: "Events", objective: "Show up where buyers gather." }, options);
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("links two channels through a person who appears in both", () => {
    promoteEntrants(projectId, "outbound", "run-1", [{ name: "Jane Roe", email: "jane@acme.com" }], options);
    promoteEntrants(projectId, "events", "run-2", [{ name: "Jane Roe", email: "jane@acme.com" }], options);
    const { feeds } = deriveChannelFeeds(projectId, options);
    assert.equal(feeds.length, 1);
    assert.equal(feeds[0].fromChannel, "events"); // alphabetically-smaller id of the pair
    assert.equal(feeds[0].toChannel, "outbound");
    assert.equal(feeds[0].sharedPeople, 1);
    assert.equal(feeds[0].sharedClaims, 0);
    assert.equal(feeds[0].sharedExperiments, 0);
    assert.equal(feeds[0].total, 1);
    assert.equal(feeds[0].label, "1 shared prospect");
  });

  it("yields one feed per channel pair for a person across three channels", () => {
    createChannel({ name: "Content", objective: "Publish where buyers read." }, options);
    const person = [{ name: "Jane Roe", email: "jane@acme.com" }];
    promoteEntrants(projectId, "outbound", "run-1", person, options);
    promoteEntrants(projectId, "events", "run-2", person, options);
    promoteEntrants(projectId, "content", "run-3", person, options);
    const { feeds } = deriveChannelFeeds(projectId, options);
    assert.equal(feeds.length, 3); // 3 channels → 3 unordered pairs
    assert.equal(feeds.every((feed) => feed.sharedPeople === 1 && feed.total === 1), true);
    const pairs = feeds.map((feed) => `${feed.fromChannel}|${feed.toChannel}`).sort();
    assert.deepEqual(pairs, ["content|events", "content|outbound", "events|outbound"]);
  });

  it("links channels through a shared claim, labeled by the claim text", () => {
    // A claim links the channels whose metadata text carries it. Give both channels an objective that
    // shares a phrase, then make that phrase the claim so it surfaces in both haystacks.
    createChannel({ name: "Webinars", objective: "Earn attribution clarity with live demos." }, options);
    updateSharedContext({
      claims: [{ text: "attribution clarity" }],
    }, options);
    const { feeds } = deriveChannelFeeds(projectId, options);
    // Outbound and Webinars both mention "attribution clarity"; Events does not.
    const claimFeed = feeds.find((feed) => feed.sharedClaims > 0);
    assert.ok(claimFeed, "expected a claim-linked feed");
    assert.deepEqual([claimFeed.fromChannel, claimFeed.toChannel].sort(), ["outbound", "webinars"]);
    assert.equal(claimFeed.sharedClaims, 1);
    assert.equal(claimFeed.label, "shared claim: attribution clarity");
  });

  it("links channels through a shared experiment variable", () => {
    updateSharedContext({
      experiments: [
        { id: "exp-1", channelId: "outbound", variable: "subject-line" },
        { id: "exp-2", channelId: "events", variable: "subject-line" },
      ],
    }, options);
    const { feeds } = deriveChannelFeeds(projectId, options);
    assert.equal(feeds.length, 1);
    assert.equal(feeds[0].sharedExperiments, 1);
    assert.equal(feeds[0].total, 1);
    assert.equal(feeds[0].label, "shared test: subject-line");
  });

  it("returns no feeds when nothing is shared across channels", () => {
    promoteEntrants(projectId, "outbound", "run-1", [{ name: "Only Here", email: "only@one.com" }], options);
    const { feeds } = deriveChannelFeeds(projectId, options);
    assert.deepEqual(feeds, []);
  });

  it("sorts feeds by total descending", () => {
    createChannel({ name: "Content", objective: "Publish where buyers read." }, options);
    // outbound↔events share two people; outbound↔content share one.
    const a = [{ name: "Jane Roe", email: "jane@acme.com" }];
    const b = [{ name: "John Doe", email: "john@beta.com" }];
    promoteEntrants(projectId, "outbound", "run-1", [...a, ...b], options);
    promoteEntrants(projectId, "events", "run-2", [...a, ...b], options);
    promoteEntrants(projectId, "content", "run-3", a, options);
    const { feeds } = deriveChannelFeeds(projectId, options);
    assert.equal(feeds.length, 3);
    assert.equal(feeds[0].total, 2); // events↔outbound, the strongest link, first
    assert.equal(feeds[0].sharedPeople, 2);
    for (let i = 1; i < feeds.length; i += 1) {
      assert.ok(feeds[i - 1].total >= feeds[i].total, "feeds must be sorted by total desc");
    }
  });

  it("returns { feeds: [] } cleanly for an empty project with no channels", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-feeds-empty-"));
    try {
      const { feeds } = deriveChannelFeeds(projectId, { root: empty });
      assert.deepEqual(feeds, []);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("directed feeds — channels wired to pull another channel's output", () => {
  let parent;
  let options;
  const projectId = "default";

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-directed-"));
    options = { root: parent };
    createChannel({ name: "Source Channel", objective: "Find operators." }, options);
    createChannel({ name: "Derived Channel", objective: "Convert them." }, options);
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  function channelByName(name) {
    return getProjectChannels(loadProject(options), options).find((c) => c.name === name);
  }

  // Wire `channelName`'s source to pull from `sourceChannelId` — exactly what the drag-to-connect
  // endpoint does (set a source node's config.sourceChannelId).
  function wireDerived(channelName, sourceChannelId) {
    const channel = channelByName(channelName);
    const flow = loadFlow(channel.graphId, null, options);
    const base = flow.graph ?? { id: channel.graphId, name: channelName, version: "1.0.0", nodes: [], edges: [] };
    const applied = applyGraphOperations(base, [
      { type: "add_node", node: { id: "src-derived", category: "source", connector: "manual", label: "Pull from channel", config: { sourceChannelId }, position: { x: 0, y: 0 } } },
    ]);
    saveFlow(applied.graph, options);
  }

  it("emits a directed feed from a source node carrying sourceChannelId", () => {
    const source = channelByName("Source Channel");
    wireDerived("Derived Channel", source.id);
    const { feeds } = deriveDirectedFeeds(projectId, options);
    assert.equal(feeds.length, 1);
    assert.equal(feeds[0].fromChannel, source.id);
    assert.equal(feeds[0].toChannel, channelByName("Derived Channel").id);
    assert.equal(feeds[0].sourceNodeId, "src-derived");
  });

  it("drops a feed whose source channel no longer exists", () => {
    wireDerived("Derived Channel", "ghost-channel-that-was-deleted");
    assert.equal(deriveDirectedFeeds(projectId, options).feeds.length, 0);
  });

  it("refuses to draw a self-feed", () => {
    const derived = channelByName("Derived Channel");
    wireDerived("Derived Channel", derived.id);
    assert.equal(deriveDirectedFeeds(projectId, options).feeds.length, 0);
  });

  it("the cross-channel loader returns [] for a channel with no runs", async () => {
    const load = createDerivedSourceLoader(options);
    assert.deepEqual(await load(channelByName("Source Channel").id), []);
    assert.deepEqual(await load("nonexistent"), []);
  });
});

describe("listSharedKernel — the project's cross-pipeline object model in one read", () => {
  let parent;
  let options;
  const projectId = "default";

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-kernel-"));
    options = { root: parent };
    createChannel({ name: "Outbound", objective: "Reach operators who value attribution clarity." }, options);
    createChannel({ name: "Events", objective: "Show up where buyers gather." }, options);
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("is honest-blank on an empty project: people [], one base ICP entry, claims []", () => {
    const kernel = listSharedKernel(projectId, options);
    assert.equal(kernel.projectId, "default");
    assert.deepEqual(kernel.people, []);
    assert.deepEqual(kernel.claims, []);
    assert.equal(kernel.icps.length, 1, "the base ICP entry is always present");
    assert.equal(kernel.icps[0].id, null);
    assert.equal(kernel.icps[0].label, null, "no stated ICP ⇒ null label, never a fake");
  });

  it("lists each Person with its pipeline appearances and cross-pipeline fatigue", () => {
    promoteEntrants(projectId, "outbound", "run-1", [{ name: "Jane Roe", email: "jane@acme.com", nowTrigger: "hiring" }], options);
    promoteEntrants(projectId, "events", "run-2", [{ name: "Jane Roe", email: "jane@acme.com", nowTrigger: "spoke" }], options);
    promoteEntrants(projectId, "outbound", "run-3", [{ name: "Al Solo", email: "al@one.com" }], options);

    const kernel = listSharedKernel(projectId, options);
    assert.equal(kernel.people.length, 2);
    const jane = kernel.people.find((p) => p.email === "jane@acme.com");
    assert.deepEqual([...jane.channelIds].sort(), ["events", "outbound"]);
    assert.deepEqual([...jane.channelNames].sort(), ["Events", "Outbound"]);
    assert.equal(jane.channelCount, 2);
    assert.equal(jane.appearanceCount, 2);
    assert.equal(jane.fatigue, 2, "in two pipelines ⇒ fatigue 2");
    assert.equal(jane.name, "Jane Roe");
    const al = kernel.people.find((p) => p.email === "al@one.com");
    assert.equal(al.fatigue, 1, "one pipeline ⇒ fatigue 1");
  });

  it("lists the stated ICP as the base plus a distinct entry per founder-linked key", () => {
    updateSharedContext({ icp: { label: "Dev-tool founders", query: "devtools", industry: "SaaS" } }, options);
    setChannelIcp("outbound", { key: "smb", label: "SMB owners" }, options);

    const kernel = listSharedKernel(projectId, options);
    const base = kernel.icps.find((i) => i.id === null);
    assert.equal(base.label, "Dev-tool founders");
    assert.equal(base.industry, "SaaS");
    const linked = kernel.icps.find((i) => i.id === "smb");
    assert.ok(linked, "a founder-linked ICP surfaces as its own entry");
    assert.equal(linked.label, "SMB owners");
    assert.deepEqual(linked.channelIds, ["outbound"]);
    assert.deepEqual(linked.channelNames, ["Outbound"]);
  });

  it("lists each structured Claim with its provenance, evidence count, and referencing pipelines", () => {
    updateSharedContext({
      claims: [{ text: "attribution clarity", provenance: "founder", evidence: [{ cite: "x.mjs:1" }] }],
    }, options);
    const kernel = listSharedKernel(projectId, options);
    assert.equal(kernel.claims.length, 1);
    const claim = kernel.claims[0];
    assert.equal(claim.text, "attribution clarity");
    assert.equal(claim.provenance, "founder");
    assert.equal(claim.evidenceCount, 1);
    assert.deepEqual(claim.channelIds, ["outbound"], "the Outbound objective carries 'attribution clarity'");
    assert.deepEqual(claim.channelNames, ["Outbound"]);
  });
});
