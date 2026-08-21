import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, assert, describe, it } from "vite-plus/test";

import { acquireDevProcessLock } from "./dev-process-lock.mjs";

const tempDirectories = [];

function makeLockPath() {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "croki-dev-lock-test-"));
  tempDirectories.push(directory);
  return NodePath.join(directory, "desktop.lock");
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

describe("desktop development process lock", () => {
  it("allows one supervisor and reports it to later launchers", async () => {
    const lockPath = makeLockPath();
    const first = await acquireDevProcessLock({
      lockPath,
      pid: 101,
      token: "first",
      isProcessRunning: (pid) => pid === 101,
    });
    const second = await acquireDevProcessLock({
      lockPath,
      pid: 202,
      token: "second",
      isProcessRunning: (pid) => pid === 101,
    });

    assert.isTrue(first.acquired);
    assert.deepEqual(second, {
      acquired: false,
      owner: { pid: 101, token: "first" },
    });
    first.releaseSync();
    assert.isFalse(NodeFS.existsSync(lockPath));
  });

  it("recovers a lock whose owner is no longer running", async () => {
    const lockPath = makeLockPath();
    NodeFS.writeFileSync(lockPath, '{"pid":101,"token":"stale"}\n');

    const lock = await acquireDevProcessLock({
      lockPath,
      pid: 202,
      token: "replacement",
      isProcessRunning: () => false,
    });

    assert.isTrue(lock.acquired);
    assert.deepEqual(JSON.parse(NodeFS.readFileSync(lockPath, "utf8")), {
      pid: 202,
      token: "replacement",
    });
    lock.releaseSync();
  });

  it("does not release a lock that has moved to another owner", async () => {
    const lockPath = makeLockPath();
    const lock = await acquireDevProcessLock({
      lockPath,
      pid: 101,
      token: "first",
      isProcessRunning: () => false,
    });
    NodeFS.writeFileSync(lockPath, '{"pid":202,"token":"replacement"}\n');

    lock.releaseSync();

    assert.isTrue(NodeFS.existsSync(lockPath));
  });
});
