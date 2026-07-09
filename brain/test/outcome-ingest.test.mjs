// outcome-ingest.test.mjs — Phase 5, outcome store + join (GTM-ENGINE-REBUILD §4, Phase 5).
//
// What this proves:
//   - A real outcome (reply → meeting → signup → purchase → retention, or a manual note) joins on ONE
//     key back to the exact run and path that produced it, and ties to
//     run/path/asset/message/channel/buyer/offer.
//   - Every Result also writes a Learning record, split into a non-identifying structural half and an
//     identifying half (the §2.8 pooling boundary).
//   - Ingestion works from all three sources (connected account, product usage event, founder-entered),
//     joined on the one key.
//   - Honest measurement: an item with no outcome is reported as UNMEASURED, never as a fake number;
//     an outcome whose key matches nothing staged is captured but reported apart, not attributed.
//   - Open shapes: a source label and an outcome kind that did not exist before ingest without rejection.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ingestOutcome,
  ingestBatch,
  joinToRun,
  outcomeReport,
  OUTCOME_SOURCES,
} from "../src/outcome-ingest.mjs";
import { gtmPathStore, runStore, resultStore, learningStore } from "../src/gtm-store.mjs";
import { teammateSoulStore } from "../src/teammate-soul-store.mjs";

// Isolated store root per test — nothing touches the real ~/.gtm-ide.
function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "outcome-ingest-")) };
}

// Seed a project with a path and a staged run whose items carry durable joinKeys. Returns ids + keys.
function seedRun(options, { projectId = "strelva", items } = {}) {
  const gtmPath = gtmPathStore.create(
    {
      projectId,
      summary: "Reach solo founders in indie Discords with a launch nudge",
      bet: { buyer: "solo founders", channel: "indie-hacker Discord", offer: "free launch checklist" },
      restsOn: [
        { type: "productTruth", id: "truth-1" },
        { type: "marketObject", id: "mkt-buyer" },
      ],
      status: "selected",
    },
    options,
  );
  const run = runStore.create(
    {
      projectId,
      pathId: gtmPath.id,
      status: "staged",
      items: items ?? [
        { joinKey: "handle-ada", buyer: "Ada", channel: "discord", offer: "checklist", message: "hey Ada" },
        { joinKey: "handle-bo", buyer: "Bo", channel: "discord", offer: "checklist", message: "hey Bo" },
        { joinKey: "handle-cy", buyer: "Cy", channel: "discord", offer: "checklist", message: "hey Cy" },
      ],
    },
    options,
  );
  return { projectId, pathId: gtmPath.id, runId: run.id, run };
}

describe("outcome ingest — join on one key", () => {
  it("joins an outcome back to the exact run + item that produced it", () => {
    const options = freshRoot();
    const { projectId, pathId, runId } = seedRun(options);

    const { result, joined, run, item } = ingestOutcome(
      { joinKey: "handle-ada", outcomeKind: "reply", source: OUTCOME_SOURCES.founderEntered },
      { ...options, projectId },
    );

    assert.equal(joined, true);
    assert.equal(run.id, runId);
    assert.equal(item.joinKey, "handle-ada");
    // Ties resolved from the joined run + item.
    assert.equal(result.runId, runId);
    assert.equal(result.pathId, pathId);
    assert.equal(result.channel, "discord");
    assert.equal(result.buyerRef, "Ada");
    assert.equal(result.offerRef, "checklist");
    assert.equal(result.outcomeKind, "reply");
    assert.equal(result.joinKey, "handle-ada");
  });

  it("an explicit field on the outcome overrides the derived tie; asset/message ids carry through", () => {
    const options = freshRoot();
    const { projectId } = seedRun(options);
    const { result } = ingestOutcome(
      { joinKey: "handle-bo", outcomeKind: "purchase", value: 49, channel: "email", assetId: "asset-x", messageId: "msg-9" },
      { ...options, projectId },
    );
    assert.equal(result.channel, "email"); // explicit wins over the item's "discord"
    assert.equal(result.assetId, "asset-x");
    assert.equal(result.messageId, "msg-9");
    assert.equal(result.value, 49);
  });

  it("joinToRun is a pure lookup and returns null on a miss", () => {
    const options = freshRoot();
    const { run } = seedRun(options);
    assert.equal(joinToRun({ joinKey: "handle-cy", runs: [run] }).item.joinKey, "handle-cy");
    assert.equal(joinToRun({ joinKey: "nope", runs: [run] }), null);
    assert.equal(joinToRun({ joinKey: "", runs: [run] }), null);
  });

  it("an outcome whose key matches nothing staged is captured honestly, not dropped", () => {
    const options = freshRoot();
    const { projectId } = seedRun(options);
    const { result, joined } = ingestOutcome(
      { joinKey: "unknown-key", outcomeKind: "reply" },
      { ...options, projectId },
    );
    assert.equal(joined, false);
    assert.equal(result.runId, null);
    assert.equal(result.pathId, null);
    assert.equal(result.joinKey, "unknown-key");
  });

  it("refuses an outcome with no joinKey", () => {
    const options = freshRoot();
    seedRun(options);
    assert.throws(() => ingestOutcome({ outcomeKind: "reply" }, { ...options, projectId: "strelva" }), /joinKey/);
  });
});

