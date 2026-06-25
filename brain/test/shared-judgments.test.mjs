import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  appendGateJudgments,
  loadSharedDecisions,
  mergeSharedDecisions,
  sharedJudgmentsPath,
} from "../src/shared-judgments.mjs";

// A recorded run result whose gate node carries founder decisions, shaped like what
// flow-store.recordFlowRun persists and what feedback-ledger hands to the shared ledger.
function resultWithGate(items, runId = "run-1") {
  return { runId, nodes: { "gate-review": { category: "gate", items } } };
}

describe("shared-judgments — the one taste notebook both rigs use", () => {
  let root;
  let options;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-shared-judgments-"));
    options = { root };
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("sandboxes the ledger path under options.root so tests never touch the real taste file", () => {
    const file = sharedJudgmentsPath(options);
    assert.ok(file.startsWith(root), `expected sandboxed path, got ${file}`);
    assert.ok(!file.includes(path.join(os.homedir(), ".leverage")));
  });

  it("appends approved, rejected, and edited gate decisions as JSONL the global rig can read", () => {
    const result = resultWithGate([
      { name: "A", email: "a@x.com", draft: "warm note to A", approvalStatus: "approved" },
      { name: "B", email: "b@x.com", draft: "stiff pitch to B", approvalStatus: "rejected" },
      { name: "C", email: "c@x.com", draft: "founder rewrite", editedFrom: "model draft", approvalStatus: "approved" },
    ]);
    const out = appendGateJudgments({ projectId: "proj", graph: { id: "g1" }, result }, options);
    assert.equal(out.appended, 3);

    const lines = fs.readFileSync(sharedJudgmentsPath(options), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines.length, 3);
    for (const rec of lines) {
      assert.equal(rec.source, "gtm-ide-gate");
      assert.equal(rec.project, "proj");
      assert.equal(rec.graphId, "g1");
      assert.ok(Array.isArray(rec.picked) && rec.picked.length === 1);
    }
    const edited = lines.find((r) => r.status === "edited");
    assert.equal(edited.draft, "founder rewrite");
    assert.equal(edited.editedFrom, "model draft");
  });

  it("reads the ledger back into the approved/rejected/edits shape memory.mjs uses", () => {
    appendGateJudgments({
      projectId: "proj",
      graph: { id: "g1" },
      result: resultWithGate([
        { name: "A", draft: "warm note to A", approvalStatus: "approved" },
        { name: "B", draft: "stiff pitch to B", approvalStatus: "rejected" },
        { name: "C", draft: "founder rewrite", editedFrom: "model draft", approvalStatus: "approved" },
      ]),
    }, options);

    const decisions = loadSharedDecisions(options);
    assert.deepEqual(decisions.approved.map((d) => d.draft).sort(), ["founder rewrite", "warm note to A"]);
    assert.deepEqual(decisions.rejected.map((d) => d.draft), ["stiff pitch to B"]);
    assert.deepEqual(decisions.edits, [{ from: "model draft", to: "founder rewrite" }]);
  });

  it("returns empty (no-op) when the shared ledger does not exist yet", () => {
    assert.deepEqual(loadSharedDecisions(options), { approved: [], rejected: [], edits: [] });
    // merge with an empty ledger preserves local decisions exactly — existing taste behavior intact
    const local = { approved: [{ name: "L", draft: "local approved" }], rejected: [], edits: [] };
    assert.deepEqual(mergeSharedDecisions(local, options), local);
  });

  it("merges local decisions first, then fills from the shared ledger, deduped by draft", () => {
    appendGateJudgments({
      projectId: "other-project",
      graph: { id: "g2" },
      result: resultWithGate([
        { name: "S", draft: "shared approved", approvalStatus: "approved" },
        { name: "Dup", draft: "same draft", approvalStatus: "approved" },
      ]),
    }, options);

    const local = { approved: [{ name: "Dup", draft: "same draft" }], rejected: [], edits: [] };
    const merged = mergeSharedDecisions(local, options);
    // local "same draft" wins its slot; "shared approved" fills in; no duplicate
    assert.deepEqual(merged.approved.map((d) => d.draft), ["same draft", "shared approved"]);
  });
});
