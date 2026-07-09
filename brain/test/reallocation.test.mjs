// reallocation.test.mjs — the learn-and-reallocate loop (GTM-MACHINE.md Area 3).
//
// What this proves (the doc's required cases):
//   - honest-null under the floor — a motion below `minObservations` measured outcomes has null lift;
//     one lucky send never reallocates, and reallocationWeights is a no-op.
//   - non-outbound kinds lift IDENTICALLY — a `ranked`/`cited`/`activated` outcome moves the signal the
//     same as a `reply` (no outbound privilege).
//   - unmeasured stays unmeasured — a motion with staged work and zero outcomes reads honestly and is
//     flagged as starved, never a fabricated rate and never auto-killed.
//   - the cross-product pool strips identity — learnedSignalAcross reads the structural projection only,
//     never customer text, and floors a one-off cross-product observation.
//   - founder weights ALWAYS win — the tilt is bounded/clamped, never inverts the founder's base, and
//     the base passes through unchanged when nothing is measured.
//   - the loop CLOSES — an outcome demonstrably shapes the next compose grounding (renderLearnedSignal)
//     and the next ranking (tiltedSignalWeights).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  learnedSignal,
  learnedSignalAcross,
  renderLearnedSignal,
  reallocationWeights,
  tiltedSignalWeights,
  starvedMotions,
  reallocationReceipt,
} from "../src/reallocation.mjs";
import { ingestOutcome, ingestBatch } from "../src/outcome-ingest.mjs";
import { gtmPathStore, runStore, learningStore } from "../src/gtm-store.mjs";
import { saveReallocationTunables, DEFAULT_REALLOCATION_TUNABLES } from "../src/reallocation-tunables-store.mjs";
import { saveSignalWeights, DEFAULT_SIGNAL_WEIGHTS } from "../src/signal-weights-store.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "reallocation-")) };
}

// Shapes drive the shape-derived motion kind (source → "Source loop"; generate → "Generate loop").
const OUTBOUND_STEPS = [
  { id: "s", category: "source", kind: "tool", position: { x: 0 }, label: "Find companies" },
  { id: "d", category: "generate", kind: "agent", position: { x: 1 }, label: "Draft" },
  { id: "g", category: "gate", position: { x: 2 }, label: "Review" },
  { id: "e", category: "execute", kind: "tool", position: { x: 3 }, label: "Send" },
];
const CONTENT_STEPS = [
  { id: "gen", category: "generate", kind: "agent", position: { x: 0 }, label: "Mint pages" },
  { id: "g", category: "gate", position: { x: 1 }, label: "Review" },
  { id: "pub", category: "execute", kind: "tool", position: { x: 2 }, label: "Publish" },
  { id: "m", category: "measure", kind: "mcp", position: { x: 3 }, label: "Read rankings" },
];

function seedMotion(options, { projectId, summary, steps, items }) {
  const gtmPath = gtmPathStore.create({ projectId, summary, status: "selected" }, options);
  const run = runStore.create(
    { projectId, pathId: gtmPath.id, status: "staged", steps, edges: [], items },
    options,
  );
  return { pathId: gtmPath.id, runId: run.id };
}

// Stage N items on a content motion and measure `measured` of them with the given outcome kind.
function seedMeasuredContent(options, projectId, { staged, measured, outcomeKind = "signup" }) {
  const items = Array.from({ length: staged }, (_, i) => ({ joinKey: `c-${i}` }));
  seedMotion(options, { projectId, summary: "pages", steps: CONTENT_STEPS, items });
  for (let i = 0; i < measured; i += 1) {
    ingestOutcome({ joinKey: `c-${i}`, outcomeKind }, { ...options, projectId });
  }
}

