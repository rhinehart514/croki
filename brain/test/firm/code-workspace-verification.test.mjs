import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";

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

  it("terminates and then force-kills a timed-out project check", async () => {
    const directory = project();
    const child = childProcess();
    const receipt = await hostProjectCheck(directory, {
      spawnProcess: () => child,
      timeoutMs: 5,
      forceKillDelayMs: 5,
    });

    assert.equal(receipt.status, "failed");
    assert.deepEqual(child.signals, ["SIGTERM", "SIGKILL"]);
    assert.match(receipt.output, /timed out/i);
    fs.rmSync(directory, { recursive: true, force: true });
  });
});
