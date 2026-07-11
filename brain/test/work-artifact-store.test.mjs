import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  WorkArtifactConflictError,
  branchWorkArtifact,
  createWorkArtifact,
  createWorkRelationship,
  getWorkArtifact,
  getWorkArtifactHistory,
  getWorkRelationship,
  hashArtifactContent,
  listWorkArtifacts,
  listWorkRelationships,
  loadWorkArtifactStore,
  restoreWorkArtifact,
  retireWorkArtifact,
  reviseWorkArtifact,
  reviseWorkRelationship,
} from "../src/work-artifact-store.mjs";
import { closePersistence } from "../src/persistence.mjs";
import { createGoal } from "../src/goal-store.mjs";

function founder(id = "founder") {
  return { type: "founder", id };
}

describe("provider-neutral open work artifact authority", () => {
  let root;
  let options;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "work-artifacts-"));
    options = { root, backend: "json" };
  });

  afterEach(() => {
    closePersistence(options);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("accepts unknown artifact kinds, formats, content types, and statuses with neutral attribution and receipts", () => {
    const artifact = createWorkArtifact("drover", {
      id: "campfire-map",
      kind: "founder_campfire_map_v9",
      format: "spatial-runes",
      contentType: "application/vnd.drover.unknown+json",
      status: "awaiting-a-moonless-night",
      title: "Campfires",
      content: { z: 2, a: ["Buffalo", "Rochester"] },
      createdBy: { type: "model-worker", workerId: "crew-researcher" },
      modelReceipts: [{ provider: "anthropic", model: "claude-opus", requestId: "req-1" }],
      toolReceipts: [{ tool: "research.search", callId: "call-1", status: "complete" }],
    }, options);

    assert.equal(artifact.kind, "founder_campfire_map_v9");
    assert.equal(artifact.format, "spatial-runes");
    assert.equal(artifact.contentType, "application/vnd.drover.unknown+json");
    assert.equal(artifact.status, "awaiting-a-moonless-night");
    assert.deepEqual(artifact.content, { a: ["Buffalo", "Rochester"], z: 2 }, "JSON object keys normalize deterministically");
    assert.deepEqual(artifact.createdBy, { type: "model-worker", workerId: "crew-researcher" });
    assert.equal(artifact.modelReceipts[0].provider, "anthropic", "provider identity stays on the receipt, not in the authority model");
    assert.equal(artifact.contentHash.length, 64);
  });

  it("branches a lineage without copying identity and preserves both parent and source references", () => {
    const original = createWorkArtifact("drover", {
      id: "position-a",
      kind: "position",
      content: "Lead with the product truth.",
      refs: [{ type: "product-truth", id: "truth-1" }],
      createdBy: founder(),
    }, options);
    const branch = branchWorkArtifact("drover", original.artifactId, {
      id: "position-b",
      content: "Lead with the founder's operating pain.",
      createdBy: { type: "model-worker", workerId: "codex" },
      parentRefs: [{ type: "decision", id: "decision-2" }],
      expectedArtifactRevision: 1,
    }, options);

    assert.equal(branch.artifactId, "position-b");
    assert.equal(branch.lineageId, original.lineageId);
    assert.equal(branch.revision, 1);
    assert.deepEqual(branch.refs, original.refs);
    assert.deepEqual(branch.parentRefs, [
      { type: "work-artifact-revision", id: original.id },
      { type: "decision", id: "decision-2" },
    ]);
    assert.equal(getWorkArtifact("drover", original.artifactId, options).content, "Lead with the product truth.");
  });

  it("rejects stale store and artifact-head revisions with inspectable optimistic conflicts", () => {
    const first = createWorkArtifact("drover", {
      id: "draft",
      kind: "document",
      content: "one",
      createdBy: founder(),
      expectedStoreRevision: 0,
    }, options);
    reviseWorkArtifact("drover", first.artifactId, {
      content: "two",
      createdBy: founder(),
    }, { ...options, expectedStoreRevision: 1, expectedArtifactRevision: 1 });

    assert.throws(
      () => createWorkArtifact("drover", {
        id: "stale-create", kind: "note", content: "x", createdBy: founder(),
      }, { ...options, expectedStoreRevision: 1 }),
      (error) => error instanceof WorkArtifactConflictError
        && error.scope === "store"
        && error.actualRevision === 2,
    );
    assert.throws(
      () => reviseWorkArtifact("drover", first.artifactId, {
        content: "stale", createdBy: founder(),
      }, { ...options, expectedArtifactRevision: 1 }),
      (error) => error instanceof WorkArtifactConflictError
        && error.scope === "artifact head"
        && error.actualRevision === 2,
    );
  });

  it("replays an idempotent mutation exactly and refuses reuse for a different payload", () => {
    const input = {
      id: "retry-safe",
      kind: "comparison",
      content: { left: "A", right: "B" },
      createdBy: founder(),
      idempotencyKey: "request-42",
      expectedStoreRevision: 0,
    };
    const first = createWorkArtifact("drover", input, options);
    const retry = createWorkArtifact("drover", input, options);

    assert.deepEqual(retry, first);
    assert.equal(loadWorkArtifactStore("drover", options).artifactRevisions.length, 1);
    assert.equal(loadWorkArtifactStore("drover", options).revision, 1);
    assert.throws(
      () => createWorkArtifact("drover", { ...input, content: { left: "C", right: "D" } }, options),
      (error) => error instanceof WorkArtifactConflictError && error.scope === "idempotency",
    );
  });

  it("stores open attributed relationships, revises them, and marks an unbased claim speculative", () => {
    createWorkArtifact("drover", { id: "evidence", kind: "evidence", content: "Observed", createdBy: founder() }, options);
    createWorkArtifact("drover", { id: "claim", kind: "claim", content: "Likely", createdBy: founder() }, options);
    const relation = createWorkRelationship("drover", {
      id: "edge-1",
      sourceRef: { type: "work-artifact", id: "evidence" },
      targetRef: { type: "work-artifact", id: "claim" },
      kind: "illuminates_without_proving",
      label: "suggests",
      basis: [{ receiptRef: { type: "file", id: "src/a.mjs:1" }, reasoning: "The behavior is explicit." }],
      provenance: "grounded",
      createdBy: { type: "model-worker", workerId: "claude" },
    }, options);
    const revised = reviseWorkRelationship("drover", relation.relationshipId, {
      kind: "complicates",
      basis: [],
      provenance: "proven",
      createdBy: founder(),
    }, { ...options, expectedRelationshipRevision: 1 });

    assert.equal(relation.kind, "illuminates_without_proving", "relationship kinds stay open");
    assert.equal(relation.provenance, "inferred", "an unresolved receipt cannot mint grounded truth");
    assert.equal(revised.kind, "complicates");
    assert.equal(revised.declaredProvenance, "proven");
    assert.equal(revised.provenance, "speculative", "a relationship with no basis cannot present as proven");
    assert.equal(getWorkRelationship("drover", "edge-1", options).revision, 2);
    assert.equal(listWorkRelationships("drover", options).length, 1);
  });

  it("refuses explicit cross-project records, parent refs, relationship endpoints, and selectors", () => {
    const artifact = createWorkArtifact("alpha", {
      id: "alpha-note", kind: "note", content: "alpha", createdBy: founder(),
    }, options);

    assert.throws(
      () => createWorkArtifact("alpha", {
        projectId: "beta", kind: "note", content: "foreign", createdBy: founder(),
      }, options),
      /belongs to project beta, not alpha/i,
    );
    assert.throws(
      () => createWorkArtifact("alpha", {
        kind: "note", content: "foreign parent", createdBy: founder(),
        parentRefs: [{ type: "work-artifact", id: "beta-note", projectId: "beta" }],
      }, options),
      /belongs to project beta, not alpha/i,
    );
    assert.throws(
      () => createWorkRelationship("alpha", {
        sourceRef: { type: "work-artifact", id: "alpha-note", projectId: "alpha" },
        targetRef: { type: "work-artifact", id: "beta-note", projectId: "beta" },
        kind: "supports", basis: ["a claim"], provenance: "inferred", createdBy: founder(),
      }, options),
      /belongs to project beta, not alpha/i,
    );
    assert.throws(
      () => getWorkArtifact("beta", { id: artifact.artifactId, projectId: "alpha" }, options),
      /belongs to project alpha, not beta/i,
    );
    assert.equal(listWorkArtifacts("beta", options).length, 0);
  });

  it("fails closed when an unscoped relationship endpoint resolves to another project", () => {
    createWorkArtifact("alpha", { id: "local", kind: "note", content: "local", createdBy: founder() }, options);
    createWorkArtifact("beta", { id: "foreign", kind: "note", content: "foreign", createdBy: founder() }, options);
    assert.throws(() => createWorkRelationship("alpha", {
      sourceRef: { type: "work-artifact", id: "local" },
      targetRef: { type: "work-artifact", id: "foreign" },
      kind: "supports", basis: ["reasoning"], provenance: "inferred", createdBy: founder(),
    }, options), /belongs to project beta, not alpha/i);
    assert.equal(listWorkRelationships("alpha", options).length, 0);
    createGoal({
      id: "foreign-goal", projectId: "beta", statement: "Foreign", createdBy: "founder", idempotencyKey: "foreign-goal",
    }, options);
    assert.throws(() => createWorkArtifact("alpha", {
      id: "bad-goal-ref", kind: "brief", content: {}, refs: [{ type: "goal", id: "foreign-goal" }], createdBy: founder(),
    }, options), /goal:foreign-goal belongs to project beta, not alpha/i);
  });

  it("persists the complete project document and reloads heads, receipts, and history", () => {
    const created = createWorkArtifact("drover", {
      id: "durable",
      kind: "table",
      content: [{ buyer: "founder", pain: "fragmented work" }],
      createdBy: { type: "import", importId: "csv-1" },
      toolReceipts: [{ tool: "csv.parse", callId: "1" }],
    }, options);
    reviseWorkArtifact("drover", created.artifactId, {
      status: "reviewed",
      createdBy: founder(),
    }, options);

    const files = fs.readdirSync(path.join(root, "work-artifacts"));
    assert.equal(files.length, 1);
    assert.match(files[0], /^drover-[a-f0-9]{12}\.json$/);
    const file = path.join(root, "work-artifacts", files[0]);
    assert.equal(fs.existsSync(file), true, "the existing JSON persistence backend owns the atomic project document");
    const fromDisk = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(fromDisk.revision, 2);
    assert.equal(fromDisk.artifactRevisions.length, 2);
    const reloaded = loadWorkArtifactStore("drover", { root, backend: "json" });
    assert.equal(reloaded.artifactHeads[0].revision, 2);
    assert.equal(getWorkArtifact("drover", "durable", { root, backend: "json" }).status, "reviewed");
    assert.equal(getWorkArtifactHistory("drover", "durable", { root, backend: "json" }).length, 2);
  });

  it("keeps immutable history and returns safe clones across input, result, head, and history reads", () => {
    const content = { nested: { value: 1 } };
    const first = createWorkArtifact("drover", {
      id: "immutable", kind: "structured-note", content, createdBy: founder(),
    }, options);
    content.nested.value = 99;
    first.content.nested.value = 88;
    const second = reviseWorkArtifact("drover", "immutable", {
      content: { nested: { value: 2 } }, createdBy: founder(),
    }, options);
    second.content.nested.value = 77;
    const history = getWorkArtifactHistory("drover", "immutable", options);
    history[0].content.nested.value = 66;

    const reread = getWorkArtifactHistory("drover", "immutable", options);
    assert.equal(reread[0].content.nested.value, 1);
    assert.equal(reread[1].content.nested.value, 2);
    assert.equal(getWorkArtifact("drover", "immutable", options).content.nested.value, 2);
    assert.notEqual(reread[0].contentHash, reread[1].contentHash);
  });

  it("retires through an immutable tombstone and restores by creating a new head revision", () => {
    createWorkArtifact("drover", {
      id: "recoverable", kind: "document", status: "draft", content: "keep me", createdBy: founder(),
    }, options);
    const retired = retireWorkArtifact("drover", "recoverable", {
      reason: "superseded for now", createdBy: founder(), expectedArtifactRevision: 1,
    }, options);
    assert.equal(retired.revision, 2);
    assert.ok(retired.retiredAt);
    assert.equal(listWorkArtifacts("drover", options).length, 0);
    assert.equal(listWorkArtifacts("drover", { ...options, includeRetired: true }).length, 1);
    const beforeRestore = loadWorkArtifactStore("drover", options);
    assert.equal(beforeRestore.tombstones.length, 1);

    const restored = restoreWorkArtifact("drover", "recoverable", {
      createdBy: founder(), expectedArtifactRevision: 2,
    }, options);
    assert.equal(restored.revision, 3);
    assert.equal(restored.status, "draft");
    assert.equal(restored.content, "keep me");
    assert.equal(restored.retiredAt, undefined);
    assert.equal(loadWorkArtifactStore("drover", options).tombstones.length, 1, "restore never rewrites or deletes the tombstone receipt");
    assert.equal(getWorkArtifactHistory("drover", "recoverable", options).length, 3);
  });

  it("restores an earlier active revision by appending a new immutable head", () => {
    createWorkArtifact("drover", { id: "rewind", kind: "brief", content: "first", createdBy: founder() }, options);
    reviseWorkArtifact("drover", "rewind", { content: "second", createdBy: founder() }, { ...options, expectedArtifactRevision: 1 });
    const restored = restoreWorkArtifact("drover", "rewind", {
      revision: 1, createdBy: founder(), expectedArtifactRevision: 2,
    }, options);
    assert.equal(restored.revision, 3);
    assert.equal(restored.content, "first");
    assert.equal(getWorkArtifactHistory("drover", "rewind", options).length, 3);
    assert.equal(getWorkArtifactHistory("drover", "rewind", options)[1].content, "second", "restoration never rewrites history");
  });

  it("hashes semantically identical JSON deterministically and never accepts executable content", () => {
    assert.equal(hashArtifactContent({ b: 2, a: 1 }), hashArtifactContent({ a: 1, b: 2 }));
    const inert = createWorkArtifact("drover", {
      id: "inert", kind: "code-sample", content: "globalThis.__artifactRan = true", createdBy: founder(),
    }, options);
    assert.equal(inert.content, "globalThis.__artifactRan = true");
    assert.equal(globalThis.__artifactRan, undefined);
    assert.throws(
      () => createWorkArtifact("drover", {
        id: "executable", kind: "bad", content: { run() {} }, createdBy: founder(),
      }, options),
      /inert JSON or text/i,
    );
  });

  it("preserves the original creator and records a required author on every revision", () => {
    const created = createWorkArtifact("drover", {
      id: "authorship", kind: "note", content: "one", createdBy: founder("jacob"),
    }, options);
    const revised = reviseWorkArtifact("drover", created.artifactId, {
      content: "two", createdBy: { type: "model-worker", workerId: "codex" },
    }, options);
    assert.deepEqual(revised.createdBy, founder("jacob"));
    assert.deepEqual(revised.revisionAuthor, { type: "model-worker", workerId: "codex" });
    assert.throws(() => createWorkArtifact("drover", {
      id: "unattributed", kind: "note", content: "none",
    }, { root, backend: "json" }), /createdBy must attribute/i);
  });

  it("lets exactly one interleaved stale writer win without erasing unrelated artifacts", () => {
    createWorkArtifact("drover", {
      id: "base", kind: "note", content: "keep", createdBy: founder(),
    }, options);
    let winner;
    assert.throws(() => createWorkArtifact("drover", {
      id: "loser", kind: "note", content: "lose", createdBy: { type: "model-worker", workerId: "claude" },
    }, {
      ...options,
      beforeCommit() {
        winner = createWorkArtifact("drover", {
          id: "winner", kind: "note", content: "win", createdBy: { type: "model-worker", workerId: "codex" },
        }, { ...options, beforeCommit: undefined });
      },
    }), (error) => error instanceof WorkArtifactConflictError
      && error.code === "WORK_ARTIFACT_CONFLICT"
      && error.expectedRevision === 1
      && error.actualRevision === 2);
    assert.equal(winner.artifactId, "winner");
    assert.deepEqual(listWorkArtifacts("drover", options).map((item) => item.artifactId), ["base", "winner"]);
  });

  it("uses collision-resistant project keys and migrates the legacy safe-id key on read", () => {
    createWorkArtifact("a/b", { id: "slash", kind: "note", content: "slash", createdBy: founder() }, options);
    createWorkArtifact("a b", { id: "space", kind: "note", content: "space", createdBy: founder() }, options);
    assert.equal(getWorkArtifact("a/b", "slash", options).content, "slash");
    assert.equal(getWorkArtifact("a b", "space", options).content, "space");
    assert.equal(fs.readdirSync(path.join(root, "work-artifacts")).length, 2);

    createWorkArtifact("legacy", { id: "old", kind: "note", content: "kept", createdBy: founder() }, options);
    const dir = path.join(root, "work-artifacts");
    const hashed = fs.readdirSync(dir).find((file) => file.startsWith("legacy-"));
    fs.renameSync(path.join(dir, hashed), path.join(dir, "legacy.json"));
    closePersistence(options);
    const migrated = loadWorkArtifactStore("legacy", { root, backend: "json" });
    assert.equal(migrated.artifactHeads[0].artifactId, "old");
    assert.equal(fs.existsSync(path.join(dir, "legacy.json")), false);
    assert.ok(fs.readdirSync(dir).some((file) => /^legacy-[a-f0-9]{12}\.json$/.test(file)));
  });

  it("demotes strong provenance without qualifying receipts", () => {
    const artifact = createWorkArtifact("drover", {
      id: "unsupported-proof", kind: "claim", content: "claim", provenance: "proven",
      createdBy: { type: "model-worker", workerId: "codex" },
    }, options);
    assert.equal(artifact.declaredProvenance, "proven");
    assert.equal(artifact.provenance, "generated");
  });

  it("rejects corrupt persisted head invariants on load", () => {
    createWorkArtifact("drover", {
      id: "corrupt-me", kind: "note", content: "valid first", createdBy: founder(),
    }, options);
    const dir = path.join(root, "work-artifacts");
    const file = path.join(dir, fs.readdirSync(dir)[0]);
    const corrupt = JSON.parse(fs.readFileSync(file, "utf8"));
    corrupt.artifactHeads[0].revisionId = "missing:r99";
    fs.writeFileSync(file, JSON.stringify(corrupt));
    closePersistence(options);
    assert.throws(() => loadWorkArtifactStore("drover", options), /Invalid artifact head invariant/);
  });
});
