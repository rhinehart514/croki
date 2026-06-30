import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createProject, loadProject, updateSharedContext } from "../src/project-store.mjs";
import { loadFeedbackLedger, recordFeedbackSignals } from "../src/feedback-ledger.mjs";

// THE INVARIANT THIS LOCKS. Ambient lets a goal drive and an ambient drive run at once — the first time
// two drives mutate ONE project's shared, project-scoped stores concurrently (the single project.json
// via update_shared_context, and the one signals[] feedback ledger). The per-(project,kind) session lock
// does NOT serialize those shared writes; what does is that every shared-store mutation is a SYNCHRONOUS
// load-modify-save, atomic under Node's single-threaded event loop. These tests prove no update is lost
// when the two drives interleave at their await boundaries — and would FAIL if a future refactor slipped
// an await BETWEEN a shared store's read and its write (reintroducing the lost-update race).

// Yield the event loop so the two simulated drives genuinely interleave between their writes.
const yieldLoop = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("concurrent goal + ambient drives never lose a shared-store update", () => {
  let parent;
  let options;
  let projectId;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-ambient-concurrency-"));
    options = { root: parent };
    projectId = createProject({ name: "Concurrency" }, options).project.id;
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("interleaved shared-context patches from two drives all land — version increments are never lost", async () => {
    const N = 30;
    const base = loadProject({ ...options, projectId }).sharedContext.version;

    // Two drives patch DISJOINT fields of the same project.json concurrently. If updateSharedContext
    // were not atomic, a drive reading a stale snapshot would save back a version missing the other
    // drive's field, and the final version would be < base + 2N.
    async function patchField(field, makeValue) {
      for (let i = 0; i < N; i += 1) {
        updateSharedContext({ [field]: makeValue(i) }, { ...options, projectId });
        await yieldLoop();
      }
    }

    await Promise.all([
      patchField("positioning", (i) => ({ promise: `goal-${i}` })),
      patchField("icp", (i) => ({ query: `ambient-${i}` })),
    ]);

    const ctx = loadProject({ ...options, projectId }).sharedContext;
    assert.equal(ctx.version, base + 2 * N, "every RMW saw the prior write's increment — no version was lost");
    assert.equal(ctx.positioning.promise, `goal-${N - 1}`, "the goal drive's field survived every ambient write");
    assert.equal(ctx.icp.query, `ambient-${N - 1}`, "the ambient drive's field was never clobbered by the goal drive");
  });

  it("interleaved feedback-ledger writes from two drives all accumulate — no banked signal is dropped", async () => {
    const N = 30;

    async function bank(label) {
      for (let i = 0; i < N; i += 1) {
        recordFeedbackSignals(
          [{ projectId, type: "FounderApproval", summary: `${label}-${i}` }],
          { ...options, projectId },
        );
        await yieldLoop();
      }
    }

    await Promise.all([bank("goal"), bank("ambient")]);

    const signals = loadFeedbackLedger(projectId, options).signals;
    for (const label of ["goal", "ambient"]) {
      for (let i = 0; i < N; i += 1) {
        assert.ok(
          signals.some((signal) => signal.summary === `${label}-${i}`),
          `the ${label} drive's signal ${i} survived the concurrent ambient writes`,
        );
      }
    }
    assert.equal(signals.length, 2 * N, "both drives' banked taste signals are all present — none was clobbered");
  });
});
