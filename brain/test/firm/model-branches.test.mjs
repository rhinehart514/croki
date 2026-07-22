import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  createModelBranch,
  mergeModelBranch,
  projectModelBranch,
  proposeModelChange,
} from "../../src/firm/model-branches.mjs";
import { getSemanticModel, mutateSemanticModel } from "../../src/firm/semantic-model-store.mjs";
import { createVenture, setVentureDoc } from "../../src/firm/venture-store.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-model-branch-"));
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "drover-model-branch-repo-"));
  const options = { root };
  const venture = createVenture({ name: "Mutable Product", repository }, options);
  setVentureDoc(venture.id, "conversation", "direction-one", { id: "direction-one", ventureId: venture.id, role: "founder", content: "Change the Product." }, options);
  mutateSemanticModel({
    ventureId: venture.id,
    baseRevision: 0,
    actor: { authority: "founder", id: "jacob" },
    operations: [{ op: "create-record", family: "objects", record: {
      id: "promise", type: "promise", name: "Current promise", statement: "Save time.", properties: { territory: "both" }, assertion: "founder-asserted", provenance: { kind: "founder-authored" },
    } }],
  }, options);
  return { venture, options };
}

describe("durable competing Product models", () => {
  it("keeps agent changes provisional until the founder selectively merges them", () => {
    const fx = fixture();
    const branch = createModelBranch({
      ventureId: fx.venture.id,
      name: "Outcome promise",
      question: "Should the Product sell velocity instead of time savings?",
      sourceRefs: ["conversation:direction-one"],
      createdBy: { authority: "agent", id: "codex" },
    }, fx.options);
    const update = proposeModelChange({
      ventureId: fx.venture.id,
      branchId: branch.id,
      targetFamily: "objects",
      targetRef: "object:promise",
      operation: "update",
      patch: { name: "Velocity promise", statement: "Move faster than the market can react." },
      rationale: "Founder direction makes speed the primary value.",
      sourceRefs: ["conversation:direction-one"],
      proposedBy: { authority: "agent", id: "codex" },
    }, fx.options);
    const alternative = proposeModelChange({
      ventureId: fx.venture.id,
      branchId: branch.id,
      targetFamily: "objects",
      operation: "create",
      proposedRecord: { id: "motion-outbound", type: "motion", name: "Outbound", statement: "Founder-led and agent-assisted outreach.", properties: { territory: "gtm" } },
      rationale: "Outbound can coexist with Product-led growth.",
      sourceRefs: ["conversation:direction-one"],
      proposedBy: { authority: "agent", id: "codex" },
    }, fx.options);

    assert.equal(getSemanticModel(fx.venture.id, fx.options).objects[0].name, "Current promise");
    assert.equal(projectModelBranch(fx.venture.id, branch.id, fx.options).proposed.objects.find((entry) => entry.id === "promise").name, "Velocity promise");

    const merged = mergeModelBranch({
      ventureId: fx.venture.id,
      branchId: branch.id,
      selectedChangeRefs: [`model-change:${update.id}`],
      reason: "Make speed current; keep outbound provisional.",
      actor: { authority: "founder", id: "jacob" },
    }, fx.options);
    assert.equal(merged.model.objects.find((entry) => entry.id === "promise").name, "Velocity promise");
    assert.equal(merged.model.objects.some((entry) => entry.id === "motion-outbound"), false);
    assert.deepEqual(merged.receipt.selectedChangeRefs, [`model-change:${update.id}`]);
    assert.equal(projectModelBranch(fx.venture.id, branch.id, fx.options).changes.some((entry) => entry.id === alternative.id), true);
  });

  it("surfaces current-model drift as an explicit conflict", () => {
    const fx = fixture();
    const branch = createModelBranch({ ventureId: fx.venture.id, question: "Change the promise?", sourceRefs: ["conversation:direction-one"], createdBy: { authority: "agent", id: "codex" } }, fx.options);
    const change = proposeModelChange({ ventureId: fx.venture.id, branchId: branch.id, targetFamily: "objects", targetRef: "object:promise", operation: "update", patch: { statement: "Agent alternative." }, rationale: "Try another promise.", sourceRefs: ["conversation:direction-one"], proposedBy: { authority: "agent", id: "codex" } }, fx.options);
    const current = getSemanticModel(fx.venture.id, fx.options);
    mutateSemanticModel({ ventureId: fx.venture.id, baseRevision: current.revision, actor: { authority: "founder", id: "jacob" }, operations: [{ op: "update-record", family: "objects", id: "promise", record: { statement: "Founder changed current truth." } }] }, fx.options);

    const projection = projectModelBranch(fx.venture.id, branch.id, fx.options);
    assert.equal(projection.conflicts[0].changeRef, `model-change:${change.id}`);
    assert.throws(
      () => mergeModelBranch({ ventureId: fx.venture.id, branchId: branch.id, selectedChangeRefs: [change.id], actor: { authority: "founder", id: "jacob" } }, fx.options),
      (error) => error.code === "model_branch_conflict" && error.conflicts.length === 1,
    );
  });

  it("never lets an agent merge adopted Product truth", () => {
    const fx = fixture();
    const branch = createModelBranch({ ventureId: fx.venture.id, question: "Change it?", sourceRefs: ["conversation:direction-one"], createdBy: { authority: "agent", id: "codex" } }, fx.options);
    assert.throws(
      () => mergeModelBranch({ ventureId: fx.venture.id, branchId: branch.id, selectedChangeRefs: ["anything"], actor: { authority: "agent", id: "codex" } }, fx.options),
      (error) => error.code === "model_branch_authority_denied",
    );
  });
});

