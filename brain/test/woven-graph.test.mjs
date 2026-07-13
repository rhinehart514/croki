import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createProject } from "../src/project-store.mjs";
import { recordObjectTouch } from "../src/gtm-store.mjs";
import { getOperatingView } from "../src/operating-view.mjs";
import { buildWovenGraph } from "../src/woven-graph.mjs";

// buildWovenGraph — the ONE projector (docs/INTERTWINED-CANVAS.md §2). A pure reshape of what
// getOperatingView returns into a single woven graph: synthetic obj:/tie:/kind: nodes and edges layered
// over the real steps. It derives nothing new, persists nothing, and re-derives on every call. Each test
// roots on an isolated temp home so nothing touches ~/.gtm-ide.

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "woven-graph-")) };
}

// A minimal per-channel GTMGraph with a source → generate → gate shape, positioned left-to-right so the
// anchor step (last data-producing step or the gate) is deterministic. `name` gives it a composer identity
// so its kind is the graph name (deriveMotionName prefers it).
function laneGraph(name, { withGate = true } = {}) {
  const nodes = [
    { id: "src", category: "source", label: "Find", position: { x: 0, y: 0 }, config: {} },
    { id: "draft", category: "generate", label: "Draft", position: { x: 200, y: 0 }, config: {} },
  ];
  if (withGate) nodes.push({ id: "gate", category: "gate", label: "Your call", position: { x: 400, y: 0 }, config: {} });
  return { id: name, name, nodes, edges: [] };
}

