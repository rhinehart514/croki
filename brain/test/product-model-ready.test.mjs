import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  registerProductModelDerive,
  awaitProductModelReady,
  _resetProductModelReady,
} from "../src/product-model-ready.mjs";

// A deferred promise so the test controls exactly when a "derive" settles.
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("product-model-ready — closes the grounding ordering window without blocking forever", () => {
  beforeEach(() => _resetProductModelReady());

  it("resolves immediately when no derive is in flight", async () => {
    const status = await awaitProductModelReady("no-such-project", { timeoutMs: 50 });
    assert.deepEqual(status, { waited: false, timedOut: false }, "nothing in flight → no wait");
  });

  it("a run awaits the in-flight derive and proceeds once it lands (the window is closed)", async () => {
    const d = deferred();
    registerProductModelDerive("p1", d.promise);
    let awaited = false;
    const waiter = awaitProductModelReady("p1", { timeoutMs: 2000 }).then((s) => { awaited = true; return s; });
    // The run has NOT proceeded yet — the derive is still mid-flight.
    await Promise.resolve();
    assert.equal(awaited, false, "the run waits while the rich model is still deriving");
    // The derive lands; the awaiting run now proceeds, having waited for the real model.
    d.resolve({ id: "model-1" });
    const status = await waiter;
    assert.deepEqual(status, { waited: true, timedOut: false }, "waited for the derive, did not time out");
  });

  it("degrades gracefully — the run proceeds when the derive exceeds the budget, never blocking forever", async () => {
    const d = deferred(); // never resolved in this test → simulates a slow/hung derive
    registerProductModelDerive("p2", d.promise);
    const start = Date.now();
    const status = await awaitProductModelReady("p2", { timeoutMs: 30 });
    assert.ok(Date.now() - start < 1000, "the run did not block forever on a slow derive");
    assert.deepEqual(status, { waited: true, timedOut: true }, "the bounded budget elapsed → the run proceeds anyway");
    d.resolve(); // clean up the dangling promise
  });

  it("a FAILED derive still releases the awaiting run (a failed derive degrades to cheap scan facts)", async () => {
    const d = deferred();
    registerProductModelDerive("p3", d.promise);
    const waiter = awaitProductModelReady("p3", { timeoutMs: 2000 });
    d.reject(new Error("derive blew up"));
    const status = await waiter;
    assert.deepEqual(status, { waited: true, timedOut: false }, "a rejected derive still resolves the await, never throws");
  });

  it("clears the registry once a derive settles, so a later run does not await a long-finished derive", async () => {
    const d = deferred();
    registerProductModelDerive("p4", d.promise);
    d.resolve({ id: "model-4" });
    await d.promise;
    // Let the settle-clear microtask run.
    await new Promise((r) => setTimeout(r, 0));
    const status = await awaitProductModelReady("p4", { timeoutMs: 50 });
    assert.deepEqual(status, { waited: false, timedOut: false }, "the settled derive was cleared → the next run does not wait");
  });

  it("registering a non-promise is a harmless no-op", async () => {
    assert.doesNotThrow(() => registerProductModelDerive("p5", null));
    assert.doesNotThrow(() => registerProductModelDerive("p5", 42));
    const status = await awaitProductModelReady("p5", { timeoutMs: 20 });
    assert.deepEqual(status, { waited: false, timedOut: false });
  });
});