describe("outcome ingest — every Result writes a Learning", () => {
  it("writes a Learning split into a non-identifying structural half and an identifying half", () => {
    const options = freshRoot();
    const { projectId, pathId } = seedRun(options);
    const { learning } = ingestOutcome(
      { joinKey: "handle-ada", outcomeKind: "meeting", value: 1 },
      { ...options, projectId },
    );
    // Structural: shape + outcome, no customer text.
    assert.equal(learning.structural.channel, "discord");
    assert.deepEqual(learning.structural.result, { outcomeKind: "meeting", value: 1, joined: true });
    assert.equal("message" in learning.structural, false);
    // Identifying: the company-specific refs and text that a pooling boundary strips.
    assert.equal(learning.identifying.pathId, pathId);
    assert.equal(learning.identifying.offer, "checklist");
    assert.equal(learning.identifying.message, "hey Ada");
    assert.ok(learning.identifying.marketObjectRefs.some((r) => r.id === "mkt-buyer"));

    // One Result → one Learning, both persisted.
    assert.equal(resultStore.list({ ...options, projectId }).length, 1);
    assert.equal(learningStore.list({ ...options, projectId }).length, 1);
  });
});

describe("outcome ingest — three sources on one key", () => {
  it("ingests from connected account, product event, and founder-entered, joining each", () => {
    const options = freshRoot();
    const { projectId } = seedRun(options);
    const { ingested, joined, unjoined } = ingestBatch(
      {
        projectId,
        sources: {
          [OUTCOME_SOURCES.connectedAccount]: [{ joinKey: "handle-ada", outcomeKind: "reply" }],
          [OUTCOME_SOURCES.productEvent]: [{ joinKey: "handle-bo", outcomeKind: "signup" }],
          [OUTCOME_SOURCES.founderEntered]: [{ joinKey: "handle-cy", outcomeKind: "meeting" }],
        },
      },
      options,
    );
    assert.equal(ingested.length, 3);
    assert.equal(joined, 3);
    assert.equal(unjoined, 0);
    // Each stamped with the source label it came in under.
    const bySource = Object.fromEntries(ingested.map((x) => [x.result.outcomeKind, x.result.source]));
    assert.equal(bySource.reply, OUTCOME_SOURCES.connectedAccount);
    assert.equal(bySource.signup, OUTCOME_SOURCES.productEvent);
    assert.equal(bySource.meeting, OUTCOME_SOURCES.founderEntered);
  });

  it("open shapes: a novel source label and a novel outcome kind ingest without rejection", () => {
    const options = freshRoot();
    const { projectId } = seedRun(options);
    const { ingested } = ingestBatch(
      { projectId, sources: { a_source_that_did_not_exist_yesterday: [{ joinKey: "handle-ada", outcomeKind: "a_brand_new_outcome_kind" }] } },
      options,
    );
    assert.equal(ingested[0].result.outcomeKind, "a_brand_new_outcome_kind");
    assert.equal(ingested[0].result.source, "a_source_that_did_not_exist_yesterday");
  });
});

