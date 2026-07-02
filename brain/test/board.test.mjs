import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getBoard, getPipelineBeliefSpine, getPipelineIcpGrouping } from "../src/board.mjs";
import { createChannel, loadProject, saveProject, updateSharedContext, setChannelIcp } from "../src/project-store.mjs";
import { saveFlow, recordFlowRun } from "../src/flow-store.mjs";

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

  it("surfaces an experiment with an unknown or missing layer on the Learn band instead of vanishing it", () => {
    updateSharedContext({
      experiments: [
        // A layer none of the nine bands claims — must land somewhere visible.
        { id: "exp-pricing", channelId: "site", targetLayer: "pricing-page", variable: "Annual toggle" },
        // A run-derived experiment carries NO layer at all — it must not be force-filed under channels.
        { id: "exp-derived", channelId: "outbound", variable: "Draft personalized opener" },
      ],
    }, options);
    const board = getBoard({ projectId: "default" }, options);
    const channels = board.layers.find((l) => l.layer === "channels");
    const learn = board.layers.find((l) => l.layer === "learn");
    assert.equal(channels.experiments.length, 0, "nothing is force-filed under the pipelines band");
    assert.deepEqual(
      learn.experiments.map((e) => e.id).sort(),
      ["exp-derived", "exp-pricing"],
      "both stray experiments surface on the Learn band",
    );
  });

  it("states the Learn belief as what the founder decided, never a tally string or '(s)' shorthand", () => {
    updateSharedContext({
      experiments: [{
        id: "exp-x",
        channelId: "x",
        targetLayer: "channels",
        hypothesis: "Personalized openers beat templates",
        verdict: { decision: "keep", decidedAt: "2026-06-29T00:00:00Z", decidedBy: "founder" },
      }],
    }, options);
    const board = getBoard({ projectId: "default" }, options);
    const learn = board.layers.find((l) => l.layer === "learn");
    assert.equal(learn.belief, "1 experiment settled");
    for (const layer of board.layers) {
      assert.ok(!/\(s\)/.test(layer.belief ?? ""), `${layer.layer} belief never uses the "(s)" shorthand`);
      assert.ok(!/gate decision\(s\)|verdict\(s\)|signal\(s\)/.test(layer.belief ?? ""), `${layer.layer} belief is not a tally`);
    }
  });
});

