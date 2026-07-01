import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getBoard, getPipelineBeliefSpine, getPipelineIcpGrouping } from "../src/board.mjs";
import { createChannel, updateSharedContext, setChannelIcp } from "../src/project-store.mjs";
import { appendAppearance, upsertPerson } from "../src/person-store.mjs";

describe("getBoard — nine belief layers derived purely from real state", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-board-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("returns nine layers grouped Strategy / Motion / Loop", () => {
    const board = getBoard({ projectId: "default" }, options);
    assert.equal(board.layers.length, 9);
    assert.equal(board.groups.Strategy.length, 4);
    assert.equal(board.groups.Motion.length, 2);
    assert.equal(board.groups.Loop.length, 3);
    assert.deepEqual(
      board.layers.map((l) => l.layer),
      ["icp", "trigger", "positioning", "offer", "channels", "artifacts", "people", "measure", "learn"],
    );
  });

  it("is honest-blank with no signal: every belief null, confidence 0, status blind, nothing moving", () => {
    const board = getBoard({ projectId: "default" }, options);
    for (const layer of board.layers) {
      assert.equal(layer.belief, null, `${layer.layer} belief is null with no signal`);
      assert.equal(layer.confidence, 0, `${layer.layer} confidence is 0 with no signal`);
      assert.equal(layer.status, "blind", `${layer.layer} status is blind with no signal`);
      assert.equal(layer.moving, false, `${layer.layer} is not moving with no run signal`);
    }
    // The Pipelines layer reports NO operational tiers when there are no pipelines — honest-blank, not
    // a row of fake zeros dressed up as state.
    const channels = board.layers.find((l) => l.layer === "channels");
    assert.equal(channels.tiers, null, "no pipelines ⇒ tiers is null, never a seeded row");
  });

  it("derives confidence per layer from real signal — it is never a seeded constant", () => {
    // Before any signal, every confidence is 0.
    const blank = getBoard({ projectId: "default" }, options);
    assert.ok(blank.layers.every((l) => l.confidence === 0));

    // Stating the ICP lights up ONLY the ICP layer — proof the number is derived, not a constant.
    updateSharedContext({ icp: { label: "Dev-tool founders" } }, options);
    const board = getBoard({ projectId: "default" }, options);
    const icp = board.layers.find((l) => l.layer === "icp");
    const offer = board.layers.find((l) => l.layer === "offer");
    assert.ok(icp.confidence > 0, "the stated ICP earns real confidence");
    assert.equal(icp.status, "assumed", "stated but untested ⇒ assumed");
    assert.equal(icp.belief, "Target: Dev-tool founders");
    assert.equal(offer.confidence, 0, "an untouched layer stays at 0 — confidence is not a shared constant");
    assert.equal(offer.status, "blind");
  });

  it("reads the new stated offer layer", () => {
    updateSharedContext({ offer: { price: "200", unit: "per month", status: "stated" } }, options);
    const board = getBoard({ projectId: "default" }, options);
    const offer = board.layers.find((l) => l.layer === "offer");
    assert.equal(offer.belief, "200 / per month");
    assert.equal(offer.groundingMode, "stated");
    assert.ok(offer.confidence > 0);
  });

  it("marks a layer validated when a founder verdict resolves its experiment", () => {
    updateSharedContext({
      experiments: [
        {
          id: "exp-cold-outbound",
          channelId: "cold-outbound",
          targetLayer: "channels",
          hypothesis: "Personalized openers beat templates",
          status: "complete",
          verdict: { decision: "keep", decidedAt: "2026-06-29T00:00:00Z", decidedBy: "founder" },
        },
      ],
    }, options);
    const board = getBoard({ projectId: "default" }, options);
    const channels = board.layers.find((l) => l.layer === "channels");
    assert.equal(channels.status, "validated");
    assert.ok(channels.confidence >= 45, "a founder verdict is the strongest confidence signal");
    assert.equal(channels.experiments.length, 1);
  });
});