describe("outcome ingest — the live path feeds a teammate's standing (GAP 2)", () => {
  // Proves the LIVE ingest path — not just the store in isolation — actually calls recordOutcome on the
  // teammate that produced the joined item, so a real reply/win moves its standing off "proving". Without
  // this feed every teammate reads "proving" forever and the stakes tone never sharpens.
  it("a real joined win bumps the producing teammate's record so standing leaves 'proving'", () => {
    const options = freshRoot();
    const projectId = "strelva";
    const ref = "outreach-writer";
    // A staged item that carries the agentRef the graph stamps when an agent step produced it.
    seedRun(options, {
      projectId,
      items: [{ joinKey: "handle-ada", buyer: "Ada", channel: "discord", message: "hey Ada", agentRef: ref }],
    });

    // Cold: no signal yet — the honest "proving" read.
    assert.equal(teammateSoulStore.voiceBriefFor(projectId, ref, {}, options).standing, "proving");

    // A real win comes back and joins to that item.
    ingestOutcome({ joinKey: "handle-ada", outcomeKind: "converted", value: 1 }, { ...options, projectId });

    // The live ingest folded the win into the teammate's real record → standing sharpens to "trusted".
    const brief = teammateSoulStore.voiceBriefFor(projectId, ref, {}, options);
    assert.equal(brief.record.wins, 1);
    assert.equal(brief.standing, "trusted");
  });

  it("an item with no agentRef teaches no soul — nothing is fabricated", () => {
    const options = freshRoot();
    const projectId = "strelva";
    // The default seed items carry no agentRef.
    seedRun(options);
    ingestOutcome({ joinKey: "handle-ada", outcomeKind: "reply" }, { ...options, projectId });
    // No teammate soul was born from an unattributable outcome.
    assert.equal(teammateSoulStore.listForProject(projectId, options).length, 0);
  });
});

describe("outcome report — honest measurement", () => {
  it("reports unmeasured items as unmeasured, never a fake number", () => {
    const options = freshRoot();
    const { projectId, pathId } = seedRun(options); // 3 staged items
    ingestOutcome({ joinKey: "handle-ada", outcomeKind: "reply" }, { ...options, projectId });

    const report = outcomeReport({ projectId }, options);
    assert.equal(report.totals.staged, 3);
    assert.equal(report.totals.measured, 1);
    assert.equal(report.totals.unmeasured, 2);

    const line = report.paths.find((p) => p.pathId === pathId);
    assert.equal(line.staged, 3);
    assert.equal(line.measured, 1);
    assert.equal(line.unmeasured, 2);
    assert.deepEqual(line.outcomes, { reply: 1 });
    // Plain-language readback names the path and is honest about what is not yet measured.
    assert.match(line.summary, /reach solo founders/i);
    assert.match(line.summary, /1 reply/);
    assert.match(line.summary, /2 actions not yet measured/);
  });

  it("a path with staged items and zero outcomes reads as nothing measured yet", () => {
    const options = freshRoot();
    const { projectId } = seedRun(options);
    const report = outcomeReport({ projectId }, options);
    assert.equal(report.totals.measured, 0);
    assert.equal(report.totals.unmeasured, 3);
    assert.match(report.paths[0].summary, /Nothing measured yet/);
  });

  it("an unjoined result is counted apart, not attributed to a path", () => {
    const options = freshRoot();
    const { projectId } = seedRun(options);
    ingestOutcome({ joinKey: "handle-ada", outcomeKind: "reply" }, { ...options, projectId }); // joins
    ingestOutcome({ joinKey: "off-band-key", outcomeKind: "reply" }, { ...options, projectId }); // no match

    const report = outcomeReport({ projectId }, options);
    assert.equal(report.totals.results, 2);
    assert.equal(report.totals.unjoinedResults, 1);
    // Only the joined outcome is attributed to the path.
    const total = report.paths.reduce((s, p) => s + Object.values(p.outcomes).reduce((a, n) => a + n, 0), 0);
    assert.equal(total, 1);
  });

  it("orders paths by observed outcomes so 'which path worked' comes from real results", () => {
    const options = freshRoot();
    const projectId = "multi";
    // Path A: one outcome. Path B: two outcomes → should sort first.
    const a = seedRun(options, { projectId, items: [{ joinKey: "a1" }] });
    const b = seedRun(options, { projectId, items: [{ joinKey: "b1" }, { joinKey: "b2" }] });
    ingestOutcome({ joinKey: "a1", outcomeKind: "reply" }, { ...options, projectId });
    ingestOutcome({ joinKey: "b1", outcomeKind: "signup" }, { ...options, projectId });
    ingestOutcome({ joinKey: "b2", outcomeKind: "signup" }, { ...options, projectId });

    const report = outcomeReport({ projectId }, options);
    assert.equal(report.paths[0].pathId, b.pathId);
    assert.equal(report.paths[1].pathId, a.pathId);
  });
});

