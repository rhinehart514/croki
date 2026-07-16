import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-server-shutdown-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { server, shutdownServer } = await import("../src/server.mjs");
const brainRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("shutdown closes the HTTP listener once and is safe to call repeatedly", async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  assert.equal(server.listening, true);

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
  const health = await response.json();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-drover-server-instance"), health.instanceId);
  assert.ok(Number.isFinite(Date.parse(response.headers.get("x-drover-responded-at"))));
  assert.ok(Number.isFinite(Date.parse(health.now)));

  const first = shutdownServer();
  const second = shutdownServer();
  assert.strictEqual(second, first);
  await first;

  assert.equal(server.listening, false);
});

test("the executable exits cleanly after SIGTERM", async () => {
  const childHome = fs.mkdtempSync(path.join(root, "child-"));
  const child = spawn(process.execPath, ["src/server.mjs"], {
    cwd: brainRoot,
    env: {
      ...process.env,
      GTM_IDE_HOME: childHome,
      GTM_IDE_PERSISTENCE: "json",
      PORT: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`server did not start:\n${output}`)), 5_000);
    child.stdout.on("data", () => {
      if (!output.includes("Drover running at")) return;
      clearTimeout(timeout);
      resolve();
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => reject(new Error(
      `server exited before signal (code ${code}, signal ${signal}):\n${output}`,
    )));
  });

  child.kill("SIGTERM");
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`server stayed alive after SIGTERM:\n${output}`));
    }, 5_000);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });

  assert.deepEqual(result, { code: 0, signal: null }, output);
});
