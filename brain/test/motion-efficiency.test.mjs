// motion-efficiency.test.mjs — the motion keying dimension + the ONE efficiency reader (GTM-MACHINE.md
// Area 7, "Measurement & attribution at operation scale").
//
// What this proves:
//   - Result.motionKind + motionRef are DERIVED at ingest from the joined run's own graph shape (reusing
//     engine.deriveMotionKind) — the founder never types it; an explicit stamp overrides; an out-of-band
//     outcome that joined to no run carries null (honestly unattributed, never forced into a bucket).
//   - A novel motion kind persists verbatim — the open-shape guard: no closed motionKind enum.
//   - deriveMotionEfficiency is the single per-motion table: two kinds attribute to SEPARATE rows; a
//     motion with staged work and no outcome reads honestly (measured 0, coverage 0), never a fabricated
//     rate; a probe outcome lands in its motion's row; coverage is null (not 0%) when nothing is staged.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ingestOutcome, ingestBatch, deriveMotionEfficiency, OUTCOME_SOURCES } from "../src/outcome-ingest.mjs";
import { deriveMotionKind, deriveMeasure } from "../src/engine.mjs";
import { gtmPathStore, runStore, resultStore } from "../src/gtm-store.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "motion-eff-")) };
}

// An outbound-shaped graph (has a source stage → conversion motion) and a content-shaped graph (no
// source; a generate → measure shape). Categories drive the SHAPE-derived motion kind.
const OUTBOUND_STEPS = [
  { id: "s", category: "source", kind: "tool", position: { x: 0 }, label: "Find founders" },
  { id: "d", category: "generate", kind: "agent", position: { x: 1 }, label: "Draft the note" },
  { id: "g", category: "gate", position: { x: 2 }, label: "Founder review" },
  { id: "e", category: "execute", kind: "tool", position: { x: 3 }, label: "Send" },
];
const CONTENT_STEPS = [
  { id: "gen", category: "generate", kind: "agent", position: { x: 0 }, label: "Mint per-city pages" },
  { id: "g", category: "gate", position: { x: 1 }, label: "Founder review" },
  { id: "pub", category: "execute", kind: "tool", position: { x: 2 }, label: "Publish" },
  { id: "m", category: "measure", kind: "mcp", position: { x: 3 }, label: "Read rankings" },
];

function seedMotion(options, { projectId, summary, steps, items }) {
  const gtmPath = gtmPathStore.create({ projectId, summary, status: "selected" }, options);
  const run = runStore.create(
    { projectId, pathId: gtmPath.id, status: "staged", steps, edges: [], items },
    options,
  );
  return { pathId: gtmPath.id, runId: run.id, run };
}

describe("motion dimension — derived at ingest from the joined run's shape", () => {
  it("stamps a shape-derived motionKind + motionRef; the founder never types it", () => {
    const options = freshRoot();
    const projectId = "estatesale";
    const { pathId } = seedMotion(options, {
      projectId,
      summary: "Reach estate-sale companies directly",
      steps: OUTBOUND_STEPS,
      items: [{ joinKey: "co-1", buyer: "Elm Estate Co", message: "hi" }],
    });

    const { result } = ingestOutcome({ joinKey: "co-1", outcomeKind: "reply" }, { ...options, projectId });
    // The kind is the graph's own shape name (source → outbound). motionRef is the durable path id.
    assert.equal(result.motionKind, deriveMotionKind({ nodes: OUTBOUND_STEPS }));
    assert.equal(result.motionKind, "Source loop");
    assert.equal(result.motionRef, pathId);
  });

  it("an explicit motionKind stamp overrides the derivation", () => {
    const options = freshRoot();
    const projectId = "estatesale";
    seedMotion(options, {
      projectId, summary: "x", steps: OUTBOUND_STEPS,
      items: [{ joinKey: "co-2" }],
    });
    const { result } = ingestOutcome(
      { joinKey: "co-2", outcomeKind: "reply", motionKind: "Partnership blitz", motionRef: "motion-x" },
      { ...options, projectId },
    );
    assert.equal(result.motionKind, "Partnership blitz");
    assert.equal(result.motionRef, "motion-x");
  });

  it("a novel motion kind persists verbatim — no closed motionKind enum", () => {
    const options = freshRoot();
    const projectId = "estatesale";
    seedMotion(options, { projectId, summary: "x", steps: OUTBOUND_STEPS, items: [{ joinKey: "co-3" }] });
    const { result } = ingestOutcome(
      { joinKey: "co-3", outcomeKind: "activated", motionKind: "midnight_barter_loop" },
      { ...options, projectId },
    );
    assert.equal(result.motionKind, "midnight_barter_loop");
  });

  it("an out-of-band outcome that joined to no run carries null motionKind — honestly unattributed", () => {
    const options = freshRoot();
    const projectId = "estatesale";
    seedMotion(options, { projectId, summary: "x", steps: OUTBOUND_STEPS, items: [{ joinKey: "co-4" }] });
    const { result, joined } = ingestOutcome({ joinKey: "off-ledger", outcomeKind: "reply" }, { ...options, projectId });
    assert.equal(joined, false);
    assert.equal(result.motionKind, null);
    assert.equal(result.motionRef, null);
  });
});

