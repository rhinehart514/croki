// Comparison harness (E1.5) — the PURE diff logic, unit-tested without a live model.
//
// compareGroundingPaths builds the same step inputs BOTH ways (pre-pack vs agentic) and reports the
// structured difference. This proves the diff logic: it builds both, surfaces each manifest, the
// size/token delta, which tools the agentic path offered, and which providers moved from pre-packed
// text into a pulled tool. The live half (compareGroundingOutputs) needs a subscription and is
// proven in live-proofs.test.mjs; here we only test the deterministic shape comparison.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approxTokens, compareGroundingPaths, compareGroundingOutputs } from "../src/agentic-compare.mjs";
import { RETRIEVAL_SOURCES } from "../src/context/retrieval-tools.mjs";

// A realistically-sized context: the pre-pack staples ALL of this in, while the agentic catalog is
// a fixed short list of tool descriptions. Real run context is large (this is the regime the
// cutover exists for), so the agentic prompt is genuinely smaller here.
function richContext() {
  const competitors = Array.from({ length: 12 }, (_, i) => `Competitor ${i} with a real positioning sentence describing how they sell to pest-control operators`);
  return {
    grounding: {
      productName: "RodentRadar",
      headline: "Remote rodent monitoring for commercial food facilities — sensors that catch activity between quarterly inspections",
      stack: ["Swift", "Node", "Postgres", "MQTT", "React"],
      winEvent: { name: "project_created" },
      evidenceState: "blind",
      blindSpots: Array.from({ length: 6 }, (_, i) => ({ title: `Blind spot ${i}: an unattributed surface in the win path` })),
    },
    market: {
      buyer: "Regional, independent pest-control operators with commercial food-facility accounts under audit pressure",
      trigger: "A failed third-party food-safety audit at one of their accounts, where rodent activity went undetected between quarterly visits",
      channels: ["LinkedIn", "industry forums", "NPMA events", "state PCO association newsletters"],
      positioning: { category: "remote pest monitoring", promise: "catch activity between inspections" },
      competitors,
    },
    __memory: {
      approved: Array.from({ length: 8 }, (_, i) => ({ summary: `Approved decision ${i}: discovery-first openers that earn time land far better than a pitch` })),
      rejected: Array.from({ length: 4 }, (_, i) => ({ summary: `Rejected decision ${i}: anything that reads like surveillance or public-record scraping` })),
      edits: [],
    },
    __state: Array.from({ length: 5 }, (_, i) => ({ createdAt: `2026-06-2${i}`, ok: true, targetNodeId: `node-${i}` })),
  };
}

const stepInput = () => ({ ref: "gtm-enrich", prompt: "Find one operator.", items: [{ id: "1" }], context: richContext() });

describe("approxTokens", () => {
  it("is a stable char-based proxy, zero for empty", () => {
    assert.equal(approxTokens(""), 0);
    assert.equal(approxTokens("abcd"), 1);
    assert.equal(approxTokens("a".repeat(40)), 10);
  });
});

