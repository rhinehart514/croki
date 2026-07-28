import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, it } from "node:test";

import { createVenture } from "../../src/firm/venture-store.mjs";
import { createWorkJournal } from "../../src/firm/work-journal.mjs";
import { recordAcceptedRun } from "../../src/firm/work-journal-runtime.mjs";
import {
  __resetRunWorkers,
  drainAllRunWorkers,
  enqueueRunLayer,
  settleRunQuiescence,
  workerSnapshot,
} from "../../src/firm/run-worker.mjs";

const fixtures = [];

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-run-worker-"));
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "drover-run-worker-repo-"));
  const options = { root };
  createVenture({ id: "worker-venture", name: "Worker venture", repository }, options);
  const handle = (runId, threadRef = `thread:${runId}`) => ({
    ventureId: "worker-venture",
    threadRef,
    runId,
    options,
  });
  const accept = (runId) => {
    const run = handle(runId);
    recordAcceptedRun(run, { participantRef: "participant:codex" });
    return run;
  };
  const value = { root, repository, options, handle, accept };
  fixtures.push(value);
  return value;
}

afterEach(() => {
  __resetRunWorkers();
  for (const item of fixtures.splice(0)) {
    fs.rmSync(item.root, { recursive: true, force: true });
    fs.rmSync(item.repository, { recursive: true, force: true });
  }
});

it("serializes one Run while unrelated Runs continue", async () => {
  const { accept } = fixture();
  const runA = accept("run-a");
  const runB = accept("run-b");
  const releaseA = deferred();
  const startedA = deferred();
  const startedB = deferred();
  const order = [];

  const providerA = enqueueRunLayer(runA, "provider-settled", async () => {
    order.push("a-provider-start");
    startedA.resolve();
    await releaseA.promise;
    order.push("a-provider-end");
  });
  await startedA.promise;
  const timelineA = enqueueRunLayer(runA, "timeline-settled", () => {
    order.push("a-timeline");
  });
  const providerB = enqueueRunLayer(runB, "provider-settled", () => {
    order.push("b-provider");
    startedB.resolve();
  });

  await startedB.promise;
  assert.deepEqual(order, ["a-provider-start", "b-provider"]);
  releaseA.resolve();
  await Promise.all([providerA, timelineA, providerB]);
  assert.deepEqual(order, ["a-provider-start", "b-provider", "a-provider-end", "a-timeline"]);
});

it("serializes different Runs that mutate the same worktree", async () => {
  const { accept } = fixture();
  const first = accept("run-one");
  const second = accept("run-two");
  const release = deferred();
  const started = deferred();
  let secondStarted = false;

  const firstTask = enqueueRunLayer(first, "provider-settled", async () => {
    started.resolve();
    await release.promise;
  }, { worktreeRef: "/exact/worktree" });
  await started.promise;
  const secondTask = enqueueRunLayer(second, "provider-settled", () => {
    secondStarted = true;
  }, { worktreeRef: "/exact/worktree" });

  assert.equal(secondStarted, false);
  release.resolve();
  await Promise.all([firstTask, secondTask]);
  assert.equal(secondStarted, true);
});

it("preserves successful layer receipts when a later layer fails and keeps Review unready", async () => {
  const { accept, options } = fixture();
  const run = accept("run-failure");
  await enqueueRunLayer(run, "provider-settled", () => "native result");
  await assert.rejects(
    enqueueRunLayer(run, "verification-settled", () => {
      throw Object.assign(new Error("Project verification failed."), { code: "verification_failed" });
    }),
    /Project verification failed/,
  );
  await enqueueRunLayer(run, "projection-persisted", () => ({ throughSequence: 3 }));

  const quiescence = await settleRunQuiescence(run, {
    requiredReceipts: ["provider-settled", "verification-settled", "projection-persisted"],
    reviewId: "review:failure",
    checkpointId: "turn-1",
  });
  assert.deepEqual(quiescence.failedReceipts, ["verification-settled"]);

  const projection = createWorkJournal(options).readProjections("worker-venture");
  const projectedRun = projection.runs.find((entry) => entry.id === "run-failure");
  assert.deepEqual(projectedRun.layerReceipts.map(({ type, status }) => ({ type, status })), [
    { type: "provider-settled", status: "succeeded" },
    { type: "verification-settled", status: "failed" },
    { type: "projection-persisted", status: "succeeded" },
  ]);
  assert.equal(projectedRun.quiescence.status, "failed");
  assert.equal(projection.reviews.find((review) => review.id === "failure").ready, false);
});

it("hydrates durable receipts after process replacement before minting quiescence", async () => {
  const { accept, options } = fixture();
  const run = accept("run-recovered");
  await enqueueRunLayer(run, "provider-settled", () => "settled");
  await enqueueRunLayer(run, "timeline-settled", () => "written");
  await enqueueRunLayer(run, "projection-persisted", () => ({ throughSequence: 3 }));

  __resetRunWorkers();
  const quiescence = await settleRunQuiescence(run, {
    requiredReceipts: ["provider-settled", "timeline-settled", "projection-persisted"],
  });
  assert.equal(quiescence.ready, true);
  assert.equal(
    createWorkJournal(options).readProjections("worker-venture")
      .runs.find((entry) => entry.id === "run-recovered").quiescence.status,
    "ready",
  );
});

it("exposes bounded backpressure only at founder-relevant queue depth and drains deterministically", async () => {
  const { accept } = fixture();
  const run = accept("run-pressure");
  const release = deferred();
  const started = deferred();
  const types = [
    "provider-settled",
    "checkpoint-captured",
    "diff-finalized",
    "commands-settled",
    "verification-settled",
    "timeline-settled",
    "projection-persisted",
  ];
  const tasks = types.map((type, index) => enqueueRunLayer(run, type, async () => {
    if (index === 0) {
      started.resolve();
      await release.promise;
    }
  }));
  await started.promise;

  assert.deepEqual(workerSnapshot(run.runId).backpressure?.pending, 7);
  release.resolve();
  await Promise.all(tasks);
  const drained = await drainAllRunWorkers();
  assert.equal(drained.find((entry) => entry.runId === run.runId).pending, 0);
  assert.equal(workerSnapshot(run.runId).backpressure, null);
});
