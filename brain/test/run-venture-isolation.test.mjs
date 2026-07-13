// run-venture-isolation.test.mjs — EXPERIMENT-MACHINE-SPEC rail 6, FIX 4: ventures never bleed.
//
// THE HOLE (Codex review): a run is addressed by id in the URL but authorized against the URL's projectId.
// The store's get(id) ignored projectId, so /projects/A/runs/<B-run>/gate|approve|greenlight would expose —
// and could approve/greenlight — venture B's work. THE FIX: run lookup is venture-scoped — it verifies the
// run's persisted projectId matches the URL projectId and FAILS CLOSED on any mismatch.
//
// What this proves:
//   - getRunScoped returns a run under its OWN venture.
//   - A run from venture B accessed under venture A fails closed (not-found), for read AND for approve AND
//     for greenlight — none of B's work is exposed or actioned under A.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { compileRunFromPath, greenlightRun, approveCompiledRun, getRunScoped } from "../src/run-compile.mjs";
import { gtmPathStore } from "../src/gtm-store.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "run-isolation-")) };
}

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

// Stage a run in venture B (projectId "venture-b"), sharing one store root with venture A.
async function stageRunInVentureB(options) {
  const p = gtmPathStore.create(
    { projectId: "venture-b", summary: "Venture B's private experiment", bet: { channel: "email" }, status: "selected" },
    options,
  );
  const { run } = await compileRunFromPath({
    projectId: "venture-b",
    pathId: p.id,
    compose: gatedComposer(),
    input: { items: [{ handle: "b-item", draft: "B's staged work", protects: "stage_locally" }] },
    options,
  });
  return run;
}

describe("FIX 4 — run access is venture-scoped, cross-venture fails closed", () => {
  it("getRunScoped returns a run under its own venture", async () => {
    const options = freshRoot();
    const runB = await stageRunInVentureB(options);
    const found = getRunScoped(runB.id, "venture-b", options);
    assert.equal(found.id, runB.id);
    assert.equal(found.projectId, "venture-b");
  });

  it("READ: venture B's run accessed under venture A fails closed", async () => {
    const options = freshRoot();
    const runB = await stageRunInVentureB(options);
    assert.throws(
      () => getRunScoped(runB.id, "venture-a", options),
      (err) => err.code === "run_not_in_venture" && err.status === 404,
      "reading B's run under A must fail closed as not-found",
    );
  });

  it("APPROVE: venture B's run cannot be approved under venture A", async () => {
    const options = freshRoot();
    const runB = await stageRunInVentureB(options);
    await assert.rejects(
      () => approveCompiledRun({
        projectId: "venture-a",
        runId: runB.id,
        decisions: { "b-item": { decision: "approve" } },
        options,
      }),
      (err) => err.code === "run_not_in_venture",
      "approving B's run under A must fail closed",
    );
  });

  it("GREENLIGHT: venture B's run cannot be greenlit under venture A", async () => {
    const options = freshRoot();
    const runB = await stageRunInVentureB(options);
    await assert.rejects(
      () => greenlightRun({ projectId: "venture-a", runId: runB.id, options }),
      (err) => err.code === "run_not_in_venture",
      "greenlighting B's run under A must fail closed",
    );
  });
});
