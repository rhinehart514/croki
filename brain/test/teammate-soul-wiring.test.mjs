// teammate-soul-wiring.test.mjs — souls fill from REAL runs, and a teammate reads its soul at draft time.
//
// This covers the wiring layer (soul-wiring.mjs) that bridges the pure soul model to the real run:
//   - a founder gate correction that recurs enough becomes a graduation candidate;
//   - a real reply/win folds into the teammate's track record and banks a world learning;
//   - the taste read (queryTaste) leads with a teammate's promoted soul, then the derived decisions;
//   - with no soul, the taste read is byte-for-byte unchanged.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  recordGateDecisionsIntoSouls,
  recordOutcomeIntoSoul,
  promotedSoulLessons,
} from "../src/soul-wiring.mjs";
import { teammateSoulStore as store } from "../src/teammate-soul-store.mjs";
import { queryTaste, buildTasteProfile, renderTasteProfile } from "../src/memory.mjs";

// Isolated on-disk root per test — never touches the real ~/.gtm-ide, order-independent.
function withRoot(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "soul-wiring-"));
  const opts = { root, backend: "json" };
  try {
    return run(opts);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// A run result carrying one gate node whose items were produced by `agentRef`.
function gateResult(runId, items) {
  return { runId, nodes: { gate1: { category: "gate", items } } };
}

describe("soul-wiring: gate corrections fill scratch learnings toward graduation", () => {
  it("a correction recurring 3x across 2 tasks makes listReady non-empty", () => {
    withRoot((opts) => {
      const ref = "outreach-writer";
      const CORRECTION = "Hi Dana, quick question about your rollout";

      // Task A (one run) carries the SAME correction twice — two items, distinct ids so the extractor
      // keeps both. Task B carries it once. That is 3 occurrences across 2 distinct tasks.
      recordGateDecisionsIntoSouls(
        {
          projectId: "rodentradar",
          result: gateResult("run-A", [
            { id: "i1", agentRef: ref, approvalStatus: "approved", editedFrom: "Hey there", draft: CORRECTION },
            { id: "i2", agentRef: ref, approvalStatus: "approved", editedFrom: "Hey there", draft: CORRECTION },
          ]),
        },
        opts,
      );
      // Below the bar after one task (3 recurrence needs both, and only 1 distinct task so far).
      assert.equal(store.listReady("rodentradar", ref, {}, opts).length, 0, "one task is not yet a pattern");

      recordGateDecisionsIntoSouls(
        {
          projectId: "rodentradar",
          result: gateResult("run-B", [
            { id: "i3", agentRef: ref, approvalStatus: "approved", editedFrom: "Hey there", draft: CORRECTION },
          ]),
        },
        opts,
      );

      const ready = store.listReady("rodentradar", ref, {}, opts);
      assert.equal(ready.length, 1, "3 occurrences across 2 tasks graduates one lesson");
      assert.match(ready[0].text, /Dana/, "the ready lesson carries the founder's correction");
    });
  });

  it("only stamps the teammate that produced the item — an unstamped item teaches nothing", () => {
    withRoot((opts) => {
      recordGateDecisionsIntoSouls(
        {
          projectId: "p1",
          result: gateResult("run-1", [
            { id: "x1", approvalStatus: "rejected", draft: "Some rejected draft with no author" },
          ]),
        },
        opts,
      );
      // No agentRef on the item → no soul is born for anyone.
      assert.equal(store.listForProject("p1", opts).length, 0);
    });
  });
});

describe("soul-wiring: real outcomes fold into the track record + a world learning", () => {
  it("a reply bumps replies and banks a source:'world' learning; a win bumps wins", () => {
    withRoot((opts) => {
      const reply = recordOutcomeIntoSoul(
        { projectId: "p1", agentRef: "outreach-writer", outcomeKind: "reply", message: "Sure, let's talk Tuesday" },
        opts,
      );
      assert.ok(reply, "a reply is a recognized world signal");
      const soul = store.get("p1", "outreach-writer", opts);
      assert.equal(soul.record.replies, 1);
      assert.equal(soul.record.wins, 0);
      const world = soul.learnings.find((l) => l.source === "world");
      assert.ok(world, "a world learning captures what landed");
      assert.match(world.text, /reply/i);

      recordOutcomeIntoSoul(
        { projectId: "p1", agentRef: "outreach-writer", outcomeKind: "converted", message: "Signed up" },
        opts,
      );
      const after = store.get("p1", "outreach-writer", opts);
      assert.equal(after.record.wins, 1, "a conversion counts as a win");
    });
  });

  it("a non-reply/non-win outcome is no signal — nothing is bumped, no soul is born", () => {
    withRoot((opts) => {
      const result = recordOutcomeIntoSoul(
        { projectId: "p1", agentRef: "outreach-writer", outcomeKind: "email-open", message: "opened" },
        opts,
      );
      assert.equal(result, null, "an open is not a reply or a win");
      assert.equal(store.get("p1", "outreach-writer", opts), null, "no fabricated soul");
    });
  });
});

describe("soul-wiring: the voice brief's standing rides on REAL signal, never a seed", () => {
  it("a logged win flips standing proving -> trusted", () => {
    withRoot((opts) => {
      const ref = "outreach-writer";
      // Fresh: no signal reads as proving.
      assert.equal(store.voiceBriefFor("p1", ref, {}, opts).standing, "proving");
      // A real conversion joins back — the ONLY thing that moves the standing.
      recordOutcomeIntoSoul({ projectId: "p1", agentRef: ref, outcomeKind: "converted", message: "Signed up" }, opts);
      assert.equal(store.voiceBriefFor("p1", ref, {}, opts).standing, "trusted");
    });
  });

  it("recorded sent-without-reply reads as on-notice", () => {
    withRoot((opts) => {
      const ref = "prospect-researcher";
      // Real drafts went out (two of them) and nothing came back — the honest on-notice read.
      store.recordOutcome("p1", ref, { runs: 1, sent: 2 }, {}, opts);
      assert.equal(store.voiceBriefFor("p1", ref, {}, opts).standing, "on-notice");
    });
  });
});

describe("soul-wiring: the taste read leads with the teammate's promoted soul", () => {
  const decisions = {
    approved: [{ name: null, draft: "A prior approved draft the founder liked" }],
    rejected: [],
    edits: [],
  };

  it("surfaces a promoted lesson AHEAD of the derived recent decisions", () => {
    withRoot((opts) => {
      const ref = "outreach-writer";
      // Record a correction, then the founder blesses it (explicit promotion — never auto).
      recordGateDecisionsIntoSouls(
        {
          projectId: "p1",
          result: gateResult("run-1", [
            { id: "i1", agentRef: ref, approvalStatus: "approved", editedFrom: "yo", draft: "Lead with the buyer's trigger" },
          ]),
        },
        opts,
      );
      const scratch = store.get("p1", ref, opts).learnings[0];
      store.promote("p1", ref, scratch.patternKey, {}, opts);

      const lessons = promotedSoulLessons("p1", ref, opts);
      assert.equal(lessons.length, 1, "one blessed lesson is in the permanent soul");

      const profile = buildTasteProfile(decisions);
      const read = queryTaste(profile, { question: "", promotedLessons: lessons });

      assert.ok(read.text.includes("Lead with the buyer's trigger"), "the promoted lesson is present");
      assert.ok(read.text.includes("A prior approved draft"), "the derived decisions still follow");
      assert.ok(
        read.text.indexOf("Lead with the buyer's trigger") < read.text.indexOf("A prior approved draft"),
        "the promoted soul leads, the derived decisions follow",
      );
      assert.equal(read.meta.promotedLessons, 1);
    });
  });

  it("no soul => the taste read is unchanged", () => {
    const profile = buildTasteProfile(decisions);
    const baseline = queryTaste(profile, { question: "" });
    // No promotedLessons at all, and an empty list, both behave exactly as before.
    assert.equal(baseline.text, renderTasteProfile(profile));
    assert.ok(!baseline.text.includes("Lessons this teammate has earned"));
    assert.equal(baseline.meta.promotedLessons, undefined);

    const emptySoul = queryTaste(profile, { question: "", promotedLessons: [] });
    assert.equal(emptySoul.text, baseline.text, "an empty soul changes nothing");
  });
});
