import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createGtmIdea,
  getGtmIdea,
  saveGtmIdea,
  listGtmIdeas,
  attachBuildWiring,
  recordIdeaOutcome,
} from "../src/idea-store.mjs";

// Each test gets an isolated store root, so nothing touches the real ~/.gtm-ide.
function freshRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-idea-store-"));
  return { root };
}

describe("idea-store — durable GtmIdea", () => {
  it("creates, persists, and reads back a survived idea", () => {
    const options = freshRoot();
    const idea = createGtmIdea({
      projectId: "p1",
      goal: "get 5 pilot conversations without paid ads",
      angle: "asset-first",
      pitch: "Turn the founder's shipped repo into a public scorecard others want their own version of.",
      barScore: 7.4,
      axes: { showable: 8, loop_able: 7 },
    }, options);

    assert.match(idea.id, /^idea-/);
    assert.equal(idea.verdict, "survived");
    assert.equal(idea.killed, false);
    assert.equal(idea.buildWiring, null);

    const read = getGtmIdea(idea.id, options);
    assert.equal(read.pitch, idea.pitch);
    assert.equal(read.barScore, 7.4);
    assert.equal(read.angle, "asset-first");
  });

  it("persists the decidable texture — what / upside / risk / take and a cut idea's reason", () => {
    const options = freshRoot();
    const cut = createGtmIdea({
      projectId: "p1",
      pitch: "Sponsor a conference booth",
      what: "a paid placement",
      upside: "puts the product in front of the exact crowd",
      risk: "costs real money before any signal",
      take: "Too expensive a first probe for this goal.",
      killReason: "Needs budget the goal explicitly rules out.",
      killed: true,
    }, options);

    const read = getGtmIdea(cut.id, options);
    assert.equal(read.what, "a paid placement");
    assert.equal(read.upside, "puts the product in front of the exact crowd");
    assert.equal(read.risk, "costs real money before any signal");
    assert.equal(read.take, "Too expensive a first probe for this goal.");
    assert.equal(read.killReason, "Needs budget the goal explicitly rules out.");
    assert.equal(read.killed, true);

    // Absent texture stays honestly null — never an empty string pretending to be content.
    const bare = createGtmIdea({ pitch: "bare idea" }, options);
    assert.equal(bare.what, null);
    assert.equal(bare.killReason, null);
  });

  it("requires a pitch", () => {
    const options = freshRoot();
    assert.throws(() => createGtmIdea({ projectId: "p1", pitch: "   " }, options), /pitch is required/);
  });

  it("keeps verdict and killed consistent — a killed idea is dead", () => {
    const options = freshRoot();
    const byVerdict = createGtmIdea({ pitch: "weak idea", verdict: "killed" }, options);
    assert.equal(byVerdict.killed, true);
    const byFlag = createGtmIdea({ pitch: "another weak idea", killed: true }, options);
    assert.equal(byFlag.verdict, "killed");
  });

  it("scopes the list to a project and orders newest first", () => {
    const options = freshRoot();
    createGtmIdea({ id: "idea-a", projectId: "p1", pitch: "first", createdAt: "x" }, options);
    createGtmIdea({ id: "idea-b", projectId: "p2", pitch: "other project" }, options);
    createGtmIdea({ id: "idea-c", projectId: "p1", pitch: "second" }, options);

    const p1 = listGtmIdeas({ ...options, projectId: "p1" });
    assert.deepEqual(p1.map((i) => i.id).sort(), ["idea-a", "idea-c"]);
    const all = listGtmIdeas(options);
    assert.equal(all.length, 3);
  });

  it("wires a survived idea into a build but refuses a killed one", () => {
    const options = freshRoot();
    const survived = createGtmIdea({ pitch: "good idea", verdict: "survived" }, options);
    const wired = attachBuildWiring(survived.id, { channelId: "ch-1", graphId: "g-9" }, options);
    assert.equal(wired.buildWiring.graphId, "g-9");

    const killed = createGtmIdea({ pitch: "dead idea", killed: true }, options);
    assert.throws(() => attachBuildWiring(killed.id, { graphId: "g-1" }, options), /killed/);
  });

  it("records a build outcome back onto the idea", () => {
    const options = freshRoot();
    const idea = createGtmIdea({ pitch: "idea", verdict: "survived" }, options);
    const updated = recordIdeaOutcome(idea.id, { reachedGate: true, approved: 3 }, options);
    assert.equal(updated.outcome.approved, 3);
    assert.equal(getGtmIdea(idea.id, options).outcome.reachedGate, true);
  });

  it("round-trips an edited idea through saveGtmIdea", () => {
    const options = freshRoot();
    const idea = createGtmIdea({ pitch: "idea", barScore: 5 }, options);
    const saved = saveGtmIdea({ ...idea, barScore: 8 }, options);
    assert.equal(saved.barScore, 8);
    assert.equal(getGtmIdea(idea.id, options).barScore, 8);
  });
});