describe("deriveMotionEfficiency — the ONE per-motion table", () => {
  it("two kinds attribute to SEPARATE rows, keyed by shape-derived motionKind", () => {
    const options = freshRoot();
    const projectId = "estatesale";
    seedMotion(options, {
      projectId, summary: "outbound", steps: OUTBOUND_STEPS,
      items: [{ joinKey: "ob-1" }, { joinKey: "ob-2" }],
    });
    seedMotion(options, {
      projectId, summary: "pages", steps: CONTENT_STEPS,
      items: [{ joinKey: "pg-1" }, { joinKey: "pg-2" }, { joinKey: "pg-3" }],
    });

    // One reply on the outbound motion; two signups on the content (pages) motion.
    ingestOutcome({ joinKey: "ob-1", outcomeKind: "reply" }, { ...options, projectId });
    ingestOutcome({ joinKey: "pg-1", outcomeKind: "signup" }, { ...options, projectId });
    ingestOutcome({ joinKey: "pg-2", outcomeKind: "signup" }, { ...options, projectId });

    const eff = deriveMotionEfficiency({ projectId }, options);
    const outbound = eff.motions.find((m) => m.motionKind === "Source loop");
    const content = eff.motions.find((m) => m.motionKind === "Generate loop");
    assert.ok(outbound, "outbound motion has its own row");
    assert.ok(content, "content motion has its own row");
    assert.notEqual(outbound.motionKind, content.motionKind, "two kinds are two rows, never merged");

    assert.equal(outbound.staged, 2);
    assert.equal(outbound.measured, 1);
    assert.deepEqual(outbound.outcomesByKind, { reply: 1 });

    assert.equal(content.staged, 3);
    assert.equal(content.measured, 2);
    assert.deepEqual(content.outcomesByKind, { signup: 2 });

    // Ordered by observed outcomes: the content motion (2 signups) ranks above outbound (1 reply).
    assert.equal(content.orderRank, 0);
    assert.ok(outbound.orderRank > content.orderRank);
  });

  it("a motion with staged work and no measured outcome reads honestly — never a fabricated rate", () => {
    const options = freshRoot();
    const projectId = "estatesale";
    seedMotion(options, {
      projectId, summary: "outbound", steps: OUTBOUND_STEPS,
      items: [{ joinKey: "cold-1" }, { joinKey: "cold-2" }, { joinKey: "cold-3" }],
    });
    // Nothing ingested.
    const eff = deriveMotionEfficiency({ projectId }, options);
    const row = eff.motions.find((m) => m.motionKind === "Source loop");
    assert.equal(row.staged, 3);
    assert.equal(row.measured, 0);
    assert.equal(row.coverage, 0); // staged-but-unmeasured is an honest 0, not a made-up win rate
    assert.deepEqual(row.outcomesByKind, {});
    assert.equal(row.lastOutcomeAt, null);
  });

  it("an out-of-band stamped signal stays in the unattributed row and claims no move", () => {
    const options = freshRoot();
    const projectId = "estatesale";
    // No run at all. A caller-supplied motion stamp cannot manufacture attribution.
    ingestOutcome(
      { joinKey: "probe-1", outcomeKind: "ranked", motionKind: "AI visibility" },
      { ...options, projectId },
    );
    const eff = deriveMotionEfficiency({ projectId }, options);
    const row = eff.motions.find((m) => m.motionKind === null);
    assert.ok(row, "the out-of-band outcome remains visible in the unattributed row");
    assert.equal(eff.motions.some((m) => m.motionKind === "AI visibility"), false);
    assert.equal(row.motionRef, null);
    assert.equal(row.staged, 0);
    assert.equal(row.measured, 1);
    assert.equal(row.coverage, null, "coverage is null when nothing is staged — never a fabricated 0/100%");
  });

  it("a measurement probe outcome lands in its motion's row through the same ingest path", () => {
    const options = freshRoot();
    const projectId = "estatesale";
    seedMotion(options, {
      projectId, summary: "pages", steps: CONTENT_STEPS,
      items: [{ joinKey: "page-buffalo" }],
    });
    // A rank probe reading enters as an outcome with an open outcomeKind through ingestBatch (the same
    // door a founder note uses), joining on the page's staged key — no separate probe pipeline.
    ingestBatch(
      { projectId, sources: { "rank-probe": [{ joinKey: "page-buffalo", outcomeKind: "ranked", value: 3 }] } },
      { ...options, projectId },
    );
    const eff = deriveMotionEfficiency({ projectId }, options);
    const row = eff.motions.find((m) => m.motionKind === "Generate loop");
    assert.equal(row.measured, 1);
    assert.deepEqual(row.outcomesByKind, { ranked: 1 });
  });

  it("a non-outbound outcome kind moves the row identically to a reply (no outbound privilege)", () => {
    const options = freshRoot();
    const projectId = "estatesale";
    seedMotion(options, { projectId, summary: "pages", steps: CONTENT_STEPS, items: [{ joinKey: "act-1" }] });
    ingestOutcome({ joinKey: "act-1", outcomeKind: "cited" }, { ...options, projectId });
    const eff = deriveMotionEfficiency({ projectId }, options);
    const row = eff.motions.find((m) => m.motionKind === "Generate loop");
    assert.equal(row.measured, 1);
    assert.deepEqual(row.outcomesByKind, { cited: 1 });
  });

  it("an empty project returns an empty motion table with honest zero totals", () => {
    const options = freshRoot();
    const eff = deriveMotionEfficiency({ projectId: "nobody" }, options);
    assert.deepEqual(eff.motions, []);
    assert.deepEqual(eff.totals, { motions: 0, staged: 0, measured: 0 });
  });
});

