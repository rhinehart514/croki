// views-store.test.mjs — saved live views + snapshots (Experience Law 12).
//
// A saved view preserves a WAY OF LOOKING at the venture, never a copy of it: a live view stores an
// arrangement id + scope (NO node positions) and re-derives on reopen; a snapshot pins refs + digests and
// fails visibly the moment a pinned record drifts. Both are venture-scoped, fail closed on cross-venture
// refs, and ride export/import.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  createVenture,
  setVentureDoc,
  getVentureDoc,
  exportVenture,
  importVenture,
  venturePersistence,
  safeId,
} from "../../src/firm/venture-store.mjs";
import {
  saveLiveView,
  captureSnapshot,
  listViews,
  reopenView,
  deleteView,
  promoteFinding,
  listFindings,
} from "../../src/firm/views-store.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-views-")), seedFoundingCrew: false };
}

function fixture() {
  const options = freshRoot();
  const venture = createVenture({ name: "Views venture" }, options);
  setVentureDoc(venture.id, "bets", "bet-a", { id: "bet-a", ventureId: venture.id, intent: "ship a" }, options);
  setVentureDoc(venture.id, "bets", "bet-b", { id: "bet-b", ventureId: venture.id, intent: "ship b" }, options);
  setVentureDoc(venture.id, "outcomes", "outcome-1", { id: "outcome-1", ventureId: venture.id, body: "real reply" }, options);
  return { options, venture };
}