describe("getPipelineBeliefSpine — one pipeline's five belief faces, derived purely from real state", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-pipeline-spine-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("returns the five faces with the full LayerBelief shape for one pipeline", () => {
    const { channel } = createChannel({ name: "Cold outbound", objective: "Book pilots" }, options);
    const spine = getPipelineBeliefSpine({ projectId: "default", channelId: channel.id }, options);

    assert.equal(spine.projectId, "default");
    assert.equal(spine.channelId, channel.id);
    assert.equal(spine.channelName, "Cold outbound");
    assert.deepEqual(Object.keys(spine.faces), ["who", "say", "reached", "worked", "verdict"]);

    for (const [key, face] of Object.entries(spine.faces)) {
      assert.ok(typeof face.belief === "string" || face.belief === null, `${key}.belief is string|null`);
      assert.ok(
        typeof face.confidence === "number" && face.confidence >= 0 && face.confidence <= 100,
        `${key}.confidence is 0-100`,
      );
      assert.ok(["validated", "testing", "assumed", "blind"].includes(face.status), `${key}.status is valid`);
      assert.ok(typeof face.groundingMode === "string", `${key}.groundingMode is a string`);
      assert.ok(Array.isArray(face.experiments), `${key}.experiments is an array`);
      assert.ok(Array.isArray(face.evidence), `${key}.evidence is an array`);
    }
  });

  it("is honest-blank for the faces with no signal (who/say/reached/verdict): null / 0 / blind", () => {
    const { channel } = createChannel({ name: "Empty pipeline" }, options);
    const spine = getPipelineBeliefSpine({ projectId: "default", channelId: channel.id }, options);

    // These four faces read founder-stated + run-derived signal, of which a brand-new pipeline has
    // none — so they honestly report blind rather than a confident fake.
    for (const key of ["who", "say", "reached", "verdict"]) {
      const face = spine.faces[key];
      assert.equal(face.belief, null, `${key} belief is null with no signal`);
      assert.equal(face.confidence, 0, `${key} confidence is 0 with no signal`);
      assert.equal(face.status, "blind", `${key} status is blind with no signal`);
      assert.equal(face.moving, false, `${key} is not moving with no signal`);
    }
    // The WORKED face reads real Measure signal off the pipeline's GRAPH shape — a blank graph with no
    // measure stage is itself derived signal (health 40), so this face is honestly non-blind, exactly
    // as the board's measure layer behaves. Never a seeded number.
    assert.ok(spine.faces.worked.belief, "worked reflects the graph's real measure state, not a fake blank");
    assert.equal(spine.faces.worked.groundingMode, "derived");
  });

  it("scopes the reached + who faces to People (and triggers) that entered THIS pipeline only", () => {
    const { channel } = createChannel({ name: "Outbound" }, options);
    const { channel: other } = createChannel({ name: "Community" }, options);

    // A person who entered THIS pipeline carrying a why-now trigger.
    const inHere = upsertPerson("default", { name: "Dana", email: "dana@acme.com" }, options);
    appendAppearance("default", inHere.id, { channelId: channel.id, trigger: "raised a seed round" }, options);
    // A person who entered a DIFFERENT pipeline — must not bleed in.
    const elsewhere = upsertPerson("default", { name: "Uri", email: "uri@else.com" }, options);
    appendAppearance("default", elsewhere.id, { channelId: other.id, trigger: "hiring spike" }, options);

    const spine = getPipelineBeliefSpine({ projectId: "default", channelId: channel.id }, options);
    assert.match(spine.faces.reached.belief, /1 person/);
    assert.equal(spine.faces.reached.status, "testing");
    assert.ok(spine.faces.reached.moving, "a reached person makes the face live");
    assert.ok(spine.faces.reached.evidence.includes("Dana"));
    assert.ok(spine.faces.who.evidence.includes("raised a seed round"));
    assert.ok(!spine.faces.who.evidence.includes("hiring spike"), "another pipeline's trigger never bleeds in");
  });

  it("reads the stated positioning + offer into the WHAT-YOU-SAY face", () => {
    const { channel } = createChannel({ name: "Outbound" }, options);
    updateSharedContext({
      positioning: { category: "GTM IDE", audience: "dev-tool founders", promise: "vibe your GTM", status: "stated" },
      offer: { price: "200", unit: "per month", status: "stated" },
    }, options);

    const spine = getPipelineBeliefSpine({ projectId: "default", channelId: channel.id }, options);
    const say = spine.faces.say;
    assert.equal(say.groundingMode, "stated");
    assert.match(say.belief, /GTM IDE/);
    assert.match(say.belief, /200 \/ per month/);
    assert.ok(say.confidence > 0, "a stated positioning + offer earns real confidence");
  });

  it("scopes an experiment verdict to the target pipeline in the VERDICT face", () => {
    const { channel } = createChannel({ name: "Outbound" }, options);
    updateSharedContext({
      experiments: [{
        id: "exp-outbound",
        channelId: channel.id,
        targetLayer: "channels",
        hypothesis: "Personalized openers beat templates",
        status: "complete",
        verdict: { decision: "keep", decidedAt: "2026-06-29T00:00:00Z", decidedBy: "founder" },
      }],
    }, options);

    const spine = getPipelineBeliefSpine({ projectId: "default", channelId: channel.id }, options);
    assert.equal(spine.faces.verdict.status, "validated");
    assert.equal(spine.faces.verdict.experiments.length, 1);
    assert.ok(spine.faces.verdict.confidence >= 45, "a founder verdict is the strongest signal");
  });

  it("throws for an unknown pipeline id", () => {
    createChannel({ name: "Outbound" }, options);
    assert.throws(() => getPipelineBeliefSpine({ projectId: "default", channelId: "does-not-exist" }, options));
  });
});

