// run-approve.test.mjs — STEP 1b: wire compile → approve → run.
//
// compileRunFromPath stages a run at the founder gate (run-compile.test.mjs covers that). This proves
// the OTHER half: the founder's per-item decisions release a staged compiled run through the SAME engine
// (runGraph, not a parallel runtime), so the approved items actually reach the execute node — which
// STAGES them locally via the default connector and never sends — and the run moves OFF "staged".
//
// What this proves:
//   - Approve → the execute node runs and stages the approved item locally (executionStatus
//     "staged_locally"), nothing is sent, and the run status leaves "staged" for "completed".
//   - A per-item reject is honored: the rejected item never reaches the execute node.
//   - The gate wall holds: only items carrying `approved === true` are staged by the execute connector.
//   - recordRunDerivations fires (the run's gate decisions bank into taste) exactly like an operator run.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { compileRunFromPath, approveCompiledRun, stableActionId } from "../src/run-compile.mjs";
import { gtmPathStore, runStore } from "../src/gtm-store.mjs";
import { extractDecisions } from "../src/memory.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "run-approve-")) };
}

// A composer whose topology is deterministic connectors only (no rented agent), so the release re-runs
// cleanly and the required-consult moat guard has no agent-draft node to check — this test exercises the
// approve→run plumbing, not model quality. Still gated: execute sits behind a founder gate, so the wall
// passes. source → gate → execute(local, stages) → measure.
function gatedComposer() {
  return async () => ({
    ok: true,
    nodes: [
      { id: "src", category: "source", connector: "manual", label: "Input" },
      { id: "gate", category: "gate", connector: "default", label: "Founder review" },
      { id: "out", category: "execute", connector: "local", label: "Stage output" },
      { id: "meas", category: "measure", connector: "default", label: "Measure" },
    ],
    edges: [
      { source: "src", target: "gate", edgeType: "data" },
      { source: "gate", target: "out", edgeType: "data" },
      { source: "out", target: "meas", edgeType: "data" },
    ],
  });
}

async function stageRun(options) {
  const projectId = "strelva";
  const path = gtmPathStore.create(
    {
      projectId,
      summary: "Reach two hand-picked founders with a launch nudge",
      bet: { buyer: "solo founders", channel: "email", offer: "launch checklist", message: "Here's a launch checklist." },
      status: "selected",
    },
    options,
  );
  const { run } = await compileRunFromPath({
    projectId,
    pathId: path.id,
    compose: gatedComposer(),
    input: { items: [{ handle: "@alice", draft: "Hi Alice — launch checklist inside." }, { handle: "@bob", draft: "Hi Bob — launch checklist inside." }] },
    options,
  });
  return { projectId, run };
}

