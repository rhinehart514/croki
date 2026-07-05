import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { deriveCockpitState, proposeMoves } from "../src/five-primitives.mjs";
import { recordFounderOutcome } from "../src/outcome-capture.mjs";
import { gtmPathStore, marketObjectStore } from "../src/gtm-store.mjs";
import { createChannel, updateSharedContext } from "../src/project-store.mjs";
import { createOperatorSession } from "../src/operator-store.mjs";
import { loadFlow, recordFlowRun } from "../src/flow-store.mjs";

// Stage a flow run carrying a gate node with founder-decided items, exactly as flow-store persists it.
function stageRun(graphId, items, options, { runId = "run-1" } = {}) {
  const { graph } = loadFlow(graphId, null, options);
  recordFlowRun(
    graph ?? { id: graphId, name: graphId, nodes: [], edges: [], revision: 0 },
    {
      runId,
      ok: true,
      targetNodeId: null,
      pendingGates: [],
      nodes: { "gate-review": { category: "gate", items } },
    },
    options,
  );
}

describe("five-primitives — honest-empty on a fresh project", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "five-prim-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("returns nulls and empties — never a fabricated number", () => {
    const state = deriveCockpitState("default", options);
    assert.equal(state.goal, null, "no goal set ⇒ null, never a placeholder");
    assert.deepEqual(state.bets, [], "no paths ⇒ no bets");
    assert.equal(state.bestMove, null, "no goal and no bet ⇒ honestly no move to propose");
    assert.equal(state.latestRun, null, "no run ⇒ null, never a row of fake zeros");
    assert.deepEqual(state.learnings, [], "no outcomes and no gate decisions ⇒ nothing learned yet");
    assert.ok(Array.isArray(state.upgrades), "upgrades is always a list");
  });

  it("proposes no moves when there are no bets", () => {
    assert.deepEqual(proposeMoves("default", options), []);
  });

  it("gives an honest latestRun of nulls (never fake replies) once a run staged nothing measurable", () => {
    const { channel } = createChannel({ name: "Cold DM" }, options);
    stageRun(channel.graphId, [{ email: "a@x.com", draft: "note", approvalStatus: "approved", joinKey: "jk-1" }], options);
    const state = deriveCockpitState("default", options);
    assert.equal(state.latestRun.sent, 1, "one approved item ⇒ one to go out");
    assert.equal(state.latestRun.replies, null, "nothing came back ⇒ replies is null, not 0-dressed-up");
    assert.equal(state.latestRun.calls, null);
    assert.equal(state.latestRun.paid, null);
    assert.equal(state.latestRun.revenue, null);
  });
});

describe("five-primitives — populated projection", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "five-prim-"));
    options = { root: parent };

    // A market fact carrying real sourced evidence ⇒ researched.
    const market = marketObjectStore.create(
      {
        projectId: "default",
        kind: "buyer",
        statement: "Agencies with manual reporting",
        evidence: [{ claim: "posted 3 ops roles this month", source: "https://linkedin.com/x", solidity: "researched" }],
      },
      options,
    );
    // The bet (a GTMPath) rests on that fact.
    gtmPathStore.create(
      {
        projectId: "default",
        summary: "Agencies will pay for automation setup",
        angle: "wedge",
        restsOn: [{ type: "marketObject", id: market.id }],
        bet: { buyer: "agency owners", trigger: "manual reporting", offer: "72-hour setup" },
        risk: "they may build it themselves",
        confidence: 0.6,
      },
      options,
    );
    createOperatorSession({ goal: "Get 1-3 paid pilots this week", projectId: "default" }, options);
    const { channel } = createChannel({ name: "Cold DM" }, options);
    stageRun(
      channel.graphId,
      [
        { email: "a@x.com", draft: "note a", approvalStatus: "approved", joinKey: "jk-1" },
        { email: "b@x.com", draft: "note b", approvalStatus: "rejected", joinKey: "jk-2" },
      ],
      options,
    );
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("translates the goal, the bet, and the run into founder language", () => {
    const state = deriveCockpitState("default", options);
    assert.equal(state.goal.text, "Get 1-3 paid pilots this week");
    assert.equal(state.goal.metric, null, "unparsed metric stays null, never guessed");

    assert.equal(state.bets.length, 1);
    const bet = state.bets[0];
    assert.equal(bet.statement, "Agencies will pay for automation setup");
    assert.equal(bet.solidity, "researched", "a bet resting on a sourced fact reads researched");
    assert.equal(bet.sure, "medium");
    assert.match(bet.basis, /agency owners/);

    assert.equal(state.latestRun.sent, 1, "one approved item ⇒ one to go out");
    assert.equal(state.latestRun.replies, null);
  });

  it("proposes a best next move that starts from the strongest bet", () => {
    const state = deriveCockpitState("default", options);
    assert.ok(state.bestMove, "a goal and a bet ⇒ a real move");
    assert.match(state.bestMove.headline, /Agencies will pay for automation setup/);
    assert.ok(state.bestMove.doToday, "the move names a literal thing to do today");
    assert.ok(state.bestMove.winIf && state.bestMove.killIf, "the move states its win and kill lines");
  });

  it("returns up to three move proposals derived from the bets, each with its evidence strength", () => {
    const moves = proposeMoves("default", options);
    assert.ok(moves.length >= 1 && moves.length <= 3);
    assert.equal(moves[0].bet, "Agencies will pay for automation setup");
    assert.equal(moves[0].evidence, "researched", "market evidence scale — never the internal solidity");
    assert.ok(moves[0].statement && moves[0].action && moves[0].risk);
  });

  it("surfaces a founder-entered outcome as a Learning through the existing ingest path", () => {
    const before = deriveCockpitState("default", options);
    assert.ok(
      !before.learnings.some((learning) => /72-hour/.test(learning.statement)),
      "the founder lesson is not there before it is recorded",
    );

    const recorded = recordFounderOutcome(
      "default",
      { runId: "run-1", happened: { label: "got replies", count: 3 }, learned: "72-hour setup beat AI automation" },
      options,
    );
    assert.equal(recorded.ok, true);

    const after = deriveCockpitState("default", options);
    assert.ok(
      after.learnings.some((learning) => /72-hour setup beat AI automation/.test(learning.statement)),
      "the founder's lesson shows up in the cockpit learnings",
    );
  });

  it("moves a bet to 'gated' solidity once its path has passed the gate", () => {
    gtmPathStore.create(
      { projectId: "default", summary: "Promoted bet", status: "promoted" },
      options,
    );
    const state = deriveCockpitState("default", options);
    const gatedBet = state.bets.find((bet) => bet.statement === "Promoted bet");
    assert.equal(gatedBet.solidity, "gated");
    assert.equal(gatedBet.sure, "high");
  });

  it("suggests sharpening the offer when none is stated, and drops that upgrade once it is", () => {
    const before = deriveCockpitState("default", options);
    assert.ok(before.upgrades.some((u) => /Sharpen your offer/.test(u)));
    updateSharedContext({ offer: { price: "$2k", unit: "setup", terms: "72 hours" } }, options);
    const after = deriveCockpitState("default", options);
    assert.ok(!after.upgrades.some((u) => /Sharpen your offer/.test(u)), "a stated offer clears that upgrade");
  });
});