describe("getPipelineBeliefSpine — the strip over one pipeline, derived from ITS composed graph", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-pipeline-spine-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  // The canonical broadcast pipeline — the shape the old fixed five-face skeleton read as permanently
  // blank (no per-person trigger step, no durable-People step). Its strip must instead show ITS stages.
  const broadcastGraph = (graphId) => ({
    id: graphId,
    name: "X launch post",
    revision: 1,
    nodes: [
      { id: "followers", category: "source", label: "Your X followers", position: { x: 0, y: 0 } },
      { id: "post", category: "generate", kind: "agent", label: "Write the launch post", position: { x: 1, y: 0 } },
      { id: "gate", category: "gate", label: "Your approval", position: { x: 2, y: 0 } },
      { id: "send", category: "execute", label: "Post to X", position: { x: 3, y: 0 } },
      { id: "replies", category: "measure", label: "Replies and clicks", position: { x: 4, y: 0 } },
    ],
    edges: [
      { id: "e1", source: "followers", target: "post", edgeType: "data" },
      { id: "e2", source: "post", target: "gate", edgeType: "data" },
      { id: "e3", source: "gate", target: "send", edgeType: "data" },
      { id: "e4", source: "send", target: "replies", edgeType: "data" },
    ],
  });

  it("cards come from the pipeline's own composed steps, in flow order and its own words", () => {
    const { channel } = createChannel({ name: "X launch post" }, options);
    saveFlow(broadcastGraph(channel.graphId), options);

    const spine = getPipelineBeliefSpine({ projectId: "default", channelId: channel.id }, options);
    assert.equal(spine.projectId, "default");
    assert.equal(spine.channelId, channel.id);
    assert.equal(spine.channelName, "X launch post");
    assert.deepEqual(
      spine.cards.map((c) => c.title),
      ["Your X followers", "Write the launch post", "Your approval", "Post to X", "Replies and clicks"],
      "one card per composed step, titled by the step's own label — no fixed who/say/reached skeleton",
    );
    // Never run: every card is honestly empty and says in plain words what would fill it.
    for (const card of spine.cards) {
      assert.equal(card.empty, true, `${card.title} is honestly empty before any run`);
      assert.ok(card.body.length > 0, `${card.title} explains what would fill it`);
    }
    assert.match(spine.cards[3].body, /Nothing has gone out yet — approve/);
  });

  it("a broadcast run fills the strip with what really happened — drafted words, gate outcome, what went out, what came back", () => {
    const { channel } = createChannel({ name: "X launch post" }, options);
    const graph = broadcastGraph(channel.graphId);
    saveFlow(graph, options);
    // The pipeline carries its own offer (written by another surface as { statement }); read defensively.
    const project = loadProject(options);
    const channels = project.channels.map((c) =>
      c.id === channel.id ? { ...c, offer: { statement: "50% off the first month" } } : c);
    saveProject({ ...project, channels }, options);

    recordFlowRun(graph, {
      runId: "run-1",
      ok: true,
      pendingGates: [],
      nodes: {
        followers: { nodeId: "followers", category: "source", ok: true, items: [{ id: "aud", name: "Your X followers" }] },
        post: { nodeId: "post", category: "generate", ok: true, items: [{ id: "p1", text: "Drover is live — 50% off the first month for multi-product founders." }] },
        gate: { nodeId: "gate", category: "gate", ok: true, items: [{ id: "p1", approvalStatus: "approved", draft: "Drover is live — 50% off the first month for multi-product founders." }] },
        send: { nodeId: "send", category: "execute", ok: true, items: [{ id: "p1" }] },
        replies: { nodeId: "replies", category: "measure", ok: true, items: [{ id: "r1", text: "12 replies, 3 signups" }] },
      },
    }, options);

    const spine = getPipelineBeliefSpine({ projectId: "default", channelId: channel.id }, options);
    const byTitle = new Map(spine.cards.map((c) => [c.title, c]));

    // What you say = what THIS pipeline actually drafted, plus the offer it carries — never the
    // project positioning paragraph echoed back.
    const draft = byTitle.get("Write the launch post");
    assert.match(draft.detail, /Drover is live/);
    assert.match(draft.body, /It carries your offer: 50% off the first month/);
    assert.equal(draft.empty, false);

    assert.match(byTitle.get("Your approval").body, /You approved 1 on the last run\./);
    assert.match(byTitle.get("Post to X").body, /1 item moved through here after your approval\./);
    const replies = byTitle.get("Replies and clicks");
    assert.match(replies.body, /1 result came back\./);
    assert.match(replies.detail, /12 replies, 3 signups/);

    // Real founder decisions close the strip in result language — never a "N gate decision(s)" tally.
    const decided = spine.cards[spine.cards.length - 1];
    assert.equal(decided.title, "What you've decided");
    assert.match(decided.body, /Across 1 run you approved 1\./);

    // Founder register: nothing on the strip speaks engine vocabulary or "(s)" shorthand.
    const serialized = JSON.stringify(spine.cards);
    for (const banned of ["(s)", "blind", "derived", "groundingMode", "confidence", "signal"]) {
      assert.ok(!serialized.includes(banned), `the strip never says "${banned}"`);
    }
  });

  it("falls back to the project-level offer when the pipeline states none of its own", () => {
    const { channel } = createChannel({ name: "X launch post" }, options);
    const graph = broadcastGraph(channel.graphId);
    saveFlow(graph, options);
    // No channel.offer — the standing default is the project-level sharedContext.offer.
    updateSharedContext({ offer: { price: "200", unit: "per month", status: "stated" } }, options);
    recordFlowRun(graph, {
      runId: "run-1",
      ok: true,
      pendingGates: [],
      nodes: {
        post: { nodeId: "post", category: "generate", ok: true, items: [{ id: "p1", text: "Launch post text" }] },
      },
    }, options);

    const spine = getPipelineBeliefSpine({ projectId: "default", channelId: channel.id }, options);
    const draft = spine.cards.find((c) => c.title === "Write the launch post");
    assert.match(draft.body, /It carries your offer: 200 \/ per month/);
  });

  it("counts drafts waiting at the gate as the founder-actionable number", () => {
    const { channel } = createChannel({ name: "X launch post" }, options);
    const graph = broadcastGraph(channel.graphId);
    saveFlow(graph, options);
    recordFlowRun(graph, {
      runId: "run-1",
      ok: true,
      pendingGates: ["gate"],
      nodes: {
        post: { nodeId: "post", category: "generate", ok: true, items: [{ id: "p1", text: "Draft A" }, { id: "p2", text: "Draft B" }] },
        gate: { nodeId: "gate", category: "gate", ok: true, items: [
          { id: "p1", approvalStatus: "pending", draft: "Draft A" },
          { id: "p2", approvalStatus: "pending", draft: "Draft B" },
        ] },
      },
    }, options);

    const spine = getPipelineBeliefSpine({ projectId: "default", channelId: channel.id }, options);
    const gateCard = spine.cards.find((c) => c.title === "Your approval");
    assert.equal(gateCard.needsYou, 2, "the waiting count is the number the founder acts on");
    assert.match(gateCard.body, /2 waiting on your decision\./);
    // Downstream stages stay honestly empty — approving is what moves them.
    assert.equal(spine.cards.find((c) => c.title === "Post to X").empty, true);
  });

  it("closes with a founder experiment verdict named by the real variable — never the typed goal", () => {
    const { channel } = createChannel({ name: "Outbound" }, options);
    updateSharedContext({
      experiments: [{
        id: "exp-outbound",
        channelId: channel.id,
        variable: "Personalized openers",
        status: "complete",
        verdict: { decision: "keep", decidedAt: "2026-06-29T00:00:00Z", decidedBy: "founder" },
      }],
    }, options);

    const spine = getPipelineBeliefSpine({ projectId: "default", channelId: channel.id }, options);
    const decided = spine.cards.find((c) => c.title === "What you've decided");
    assert.ok(decided, "a settled experiment is a real conclusion");
    assert.match(decided.body, /You kept “Personalized openers”\./);
  });

  it("has no decisions card when nothing has been decided — honest emptiness, not a fake conclusion", () => {
    const { channel } = createChannel({ name: "Outbound" }, options);
    const spine = getPipelineBeliefSpine({ projectId: "default", channelId: channel.id }, options);
    assert.ok(!spine.cards.some((c) => c.title === "What you've decided"));
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