describe("deriveMotionMeasure (via deriveMeasure) — one honest read for any motion kind", () => {
  it("a motion with a measured outcome reports it per kind and reads monitoring", () => {
    const results = [{ joinKey: "k1", outcomeKind: "signup", observedAt: "2026-07-08T00:00:00Z" }];
    const runs = [{ items: [{ joinKey: "k1" }], result: { nodes: {} } }];
    const graph = { nodes: CONTENT_STEPS };
    const measure = deriveMeasure(null, runs, [], graph, results);
    assert.equal(measure.throughput, 1);
    assert.deepEqual(measure.outcomesByKind, { signup: 1 });
    assert.equal(measure.agentStatus, "monitoring");
  });

  it("a motion with no way to observe reads 'no way to observe this yet' and names the probe", () => {
    // A content motion with no measure stage and no outcome — honestly blind, with the fix named.
    const graph = { nodes: [{ id: "gen", category: "generate", position: { x: 0 } }, { id: "g", category: "gate", position: { x: 1 } }] };
    const measure = deriveMeasure(null, [], [], graph, []);
    assert.ok(measure.activeIssues.some((i) => /no way to observe/i.test(i)));
    assert.ok(measure.suggestedActions.some((a) => /probe|measure step/i.test(a)));
    assert.equal(measure.throughput, 0);
  });
});
