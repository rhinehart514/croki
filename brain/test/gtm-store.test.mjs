import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  productTruthStore,
  productTruthsFromScan,
  persistProductTruthsFromScan,
  marketObjectStore,
  gtmPathStore,
  measurementContractStore,
  runStore,
  resultStore,
  repeatableMotionStore,
  learningStore,
  structuralProjection,
} from "../src/gtm-store.mjs";

// Isolated store root per test — nothing touches the real ~/.gtm-ide.
function freshRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-store-"));
  return { root };
}

describe("gtm-store — ProductTruth", () => {
  it("creates, persists, and reads back a truth; requires a statement", () => {
    const options = freshRoot();
    const truth = productTruthStore.create({
      projectId: "strelva",
      statement: "Signup carries a referral source",
      evidence: [{ claim: "referral param read at signup", source: "app/signup.ts:88", solidity: "observed" }],
      solidity: "observed",
    }, options);

    assert.match(truth.id, /^truth-/);
    assert.equal(truth.solidity, "observed");
    const read = productTruthStore.get(truth.id, options);
    assert.equal(read.statement, "Signup carries a referral source");
    assert.equal(read.evidence[0].source, "app/signup.ts:88");

    assert.throws(() => productTruthStore.create({ statement: "  " }, options), /statement is required/);
  });

  it("structurally demotes an evidence-less truth to speculative", () => {
    const options = freshRoot();
    const truth = productTruthStore.create({ statement: "Users adore the onboarding", solidity: "observed" }, options);
    assert.equal(truth.solidity, "speculative", "a claim with no sourced evidence cannot present as grounded");
  });

  it("adapts a scan report into grounded, file:line-cited truths (does not re-scan)", () => {
    const report = {
      repo: "/Users/x/strelva",
      scannedAt: "2026-07-02T00:00:00.000Z",
      winEvent: { name: "subscription_started", citations: [{ label: "Win event fires on checkout", file: "web/checkout.ts", line: 120, text: "track('subscription_started')" }] },
      attribution: { citations: [] },
      analytics: { citations: [] },
      gaps: [{ title: "Source not carried to win", citations: [{ label: "no source on win", file: "web/checkout.ts", line: 121, text: "" }] }],
    };
    const truths = productTruthsFromScan(report, { projectId: "strelva" });
    assert.equal(truths.length, 2);
    assert.ok(truths.every((t) => t.solidity === "observed"), "scan file:line evidence is observed");
    assert.equal(truths[0].evidence[0].source, "web/checkout.ts:120");
    assert.equal(truths[0].projectId, "strelva");
    // A report with no citations invents nothing.
    assert.deepEqual(productTruthsFromScan({ winEvent: { citations: [] }, gaps: [] }), []);
  });

  it("persists the scan's truths into the store, idempotently (so the map rests on real product facts)", () => {
    const options = freshRoot();
    const report = {
      repo: "/Users/x/strelva",
      scannedAt: "2026-07-02T00:00:00.000Z",
      winEvent: { name: "subscription_started", citations: [{ label: "Win event fires on checkout", file: "web/checkout.ts", line: 120 }] },
      attribution: { citations: [] },
      analytics: { citations: [] },
      gaps: [{ title: "Source not carried to win", citations: [{ label: "no source on win", file: "web/checkout.ts", line: 121 }] }],
    };

    // Before: zero product facts — this is exactly the "grounded in 0 product facts" state.
    assert.equal(productTruthStore.list({ ...options, projectId: "strelva" }).length, 0);

    const first = persistProductTruthsFromScan(report, { projectId: "strelva", options });
    assert.equal(first.created.length, 2, "both cited truths persisted");
    assert.equal(productTruthStore.list({ ...options, projectId: "strelva" }).length, 2, "the map now rests on real product facts");

    // Idempotent: a second call (a re-scan) adds nothing new — no duplicate pile-up.
    const second = persistProductTruthsFromScan(report, { projectId: "strelva", options });
    assert.equal(second.created.length, 0, "a re-scan creates no duplicates");
    assert.equal(second.skipped, 2);
    assert.equal(productTruthStore.list({ ...options, projectId: "strelva" }).length, 2);

    // A report with nothing cited persists nothing rather than inventing a fact.
    const empty = persistProductTruthsFromScan({ winEvent: { citations: [] }, gaps: [] }, { projectId: "strelva", options });
    assert.equal(empty.created.length, 0);
  });
});