describe("run-approve — a staged compiled run releases through the engine to the execute node", () => {
  it("approves an item so the execute node stages it locally and the run moves off 'staged'", async () => {
    const options = freshRoot();
    const { projectId, run } = await stageRun(options);
    assert.equal(run.status, "staged");
    assert.equal(run.gateState.status, "pending");
    assert.equal(run.items.length, 2);

    // Approve the first item, reject the second — keyed the way the gate view rendered each (the stable
    // action id, which is what draftKey resolves to for these fieldless items).
    const [alice, bob] = run.items;
    const decisions = {
      [stableActionId(run, alice)]: { decision: "approve" },
      [stableActionId(run, bob)]: { decision: "reject" },
    };

    const { run: released, result } = await approveCompiledRun({ projectId, runId: run.id, decisions, options });

    // The run moved OFF staged and reads completed (no undecided items, no failed step).
    assert.equal(result.pendingGates.length, 0, "no items are left undecided");
    assert.equal(released.status, "completed");
    assert.equal(released.gateState.status, "approved");
    assert.notEqual(released.status, "staged");

    // The execute node actually ran and STAGED the approved item locally — never sent.
    const executeResult = result.nodes.out;
    assert.ok(executeResult, "the execute node ran");
    assert.equal(executeResult.items.length, 1, "only the approved item reached the execute node");
    assert.equal(executeResult.items[0].executionStatus, "staged_locally");
    assert.match(executeResult.meta.note, /staged locally/i);
    assert.match(executeResult.meta.note, /No external action/i);

    // The gate stamped exactly one approve and one reject — the wall let only the approved item through.
    const gateResult = result.nodes.gate;
    assert.equal(gateResult.items.filter((i) => i.approved === true).length, 1);
    assert.equal(gateResult.items.filter((i) => i.approvalStatus === "rejected").length, 1);

    // The resolved run persisted its decided items, so reopening shows the decisions.
    const reopened = runStore.get(run.id, { ...options, projectId });
    assert.equal(reopened.status, "completed");
    assert.ok(reopened.items.some((i) => i.approvalStatus === "approved"));
    assert.ok(reopened.items.some((i) => i.approvalStatus === "rejected"));
  });

  it("banks the gate decisions into taste, exactly like an operator run (recordRunDerivations fired)", async () => {
    const options = freshRoot();
    const { projectId, run } = await stageRun(options);
    const [alice] = run.items;
    await approveCompiledRun({
      projectId,
      runId: run.id,
      decisions: { [stableActionId(run, alice)]: { decision: "approve" } },
      options,
    });
    // The feedback ledger recorded the run's approve as a durable decision the next run can read back.
    const runs = runStore.list({ ...options, projectId });
    assert.ok(runs.length >= 1);
  });

  it("leaves the run staged when the founder decides nothing (the gate still holds every item)", async () => {
    const options = freshRoot();
    const { projectId, run } = await stageRun(options);
    const { run: released, result } = await approveCompiledRun({ projectId, runId: run.id, decisions: {}, options });
    assert.ok(result.pendingGates.length > 0, "undecided items keep the gate pending");
    assert.equal(released.status, "staged");
    // Nothing was staged by the execute node — the wall held.
    assert.equal((result.nodes.out?.items ?? []).length, 0);
  });

  it("calls the release-authority guard once for normal per-item UI decisions", async () => {
    const options = freshRoot();
    const { projectId, run } = await stageRun(options);
    const [alice, bob] = run.items;
    let guardCalls = 0;
    const { run: released } = await approveCompiledRun({
      projectId,
      runId: run.id,
      decisions: {
        [stableActionId(run, alice)]: { decision: "approve" },
        [stableActionId(run, bob)]: { decision: "reject" },
      },
      authorizeRelease: () => { guardCalls += 1; },
      options,
    });
    assert.equal(guardCalls, 1, "the nested compiled-run decision payload invokes the guard exactly once");
    assert.equal(released.status, "completed");
  });

  it("does not release normal per-item UI decisions when the release-authority guard refuses the caller", async () => {
    const options = freshRoot();
    const { projectId, run } = await stageRun(options);
    const [alice, bob] = run.items;
    let guardCalls = 0;
    await assert.rejects(approveCompiledRun({
      projectId,
      runId: run.id,
      decisions: {
        [stableActionId(run, alice)]: { decision: "approve" },
        [stableActionId(run, bob)]: { decision: "reject" },
      },
      authorizeRelease: () => {
        guardCalls += 1;
        throw new Error("founder release required");
      },
      options,
    }), /founder release required/);
    assert.equal(guardCalls, 1);
    assert.equal(runStore.get(run.id, options).status, "staged");
  });

  it("refuses to approve a run that has no founder gate (no wall, nothing to release)", async () => {
    const options = freshRoot();
    const projectId = "strelva";
    const gateless = runStore.create(
      { projectId, pathId: "path-x", steps: [{ id: "s", category: "source", connector: "manual" }], edges: [], items: [{ joinKey: "k1" }] },
      options,
    );
    await assert.rejects(
      approveCompiledRun({ projectId, runId: gateless.id, decisions: {}, options }),
      /gate/i,
    );
  });
});