describe("learnedSignal — the observation floor", () => {
  it("below the floor, lift is honest-null (one lucky send never reallocates)", () => {
    const options = freshRoot();
    const projectId = "p";
    // 4 staged, 1 measured — under the default floor of 5.
    seedMeasuredContent(options, projectId, { staged: 4, measured: 1 });

    const signal = learnedSignal(projectId, options);
    const content = signal.motions.find((m) => m.motionKind === "Generate loop");
    assert.ok(content, "the content motion has a row");
    assert.equal(content.observed, 1);
    assert.equal(content.meetsFloor, false, "1 observed is under the floor of 5");
    assert.equal(content.lift, null, "lift is honest-null under the floor — the machine does not tilt");
    // A no-op tilt: nothing cleared the floor, so the founder's base passes through unchanged.
    const tilt = reallocationWeights(signal, DEFAULT_SIGNAL_WEIGHTS);
    assert.equal(tilt.applied, false, "under the floor, reallocation is a no-op");
  });

  it("at or above the floor, lift is defined against the qualifying mean", () => {
    const options = freshRoot();
    const projectId = "p";
    // A tunable floor of 3 so the test stays small; the store is per-root so nothing global changes.
    saveReallocationTunables({ observationFloor: 3 }, { ...options, projectId });
    // Content motion: 5 staged, 5 measured (clears floor 3). Outbound: 5 staged, 3 measured (clears too).
    seedMeasuredContent(options, projectId, { staged: 5, measured: 5, outcomeKind: "signup" });
    const obItems = Array.from({ length: 5 }, (_, i) => ({ joinKey: `o-${i}` }));
    seedMotion(options, { projectId, summary: "outbound", steps: OUTBOUND_STEPS, items: obItems });
    for (let i = 0; i < 3; i += 1) ingestOutcome({ joinKey: `o-${i}`, outcomeKind: "reply" }, { ...options, projectId });

    const signal = learnedSignal(projectId, options);
    assert.equal(signal.minObservations, 3);
    const content = signal.motions.find((m) => m.motionKind === "Generate loop");
    const outbound = signal.motions.find((m) => m.motionKind === "Source loop");
    assert.equal(content.meetsFloor, true);
    assert.equal(outbound.meetsFloor, true);
    // Mean of (5, 3) = 4. Content lifts +1, outbound lifts -1.
    assert.equal(signal.projectMean, 4);
    assert.equal(content.lift, 1);
    assert.equal(outbound.lift, -1);
  });
});

describe("learnedSignal — non-outbound kinds lift identically, unmeasured stays unmeasured", () => {
  it("a `ranked`/`cited` outcome moves the signal the same as a `reply`", () => {
    const options = freshRoot();
    const projectId = "p";
    saveReallocationTunables({ observationFloor: 2 }, { ...options, projectId });
    // Content motion earns 2 `ranked` outcomes; identical staged/measured to an outbound with 2 replies.
    seedMeasuredContent(options, projectId, { staged: 2, measured: 2, outcomeKind: "ranked" });
    const obItems = [{ joinKey: "o-0" }, { joinKey: "o-1" }];
    seedMotion(options, { projectId, summary: "outbound", steps: OUTBOUND_STEPS, items: obItems });
    ingestOutcome({ joinKey: "o-0", outcomeKind: "reply" }, { ...options, projectId });
    ingestOutcome({ joinKey: "o-1", outcomeKind: "reply" }, { ...options, projectId });

    const signal = learnedSignal(projectId, options);
    const content = signal.motions.find((m) => m.motionKind === "Generate loop");
    const outbound = signal.motions.find((m) => m.motionKind === "Source loop");
    // Same observed count, same lift — the non-outbound kind carries no penalty and no privilege.
    assert.equal(content.observed, outbound.observed);
    assert.equal(content.lift, outbound.lift);
  });

  it("a motion with staged work and zero outcomes reads unmeasured and is flagged as starved", () => {
    const options = freshRoot();
    const projectId = "p";
    // 6 staged, 0 measured — above the floor of 5 in staged work, nothing measured.
    const items = Array.from({ length: 6 }, (_, i) => ({ joinKey: `x-${i}` }));
    seedMotion(options, { projectId, summary: "cold", steps: OUTBOUND_STEPS, items });

    const signal = learnedSignal(projectId, options);
    const row = signal.motions.find((m) => m.motionKind === "Source loop");
    assert.equal(row.measured, 0);
    assert.equal(row.lift, null, "no measured outcome → no lift, never a fabricated rate");
    assert.equal(row.ignoredRate, 1, "6 of 6 staged drew nothing → ignoredRate 1");

    const starved = starvedMotions(projectId, options);
    assert.equal(starved.motions.length, 1);
    assert.equal(starved.motions[0].motionKind, "Source loop");
    assert.equal(starved.motions[0].staged, 6);
    assert.match(starved.motions[0].reason, /0 measured/);
  });
});

