import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { run as runGate } from "../src/connectors/gate/default.mjs";
import { loadFlow, saveFlow } from "../src/flow-store.mjs";
import {
  createChannel,
  getChannel,
  loadProject,
  promoteChannel,
  revokeChannel,
} from "../src/project-store.mjs";

// A clean draft the pattern can vouch for; an exception the founder must still look at.
const CLEAN = [
  { id: "a", draft: "Hi there, saw your repo." },
  { id: "b", draft: "Loved your latest release." },
];
const EXCEPTION = { id: "c", draft: "Unsure about this one.", needsReview: true };

describe("per-channel autonomy ladder — store mutations", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-autonomy-"));
    options = { root: parent };
  });
  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("a new channel starts at draft with no standing pattern", () => {
    const { channel } = createChannel({ name: "Founder outbound" }, options);
    assert.equal(channel.autonomy, "draft");
    assert.equal(channel.blessedPattern, null);
  });

  it("promoteChannel raises the rung, banks the blessed pattern, and stamps the gate node config", () => {
    const { channel } = createChannel({ name: "Founder outbound" }, options);
    // Give the channel a gate node to stamp (a blank channel graph has none).
    const flow = loadFlow(channel.graphId, null, options);
    saveFlow({
      ...flow.graph,
      nodes: [{ id: "gate-1", category: "gate", connector: "default", config: {} }],
    }, options);

    const promoted = promoteChannel(channel.id, {
      autonomy: "trusted",
      blessedPattern: { note: "personalized, on-claim outreach" },
    }, options).channel;
    assert.equal(promoted.autonomy, "trusted");
    assert.equal(promoted.blessedPattern.decision, "approve");
    assert.equal(promoted.blessedPattern.note, "personalized, on-claim outreach");

    const gate = loadFlow(channel.graphId, null, options).graph.nodes.find((n) => n.id === "gate-1");
    assert.equal(gate.config.autonomy, "trusted");
    assert.equal(gate.config.blessedPattern.decision, "approve");
  });

  it("a revoked channel instantly reverts to draft and clears the gate node config", () => {
    const { channel } = createChannel({ name: "Founder outbound" }, options);
    const flow = loadFlow(channel.graphId, null, options);
    saveFlow({
      ...flow.graph,
      nodes: [{ id: "gate-1", category: "gate", connector: "default", config: {} }],
    }, options);
    promoteChannel(channel.id, { autonomy: "trusted", blessedPattern: { note: "ok" } }, options);

    const reverted = revokeChannel(channel.id, options).channel;
    assert.equal(reverted.autonomy, "draft");
    assert.equal(reverted.blessedPattern, null);

    const gate = loadFlow(channel.graphId, null, options).graph.nodes.find((n) => n.id === "gate-1");
    assert.equal(gate.config.autonomy, undefined);
    assert.equal(gate.config.blessedPattern, undefined);

    // Reading the channel back fresh from disk still shows draft — the revert is durable.
    assert.equal(getChannel(loadProject(options), channel.id, options).autonomy, "draft");
  });

  it("refuses to promote without a blessed pattern, and refuses a promotion to draft", () => {
    const { channel } = createChannel({ name: "Founder outbound" }, options);
    assert.throws(() => promoteChannel(channel.id, { autonomy: "trusted" }, options), /blessed pattern/);
    assert.throws(
      () => promoteChannel(channel.id, { autonomy: "draft", blessedPattern: { note: "x" } }, options),
      /trusted.*autonomous/,
    );
  });
});

describe("per-channel autonomy ladder — gate behavior", () => {
  const context = { __run: { originRunId: "run-1" } };

  it("a draft channel still holds every item at the gate", async () => {
    const node = { id: "gate-1", category: "gate", config: {} };
    const result = await runGate(node, [...CLEAN, EXCEPTION], context);
    assert.equal(result.pendingReview, true);
    assert.equal(result.meta.awaitingReview, 3);
    assert.ok(result.items.every((item) => item.approvalStatus === "pending"));
  });

  it("a trusted channel auto-applies the blessed pattern but holds exceptions", async () => {
    const node = {
      id: "gate-1",
      category: "gate",
      config: { autonomy: "trusted", blessedPattern: { decision: "approve" } },
    };
    const result = await runGate(node, [...CLEAN, EXCEPTION], context);
    assert.equal(result.meta.mode, "autonomy");
    assert.equal(result.meta.autonomy, "trusted");
    // The two clean drafts pass ON THE PATTERN; the flagged exception is held for review.
    assert.equal(result.meta.approved, 2);
    assert.equal(result.meta.pending, 1);
    const approved = result.items.filter((i) => i.approvalStatus === "approved");
    assert.ok(approved.every((i) => i.viaPattern === true));
    const held = result.items.find((i) => i.id === "c");
    assert.equal(held.approvalStatus, "pending");
    assert.equal(held.isException, true);
  });

  it("an autonomous channel behaves the same as trusted at the gate", async () => {
    const node = {
      id: "gate-1",
      category: "gate",
      config: { autonomy: "autonomous", blessedPattern: { decision: "approve" } },
    };
    const result = await runGate(node, CLEAN, context);
    assert.equal(result.meta.mode, "autonomy");
    assert.equal(result.meta.approved, 2);
    assert.equal(result.pendingReview, false);
  });
});
