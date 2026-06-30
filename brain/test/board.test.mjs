import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getBoard } from "../src/board.mjs";
import { updateSharedContext } from "../src/project-store.mjs";

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

  it("is honest-blank with no signal: every belief null, confidence 0, status blind", () => {
    const board = getBoard({ projectId: "default" }, options);
    for (const layer of board.layers) {
      assert.equal(layer.belief, null, `${layer.layer} belief is null with no signal`);
      assert.equal(layer.confidence, 0, `${layer.layer} confidence is 0 with no signal`);
      assert.equal(layer.status, "blind", `${layer.layer} status is blind with no signal`);
    }
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