describe("reallocationWeights — founder weights always win", () => {
  it("is a no-op when nothing clears the floor; base passes through unchanged", () => {
    const options = freshRoot();
    const projectId = "p";
    seedMeasuredContent(options, projectId, { staged: 4, measured: 1 }); // under floor
    const signal = learnedSignal(projectId, options);
    const result = reallocationWeights(signal, DEFAULT_SIGNAL_WEIGHTS);
    assert.equal(result.applied, false);
    assert.deepEqual(result.weights, { ...DEFAULT_SIGNAL_WEIGHTS });
  });

  it("tilts toward hard evidence but never inverts or zeroes a founder weight", () => {
    const options = freshRoot();
    const projectId = "p";
    saveReallocationTunables({ observationFloor: 2, tiltClamp: 0.35 }, { ...options, projectId });
    seedMeasuredContent(options, projectId, { staged: 5, measured: 5, outcomeKind: "signup" });

    const signal = { ...learnedSignal(projectId, options), tiltClamp: 0.35 };
    const result = reallocationWeights(signal, DEFAULT_SIGNAL_WEIGHTS);
    assert.equal(result.applied, true);
    // Every weight stays strictly positive and within the clamp of its base — the ordering can't invert.
    for (const key of Object.keys(DEFAULT_SIGNAL_WEIGHTS)) {
      const base = DEFAULT_SIGNAL_WEIGHTS[key];
      const tilted = result.weights[key];
      assert.ok(tilted > 0, `${key} stays positive`);
      assert.ok(tilted >= base * (1 - 0.35) - 1e-9, `${key} never eased below the clamp floor`);
      assert.ok(tilted <= base * (1 + 0.35) + 1e-9, `${key} never raised past the clamp ceiling`);
    }
    // The hard-evidence signals moved UP; the softer proxies eased DOWN.
    assert.ok(result.weights.evidenceStrength > DEFAULT_SIGNAL_WEIGHTS.evidenceStrength);
    assert.ok(result.weights.measurementReadiness > DEFAULT_SIGNAL_WEIGHTS.measurementReadiness);
    assert.ok(result.weights.upside <= DEFAULT_SIGNAL_WEIGHTS.upside);
    assert.ok(result.weights.founderFit <= DEFAULT_SIGNAL_WEIGHTS.founderFit);
  });

  it("a clamp of 0 disables the tilt entirely — a founder who opts out is honored", () => {
    const options = freshRoot();
    const projectId = "p";
    saveReallocationTunables({ observationFloor: 2, tiltClamp: 0 }, { ...options, projectId });
    seedMeasuredContent(options, projectId, { staged: 5, measured: 5 });
    const signal = { ...learnedSignal(projectId, options), tiltClamp: 0 };
    const result = reallocationWeights(signal, DEFAULT_SIGNAL_WEIGHTS);
    // With clamp 0 the strength is 0 → every delta is 0 → base passes through.
    assert.deepEqual(result.weights, { ...DEFAULT_SIGNAL_WEIGHTS });
  });
});

describe("tiltedSignalWeights — the ranking seam, founder base preserved", () => {
  it("returns the founder's saved base when nothing is measured", () => {
    const options = freshRoot();
    const projectId = "p";
    const savedBase = saveSignalWeights({ evidenceStrength: 0.4 }, { ...options, projectId });
    const { weights, applied, base } = tiltedSignalWeights({ ...options, projectId });
    assert.equal(applied, false);
    assert.deepEqual(base, savedBase);
    assert.deepEqual(weights, savedBase, "with nothing measured, ranking reads the founder's base verbatim");
  });

  it("the founder's saved base is the anchor the tilt moves — not the shipped default", () => {
    const options = freshRoot();
    const projectId = "p";
    // A founder who's cranked evidence to 0.4; the tilt should raise it from THAT base, not from 0.22.
    saveSignalWeights({ evidenceStrength: 0.4 }, { ...options, projectId });
    saveReallocationTunables({ observationFloor: 2 }, { ...options, projectId });
    seedMeasuredContent(options, projectId, { staged: 5, measured: 5 });
    const { weights, base, applied } = tiltedSignalWeights({ ...options, projectId });
    assert.equal(applied, true);
    assert.equal(base.evidenceStrength, 0.4);
    assert.ok(weights.evidenceStrength >= 0.4, "tilt raised the founder's own base, never reset to default");
  });
});

describe("the loop closes — an outcome shapes the next compose", () => {
  it("renderLearnedSignal names a working motion shape once it clears the floor", () => {
    const options = freshRoot();
    const projectId = "p";
    saveReallocationTunables({ observationFloor: 2 }, { ...options, projectId });
    seedMeasuredContent(options, projectId, { staged: 5, measured: 5, outcomeKind: "signup" });
    // A second, starved motion so both halves of the block render.
    const items = Array.from({ length: 5 }, (_, i) => ({ joinKey: `d-${i}` }));
    seedMotion(options, { projectId, summary: "cold", steps: OUTBOUND_STEPS, items });

    const block = renderLearnedSignal(learnedSignal(projectId, options));
    assert.match(block, /EARNING WINS/);
    assert.match(block, /Generate loop/);
    assert.match(block, /5 signup/);
    assert.match(block, /DRAWN NOTHING/);
    assert.match(block, /Source loop/);
  });

  it("renders nothing on a fresh project (no measured outcome → no faked block)", () => {
    const options = freshRoot();
    assert.equal(renderLearnedSignal(learnedSignal("nobody", options)), "");
  });
});