describe("saved live views + snapshots (Law 12)", () => {
  it("saves a live view as an arrangement id + scope with NO node positions, and reopens it re-derivable", () => {
    const { options, venture } = fixture();
    const view = saveLiveView(venture.id, {
      name: "Bets in flight",
      arrangement: "orbital-atlas",
      rootRefs: ["bet:bet-a", "bet:bet-b", "outcome:outcome-1"],
    }, options);

    assert.equal(view.kind, "live");
    assert.equal(view.arrangement, "orbital-atlas");
    // A saved view stores no positions — it is a way of looking, not a frozen frame.
    const serialized = JSON.stringify(view);
    assert.equal(serialized.includes("position"), false, "a live view stores no node positions");
    assert.equal(serialized.includes("\"x\":"), false);
    assert.equal(serialized.includes("\"y\":"), false);

    const reopened = reopenView(venture.id, view.id, options);
    assert.equal(reopened.arrangement, "orbital-atlas", "reopen returns the arrangement to re-run");
    assert.deepEqual(reopened.rootRefs, ["bet:bet-a", "bet:bet-b", "outcome:outcome-1"], "reopen returns the scope, not a layout");
    assert.equal("camera" in reopened, false, "reopen carries no stored camera/layout");
  });

  it("captures a snapshot as an immutable manifest; a drifted pinned ref fails VISIBLY on reopen", () => {
    const { options, venture } = fixture();
    const snapshot = captureSnapshot(venture.id, {
      name: "How it looked at launch",
      arrangement: "orbital-atlas",
      rootRefs: ["bet:bet-a", "outcome:outcome-1"],
    }, options);

    assert.equal(snapshot.kind, "snapshot");
    assert.equal(snapshot.frame.kind, "snapshot");
    // Every pinned source carries a revision or digest — the pin that makes drift detectable later.
    for (const source of snapshot.frame.sources) {
      assert.ok(source.revision != null || source.digest, "every snapshot source pins a revision or digest");
    }
    // Immutable after capture.
    assert.throws(() => { snapshot.frame.sources.push({ ref: "bet:bet-b" }); }, "the snapshot manifest is frozen");

    // Intact while nothing drifted.
    const intactReopen = reopenView(venture.id, snapshot.id, options);
    assert.equal(intactReopen.intact, true, "a snapshot over unchanged records resolves intact");
    assert.deepEqual(intactReopen.stale, []);

    // Drift a pinned record — the snapshot must report it stale, never silently show the new content.
    setVentureDoc(venture.id, "outcomes", "outcome-1", { id: "outcome-1", ventureId: venture.id, body: "REVISED reply" }, options);
    const driftedReopen = reopenView(venture.id, snapshot.id, options);
    assert.equal(driftedReopen.intact, false, "a drifted pinned ref makes the snapshot no longer intact");
    assert.deepEqual(driftedReopen.stale, [{ ref: "outcome:outcome-1", state: "stale" }], "the exact drifted ref is reported stale, visibly");

    // Deleting a pinned record surfaces as unresolved, not a silent gap.
    venturePersistence(options, venture.id).delete("outcomes", safeId("outcome-1"));
    const missingReopen = reopenView(venture.id, snapshot.id, options);
    assert.ok(missingReopen.stale.some((entry) => entry.ref === "outcome:outcome-1" && entry.state === "unresolved"), "a deleted pinned ref reports unresolved");
  });

  it("lists and deletes saved views", () => {
    const { options, venture } = fixture();
    const live = saveLiveView(venture.id, { name: "Live", arrangement: "orbital-atlas", rootRefs: ["bet:bet-a"] }, options);
    const snap = captureSnapshot(venture.id, { name: "Snap", rootRefs: ["bet:bet-b"] }, options);

    const views = listViews(venture.id, options);
    assert.equal(views.length, 2);
    assert.deepEqual(views.map((v) => v.id).sort(), [live.id, snap.id].sort());

    deleteView(venture.id, live.id, options);
    assert.deepEqual(listViews(venture.id, options).map((v) => v.id), [snap.id]);
    assert.throws(() => deleteView(venture.id, live.id, options), (e) => e.code === "view_not_found" && e.status === 404);
  });

  it("fails CLOSED on a cross-venture ref — a view can only frame its own venture's objects", () => {
    const { options, venture } = fixture();
    const other = createVenture({ name: "Other venture" }, options);
    setVentureDoc(other.id, "bets", "bet-foreign", { id: "bet-foreign", ventureId: other.id, intent: "not yours" }, options);

    assert.throws(
      () => saveLiveView(venture.id, { name: "Steal", arrangement: "orbital-atlas", rootRefs: ["bet:bet-foreign"] }, options),
      (e) => e.code === "view_scope_cross_venture" && e.status === 404,
      "a live view cannot frame another venture's bet",
    );
    assert.throws(
      () => captureSnapshot(venture.id, { name: "Steal snap", rootRefs: ["bet:bet-foreign"] }, options),
      (e) => e.code === "view_scope_cross_venture" && e.status === 404,
      "a snapshot cannot pin another venture's bet",
    );
    // A non-durable UI pseudo-ref is refused before it can ever resolve "unresolved" forever.
    assert.throws(
      () => saveLiveView(venture.id, { name: "Pseudo", arrangement: "orbital-atlas", rootRefs: ["atlas:wall"] }, options),
      (e) => e.code === "view_scope_non_durable",
      "a pseudo-ref cannot enter a saved view scope",
    );
  });

  it("saved views (live + snapshot) ride export/import unchanged", () => {
    const { options, venture } = fixture();
    const live = saveLiveView(venture.id, { name: "Live", arrangement: "orbital-atlas", rootRefs: ["bet:bet-a", "bet:bet-b"] }, options);
    const snap = captureSnapshot(venture.id, { name: "Snap", rootRefs: ["outcome:outcome-1"] }, options);

    const bundle = exportVenture(venture.id, options);
    assert.equal(bundle.documents.views.length, 2, "views are in the export bundle");

    const destination = { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-views-dest-")) };
    importVenture(bundle, destination);

    const movedLive = getVentureDoc(venture.id, "views", live.id, destination);
    const movedSnap = getVentureDoc(venture.id, "views", snap.id, destination);
    assert.deepEqual(movedLive, live, "the live view round-tripped unchanged");
    assert.deepEqual(movedSnap, snap, "the snapshot manifest round-tripped unchanged");

    // The moved snapshot still resolves intact against the moved records.
    const reopened = reopenView(venture.id, snap.id, destination);
    assert.equal(reopened.intact, true, "the transferred snapshot resolves against the transferred records");
  });

  it("promotes a finding out of a view into durable truth with source-view provenance (Law 11)", () => {
    const { options, venture } = fixture();
    const view = saveLiveView(venture.id, { name: "Live", arrangement: "orbital-atlas", rootRefs: ["bet:bet-a"] }, options);

    const finding = promoteFinding(venture.id, {
      viewId: view.id,
      statement: "bet-a and outcome-1 tell the same story.",
      subjectRefs: ["bet:bet-a", "outcome:outcome-1"],
      condition: "established",
      promotedBy: { authority: "founder", id: "founder" },
    }, options);

    assert.equal(finding.statement, "bet-a and outcome-1 tell the same story.");
    assert.equal(finding.condition, "established", "the founder can explicitly establish a promoted finding");
    assert.equal(finding.provenance.sourceViewRef, `view:${view.id}`, "the finding names the view it came from");
    assert.deepEqual(listFindings(venture.id, options).map((f) => f.id), [finding.id]);

    // A non-founder promoter stays inferred — authority is earned, not claimed.
    const inferred = promoteFinding(venture.id, {
      statement: "a model's guess.",
      subjectRefs: ["bet:bet-a"],
      condition: "established",
      promotedBy: { authority: "agent", id: "codex" },
    }, options);
    assert.equal(inferred.condition, "inferred", "a non-founder finding cannot self-establish");
  });

  it("REFUSES to re-POST over an existing snapshot id — immutable after capture is a mechanism, not a comment", () => {
    const { options, venture } = fixture();
    const snapshot = captureSnapshot(venture.id, {
      id: "snap-fixed",
      name: "Original name",
      rootRefs: ["bet:bet-a"],
    }, options);
    assert.equal(snapshot.name, "Original name");

    // A founder-capability re-POST that reuses the snapshot id would silently rewrite its pins/name. Refused.
    assert.throws(
      () => captureSnapshot(venture.id, { id: "snap-fixed", name: "REWRITTEN name", rootRefs: ["bet:bet-b"] }, options),
      (e) => e.code === "view_immutable" && e.status === 409,
      "an existing snapshot id cannot be overwritten",
    );
    // The stored snapshot is untouched — the original pins and name survive.
    const stored = getVentureDoc(venture.id, "views", "snap-fixed", options);
    assert.equal(stored.name, "Original name", "the captured snapshot kept its name");
    assert.deepEqual(stored.spec.rootRefs, ["bet:bet-a"], "the captured snapshot kept its pins");

    // A live view cannot be silently converted into a snapshot id either.
    const live = saveLiveView(venture.id, { id: "live-fixed", name: "Live", arrangement: "orbital-atlas", rootRefs: ["bet:bet-a"] }, options);
    assert.throws(
      () => captureSnapshot(venture.id, { id: live.id, name: "Snap over live", rootRefs: ["bet:bet-a"] }, options),
      (e) => e.code === "view_immutable" && e.status === 409,
      "a snapshot cannot overwrite a record of another kind",
    );
    // But re-saving a LIVE view under its own id is still allowed — a live view stays mutable.
    const resaved = saveLiveView(venture.id, { id: live.id, name: "Live renamed", arrangement: "orbital-atlas", rootRefs: ["bet:bet-b"] }, options);
    assert.equal(resaved.name, "Live renamed", "a live view remains re-saveable");
  });

  it("REFUSES to re-POST over an existing finding id — a canonicalized finding is immutable", () => {
    const { options, venture } = fixture();
    const finding = promoteFinding(venture.id, {
      id: "finding-fixed",
      statement: "the original finding.",
      subjectRefs: ["bet:bet-a"],
      promotedBy: { authority: "founder", id: "founder" },
    }, options);
    assert.equal(finding.statement, "the original finding.");

    assert.throws(
      () => promoteFinding(venture.id, {
        id: "finding-fixed",
        statement: "a silent rewrite.",
        subjectRefs: ["bet:bet-b"],
        promotedBy: { authority: "founder", id: "founder" },
      }, options),
      (e) => e.code === "view_immutable" && e.status === 409,
      "an existing finding id cannot be overwritten",
    );
    const stored = getVentureDoc(venture.id, "findings", "finding-fixed", options);
    assert.equal(stored.statement, "the original finding.", "the canonicalized finding kept its statement");
    assert.deepEqual(stored.subjectRefs, ["bet:bet-a"], "the canonicalized finding kept its subjects");
  });
});