describe("buildWovenGraph — the woven projection (INTERTWINED-CANVAS §2)", () => {
  it("emits one obj: node per touched object, a tie: edge per lane touch, and a kind: cluster per motion", () => {
    const options = freshRoot();
    createProject({ name: "EstateSaleUSA" }, options);
    // Two motions of different kinds touch the SAME geo — the shared-object case.
    recordObjectTouch("estatesaleusa", { objectKey: "geo:buffalo", kind: "geo", label: "Buffalo, NY", motionId: "m-pages", runId: "r1", verb: "built" }, options);
    recordObjectTouch("estatesaleusa", { objectKey: "geo:buffalo", kind: "geo", label: "Buffalo, NY", motionId: "m-outreach", runId: "r2", verb: "emailed" }, options);

    const view = {
      projectId: "estatesaleusa",
      lanes: [
        { channelId: "m-pages", name: "Per-city pages", motionKind: "Per-city pages" },
        { channelId: "m-outreach", name: "Cold outreach", motionKind: "Cold outreach" },
      ],
      objects: [
        { objectKey: "geo:buffalo", kind: "geo", label: "Buffalo, NY", bucket: "in_flight", motionCount: 2, touchCount: 2, lanes: ["m-pages", "m-outreach"], provenance: { kind: "grounded", basis: "in_flight — derived from 2 touches across 2 motions" } },
      ],
    };
    const channelGraphs = new Map([
      ["m-pages", laneGraph("Per-city pages")],
      ["m-outreach", laneGraph("Cold outreach")],
    ]);

    const woven = buildWovenGraph(view, { channelGraphs, storeOptions: options });

    // ONE object node, drawn (2 motions).
    const buffalo = woven.objectNodes.filter((n) => n.objectKey === "geo:buffalo");
    assert.equal(buffalo.length, 1, "the shared object is one node");
    assert.equal(buffalo[0].id, "obj:geo:buffalo");
    assert.equal(buffalo[0].kind, "geo", "kind is the ledger's open string");
    assert.equal(buffalo[0].draw, true, "a 2-motion object draws individually");
    assert.equal(buffalo[0].motionCount, 2);

    // TWO ties converging on the one node, each labeled with its lane's real verb from the ledger.
    const buffTies = woven.ties.filter((t) => t.objectKey === "geo:buffalo").sort((a, b) => a.channelId.localeCompare(b.channelId));
    assert.equal(buffTies.length, 2, "two ties converge on the shared object");
    assert.deepEqual(buffTies.map((t) => t.channelId), ["m-outreach", "m-pages"]);
    assert.equal(buffTies.find((t) => t.channelId === "m-outreach").verb, "emailed", "the tie carries the lane's real verb");
    assert.equal(buffTies.find((t) => t.channelId === "m-pages").verb, "built");
    // The anchor step is the lane's gate (rightmost), from its own graph — data already derivable.
    assert.equal(buffTies[0].anchorStepId, "gate", "the tie anchors on the lane's last step (its gate)");

    // TWO kind clusters, one per distinct motion, each holding its lane.
    assert.equal(woven.kindClusters.length, 2, "two distinct motion kinds cluster separately");
    const pagesCluster = woven.kindClusters.find((c) => c.motionKind === "Per-city pages");
    assert.ok(pagesCluster, "the pages motion has its own cluster");
    assert.deepEqual(pagesCluster.laneKeys, ["m-pages"]);
    assert.equal(pagesCluster.id, "kind:Per-city pages");
  });

  it("applies the 2+-touch rule: single-touch objects collapse to a per-lane count, only 2+ draw", () => {
    const options = freshRoot();
    const view = {
      projectId: "p",
      lanes: [{ channelId: "m1", name: "Outbound", motionKind: "Outbound" }],
      objects: [
        // One object touched by ONE motion → collapses.
        { objectKey: "person:solo", kind: "person", label: "Solo", bucket: "seen", motionCount: 1, touchCount: 1, lanes: ["m1"], provenance: {} },
        // Another single-touch object on the same lane → same badge.
        { objectKey: "person:solo-two", kind: "person", label: "Solo Two", bucket: "seen", motionCount: 1, touchCount: 1, lanes: ["m1"], provenance: {} },
      ],
    };
    const channelGraphs = new Map([["m1", laneGraph("Outbound")]]);
    const woven = buildWovenGraph(view, { channelGraphs, touchRecords: [] });

    assert.equal(woven.objectNodes.every((n) => n.draw === false), true, "no single-touch object draws individually");
    assert.equal(woven.stats.drawnObjectCount, 0, "nothing drawn");
    assert.equal(woven.stats.collapsedObjectCount, 2, "both collapse");
    assert.deepEqual(woven.collapsedByLane.m1.count, 2, "the lane's badge counts both single-touch objects");
    assert.deepEqual(woven.collapsedByLane.m1.objectKeys.sort(), ["person:solo", "person:solo-two"]);
    // Ties to collapsed objects are NOT drawn as individual threads.
    assert.equal(woven.ties.every((t) => t.drawn === false), true, "ties to collapsed objects ride the badge, not individual threads");
  });

  it("straddles a blended-kind pipeline across two clusters, never forcing it into one bucket", () => {
    const options = freshRoot();
    const view = {
      projectId: "p",
      lanes: [
        // A lane the composer flagged as blending two motions — it names both.
        { channelId: "m-blend", name: "Pages + outbound", motionKind: "Programmatic pages", blendKinds: ["Cold outreach"] },
        { channelId: "m-pure", name: "Cold outreach", motionKind: "Cold outreach" },
      ],
      objects: [],
    };
    const channelGraphs = new Map(); // no graphs → falls back to the lane's reported kinds
    const woven = buildWovenGraph(view, { channelGraphs, touchRecords: [] });

    // The blended lane appears in BOTH clusters.
    assert.deepEqual(woven.laneKinds["m-blend"].sort(), ["Cold outreach", "Programmatic pages"], "a blended lane reports both kinds");
    const pages = woven.kindClusters.find((c) => c.motionKind === "Programmatic pages");
    const outreach = woven.kindClusters.find((c) => c.motionKind === "Cold outreach");
    assert.ok(pages.laneKeys.includes("m-blend"), "the blended lane sits in the pages cluster");
    assert.ok(outreach.laneKeys.includes("m-blend"), "AND in the outreach cluster — straddling, not bucketed");
    assert.ok(outreach.laneKeys.includes("m-pure"), "the pure lane shares the outreach cluster");
    // The pure lane belongs to exactly one kind.
    assert.deepEqual(woven.laneKinds["m-pure"], ["Cold outreach"]);
  });

  it("is honest-blind on an empty project — no synthetic nodes, ties, or clusters fabricated", () => {
    const options = freshRoot();
    createProject({ name: "Empty" }, options);
    const view = getOperatingView({ projectId: "empty" }, options);
    const woven = buildWovenGraph(view, { channelGraphs: new Map(), storeOptions: options });

    assert.deepEqual(woven.objectNodes, [], "no object nodes fabricated");
    assert.deepEqual(woven.ties, [], "no ties fabricated");
    assert.deepEqual(woven.kindClusters, [], "no kind clusters fabricated");
    assert.deepEqual(woven.collapsedByLane, {}, "no collapse badges fabricated");
    assert.deepEqual(woven.stats, { objectCount: 0, drawnObjectCount: 0, collapsedObjectCount: 0, tieCount: 0, drawnTieCount: 0, kindCount: 0 });
  });

  it("derives the tie anchor from the lane's graph (last data-producing step) — no ledger step id needed", () => {
    const view = {
      projectId: "p",
      lanes: [{ channelId: "m1", name: "Outbound", motionKind: "Outbound" }],
      objects: [
        { objectKey: "geo:x", kind: "geo", label: "X", bucket: "in_flight", motionCount: 2, touchCount: 2, lanes: ["m1", "m2"], provenance: {} },
      ],
    };
    // m1 has a graph WITHOUT a gate → anchor is its rightmost work step ("draft"); m2 has no graph → anchor null.
    const channelGraphs = new Map([["m1", laneGraph("Outbound", { withGate: false })]]);
    const touchRecords = [
      { objectKey: "geo:x", kind: "geo", touches: [
        { motionId: "m1", runId: "r1", verb: "worked", at: "2026-01-01T00:00:00Z" },
        { motionId: "m2", runId: "r2", verb: "targeted", at: "2026-01-02T00:00:00Z" },
      ] },
    ];
    const woven = buildWovenGraph(view, { channelGraphs, touchRecords });

    const t1 = woven.ties.find((t) => t.channelId === "m1");
    const t2 = woven.ties.find((t) => t.channelId === "m2");
    assert.equal(t1.anchorStepId, "draft", "anchors on the last data-producing step when there is no gate");
    assert.equal(t1.anchorX, 200);
    assert.equal(t2.anchorStepId, null, "a lane with no loaded graph still emits a tie (anchor null), not a dropped touch");
    // The chip's mean-X is the mean of its known anchor xs (only m1 contributes a number).
    const obj = woven.objectNodes.find((n) => n.objectKey === "geo:x");
    assert.equal(obj.anchorMeanX, 200, "the chip sits at the mean-X of its touching steps (v1 placement)");
  });

  it("reads the ledger itself when touchRecords is not supplied (end-to-end over a real project)", () => {
    const options = freshRoot();
    createProject({ name: "EstateSaleUSA" }, options);
    recordObjectTouch("estatesaleusa", { objectKey: "geo:buffalo", kind: "geo", label: "Buffalo, NY", motionId: "m-a", runId: "r1", verb: "worked" }, options);
    recordObjectTouch("estatesaleusa", { objectKey: "geo:buffalo", kind: "geo", label: "Buffalo, NY", motionId: "m-b", runId: "r2", verb: "targeted" }, options);

    const view = {
      projectId: "estatesaleusa",
      lanes: [{ channelId: "m-a", name: "A", motionKind: "A" }, { channelId: "m-b", name: "B", motionKind: "B" }],
      objects: [
        { objectKey: "geo:buffalo", kind: "geo", label: "Buffalo, NY", bucket: "in_flight", motionCount: 2, touchCount: 2, lanes: ["m-a", "m-b"], provenance: {} },
      ],
    };
    // No touchRecords passed → buildWovenGraph reads the ledger for verbs using storeOptions.
    const woven = buildWovenGraph(view, { channelGraphs: new Map(), storeOptions: options });
    const verbs = Object.fromEntries(woven.ties.map((t) => [t.channelId, t.verb]));
    assert.deepEqual(verbs, { "m-a": "worked", "m-b": "targeted" }, "verbs come from the real ledger when not passed in");
  });

  it("preserves partial and archived anchors while marking unresolved lineage locally", () => {
    const woven = buildWovenGraph({
      projectId: "p",
      lanes: [],
      objects: [],
      canvasSources: {
        project: { id: "p", name: "Partial" },
        productTruth: [],
        productModel: null,
        crew: [],
        questions: [{ id: "q-archived", text: "Old question", status: "archived", pinned: true, backlinks: [{ type: "path", id: "missing" }] }],
        pipelines: [],
        runs: [],
        decisions: [],
        signals: [],
        outcomes: [],
        geometry: { namespace: "project-canvas", revision: 7, positions: { "anchor:question:q-archived": { x: 3, y: 4 }, "unknown:gone": { x: 5, y: 6 }, "obj-legacy": { x: 7, y: 8 } } },
        state: { kind: "ready", stale: false, issues: [] },
      },
    }, { channelGraphs: new Map(), touchRecords: [] });

    assert.ok(woven.canvas.anchors.some((item) => item.ref.id === "q-archived" && item.body.status === "archived"));
    assert.equal(woven.canvas.relationships[0].resolved, false);
    assert.equal(woven.canvas.state.kind, "partial");
    assert.deepEqual(woven.canvas.geometry.detachedPositionRefs, ["unknown:gone"]);
    assert.deepEqual(woven.canvas.geometry.compatibilityPositionRefs, ["obj-legacy"]);
    assert.equal(woven.canvas.geometry.revision, 7);
  });
});
