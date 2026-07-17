import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  createVenture,
  getVentureDoc,
  listVentureDocs,
  openVenture,
  setVentureDoc,
} from "../../src/firm/venture-store.mjs";
import {
  createVentureTransfer,
  importVentureTransfer,
  VENTURE_TRANSFER_FORMAT,
  VENTURE_TRANSFER_VERSION,
} from "../../src/firm/venture-transfer.mjs";

function directory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fixture() {
  const root = directory("drover-transfer-source-");
  const repository = directory("drover-transfer-repo-");
  const options = { root };
  const venture = createVenture({ name: "Transfer fixture", repository }, options);
  const betId = "bet-portable";
  const workspaceId = `${venture.id}__${betId}`;
  const worktree = path.join(repository, ".dogfood-worktrees", "live-change");
  setVentureDoc(venture.id, "bets", betId, {
    id: betId,
    ventureId: venture.id,
    intent: "Prove transfer",
    work: {
      runtimeSessionId: "codex:source-machine-session",
      stepCount: 4,
      spentUsd: 0.25,
      cwd: repository,
    },
    staged: [{
      kind: "product-change",
      workspaceId,
      revisionId: "revision-1",
      worktree,
      repoRoot: repository,
      diff: "diff --git a/a.txt b/a.txt",
    }],
  }, options);
  setVentureDoc(venture.id, "productChanges", workspaceId, {
    id: workspaceId,
    ventureId: venture.id,
    betId,
    repo: repository,
    revisions: [{
      id: "revision-1",
      ventureId: venture.id,
      betId,
      status: "approved",
      sourceReceiptId: "change.md",
      worktree,
      repositoryPath: repository,
      diff: "diff --git a/a.txt b/a.txt",
    }],
    decisions: [],
  }, options);
  setVentureDoc(venture.id, "decisions", "wall-transfer", {
    id: "wall-transfer",
    ventureId: venture.id,
    betId,
    decision: null,
    effect: {
      kind: "product-change",
      workspaceId,
      revisionId: "revision-1",
      worktree,
    },
  }, options);
  return { root, repository, options, venture, betId, workspaceId, worktree };
}

