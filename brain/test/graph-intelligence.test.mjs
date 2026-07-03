import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { deriveWeaknessForGraph, detectWeakness, weaknessReport } from "../src/graph-intelligence/weakness.mjs";
import { recommend, scorePath } from "../src/graph-intelligence/path-ranking.mjs";
import { routeEdgeType, validateInferredEdges } from "../src/graph-intelligence/edge-inference.mjs";
import { sprayGraph } from "../src/graph-intelligence/spray.mjs";

const at = "2026-07-02T00:00:00.000Z";
const source = (ref) => ({ kind: "scan", ref, preview: ref, at });

// An isolated store root so recommend()'s signal-weights lookup reads a fresh (empty → default) store
// instead of the real ~/.gtm-ide — the weights are the seed defaults, exactly as before.
function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "graph-intelligence-")) };
}

function node(id, fields = {}) {
  return {
    id,
    projectId: "drover",
    domain: "strategy",
    type: "message",
    maturity: "typed",
    statement: id,
    evidence: [],
    sources: [source(id)],
    origin: "spray",
    payload: {},
    ...fields,
  };
}

describe("graph intelligence — weakness", () => {
  it("fires evidence from stored provenance and leaves deferred detectors unmeasured", () => {
    const unsupported = node("unsupported", { evidence: [], sources: [source("founder-note")] });
    const result = detectWeakness(unsupported, { nodes: [unsupported], edges: [] });
    assert.equal(result.report.evidence, "fired");
    assert.equal(result.report.specificity, "unmeasured");
    assert.equal(result.report.performance, "unmeasured");
    assert.equal(result.weaknesses[0].detectedFrom.length, 1, "weakness carries a real receipt");
  });

  it("reports thin no-signal data as unmeasured instead of flagging every card", () => {
    const thin = node("thin", { evidence: [], sources: [] });
    const report = weaknessReport(thin, { nodes: [thin], edges: [] });
    assert.equal(report.evidence, "unmeasured");
    assert.equal(report.product, "unmeasured");
    assert.equal(report.measurement, "unmeasured");
    assert.equal(report.execution, "unmeasured");
  });

  it("fires and clears product weakness from observed Product support", () => {
    const claim = node("claim", { payload: { claimsProduct: true } });
    const proof = node("proof", {
      domain: "product",
      type: "proof",
      statement: "The repo proves it.",
      solidity: "observed",
      evidence: [{ claim: "it exists", source: "src/app.ts:1", solidity: "observed", capturedAt: at }],
    });
    assert.equal(weaknessReport(claim, { nodes: [claim], edges: [] }).product, "fired");
    assert.equal(weaknessReport(claim, {
      nodes: [claim, proof],
      edges: [{ id: "e", source: "proof", target: "claim", type: "supports", status: "proposed", basis: [source("src/app.ts:1")], confidence: 100 }],
    }).product, "clear");
  });

  it("detects measurement gaps and incomplete contracts without blocking compile", () => {
    const path = node("path", { domain: "runs", type: "path", statement: "Cold email path" });
    const contract = node("mc", {
      domain: "measurement",
      type: "contract",
      statement: "Measure replies",
      payload: { outcomeKinds: ["reply"], sources: [], joinKey: "", successCriteria: "" },
    });
    const report = weaknessReport(path, {
      nodes: [path, contract],
      edges: [{ id: "m", source: "path", target: "mc", type: "measured_by", status: "proposed", basis: [source("compile")], confidence: 100 }],
    });
    assert.equal(report.measurement, "fired");
  });

  it("detects unsourceable audience lists through source-entry discipline", () => {
    const list = node("list", {
      domain: "audience",
      type: "list",
      statement: "Empty manual list",
      payload: { mode: "provided", connector: "manual", items: [] },
    });
    assert.equal(weaknessReport(list, { nodes: [list], edges: [] }).execution, "fired");
    const discovered = { ...list, id: "disc", payload: { mode: "discovered" } };
    assert.equal(weaknessReport(discovered, { nodes: [discovered], edges: [] }).execution, "clear");
  });
});