describe("getPipelineIcpGrouping — the L0 ground: which ICP each pipeline tests", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-icp-grouping-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("groups every pipeline under the project's single stated ICP as the base ground", () => {
    const { channel: c1 } = createChannel({ name: "Outbound" }, options);
    const { channel: c2 } = createChannel({ name: "Community" }, options);
    updateSharedContext({ icp: { label: "Dev-tool founders" } }, options);

    const grouping = getPipelineIcpGrouping({ projectId: "default" }, options);
    assert.equal(grouping.projectId, "default");
    assert.equal(grouping.icpKey, "Dev-tool founders");
    assert.equal(grouping.icpBelief, "Target: Dev-tool founders");
    assert.equal(grouping.channelCount, 2);
    assert.deepEqual([...grouping.channelIds].sort(), [c1.id, c2.id].sort());

    const base = grouping.grounds[0];
    assert.equal(base.source, "stated");
    assert.equal(base.grounded, true);
    assert.equal(base.channelCount, 2);
  });

  it("is honest-blank (null icpKey, grounded false) when no ICP is stated but still holds the pipelines", () => {
    createChannel({ name: "Outbound" }, options);
    const grouping = getPipelineIcpGrouping({ projectId: "default" }, options);

    assert.equal(grouping.icpKey, null, "no stated ICP ⇒ icpKey is null");
    assert.equal(grouping.icpBelief, null, "no stated ICP ⇒ icpBelief is null");
    assert.equal(grouping.grounds[0].grounded, false, "the base ground reports blind honestly");
    assert.equal(grouping.grounds[0].channelCount, 1, "yet the pipeline still hangs off the ground");
  });

  it("derives icpKey from label, then query, then industry in that precedence", () => {
    createChannel({ name: "Outbound" }, options);

    updateSharedContext({ icp: { industry: "SaaS" } }, options);
    assert.equal(getPipelineIcpGrouping({ projectId: "default" }, options).icpKey, "SaaS");

    updateSharedContext({ icp: { query: "B2B demand-gen", industry: "SaaS" } }, options);
    assert.equal(getPipelineIcpGrouping({ projectId: "default" }, options).icpKey, "B2B demand-gen");

    updateSharedContext({ icp: { label: "Marketing leaders", query: "B2B demand-gen", industry: "SaaS" } }, options);
    assert.equal(getPipelineIcpGrouping({ projectId: "default" }, options).icpKey, "Marketing leaders");
  });

  it("adds a distinct ICP ground for an ICP-targeted experiment grouping its arm pipelines", () => {
    const { channel: c1 } = createChannel({ name: "Outbound" }, options);
    const { channel: c2 } = createChannel({ name: "Community" }, options);
    updateSharedContext({
      experiments: [{
        id: "exp-icp-test",
        targetLayer: "icp",
        hypothesis: "Seed-stage founders convert better than Series A",
        arms: [
          { id: "arm-1", label: "seed", kind: "channel", channelId: c1.id },
          { id: "arm-2", label: "series-a", kind: "channel", channelId: c2.id },
        ],
      }],
    }, options);

    const grouping = getPipelineIcpGrouping({ projectId: "default" }, options);
    assert.equal(grouping.grounds.length, 2, "base ground + one experiment ground");
    const expGround = grouping.grounds.find((g) => g.source === "experiment");
    assert.ok(expGround, "an ICP-targeted experiment becomes its own ground");
    assert.equal(expGround.icpBelief, "Seed-stage founders convert better than Series A");
    assert.equal(expGround.channelCount, 2);
    assert.deepEqual([...expGround.channelIds].sort(), [c1.id, c2.id].sort());
  });

  it("adds an explicit-link ground grouping pipelines the founder bound to one ICP key", () => {
    const { channel: c1 } = createChannel({ name: "PCO Outbound" }, options);
    const { channel: c2 } = createChannel({ name: "Restaurant Outbound" }, options);
    createChannel({ name: "Unlinked" }, options);
    setChannelIcp(c1.id, { key: "smb-owners", label: "SMB owners" }, options);
    setChannelIcp(c2.id, "smb-owners", options);

    const grouping = getPipelineIcpGrouping({ projectId: "default" }, options);
    const linkGround = grouping.grounds.find((g) => g.source === "explicit-link");
    assert.ok(linkGround, "an explicit founder link becomes its own ground");
    assert.equal(linkGround.icpKey, "smb-owners");
    assert.equal(linkGround.icpBelief, "SMB owners");
    assert.equal(linkGround.channelCount, 2, "both pipelines linked to the same key group together");
    assert.deepEqual([...linkGround.channelIds].sort(), [c1.id, c2.id].sort());
    // Clearing a link drops the pipeline back to the base ground only.
    setChannelIcp(c1.id, null, options);
    const after = getPipelineIcpGrouping({ projectId: "default" }, options);
    const ground2 = after.grounds.find((g) => g.source === "explicit-link");
    assert.equal(ground2.channelCount, 1, "the reversible clear removes the pipeline from the link ground");
  });

  it("renders each pipeline under its OWN stated ICP record when linked to distinct named ICPs", () => {
    const { channel: c1 } = createChannel({ name: "Local Biz Outbound" }, options);
    const { channel: c2 } = createChannel({ name: "Non-profit Outbound" }, options);
    const { channel: c3 } = createChannel({ name: "Member Org Outbound" }, options);
    // An ICP-discovery program: one experiment, three segments stated as named records.
    updateSharedContext({
      icp: { label: "Everyone (default)" },
      icps: [
        { key: "local-biz", label: "Local businesses", industry: "Retail" },
        { key: "non-profits", query: "mission-driven orgs" },
      ],
    }, options);
    setChannelIcp(c1.id, "local-biz", options);
    setChannelIcp(c2.id, "non-profits", options);
    // A pipeline linked to a key with NO stated record still grounds honestly off its bare key.
    setChannelIcp(c3.id, { key: "member-orgs" }, options);

    const grouping = getPipelineIcpGrouping({ projectId: "default" }, options);
    const linkGrounds = grouping.grounds.filter((g) => g.source === "explicit-link");
    assert.equal(linkGrounds.length, 3, "each distinct linked key is its own ground");

    const local = linkGrounds.find((g) => g.icpKey === "local-biz");
    assert.equal(local.icpBelief, "Local businesses", "resolves to the named record's belief, not the global icp");
    assert.equal(local.icpRecord.industry, "Retail", "the ground carries the full resolved ICP record");
    assert.deepEqual(local.channelIds, [c1.id]);

    const np = linkGrounds.find((g) => g.icpKey === "non-profits");
    assert.equal(np.icpBelief, "mission-driven orgs", "belief falls to the record's query when it has no label");

    const member = linkGrounds.find((g) => g.icpKey === "member-orgs");
    assert.equal(member.icpBelief, "Target: member-orgs", "an unresolved key is honest-blank on the bare key");
    assert.equal(member.icpRecord, null, "no stated record ⇒ icpRecord is null, never fabricated");

    // The global icp remains the base ground, unchanged by per-pipeline records.
    assert.equal(grouping.icpBelief, "Target: Everyone (default)");
  });

  it("carries a per-arm measurement rollup on every ground, honest-blind (null score, no leader) with no runs", () => {
    const { channel: c1 } = createChannel({ name: "Outbound" }, options);
    createChannel({ name: "Community" }, options);
    updateSharedContext({ icp: { label: "Dev-tool founders" } }, options);

    const grouping = getPipelineIcpGrouping({ projectId: "default" }, options);
    const base = grouping.grounds[0];
    assert.equal(base.arms.length, 2, "the base ground races all its pipelines as arms");
    assert.equal(base.leader, null, "no runs ⇒ no leader is named");
    for (const arm of base.arms) {
      assert.equal(arm.totalScore, null, "a pipeline with no runs scores null (honest-blind), never a fake 0");
      assert.equal(arm.isLeader, false);
      assert.equal(arm.signals.runsCount, 0);
      assert.equal(arm.signals.itemsProduced, 0);
      assert.equal(arm.signals.peopleReached, 0);
      assert.equal(arm.signals.fatigueScore, 0);
      assert.equal(arm.channelId, arm.channelId);
    }
    // The arm carries the pipeline it measures.
    assert.ok(base.arms.some((a) => a.channelId === c1.id));
  });
});
