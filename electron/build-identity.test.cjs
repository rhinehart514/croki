"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { buildIdentity } = require("./build-identity.cjs");

test("development identity distinguishes an exact modified source tree", () => {
  const calls = [];
  const identity = buildIdentity({
    version: "0.3.4",
    execFile(_command, args) {
      calls.push(args);
      return args[0] === "rev-parse" ? "76ecbeaa\n" : " M package.json\n";
    },
  });
  assert.deepEqual(identity, {
    channel: "development",
    version: "0.3.4",
    revision: "76ecbeaa",
    modified: true,
    label: "Development Build · 0.3.4 · 76ecbeaa · modified",
  });
  assert.equal(calls.length, 2);
});

test("production identity never inspects source metadata", () => {
  const identity = buildIdentity({
    version: "0.3.4",
    packaged: true,
    execFile() { throw new Error("production must not inspect Git"); },
  });
  assert.deepEqual(identity, {
    channel: "production",
    version: "0.3.4",
    revision: null,
    modified: false,
    label: "Croki 0.3.4",
  });
});

test("a source archive still identifies itself as development", () => {
  const identity = buildIdentity({
    version: "0.3.4",
    execFile() { throw new Error("Git metadata unavailable"); },
  });
  assert.equal(identity.label, "Development Build · 0.3.4");
  assert.equal(identity.channel, "development");
});
