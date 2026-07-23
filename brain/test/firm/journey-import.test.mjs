import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  cleanupExpiredJourneyImports,
  deleteJourneyImport,
  JOURNEY_IMPORT_LIMIT_BYTES,
  journeyRouteToken,
  stageJourneyImport,
} from "../../src/firm/journey-import.mjs";
import {
  adoptJourneyImport,
  listJourneyObservations,
  previewJourneyImport,
} from "../../src/firm/journey-observations.mjs";
import {
  buildJourneyMappingWorkLoopTools,
  getJourneyMappingProposal,
  listJourneyMappingProposals,
  saveJourneyMappingProposal,
} from "../../src/firm/journey-mapping-proposals.mjs";
import { getSemanticModel, mutateSemanticModel } from "../../src/firm/semantic-model-store.mjs";
import { createVenture, getVentureDoc } from "../../src/firm/venture-store.mjs";

function fixture(name = "Journey evidence") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "croki-journey-"));
  const options = { root };
  const venture = createVenture({ name }, options);
  const model = getSemanticModel(venture.id, options);
  mutateSemanticModel({
    ventureId: venture.id,
    baseRevision: model.revision,
    actor: { authority: "agent", id: "page-map" },
    operations: [
      {
        op: "create-record",
        family: "objects",
        record: {
          id: "page-home", type: "page", name: "Home", statement: "Welcome",
          assertion: "tentative", provenance: { kind: "repository-page", sourceRef: "repository:home" },
          properties: { territory: "product", page: { route: "/", sourceRef: "repository:home" } },
        },
      },
      {
        op: "create-record",
        family: "objects",
        record: {
          id: "page-pricing", type: "page", name: "Pricing", statement: "Plans",
          assertion: "tentative", provenance: { kind: "repository-page", sourceRef: "repository:pricing" },
          properties: { territory: "product", page: { route: "/pricing", sourceRef: "repository:pricing" } },
        },
      },
      {
        op: "create-record",
        family: "objects",
        record: {
          id: "page-doc", type: "page", name: "Doc", statement: "A document",
          assertion: "tentative", provenance: { kind: "repository-page", sourceRef: "repository:doc" },
          properties: { territory: "product", page: { route: "/docs/:slug", sourceRef: "repository:doc" } },
        },
      },
    ],
  }, options);
  return { root, options, venture, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function stage(ventureId, content, name, options) {
  return stageJourneyImport(ventureId, {
    name,
    mediaType: name.endsWith(".csv") ? "text/csv" : "application/json",
    data: Buffer.from(content).toString("base64"),
  }, options);
}

describe("provider-neutral journey imports", () => {
  it("profiles quoted CSV without retaining row values and stages it venture-local at 0600", () => {
    const fx = fixture();
    try {
      const csv = "\ufeffsession_id,timestamp,path,event_name,note\n\"person-secret\",\"2026-07-01T10:00:00Z\",\"/pricing?plan=pro\",\"Viewed\",\"contains, comma\"\n";
      const profile = stage(fx.venture.id, csv, "journey.csv", fx.options);
      assert.equal(profile.valid, true);
      assert.equal(profile.rowCount, 1);
      assert.equal(profile.inferredMapping.inputKind, "event-rows");
      assert.equal(profile.routes[0].match.pageRef, "object:page-pricing");
      assert.equal(JSON.stringify(profile).includes("person-secret"), false);
      assert.equal(JSON.stringify(profile).includes("contains, comma"), false);
      const stored = getVentureDoc(fx.venture.id, "journeyImports", profile.importRef, fx.options);
      const stagedRoot = path.join(fx.root, "ventures", fx.venture.id, "journey-imports", "staged");
      const file = path.join(stagedRoot, `${stored.digest}.csv`);
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      assert.equal(fs.statSync(stagedRoot).mode & 0o777, 0o700);
    } finally { fx.cleanup(); }
  });

  it("accepts JSON and JSONL while returning a repairable invalid profile for malformed UTF-8", () => {
    const fx = fixture();
    try {
      const json = stage(fx.venture.id, JSON.stringify({ events: [{ sid: "a", at: "2026-07-01", route: "/" }] }), "events.json", fx.options);
      const jsonl = stage(fx.venture.id, '{"sid":"a","at":"2026-07-01","route":"/"}\n{"sid":"a","at":"2026-07-02","route":"/pricing"}', "events.jsonl", fx.options);
      const invalid = stageJourneyImport(fx.venture.id, {
        name: "broken.jsonl",
        mediaType: "application/x-ndjson",
        data: Buffer.from([0xc3, 0x28]).toString("base64"),
      }, fx.options);
      assert.equal(json.valid, true);
      assert.equal(jsonl.rowCount, 2);
      assert.equal(invalid.valid, false);
      assert.equal(invalid.issues[0].code, "journey_import_utf8_invalid");
      assert.ok(getVentureDoc(fx.venture.id, "journeyImports", invalid.importRef, fx.options), "invalid staging must remain cancelable");
    } finally { fx.cleanup(); }
  });

  it("rejects files over 12 MiB and cannot read another venture's staged import", () => {
    const fx = fixture();
    const other = createVenture({ name: "Other venture" }, fx.options);
    try {
      assert.throws(() => stageJourneyImport(fx.venture.id, {
        name: "huge.csv",
        data: Buffer.alloc(JOURNEY_IMPORT_LIMIT_BYTES + 1, 97).toString("base64"),
      }, fx.options), (error) => error.code === "journey_import_too_large" && error.status === 413);
      const profile = stage(fx.venture.id, "sid,at,route\na,2026-07-01,/\n", "events.csv", fx.options);
      assert.throws(
        () => previewJourneyImport(other.id, profile.importRef, {}, fx.options),
        (error) => error.code === "journey_import_not_found" && error.status === 404,
      );
    } finally { fx.cleanup(); }
  });

  it("deterministically previews event paths with exact, explicit dynamic, and unmatched routes", () => {
    const fx = fixture();
    try {
      const content = [
        "sid,at,route",
        "private-one,2026-07-01T10:00:00Z,/",
        "private-one,2026-07-01T10:01:00Z,/pricing?plan=pro",
        "private-two,2026-07-01T11:00:00Z,/docs/getting-started",
        "private-two,2026-07-01T11:01:00Z,/unknown/person-secret",
        "missing,,/pricing",
      ].join("\n");
      const profile = stage(fx.venture.id, content, "events.csv", fx.options);
      const dynamicToken = journeyRouteToken("/docs/getting-started");
      const unknownToken = journeyRouteToken("/unknown/person-secret");
      const mapping = {
        inputKind: "event-rows",
        fields: { sequenceKey: "sid", timestamp: "at", route: "route" },
        routeMappings: { [dynamicToken]: "object:page-doc" },
        timezone: "UTC",
      };
      const first = previewJourneyImport(fx.venture.id, profile.importRef, mapping, fx.options);
      const second = previewJourneyImport(fx.venture.id, profile.importRef, mapping, fx.options);
      assert.deepEqual(first, second);
      assert.deepEqual(first.pageCounts, [
        { pageRef: "object:page-doc", count: 1 },
        { pageRef: "object:page-home", count: 1 },
        { pageRef: "object:page-pricing", count: 1 },
      ]);
      assert.deepEqual(first.transitions, [{ fromPageRef: "object:page-home", toPageRef: "object:page-pricing", count: 1 }]);
      assert.deepEqual(first.dropOffs, [{ pageRef: "object:page-pricing", count: 1 }]);
      assert.deepEqual(first.unmatchedRoutes, [{ route: unknownToken, count: 1 }]);
      assert.deepEqual(first.rejectedRows, { count: 1, reasons: [{ reason: "invalid-timestamp", count: 1 }] });
      assert.equal(JSON.stringify(first).includes("private-one"), false);
      assert.equal(JSON.stringify(first).includes("person-secret"), false);
    } finally { fx.cleanup(); }
  });

  it("adopts only aggregates and a bounded receipt, then deletes the raw staged file", () => {
    const fx = fixture();
    try {
      const profile = stage(fx.venture.id, [
        "sid,at,route",
        "secret-person,2026-07-01T10:00:00Z,/",
        "secret-person,2026-07-01T10:01:00Z,/pricing",
      ].join("\n"), "events.csv", fx.options);
      const stored = getVentureDoc(fx.venture.id, "journeyImports", profile.importRef, fx.options);
      const file = path.join(fx.root, "ventures", fx.venture.id, "journey-imports", "staged", `${stored.digest}.csv`);
      const result = adoptJourneyImport(fx.venture.id, profile.importRef, {
        inputKind: "event-rows",
        fields: { sequenceKey: "sid", timestamp: "at", route: "route" },
        routeMappings: {},
        expectedPageModelRevision: profile.pageModelRevision,
        sourceRef: "source:analytics-export",
        threadRef: "thread:journey-review",
        messageRef: "conversation:founder-turn",
      }, fx.options);
      assert.equal(fs.existsSync(file), false);
      assert.equal(getVentureDoc(fx.venture.id, "journeyImports", profile.importRef, fx.options), null);
      assert.equal(result.snapshot.sourceRef, "source:analytics-export");
      assert.equal(result.receipt.pageModelRevision, profile.pageModelRevision);
      assert.equal(result.receipt.threadRef, "thread:journey-review");
      const persisted = JSON.stringify(listJourneyObservations(fx.venture.id, fx.options));
      assert.equal(persisted.includes("secret-person"), false);
      assert.equal(persisted.includes("sid,at,route"), false);
    } finally { fx.cleanup(); }
  });

  it("blocks stale adoption without deleting staging", () => {
    const fx = fixture();
    try {
      const profile = stage(fx.venture.id, "sid,at,route\na,2026-07-01,/\n", "events.csv", fx.options);
      const current = getSemanticModel(fx.venture.id, fx.options);
      mutateSemanticModel({
        ventureId: fx.venture.id,
        baseRevision: current.revision,
        actor: { authority: "founder", id: "founder" },
        operations: [{
          op: "create-record", family: "objects",
          record: { id: "change", type: "open", name: "Changed", statement: "", properties: {}, assertion: "founder-asserted", provenance: {} },
        }],
      }, fx.options);
      assert.throws(() => adoptJourneyImport(fx.venture.id, profile.importRef, {
        inputKind: "event-rows",
        fields: { sequenceKey: "sid", timestamp: "at", route: "route" },
        expectedPageModelRevision: profile.pageModelRevision,
      }, fx.options), (error) => error.code === "journey_page_model_stale" && error.status === 409);
      assert.ok(getVentureDoc(fx.venture.id, "journeyImports", profile.importRef, fx.options));
    } finally { fx.cleanup(); }
  });

  it("aggregates transition exports and preserves prior receipts when a newer source snapshot arrives", () => {
    const fx = fixture();
    try {
      const mapping = {
        inputKind: "aggregate-transitions",
        fields: { from: "from", to: "to", count: "count" },
        routeMappings: {},
        timezone: "UTC",
        window: { from: "2026-07-01T00:00:00Z", to: "2026-07-07T23:59:59Z" },
      };
      for (const count of [5, 7]) {
        const profile = stage(fx.venture.id, `from,to,count\n/,/pricing,${count}\n/pricing,drop-off,2\n`, `transitions-${count}.csv`, fx.options);
        adoptJourneyImport(fx.venture.id, profile.importRef, {
          ...mapping,
          expectedPageModelRevision: profile.pageModelRevision,
          sourceRef: "source:weekly-export",
        }, fx.options);
      }
      const listed = listJourneyObservations(fx.venture.id, fx.options);
      assert.equal(listed.observations.length, 2);
      assert.equal(listed.receipts.length, 2);
      assert.equal(listed.observations[0].dropOffs[0].count, 2);
    } finally { fx.cleanup(); }
  });

  it("cancels explicitly and expires abandoned staging after 24 hours", () => {
    const fx = fixture();
    try {
      const canceled = stage(fx.venture.id, "sid,at,route\na,2026-07-01,/\n", "cancel.csv", fx.options);
      assert.equal(deleteJourneyImport(fx.venture.id, canceled.importRef, fx.options), true);
      assert.equal(getVentureDoc(fx.venture.id, "journeyImports", canceled.importRef, fx.options), null);
      const expired = stage(fx.venture.id, "sid,at,route\nb,2026-07-01,/\n", "expire.csv", fx.options);
      const stored = getVentureDoc(fx.venture.id, "journeyImports", expired.importRef, fx.options);
      const removed = cleanupExpiredJourneyImports(fx.options, Date.parse(stored.expiresAt) + 1);
      assert.deepEqual(removed, [{ ventureId: fx.venture.id, importRef: expired.importRef }]);
      assert.equal(getVentureDoc(fx.venture.id, "journeyImports", expired.importRef, fx.options), null);
    } finally { fx.cleanup(); }
  });

  it("keeps SDK mapping proposals structured, provisional, and bound to the exact Thread", async () => {
    const fx = fixture();
    try {
      const profile = stage(fx.venture.id, "sid,at,route\na,2026-07-01,/\n", "proposal.csv", fx.options);
      const mapping = {
        inputKind: "event-rows",
        fields: { sequenceKey: "sid", timestamp: "at", route: "route" },
        routeMappings: {},
        timezone: "UTC",
      };
      const first = saveJourneyMappingProposal(
        fx.venture.id, profile.importRef, mapping,
        { threadRef: "thread:journey", messageRef: "conversation:one", proposedBy: { authority: "agent", id: "codex" } },
        fx.options,
      );
      const revised = saveJourneyMappingProposal(
        fx.venture.id, profile.importRef, mapping,
        { threadRef: "thread:journey", messageRef: "conversation:two", proposedBy: { authority: "agent", id: "codex" } },
        fx.options,
      );
      assert.equal(revised.id, first.id);
      assert.equal(revised.revision, 2);
      assert.equal(revised.status, "proposed");
      assert.equal(listJourneyMappingProposals(fx.venture.id, profile.importRef, fx.options).length, 1);
      assert.equal(getJourneyMappingProposal(fx.venture.id, first.id, fx.options).messageRef, "conversation:two");

      const tools = buildJourneyMappingWorkLoopTools({
        ventureId: fx.venture.id,
        teammateRef: "codex",
        target: { journeyImportRef: profile.importRef, threadRef: "thread:journey" },
        options: fx.options,
        trackCall() {},
      });
      assert.deepEqual(tools.map((tool) => tool.name), ["propose_journey_mapping"]);
      const fromTool = await tools[0].run(mapping);
      assert.equal(fromTool.status, "proposed");
      assert.equal(fromTool.preview.pageCounts[0].pageRef, "object:page-home");
      assert.equal(listJourneyObservations(fx.venture.id, fx.options).observations.length, 0, "a model proposal must not adopt evidence");
    } finally { fx.cleanup(); }
  });
});
