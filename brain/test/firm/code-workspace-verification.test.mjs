import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
// This suite injects the process handle (spawnProcess) rather than spawning real processes. The timeout
// path additionally depends on the two production timers firing, and those timers are unref'd on purpose
// (a pending host check must never keep the Brain process alive). A real unref'd timer is free never to
// fire once the awaiting test leaves nothing else on the loop, which hangs the test nondeterministically.
// So the test owns the clock: it fakes setTimeout and advances it deterministically instead of waiting.

import { hostProjectCheck } from "../../src/firm/code-workspace-verification.mjs";

function project() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "drover-project-check-"));
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  return directory;
}

function childProcess() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.signals = [];
  child.kill = (signal) => {
    child.signals.push(signal);
    if (signal === "SIGKILL") queueMicrotask(() => child.emit("close", null, signal));
    return true;
  };
  return child;
}

describe("coding workspace project verification", () => {
  it("runs without blocking the caller and records a bounded successful receipt", async () => {
    const directory = project();
    const child = childProcess();
    const check = hostProjectCheck(directory, { spawnProcess: () => child });
    let callerProgressed = false;
    queueMicrotask(() => { callerProgressed = true; });
    child.stdout.write("x".repeat(20_000));
    setImmediate(() => child.emit("close", 0, null));

    const receipt = await check;
    assert.equal(callerProgressed, true);
    assert.equal(receipt.status, "passed");
    assert.ok(receipt.output.length <= 16_000);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("terminates and then force-kills a timed-out project check", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const directory = project();
    const child = childProcess();
    const pending = hostProjectCheck(directory, {
      spawnProcess: () => child,
      timeoutMs: 5,
      forceKillDelayMs: 5,
    });

    // Reaching the timeout sends SIGTERM and arms the force-kill delay; reaching that delay sends SIGKILL,
    // which the fake child answers with a close. Advancing the fake clock drives both, deterministically.
    t.mock.timers.tick(5);
    t.mock.timers.tick(5);
    const receipt = await pending;

    assert.equal(receipt.status, "failed");
    assert.deepEqual(child.signals, ["SIGTERM", "SIGKILL"]);
    assert.match(receipt.output, /timed out/i);
    fs.rmSync(directory, { recursive: true, force: true });
  });
});