describe("venture transfer file", () => {
  it("exports durable venture truth without source-machine paths or provider sessions", () => {
    const source = fixture();
    const transfer = createVentureTransfer(source.venture.id, source.options);
    const serialized = JSON.stringify(transfer);

    assert.equal(transfer.format, VENTURE_TRANSFER_FORMAT);
    assert.equal(transfer.version, VENTURE_TRANSFER_VERSION);
    assert.equal(transfer.venture.manifest.repository, undefined);
    assert.equal(serialized.includes(source.repository), false);
    assert.equal(serialized.includes(source.worktree), false);
    assert.equal(serialized.includes("source-machine-session"), false);

    const bet = transfer.venture.documents.bets.find((entry) => entry.id === source.betId);
    assert.deepEqual(bet.work, { stepCount: 4, spentUsd: 0.25, providerResume: "cold" });
    assert.equal(bet.staged[0].transferState, "needs-refork");

    const workspace = transfer.venture.documents.productChanges[0];
    assert.equal(workspace.repo, undefined);
    assert.equal(workspace.transferState, "needs-refork");
    assert.equal(workspace.revisions[0].status, "needs-refork");
    assert.equal(workspace.revisions[0].transferredStatus, "approved");
    assert.equal(workspace.revisions[0].worktreeStatus, "needs-refork");
    assert.equal(transfer.resume.provider, "cold");
    assert.equal(transfer.resume.destinationRepository, "rebind-required");
  });

  it("requires an explicit destination repository and records the cold/refork boundary", () => {
    const source = fixture();
    const transfer = createVentureTransfer(source.venture.id, source.options);
    const destinationRoot = directory("drover-transfer-destination-");
    const destinationRepository = directory("drover-transfer-destination-repo-");

    assert.throws(
      () => importVentureTransfer(transfer, { root: destinationRoot }),
      (error) => error.code === "venture_repository_rebind_required",
    );

    const result = importVentureTransfer(transfer, {
      root: destinationRoot,
      repository: destinationRepository,
    });
    assert.equal(result.venture.repository, fs.realpathSync(destinationRepository));
    assert.equal(result.receipt.providerResume, "cold");
    assert.equal(result.receipt.productChangeWorktrees, "refork-required");
    assert.deepEqual(result.receipt.reforkWorkspaceIds, [source.workspaceId]);

    const options = { root: destinationRoot };
    const importedBet = getVentureDoc(source.venture.id, "bets", source.betId, options);
    assert.equal(importedBet.work.runtimeSessionId, undefined);
    assert.equal(importedBet.work.providerResume, "cold");
    const importedWorkspace = getVentureDoc(source.venture.id, "productChanges", source.workspaceId, options);
    assert.equal(importedWorkspace.repo, fs.realpathSync(destinationRepository));
    assert.equal(importedWorkspace.revisions[0].status, "needs-refork");
    assert.equal(importedWorkspace.revisions[0].worktree, undefined);
    assert.equal(getVentureDoc(source.venture.id, "settings", "transfer", options).receiptId, result.receipt.receiptId);
  });

  it("emits transfer v2 while still accepting a v1 bundle", () => {
    const source = fixture();
    const transfer = createVentureTransfer(source.venture.id, source.options);
    assert.equal(transfer.version, 2);
    transfer.version = 1;
    const destinationRoot = directory("drover-transfer-v1-");
    const destinationRepository = directory("drover-transfer-v1-repo-");
    const result = importVentureTransfer(transfer, { root: destinationRoot, repository: destinationRepository });
    assert.equal(result.venture.id, source.venture.id);
  });

  it("accepts a real legacy v1 atlas and preserves it for lazy migration", () => {
    const source = fixture();
    const transfer = createVentureTransfer(source.venture.id, source.options);
    transfer.version = 1;
    transfer.venture.documents.architecture = [{
      current: { schemaVersion: 1, ventureId: source.venture.id, revision: 0, intent: { statement: "Legacy", constraints: [] }, elements: [], connections: [], groups: [], evidenceAnnotations: [], updatedAt: null, updatedBy: null },
      revisions: [], proposals: [], revision: 0,
    }];
    const destinationRoot = directory("drover-transfer-real-v1-");
    importVentureTransfer(transfer, { root: destinationRoot, repository: directory("drover-transfer-real-v1-repo-") });
    assert.ok(getVentureDoc(source.venture.id, "architecture", "atlas", { root: destinationRoot }).current);
  });

  it("rejects duplicate or malformed atlas singletons before writing the destination", () => {
    const source = fixture();
    const destinationRepository = directory("drover-transfer-singleton-repo-");
    const duplicate = createVentureTransfer(source.venture.id, source.options);
    duplicate.venture.documents.architecture = [{ schemaVersion: 2 }, { schemaVersion: 99 }];
    const duplicateRoot = directory("drover-transfer-singleton-");
    assert.throws(
      () => importVentureTransfer(duplicate, { root: duplicateRoot, repository: destinationRepository }),
      (error) => error.code === "venture_transfer_invalid" && error.status === 400,
    );
    assert.equal(openVenture(source.venture.id, { root: duplicateRoot }), null);

    const malformed = createVentureTransfer(source.venture.id, source.options);
    malformed.venture.documents.architecture = [{ schemaVersion: 2, ventureId: source.venture.id, revision: 0 }];
    const malformedRoot = directory("drover-transfer-malformed-v2-");
    assert.throws(
      () => importVentureTransfer(malformed, { root: malformedRoot, repository: directory("drover-transfer-malformed-v2-repo-") }),
      (error) => error.code === "venture_transfer_invalid" && error.status === 400,
    );
    assert.equal(openVenture(source.venture.id, { root: malformedRoot }), null);
  });

  it("rejects nested cross-venture references before writing any destination record", () => {
    const source = fixture();
    const transfer = structuredClone(createVentureTransfer(source.venture.id, source.options));
    transfer.venture.documents.decisions[0].effect.workspaceId = "other-venture__bet-stolen";
    const destinationRoot = directory("drover-transfer-cross-scope-");
    const destinationRepository = directory("drover-transfer-cross-scope-repo-");

    assert.throws(
      () => importVentureTransfer(transfer, { root: destinationRoot, repository: destinationRepository }),
      (error) => error.code === "venture_transfer_cross_scope" && error.status === 404,
    );
    assert.equal(openVenture(source.venture.id, { root: destinationRoot }), null);
  });

  it("does not overwrite a resident venture or bind two ventures to one repository", () => {
    const source = fixture();
    const transfer = createVentureTransfer(source.venture.id, source.options);
    const destinationRoot = directory("drover-transfer-conflict-");
    const destinationRepository = directory("drover-transfer-conflict-repo-");
    const residentRepository = directory("drover-transfer-resident-repo-");
    const resident = createVenture({ name: "Resident", repository: residentRepository }, { root: destinationRoot });
    const residentBefore = listVentureDocs(resident.id, "bets", { root: destinationRoot });

    importVentureTransfer(transfer, { root: destinationRoot, repository: destinationRepository });
    assert.deepEqual(listVentureDocs(resident.id, "bets", { root: destinationRoot }), residentBefore);
    assert.throws(
      () => importVentureTransfer(transfer, {
        root: destinationRoot,
        repository: directory("drover-transfer-second-repo-"),
      }),
      (error) => error.code === "venture_transfer_conflict" && error.status === 409,
    );

    const otherSource = fixture();
    const otherTransfer = createVentureTransfer(otherSource.venture.id, otherSource.options);
    assert.throws(
      () => importVentureTransfer(otherTransfer, { root: destinationRoot, repository: residentRepository }),
      (error) => error.code === "venture_repository_in_use" && error.status === 409,
    );
  });

  it("returns a real 404 for an unknown source venture", () => {
    assert.throws(
      () => createVentureTransfer("venture-missing", { root: directory("drover-transfer-missing-") }),
      (error) => error.code === "venture_not_found" && error.status === 404,
    );
  });
});