describe("compareGroundingPaths — full-agentic vs pre-pack", () => {
  it("builds both, reports each mode, and the agentic prompt is SMALLER", () => {
    const cmp = compareGroundingPaths(stepInput(), { agentic: { agenticRetrieval: true } });
    assert.equal(cmp.prePack.mode, "pre-pack");
    assert.equal(cmp.agentic.mode, "agentic");
    assert.ok(cmp.delta.chars < 0, "agentic prompt should be smaller (no stapled block)");
    assert.ok(cmp.delta.approxTokens < 0, "fewer approx tokens on the agentic path");
    assert.equal(cmp.summary.smaller, true);
    assert.equal(cmp.summary.sameInputs, true);
  });

  it("reports the tools the agentic path offered (one per real source)", () => {
    const cmp = compareGroundingPaths(stepInput(), { agentic: { agenticRetrieval: true } });
    assert.equal(cmp.agentic.offeredToolCount, RETRIEVAL_SOURCES.length);
    assert.equal(cmp.prePack.offeredToolCount, 0, "pre-pack offers no tools");
    assert.ok(cmp.agentic.offeredTools.includes("get_market"));
  });

  it("lists which providers MOVED from pre-packed text into a pulled tool", () => {
    const cmp = compareGroundingPaths(stepInput(), { agentic: { agenticRetrieval: true } });
    // market, product, taste, state all contributed in the pre-pack and are now tools.
    assert.ok(cmp.movedToTools.includes("market"), "market moved from text to a tool");
    assert.ok(cmp.movedToTools.includes("product"), "product moved from text to a tool");
    assert.ok(cmp.movedToTools.includes("taste"), "taste moved from text to a tool");
  });

  it("surfaces each manifest for inspection", () => {
    const cmp = compareGroundingPaths(stepInput(), { agentic: { agenticRetrieval: true } });
    assert.ok(Array.isArray(cmp.prePack.manifest.providers), "pre-pack manifest carries its providers");
    assert.equal(cmp.agentic.manifest.mode, "agentic");
    assert.ok(Array.isArray(cmp.agentic.manifest.offered));
  });
});

describe("compareGroundingPaths — single-source cutover", () => {
  it("compares ONLY market cut over against the full pre-pack", () => {
    const cmp = compareGroundingPaths(stepInput(), { agentic: { agenticProviders: ["market"] } });
    assert.equal(cmp.agentic.mode, "partial-agentic");
    assert.deepEqual(cmp.agentic.offeredTools, ["get_market"]);
    // Only market moved to a tool; product/taste/state stay pre-packed on BOTH sides.
    assert.deepEqual(cmp.movedToTools, ["market"]);
    assert.ok(cmp.agentic.prePackedProviders.includes("taste"), "taste still pre-packed in the partial build");
    assert.ok(!cmp.agentic.prePackedProviders.includes("market"), "market is no longer pre-packed");
  });

  it("the single-source cutover moves FEWER providers than the full flip", () => {
    const full = compareGroundingPaths(stepInput(), { agentic: { agenticRetrieval: true } });
    const oneSource = compareGroundingPaths(stepInput(), { agentic: { agenticProviders: ["market"] } });
    // The full flip moves every contributing provider to a tool; the single-source flip moves one.
    assert.equal(oneSource.movedToTools.length, 1, "exactly one provider moved");
    assert.ok(full.movedToTools.length > oneSource.movedToTools.length, "the full flip moves strictly more");
    // And the partial path still pre-packs the sources it did NOT cut over; the full path pre-packs none.
    assert.ok(oneSource.agentic.prePackedProviders.length > 0, "partial cutover still pre-packs the rest");
    assert.equal(full.agentic.prePackedProviders.length, 0, "the full flip pre-packs nothing");
  });
});

describe("compareGroundingOutputs — the LIVE half is guarded, never runs a model in unit tests", () => {
  it("refuses without a live invoker (it spends a real subscription call)", async () => {
    await assert.rejects(
      () => compareGroundingOutputs(stepInput(), {}),
      /live agent invoker/,
      "the output comparison must demand a real invoker so a unit test can't accidentally spend",
    );
  });

  it("runs both paths through an injected fake invoker (proves the wiring without a model)", async () => {
    const calls = [];
    const fakeInvoker = async ({ config }) => {
      calls.push(config);
      return { ok: true, items: [{ from: config.agenticRetrieval ? "agentic" : "pre-pack" }], meta: { invoked: "gtm-enrich" } };
    };
    const result = await compareGroundingOutputs(stepInput(), { invoker: fakeInvoker });
    assert.equal(calls.length, 2, "both paths run");
    assert.ok(result.shape, "the shape comparison is included");
    assert.equal(result.prePack.items[0].from, "pre-pack");
    assert.equal(result.agentic.items[0].from, "agentic");
  });
});