describe("learnedSignalAcross — the floored cross-product prior strips identity", () => {
  it("pools the structural projection only — never customer text — and drops the excluded project", () => {
    const options = freshRoot();
    // Two other-product learnings with joined outcomes, plus identifying text that must NOT leak.
    for (let i = 0; i < 6; i += 1) {
      learningStore.create(
        {
          projectId: "other-co",
          structural: {
            productShape: "marketplace",
            channel: "content",
            result: { outcomeKind: "signup", value: 1, joined: true },
          },
          identifying: {
            pathId: "secret-path",
            offer: "Jane Doe's private discount",
            message: "Hi Jane, here's your link",
          },
        },
        { ...options, projectId: "other-co" },
      );
    }
    // The excluded project's own learning — must be dropped from its own prior.
    learningStore.create(
      {
        projectId: "mine",
        structural: { productShape: "marketplace", channel: "content", result: { outcomeKind: "signup", joined: true } },
        identifying: { pathId: "p", offer: "x", message: "y" },
      },
      { ...options, projectId: "mine" },
    );

    // The prior for "mine" pools EVERY other product's learnings and drops "mine"'s own. It reads the
    // whole store (no projectId scope) and strips identity at the structuralProjection boundary.
    const prior = learnedSignalAcross({ excludeProjectId: "mine" }, options);
    assert.equal(prior.floored, true);
    const serialized = JSON.stringify(prior);
    assert.ok(!/Jane Doe/.test(serialized), "no customer name leaks into the prior");
    assert.ok(!/secret-path/.test(serialized), "no identifying path leaks into the prior");
    assert.ok(!/here's your link/.test(serialized), "no message text leaks into the prior");
    // The pooled shape survives at exactly 6 — the excluded project's own 7th observation is dropped, so
    // "mine" gets a prior built purely from OTHER products.
    const row = prior.motions.find((m) => m.productShape === "marketplace");
    assert.ok(row, "the pooled shape is present past the floor");
    assert.equal(row.observed, 6, "the excluded project's own learning is dropped from its prior");
  });

  it("floors a one-off cross-product observation — a single win is not a prior", () => {
    const options = freshRoot();
    learningStore.create(
      {
        projectId: "other-co",
        structural: { productShape: "solo", channel: "outbound", result: { outcomeKind: "reply", joined: true } },
        identifying: {},
      },
      { ...options, projectId: "other-co" },
    );
    const prior = learnedSignalAcross({ excludeProjectId: "mine" }, options);
    assert.equal(prior.motions.length, 0, "1 observation is under the floor — no prior emitted");
  });
});

describe("reallocationReceipt — the Overdrive card, overturnable, never a hidden policy", () => {
  it("composes the working motions, the tilt reasons, and the starved flags", () => {
    const options = freshRoot();
    const projectId = "p";
    saveReallocationTunables({ observationFloor: 2 }, { ...options, projectId });
    seedMeasuredContent(options, projectId, { staged: 5, measured: 5, outcomeKind: "signup" });
    const items = Array.from({ length: 5 }, (_, i) => ({ joinKey: `d-${i}` }));
    seedMotion(options, { projectId, summary: "cold", steps: OUTBOUND_STEPS, items });

    const receipt = reallocationReceipt(projectId, options);
    assert.equal(receipt.applied, true);
    assert.ok(receipt.working.some((m) => m.motionKind === "Generate loop"));
    assert.ok(receipt.reasons.length > 0);
    assert.ok(receipt.starved.some((m) => m.motionKind === "Source loop"));
    // The base is carried so the founder sees what it moved FROM — overturnable, not hidden.
    assert.deepEqual(receipt.base, { ...DEFAULT_SIGNAL_WEIGHTS });
  });
});

describe("reallocation-tunables — the founder-tunable aggressiveness knobs", () => {
  it("ships the stated defaults and bounds a tuned value", () => {
    const options = freshRoot();
    const projectId = "p";
    assert.equal(DEFAULT_REALLOCATION_TUNABLES.observationFloor, 5);
    assert.equal(DEFAULT_REALLOCATION_TUNABLES.tiltClamp, 0.35);
    assert.equal(DEFAULT_REALLOCATION_TUNABLES.dailyProbeCap, 20);
    // A clamp of 5 (would invert a base weight) is bounded down to the safe ceiling; a negative floor
    // falls back to the default.
    const saved = saveReallocationTunables({ observationFloor: -3, tiltClamp: 5, dailyProbeCap: 40 }, { ...options, projectId });
    assert.equal(saved.observationFloor, DEFAULT_REALLOCATION_TUNABLES.observationFloor);
    assert.ok(saved.tiltClamp < 1, "a clamp that could invert the base is bounded below 1");
    assert.equal(saved.dailyProbeCap, 40);
  });
});
