#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { test } from "node:test";

import { freePort, ROOT, waitForDom } from "./fixtures/browser-harness.mjs";
import { launchPackagedDroverElectron } from "./lib/electron-app.mjs";

test("the packaged Drover app boots its Brain and trusted founder bridge", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "drover-package-acceptance-"));
  const output = path.join(temp, "release");
  const builder = path.join(ROOT, "node_modules", ".bin", "electron-builder");
  const built = spawnSync(builder, ["--mac", "dir", "--arm64", `--config.directories.output=${output}`], {
    cwd: ROOT, encoding: "utf8", timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(built.status, 0, `The packaged app could not be built.\n${built.stdout}\n${built.stderr}`);

  const executable = path.join(output, "mac-arm64", "Drover.app", "Contents", "MacOS", "Drover");
  const appBundle = path.resolve(path.dirname(executable), "../..");
  const infoPlist = path.join(appBundle, "Contents", "Info.plist");
  const iconName = execFileSync("/usr/bin/plutil", ["-extract", "CFBundleIconFile", "raw", infoPlist], { encoding: "utf8" }).trim();
  assert.equal(iconName, "icon.icns", "the packaged app did not declare Drover's application icon");
  assert.ok(fs.statSync(path.join(appBundle, "Contents", "Resources", iconName)).size > 100_000, "the packaged Drover icon was missing or incomplete");
  const home = path.join(temp, "home");
  fs.mkdirSync(home, { recursive: true });
  let app = null;
  try {
    app = await launchPackagedDroverElectron({ executable, home, port: await freePort() });
    await waitForDom(app.client, `document.title === "Drover"`, "the package did not open the Drover renderer");
    await waitForDom(app.client, `typeof window.droverDesktop?.selectRepository === "function"`, "the package did not expose the trusted desktop bridge");
    const runtime = JSON.parse(fs.readFileSync(path.join(home, ".runtime", "brain.json"), "utf8"));
    const health = await fetch(`http://127.0.0.1:${runtime.port}/api/health`).then((response) => response.json());
    assert.equal(health.instanceId, runtime.instanceId, "the packaged renderer and Brain did not share one instance");
  } finally {
    await app?.close().catch(() => {});
    assert.equal(fs.existsSync(path.join(home, ".runtime", "brain.json")), false, "the package left a stale Brain location");
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 });
  }
});