// ── Durable cross-tick dedupe ─────────────────────────────────────────────────────────────────────
// The automatic inbox reader re-reads the same sent message every heartbeat, re-ingesting the same
// signal each tick. Without durable dedupe, one real reply would mint a fresh Result every tick
// (~288/day), fabricating win counts. The persisted Result ledger IS the seen-state: a signal already
// recorded (same joinKey + outcomeKind + messageId + source) is a no-op. A founder-entered note, which
// carries no messageId, is never deduped — a genuine second manual entry is always kept.
describe("outcome ingest — durable dedupe on a re-observed signal", () => {
  it("records a messageId-bearing signal once, then no-ops on a re-ingest of the same signal", () => {
    const options = freshRoot();
    const { projectId } = seedRun(options);
    const signal = { joinKey: "handle-ada", outcomeKind: "reply", source: "connected-account", messageId: "gmsg-ada" };

    const first = ingestOutcome({ ...signal }, { ...options, projectId });
    assert.equal(first.deduped ?? false, false, "the first observation records a real Result");
    assert.equal(resultStore.list({ ...options, projectId }).length, 1);

    const second = ingestOutcome({ ...signal }, { ...options, projectId });
    assert.equal(second.deduped, true, "re-observing the same signal is a durable no-op");
    assert.equal(second.result.id, first.result.id, "the existing Result is returned, not a new one");
    assert.equal(resultStore.list({ ...options, projectId }).length, 1, "still exactly one Result — never a duplicate per tick");
  });

  it("still records a genuinely distinct signal (a different messageId or outcome kind)", () => {
    const options = freshRoot();
    const { projectId } = seedRun(options);
    ingestOutcome({ joinKey: "handle-ada", outcomeKind: "reply", source: "connected-account", messageId: "gmsg-1" }, { ...options, projectId });
    // A different sent message (different id) is a distinct real signal — recorded, not deduped.
    ingestOutcome({ joinKey: "handle-ada", outcomeKind: "reply", source: "connected-account", messageId: "gmsg-2" }, { ...options, projectId });
    // A different outcome kind on the same message is also distinct.
    ingestOutcome({ joinKey: "handle-ada", outcomeKind: "bounce", source: "connected-account", messageId: "gmsg-1" }, { ...options, projectId });
    assert.equal(resultStore.list({ ...options, projectId }).length, 3);
  });

  it("never dedupes a founder-entered outcome (no messageId), so a second manual entry is kept", () => {
    const options = freshRoot();
    const { projectId } = seedRun(options);
    // Two manual entries of the same kind on the same run — both real, both kept.
    ingestOutcome({ joinKey: "handle-ada", outcomeKind: "reply", source: "founder-entered" }, { ...options, projectId });
    ingestOutcome({ joinKey: "handle-ada", outcomeKind: "reply", source: "founder-entered" }, { ...options, projectId });
    assert.equal(resultStore.list({ ...options, projectId }).length, 2, "manual entries are never silently swallowed");
  });
});