describe("graph intelligence — edges and spray", () => {
  it("routes unknown model edge labels into the closed edge union and drops edges without basis", () => {
    assert.equal(routeEdgeType("backs"), "supports");
    assert.equal(routeEdgeType("totally_new_edge"), "derived_from");
    const a = node("a");
    const b = node("b");
    const edges = validateInferredEdges([
      { source: "a", target: "b", type: "backs", confidence: 0.7, cites: ["a"], clause: "a backs b" },
      { source: "a", target: "b", type: "invented", confidence: 0.2, cites: [], clause: "empty basis is invalid" },
    ], { projectId: "drover", nodes: [a, b], edges: [] });
    assert.equal(edges.length, 1);
    assert.equal(edges[0].type, "supports");
    assert.equal(edges[0].confidence, 70);
  });

  it("sprays product, market, and strategy cards and draws structural support edges", () => {
    const graph = sprayGraph({
      projectId: "drover",
      scanReport: {
        repo: "/tmp/app",
        winEvent: { citations: [{ label: "Tracks project_created", file: "src/track.ts", line: 4, text: "track('project_created')" }] },
        attribution: { citations: [] },
        analytics: { citations: [] },
        gaps: [{ id: "gap-1", title: "Attribution is captured but not carried", severity: "high", recommendation: "carry source", citations: [{ file: "src/track.ts", line: 8, label: "missing source", text: "" }] }],
      },
      marketObjects: [{
        id: "mkt-1",
        kind: "buyer",
        statement: "Founders running more than one product",
        evidence: [{ claim: "seen", source: "https://example.com", solidity: "researched", capturedAt: at }],
        source: "research",
      }],
      strategyCandidates: [{
        id: "strat-1",
        type: "message",
        statement: "Lead with the multi-product GTM desk promise.",
        restsOn: ["obj-mkt-1"],
        evidence: [{ claim: "rests on buyer", source: "obj-mkt-1", solidity: "inferred", capturedAt: at }],
      }],
    });
    assert.ok(graph.nodes.some((item) => item.domain === "product"));
    assert.ok(graph.nodes.some((item) => item.domain === "market"));
    assert.ok(graph.nodes.some((item) => item.id === "strat-1"));
    assert.ok(graph.nodes.some((item) => item.type === "measurement_gap"));
    assert.ok(graph.edges.some((edge) => edge.source === "obj-mkt-1" && edge.target === "strat-1" && edge.type === "supports"));
  });
});

describe("graph intelligence — strongest current testable path", () => {
  it("returns exactly one highlighted path with deterministic tie handling and weakness penalty", () => {
    const graph = deriveWeaknessForGraph({
      projectId: "drover",
      nodes: [
        node("proof", { domain: "product", type: "proof", statement: "Observed proof", solidity: "observed", evidence: [{ claim: "proof", source: "src:1", solidity: "observed", capturedAt: at }] }),
        node("buyer", { domain: "market", type: "buyer", statement: "Researched buyer", solidity: "researched", evidence: [{ claim: "buyer", source: "web", solidity: "researched", capturedAt: at }] }),
        node("channel", { domain: "strategy", type: "channel", statement: "Sourced community channel", solidity: "researched", evidence: [{ claim: "channel", source: "web", solidity: "researched", capturedAt: at }] }),
        node("msg", { domain: "strategy", type: "message", statement: "Message with proof", solidity: "inferred", evidence: [{ claim: "message", source: "proof", solidity: "inferred", capturedAt: at }], payload: { claimsProduct: true } }),
        node("list", { domain: "audience", type: "list", statement: "Real list", payload: { mode: "provided", connector: "manual", items: [{ email: "a@example.com" }] }, evidence: [{ claim: "list", source: "csv", solidity: "observed", capturedAt: at }] }),
      ],
      edges: [
        { id: "e1", source: "proof", target: "msg", type: "supports", status: "proposed", basis: [source("proof")], confidence: 100 },
        { id: "e2", source: "msg", target: "channel", type: "uses", status: "proposed", basis: [source("msg")], confidence: 100 },
        { id: "e3", source: "channel", target: "list", type: "targets", status: "proposed", basis: [source("channel")], confidence: 100 },
      ],
    });
    const rec = recommend(graph, freshRoot());
    assert.equal(rec.highlighted.length, 1);
    assert.ok(rec.highlighted[0].nodeIds.length >= 1);
    assert.ok(rec.highlighted[0].name);
    assert.ok(rec.highlighted[0].name.split(/\s+/).length <= 5);
    assert.equal(rec.highlighted[0].pathId, rec.rankedPaths[0].pathId, "phase 1 lights the deterministic top path only");
    assert.ok(rec.rankedPaths[0].score <= 1);
  });

  it("returns an honest empty reason instead of a fake path", () => {
    const rec = recommend({ projectId: "empty", nodes: [], edges: [] }, freshRoot());
    assert.deepEqual(rec.highlighted, []);
    assert.match(rec.reason, /scan found no product truths/i);
  });

  it("names a stored path from the model-authored summary, not hand-picked bet words", () => {
    const summary = "Indie founders adopt RodentRadar via a Show HN launch";
    const pathNode = node("p1", {
      domain: "runs",
      type: "path",
      statement: summary, // pathToNode carries path.summary as the node statement
      payload: { bet: { buyer: "indie founders", channel: "Show HN" } },
    });
    const graph = { projectId: "drover", nodes: [pathNode], edges: [] };
    const scored = scorePath({ pathId: "p1", nodeIds: ["p1"], edgeIds: [], source: "stored" }, graph);
    assert.equal(scored.name, summary, "the strategist's own summary names the path");
  });

  it("falls back to the word-picker only when no stored path names the candidate", () => {
    // A BFS-discovered walk candidate has no runs/path node, so no model name — pick a few words.
    const strat = node("s1", { domain: "strategy", type: "channel", statement: "Sourced community channel on Reddit" });
    const graph = { projectId: "drover", nodes: [strat], edges: [] };
    const scored = scorePath({ pathId: "walk:s1", nodeIds: ["s1"], edgeIds: [], source: "walk" }, graph);
    assert.ok(scored.name && scored.name.split(/\s+/).length <= 5, "fallback name stays compact");
    assert.notEqual(scored.name, "");
  });
});