describe("gtm-store — MarketObject (open kind)", () => {
  it("requires kind and statement, and demotes an unsourced object to speculative", () => {
    const options = freshRoot();
    const sourced = marketObjectStore.create({
      projectId: "strelva",
      kind: "pain",
      statement: "Ops leads lose an hour a day reconciling two dashboards",
      evidence: [{ claim: "stated in 3 of 5 calls", source: "notion://calls/2026-06", solidity: "researched" }],
      confidence: 0.6,
      openQuestions: ["how often per week?", "how often per week?"],
    }, options);
    assert.equal(sourced.kind, "pain");
    assert.equal(sourced.solidity, "researched");
    assert.equal(sourced.confidence, 0.6);
    assert.deepEqual(sourced.openQuestions, ["how often per week?"], "labels de-duplicated");

    const guessed = marketObjectStore.create({ kind: "buyer", statement: "probably SMB owners", solidity: "observed" }, options);
    assert.equal(guessed.solidity, "speculative");

    assert.throws(() => marketObjectStore.create({ statement: "no kind" }, options), /kind is required/);
    assert.throws(() => marketObjectStore.create({ kind: "buyer" }, options), /statement is required/);
  });

  it("accepts an entirely novel, open kind without rejection", () => {
    const options = freshRoot();
    const obj = marketObjectStore.create({ kind: "campfire_ritual", statement: "buyers gather at a weekly meetup", evidence: [{ claim: "seen", source: "eventbrite://x" }] }, options);
    assert.equal(obj.kind, "campfire_ritual");
  });
});

describe("gtm-store — GTMPath portfolio", () => {
  it("stores the open bet, code-owned ranking signals, refs, and defaults status to proposed", () => {
    const options = freshRoot();
    const p = gtmPathStore.create({
      projectId: "strelva",
      summary: "Reach ops leads through their existing analytics community",
      restsOn: [{ type: "marketObject", id: "mkt-1" }, "truth-9"],
      bet: { buyer: "ops lead", pain: "dashboard sprawl", channel: "community", offer: "", extraOpenField: "anything" },
      risk: "community may resist promotion",
      confidence: 0.4,
      rankingSignals: { evidenceStrength: 0.7, speedToTest: 0.9, wildcardSignal: 3 },
    }, options);

    assert.equal(p.status, "proposed");
    assert.equal(p.bet.buyer, "ops lead");
    assert.equal(p.bet.extraOpenField, "anything", "bet fields are open");
    assert.equal(p.bet.offer, undefined, "empty bet fields are dropped, not stored blank");
    assert.deepEqual(p.restsOn, [{ type: "marketObject", id: "mkt-1" }, { type: null, id: "truth-9" }]);
    assert.equal(p.rankingSignals.wildcardSignal, 3, "ranking signals are open data");
    assert.equal(gtmPathStore.get(p.id, options).summary, p.summary);

    assert.throws(() => gtmPathStore.create({ risk: "no summary" }, options), /summary is required/);
  });
});

describe("gtm-store — MeasurementContract", () => {
  it("keeps outcome kinds and sources as open lists with a join key", () => {
    const options = freshRoot();
    const mc = measurementContractStore.create({
      projectId: "strelva",
      pathId: "path-1",
      outcomeKinds: ["reply", "meeting", "signup", "wildcard_outcome"],
      sources: ["gmail", "product-event", "founder-entered"],
      joinKey: "campaign-2026-07",
      successCriteria: "at least one meeting booked within 14 days",
    }, options);
    assert.deepEqual(mc.outcomeKinds, ["reply", "meeting", "signup", "wildcard_outcome"]);
    assert.equal(mc.joinKey, "campaign-2026-07");
    assert.equal(measurementContractStore.get(mc.id, options).successCriteria, mc.successCriteria);
  });
});

describe("gtm-store — Run and Result join", () => {
  it("mints a joinKey per staged item and defaults the gate to pending", () => {
    const options = freshRoot();
    const run = runStore.create({
      projectId: "strelva",
      pathId: "path-1",
      steps: [{ kind: "agent", ref: "researcher" }],
      items: [{ to: "a@x.com" }, { to: "b@x.com", joinKey: "explicit-1" }],
    }, options);
    assert.equal(run.status, "staged");
    assert.equal(run.gateState.status, "pending");
    assert.ok(run.items[0].joinKey, "a joinKey is minted for an item that lacked one");
    assert.equal(run.items[1].joinKey, "explicit-1");
    assert.throws(() => runStore.create({ steps: [] }, options), /pathId/);
  });

  it("joins a Result back to its run via the joinKey; requires a joinKey", () => {
    const options = freshRoot();
    const run = runStore.create({ projectId: "strelva", pathId: "path-1", items: [{ to: "a@x.com", joinKey: "k1" }] }, options);
    const result = resultStore.create({
      projectId: "strelva",
      runId: run.id,
      pathId: "path-1",
      outcomeKind: "reply",
      channel: "email",
      value: { sentiment: "warm" },
      joinKey: "k1",
    }, options);
    assert.equal(result.joinKey, run.items[0].joinKey);
    assert.equal(result.outcomeKind, "reply");
    assert.throws(() => resultStore.create({ runId: run.id, outcomeKind: "reply" }, options), /joinKey/);
  });
});

