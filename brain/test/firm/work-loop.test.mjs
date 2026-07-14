// work-loop.test.mjs — F2 acceptance: a teammate drives real work through the runtime adapters
// directly, forks divergent bets, stages drafts with taste consulted, and parks an outward send at
// the wall — with zero imports from FIRM-SPEC.md's Dies list. Uses a fake Anthropic-shaped client
// (client.messages.create), the same injection convention brain/test/runtimes.test.mjs uses for the
// anthropic adapter, so selectRuntime resolves to a real adapter without touching a network or a
// subscription CLI.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { driveTeammate } from "../../src/firm/work-loop.mjs";
import { createVenture, getVentureDoc, listVentureDocs } from "../../src/firm/venture-store.mjs";
import { runtimeForModel } from "../../src/runtimes/index.mjs";
import { listCrew } from "../../src/firm/crew.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-work-loop-")) };
}

// A fake Anthropic-shaped client: each entry in `turns` is one model turn, returned in order.
// Mirrors fakeCtx()'s client double in brain/test/runtimes.test.mjs.
function fakeClient(turns) {
  let index = 0;
  return {
    messages: {
      async create() {
        const response = turns[index];
        index += 1;
        if (!response) throw new Error("Unexpected extra model turn.");
        return response;
      },
    },
  };
}

// One model turn calling one or more tools — the anthropic adapter runs every tool_use block in a
// turn's content array before asking for the next turn, so several tool calls in the same round
// belong in one turn(), not one each.
function turn(...calls) {
  return { content: calls.map(([id, name, input = {}]) => ({ type: "tool_use", id, name, input })) };
}
function text(t) {
  return { content: [{ type: "text", text: t }] };
}

describe("driveTeammate — forks divergent bets, stages drafts, parks an outward send", () => {
  it("forks two bets with distinct intents, stages a draft on each (taste consulted first), and parks one outward send", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Work loop acceptance" }, options);
    const parked = [];

    const client = fakeClient([
      turn(
        ["t1", "get_taste", { question: "cold outbound" }],
        ["t2", "fork_bet", { intent: "cold email to ops leads" }],
        ["t3", "fork_bet", { intent: "LinkedIn DM to ops leads" }],
      ),
      text("diverged into two genuinely different angles"),
    ]);

    const outcome1 = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "outreach-writer",
      goal: "Land the first pilot for LocalSeoData",
      options,
      deps: { client },
    });
    assert.equal(outcome1.outcome.kind, "completed");
    assert.equal(listCrew(venture.id, options)[0].ref, "outreach-writer", "driving a new ref summons it onto the crew");

    const bets = listVentureDocs(venture.id, "bets", options);
    assert.equal(bets.length, 2, "two divergent bets were forked");
    const intents = bets.map((b) => b.intent).sort();
    assert.deepEqual(intents, ["LinkedIn DM to ops leads", "cold email to ops leads"]);
    assert.ok(bets.every((b) => b.forkedFrom === null), "both are fresh forks from the goal, not chained to each other");

    // Stage a draft on each bet (a second drive per bet), taste consulted first in the SAME turn as
    // the stage_artifact call.
    for (const bet of bets) {
      const stageClient = fakeClient([
        turn(
          ["s1", "get_taste", {}],
          ["s2", "stage_artifact", { betId: bet.id, content: "Hey — noticed your team is scaling ops..." }],
        ),
        text("staged"),
      ]);
      const staged = await driveTeammate({
        ventureId: venture.id,
        teammateRef: "outreach-writer",
        goal: "Draft outreach for this bet",
        betId: bet.id,
        options,
        deps: { client: stageClient },
      });
      assert.equal(staged.outcome.kind, "completed");
    }

    const restaged = listVentureDocs(venture.id, "bets", options);
    for (const bet of restaged) {
      assert.equal(bet.staged.length, 1, `bet ${bet.id} carries exactly one staged draft`);
    }

    // Park one outward send at the wall via an injected park() double — never executes.
    const outwardClient = fakeClient([
      turn(
        ["o1", "get_taste", {}],
        ["o2", "stage_outward", { betId: restaged[0].id, effect: { external: true } }],
      ),
      text("parked at the wall"),
    ]);
    const outwardResult = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "outreach-writer",
      goal: "Send the outreach",
      betId: restaged[0].id,
      options,
      deps: {
        client: outwardClient,
        park: async (item) => { parked.push(item); return { id: "queue-1", ...item }; },
      },
    });
    assert.equal(outwardResult.outcome.kind, "paused");
    assert.equal(parked.length, 1, "exactly one outward effect reached the wall queue");
    assert.equal(parked[0].betId, restaged[0].id);
    assert.equal(parked[0].effect.external, true);
  });
});

