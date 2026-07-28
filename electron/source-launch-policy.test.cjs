"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assertSourceLaunchAvailable,
  packagedCrokiProcesses,
} = require("./source-launch-policy.cjs");

const PROCESS_LIST = `
42102 /Applications/Croki.app/Contents/MacOS/Croki
42103 /Applications/Croki.app/Contents/Frameworks/Croki Helper.app/Contents/MacOS/Croki Helper --type=gpu-process
47340 ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .
`;

test("source launch detects only the packaged Croki process", () => {
  assert.deepEqual(packagedCrokiProcesses({
    platform: "darwin",
    listProcesses: () => PROCESS_LIST,
  }), [{
    pid: 42102,
    command: "/Applications/Croki.app/Contents/MacOS/Croki",
  }]);
});

test("source launch fails explicitly instead of foregrounding stale production", () => {
  assert.throws(() => assertSourceLaunchAvailable({
    platform: "darwin",
    listProcesses: () => PROCESS_LIST,
  }), (error) => {
    assert.equal(error.code, "CROKI_PACKAGED_RUNNING");
    assert.deepEqual(error.pids, [42102]);
    assert.match(error.message, /Nothing was deleted or replaced/);
    return true;
  });
});

test("source launch remains available outside the packaged collision", () => {
  assert.doesNotThrow(() => assertSourceLaunchAvailable({
    platform: "darwin",
    listProcesses: () => "47340 ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .",
  }));
  assert.deepEqual(packagedCrokiProcesses({
    platform: "linux",
    listProcesses: () => PROCESS_LIST,
  }), []);
});