describe("gtm-store — RepeatableMotion (light wrapper)", () => {
  it("wraps a source run with cadence and scorekeeping, no composition authority", () => {
    const options = freshRoot();
    const motion = repeatableMotionStore.create({
      projectId: "strelva",
      sourceRunId: "run-9",
      cadence: "weekly",
      nextRunTemplate: { pathId: "path-1" },
    }, options);
    assert.equal(motion.sourceRunId, "run-9");
    assert.deepEqual(motion.scorekeeping, { runs: [] });
    assert.equal(repeatableMotionStore.get(motion.id, options).cadence, "weekly");
    assert.throws(() => repeatableMotionStore.create({ cadence: "weekly" }, options), /sourceRunId/);
  });
});

describe("gtm-store — Learning capture (structural / identifying split)", () => {
  it("splits structural signal from identifying text and projects structural-only for pooling", () => {
    const options = freshRoot();
    const learning = learningStore.create({
      projectId: "strelva",
      productShape: "b2b-saas-analytics",
      runType: "cold-outreach",
      channel: "email",
      result: { outcomeKind: "meeting", value: 1 },
      promotionDecision: "promoted",
      // identifying:
      pathId: "path-1",
      marketObjectRefs: [{ type: "marketObject", id: "mkt-1" }],
      offer: "free 20-min teardown of your funnel",
      message: "Hi Dana, saw Strelva ships ...",
    }, options);

    assert.equal(learning.structural.productShape, "b2b-saas-analytics");
    assert.equal(learning.structural.channel, "email");
    assert.equal(learning.identifying.offer, "free 20-min teardown of your funnel");
    assert.equal(learning.identifying.pathId, "path-1");
    assert.deepEqual(learning.identifying.marketObjectRefs, [{ type: "marketObject", id: "mkt-1" }]);

    // The pooling projection carries structural signal ONLY — every identifying field is gone.
    const projected = structuralProjection(learning);
    assert.equal(projected.productShape, "b2b-saas-analytics");
    assert.equal(projected.channel, "email");
    assert.equal(projected.offer, undefined);
    assert.equal(projected.message, undefined);
    assert.equal(projected.pathId, undefined);
    assert.equal(projected.marketObjectRefs, undefined);
  });

  it("accepts the pre-split shape too", () => {
    const options = freshRoot();
    const learning = learningStore.create({
      structural: { productShape: "consumer-app", channel: "tiktok" },
      identifying: { offer: "secret", message: "hey" },
    }, options);
    assert.equal(learning.structural.channel, "tiktok");
    assert.equal(structuralProjection(learning).offer, undefined);
  });
});

describe("gtm-store — shared store behavior", () => {
  it("scopes list() to a project, orders newest first, and round-trips a save", () => {
    const options = freshRoot();
    marketObjectStore.create({ id: "mkt-a", projectId: "p1", kind: "buyer", statement: "one" }, options);
    marketObjectStore.create({ id: "mkt-b", projectId: "p2", kind: "buyer", statement: "other" }, options);
    marketObjectStore.create({ id: "mkt-c", projectId: "p1", kind: "buyer", statement: "two" }, options);

    const p1 = marketObjectStore.list({ ...options, projectId: "p1" });
    assert.deepEqual(p1.map((m) => m.id).sort(), ["mkt-a", "mkt-c"]);
    assert.equal(marketObjectStore.list(options).length, 3);

    const one = marketObjectStore.get("mkt-a", options);
    const saved = marketObjectStore.save({ ...one, statement: "one edited", evidence: [{ claim: "c", source: "f:1" }] }, options);
    assert.equal(saved.statement, "one edited");
    assert.equal(saved.solidity, "researched", "adding sourced evidence lifts it off speculative");
    assert.equal(saved.createdAt, one.createdAt, "createdAt preserved across save");
    assert.ok(saved.updatedAt >= one.updatedAt);
  });

  it("get throws a clear error for a missing record", () => {
    const options = freshRoot();
    assert.throws(() => gtmPathStore.get("path-nope", options), /not found/);
  });
});