describe("driveTeammate — a staged draft that never consulted taste is refused", () => {
  it("stage_artifact throws when get_taste was never called first, and stages nothing", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Consult guard" }, options);
    const client = fakeClient([turn(["b1", "fork_bet", { intent: "cold outbound to fintech ops" }]), text("forked")]);
    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "outreach-writer",
      goal: "Try cold outbound",
      options,
      deps: { client },
    });
    const [bet] = listVentureDocs(venture.id, "bets", options);
    assert.ok(bet);

    // A second drive stages a draft WITHOUT ever calling get_taste first.
    const badClient = fakeClient([
      turn(["s1", "stage_artifact", { betId: bet.id, content: "no taste consulted" }]),
      text("tried to stage without consulting taste"),
    ]);
    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "outreach-writer",
      goal: "Stage without consulting taste",
      betId: bet.id,
      options,
      deps: { client: badClient },
    });
    // The tool call throws inside runTool; the anthropic adapter records that as a tool error and
    // keeps going rather than crashing the drive — assert the bet stayed unstaged and the refusal
    // was recorded, not silently swallowed.
    const reloaded = getVentureDoc(venture.id, "bets", bet.id, options);
    assert.equal((reloaded.staged ?? []).length, 0, "no draft was staged — the consult guard refused it");
    const events = reloaded.events ?? [];
    assert.ok(
      events.some((e) => e.type === "tool_failed" && /moat|taste/i.test(e.detail)),
      "the refusal is recorded as a tool failure event",
    );
  });
});

describe("driveTeammate — tool names matching FORBIDDEN_TOOL are refused at the seam", () => {
  it("the real firm tool set carries nothing FORBIDDEN_TOOL matches, and the seam refuses one that would", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Tool safety" }, options);
    const { buildToolSet } = await import("../../src/firm/work-loop-tools.mjs");
    const taste = await import("../../src/firm/taste.mjs");
    const ventureStore = await import("../../src/firm/venture-store.mjs");
    assert.doesNotThrow(() => buildToolSet({
      ventureId: venture.id, teammateRef: "x", options, taste, ventureStore, deps: {},
    }), "the real firm tool set carries no forbidden-shaped name today");

    // Prove the seam itself refuses a forbidden-shaped name if one ever appeared.
    const { filterSafeTools } = await import("../../src/tool-safety.mjs");
    assert.throws(() => filterSafeTools([{ name: "send_outreach" }]), /outbound\/approval verb/);
    assert.throws(() => filterSafeTools([{ name: "approve_bet" }]), /outbound\/approval verb/);
  });
});

describe("driveTeammate — resume: a paused drive resumes from runtimeSessionId state only", () => {
  it("persists runtimeSessionId/stepCount/spentUsd/pausedFor on pause, and resumes from exactly that", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Resume" }, options);
    const client = fakeClient([turn(["f1", "fork_bet", { intent: "try a cold call" }]), text("forked")]);
    await driveTeammate({ ventureId: venture.id, teammateRef: "closer", goal: "Try a cold call", options, deps: { client } });
    const bet = listVentureDocs(venture.id, "bets", options)[0];

    // Exhaust the step budget mid-goal — the honest "budget" pause kind (a real founder-facing pause
    // would come from stage_outward/ask_founder parking; either way the resume contract is the same:
    // only the persisted work record carries state across the pause).
    const pausingClient = fakeClient([turn(["g1", "get_taste", {}])]);
    const drive1 = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "closer",
      goal: "Stage a draft",
      betId: bet.id,
      options,
      deps: { client: pausingClient, maxSteps: 1 },
    });
    assert.equal(drive1.outcome.kind, "budget");
    const afterFirst = getVentureDoc(venture.id, "bets", bet.id, options);
    assert.equal(afterFirst.work.stepCount, 1, "step count persisted across the pause");

    // Resume: a fresh client sees a fresh conversation (initialMessages is always null in this loop),
    // proving resume rides on the persisted work record rather than any replayed transcript.
    const resumeClient = fakeClient([text("done after resume")]);
    const drive2 = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "closer",
      goal: "Stage a draft",
      betId: bet.id,
      options,
      deps: { client: resumeClient },
    });
    assert.equal(drive2.outcome.kind, "completed");
    const afterResume = getVentureDoc(venture.id, "bets", bet.id, options);
    assert.equal(afterResume.work.stepCount, 2, "the step count continued from where it paused, not reset to 0");
    assert.equal(afterResume.work.pausedFor, null, "a completed drive clears the pause marker");
  });
});

describe("driveTeammate — runtimeForModel routes unchanged", () => {
  it("gpt-* routes to codex and claude-* routes to claude-code (existing behavior untouched)", () => {
    assert.equal(runtimeForModel("gpt-5.5-codex"), "codex");
    assert.equal(runtimeForModel("claude-opus-4-8"), "claude-code");
    assert.equal(runtimeForModel("unknown-model"), null);
  });
});
