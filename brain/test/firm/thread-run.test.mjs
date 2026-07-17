import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { ROOT_THREAD_ID, createRootThread, createThread, withThreadMessage } from "../../src/firm/thread.mjs";
import { completeRun, createRun } from "../../src/firm/run.mjs";
import { ensureRootThread, getSemanticModel, recordRun } from "../../src/firm/semantic-model-store.mjs";
import { createVenture, setVentureDoc } from "../../src/firm/venture-store.mjs";

function directory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fixture() {
  const options = { root: directory("drover-thread-run-") };
  const repository = directory("drover-thread-run-repo-");
  const venture = createVenture({ name: "Thread/Run fixture", repository }, { ...options, seedFoundingCrew: false });
  setVentureDoc(venture.id, "bets", "bet-a", { id: "bet-a", ventureId: venture.id, intent: "a" }, options);
  setVentureDoc(venture.id, "bets", "bet-b", { id: "bet-b", ventureId: venture.id, intent: "b" }, options);
  setVentureDoc(venture.id, "conversation", "message-one", { id: "message-one", ventureId: venture.id, role: "founder", body: "Go." }, options);
  return { options, venture };
}

describe("pure thread constructors", () => {
  it("builds a root thread with deterministic identity and no copied message bodies", () => {
    const thread = createRootThread("venture-x", { at: "2026-07-17T00:00:00.000Z" });
    assert.equal(thread.id, ROOT_THREAD_ID);
    assert.deepEqual(thread.subjectRefs, ["venture:venture-x"]);
    assert.deepEqual(thread.messageRefs, []);
  });

  it("refuses a non-conversation message reference", () => {
    assert.throws(() => createThread({ id: "t", name: "T", messageRefs: ["object:x"] }), (error) => error.code === "thread_invalid");
    assert.throws(() => withThreadMessage(createThread({ id: "t", name: "T" }), "object:x"), (error) => error.code === "thread_invalid");
  });

  it("appends a durable message ref without mutating the input", () => {
    const thread = createThread({ id: "t", name: "T" });
    const next = withThreadMessage(thread, "conversation:message-one");
    assert.deepEqual(thread.messageRefs, []);
    assert.deepEqual(next.messageRefs, ["conversation:message-one"]);
  });
});

describe("pure run constructors", () => {
  it("builds a betless run", () => {
    const run = createRun({ id: "r", threadRef: "thread:venture-root" });
    assert.deepEqual(run.betRefs, []);
    assert.equal("running" in run, false);
    assert.equal("status" in run, false);
  });

  it("builds a multi-bet run and rejects a missing thread", () => {
    const run = createRun({ id: "r", threadRef: "thread:venture-root", betRefs: ["bet:a", "bet:b"] });
    assert.deepEqual(run.betRefs, ["bet:a", "bet:b"]);
    assert.throws(() => createRun({ id: "r", betRefs: [] }), (error) => error.code === "run_invalid");
  });

  it("rejects self-parenting and non-run parents", () => {
    assert.throws(() => createRun({ id: "r", threadRef: "thread:venture-root", parentRunRef: "run:r" }), (error) => error.code === "run_invalid");
    assert.throws(() => createRun({ id: "r", threadRef: "thread:venture-root", parentRunRef: "object:x" }), (error) => error.code === "run_invalid");
  });

  it("completes a run with durable joins and no running state", () => {
    const run = completeRun(createRun({ id: "r", threadRef: "thread:venture-root" }), { at: "2026-07-17T01:00:00.000Z", outcomeRefs: ["outcome:o1"] });
    assert.equal(run.completedAt, "2026-07-17T01:00:00.000Z");
    assert.deepEqual(run.outcomeRefs, ["outcome:o1"]);
    assert.equal("running" in run, false);
  });
});

describe("thread/run atlas CAS adapter", () => {
  it("forms the root thread lazily, exactly once, and persists a multi-bet run", () => {
    const fx = fixture();
    assert.equal(getSemanticModel(fx.venture.id, fx.options).threads.length, 0, "a read forms nothing");

    const first = ensureRootThread(fx.venture.id, {}, fx.options);
    assert.equal(first.created, true);
    const second = ensureRootThread(fx.venture.id, {}, fx.options);
    assert.equal(second.created, false);
    assert.equal(getSemanticModel(fx.venture.id, fx.options).threads.filter((t) => t.id === ROOT_THREAD_ID).length, 1);

    const { runRef } = recordRun(fx.venture.id, {
      id: "drive-one",
      threadRef: first.threadRef,
      betRefs: ["bet:bet-a", "bet:bet-b"],
      originMessageRef: "conversation:message-one",
    }, {}, fx.options);
    assert.equal(runRef, "run:drive-one");
    const run = getSemanticModel(fx.venture.id, fx.options).runs.find((entry) => entry.id === "drive-one");
    assert.deepEqual(run.betRefs, ["bet:bet-a", "bet:bet-b"]);
    assert.equal(run.threadRef, "thread:venture-root");
  });

  it("fails closed when a run cites a bet that does not exist in the venture", () => {
    const fx = fixture();
    ensureRootThread(fx.venture.id, {}, fx.options);
    assert.throws(
      () => recordRun(fx.venture.id, { id: "ghost", threadRef: `thread:${ROOT_THREAD_ID}`, betRefs: ["bet:missing"] }, {}, fx.options),
      (error) => error.code === "semantic_model_missing_ref",
    );
  });
});
