import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  brainRuntimeFile,
  clearBrainRuntime,
  publishBrainRuntime,
  readBrainRuntime,
  resolveBrainEndpoint,
} from "../src/brain-runtime-location.mjs";

test("the desktop Brain publishes one private dynamic loopback location for MCP", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-brain-runtime-"));
  try {
    const record = { port: 53721, instanceId: "brain-one", pid: process.pid, startedAt: "2026-07-20T12:00:00.000Z" };
    assert.deepEqual(publishBrainRuntime(record, { root }), record);
    assert.deepEqual(readBrainRuntime({ root }), record);
    assert.deepEqual(resolveBrainEndpoint({ root }), { baseUrl: "http://127.0.0.1:53721", instanceId: "brain-one", source: "desktop" });
    assert.equal(fs.statSync(brainRuntimeFile({ root })).mode & 0o777, 0o600);
    assert.equal(clearBrainRuntime("another-instance", { root }), false);
    assert.ok(fs.existsSync(brainRuntimeFile({ root })));
    assert.equal(clearBrainRuntime("brain-one", { root }), true);
    assert.equal(readBrainRuntime({ root }), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("MCP falls back to the development Brain and rejects non-loopback overrides", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-brain-runtime-"));
  try {
    assert.deepEqual(resolveBrainEndpoint({ root }), { baseUrl: "http://127.0.0.1:4317", instanceId: null, source: "development" });
    assert.deepEqual(resolveBrainEndpoint({ root, url: "http://localhost:8123" }), { baseUrl: "http://localhost:8123", instanceId: null, source: "explicit" });
    assert.throws(() => resolveBrainEndpoint({ root, url: "https://example.com" }), /loopback/i);
    fs.mkdirSync(path.dirname(brainRuntimeFile({ root })), { recursive: true });
    fs.writeFileSync(brainRuntimeFile({ root }), "not json");
    assert.equal(readBrainRuntime({ root }), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
