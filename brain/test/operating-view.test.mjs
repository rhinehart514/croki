import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createProject } from "../src/project-store.mjs";
import { recordObjectTouch, listObjectTouches } from "../src/gtm-store.mjs";
import { getOperatingView } from "../src/operating-view.mjs";

// Area 6 — the ONE Operator lens read. getOperatingView is a pure cross-fleet projection: it composes the
// engine stages, the one efficiency table, and Area 1's touch ledger into lanes + a shared object map, and
// it NEVER writes, triggers a run, or emits next-move prose. Each test roots on an isolated temp home so
// nothing touches ~/.gtm-ide.

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "operating-view-")) };
}

describe("getOperatingView — the shared-map read (Area 6)", () => {
  it("draws a shared object ONCE with ties to every lane that touched it (double-work prevention)", () => {
    const options = freshRoot();
    createProject({ name: "EstateSaleUSA" }, options);
    // Two motions of different kinds touch the SAME object — the eval's shared-map case.
    recordObjectTouch("estatesaleusa", { kind: "geo", fields: { locality: "Buffalo" }, motionId: "m-pages", runId: "r1", verb: "built" }, options);
    recordObjectTouch("estatesaleusa", { kind: "geo", fields: { locality: "Buffalo" }, motionId: "m-outreach", runId: "r2", verb: "worked" }, options);

    const view = getOperatingView({ projectId: "estatesaleusa" }, options);
    const buffalo = view.objects.filter((o) => o.objectKey === "geo:buffalo");
    assert.equal(buffalo.length, 1, "the shared object renders exactly once");
    assert.deepEqual(buffalo[0].lanes.sort(), ["m-outreach", "m-pages"], "tied to both lanes that touched it");
    assert.equal(buffalo[0].motionCount, 2, "counts two distinct motions on the one object");
  });

  it("every derived object state carries a provenance receipt (DOCTRINE's receipt rule)", () => {
    const options = freshRoot();
    createProject({ name: "EstateSaleUSA" }, options);
    recordObjectTouch("estatesaleusa", { kind: "keyword", fields: { query: "estate sales near me", geo: "Buffalo" }, motionId: "m-ai", runId: "r1", verb: "targeted" }, options);

    const view = getOperatingView({ projectId: "estatesaleusa" }, options);
    const kw = view.objects.find((o) => o.objectKey === "keyword:estate-sales-near-me|buffalo");
    assert.ok(kw, "the touched keyword appears on the map");
    assert.equal(kw.provenance.kind, "grounded", "a touched object is grounded, not a bet");
    assert.match(kw.provenance.basis, /touch/, "the receipt names what produced the state");
  });

  it("is provably READ-ONLY — the ledger is byte-identical before and after the read", () => {
    const options = freshRoot();
    createProject({ name: "EstateSaleUSA" }, options);
    recordObjectTouch("estatesaleusa", { kind: "geo", fields: { locality: "Buffalo" }, motionId: "m1", runId: "r1", verb: "worked" }, options);
    const before = JSON.stringify(listObjectTouches("estatesaleusa", options));

    getOperatingView({ projectId: "estatesaleusa" }, options);
    getOperatingView({ projectId: "estatesaleusa" }, options);

    const after = JSON.stringify(listObjectTouches("estatesaleusa", options));
    assert.equal(after, before, "the read wrote nothing back to the ledger");
  });

  it("emits NO next-move prose — only state, ties, and the decisions the lens routes to", () => {
    const options = freshRoot();
    createProject({ name: "EstateSaleUSA" }, options);
    recordObjectTouch("estatesaleusa", { kind: "geo", fields: { locality: "Buffalo" }, motionId: "m1", runId: "r1", verb: "worked" }, options);
    const view = getOperatingView({ projectId: "estatesaleusa" }, options);
    // The shape is state only: lanes, objects, pending decisions — never a recommendation field.
    assert.deepEqual(
      Object.keys(view).filter((k) => /recommend|suggest|nextMove|advice/i.test(k)),
      [],
      "no recommender field on the operating view",
    );
  });

  it("renders proposed plan lanes (Area 4) in the same grammar, marked as bets, without persisting", () => {
    const options = freshRoot();
    createProject({ name: "EstateSaleUSA" }, options);
    const planMotions = [
      { type: "programmatic-pages", label: "Per-city listing pages", origin: "derived", rationale: "you already hold the sale records" },
      { type: "cold-outreach", label: "Email estate-sale companies", origin: "speculative", rationale: "a bet" },
    ];
    const view = getOperatingView({ projectId: "estatesaleusa" }, { ...options, planMotions });
    const proposed = view.lanes.filter((l) => l.proposed === true);
    assert.equal(proposed.length, 2, "both plan motions render as proposed lanes");
    const derived = proposed.find((l) => l.origin === "derived");
    assert.ok(derived, "a grounded code-native motion reads as derived");
    assert.equal(derived.health, 0, "a not-yet-run lane has no fabricated health");
    // The plan is a regenerated read — nothing about it persisted to the ledger.
    assert.equal(listObjectTouches("estatesaleusa", options).length, 0, "the proposed plan wrote nothing durable");
  });

  it("is honest-blind on a project nothing has touched — no seeded lanes or objects", () => {
    const options = freshRoot();
    createProject({ name: "Empty" }, options);
    const view = getOperatingView({ projectId: "empty" }, options);
    assert.deepEqual(view.objects, [], "no objects fabricated");
    assert.deepEqual(view.lanes, [], "no lanes fabricated");
    assert.deepEqual(view.pending, [], "no pending decisions fabricated");
  });
});
