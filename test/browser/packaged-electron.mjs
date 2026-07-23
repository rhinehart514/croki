#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { test } from "node:test";

import { freePort, ROOT, waitForDom } from "./fixtures/browser-harness.mjs";
import { launchPackagedDroverElectron } from "./lib/electron-app.mjs";

function listeningTcpPorts(pid) {
  const output = execFileSync("/usr/sbin/lsof", ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN", "-Fn"], { encoding: "utf8" });
  return [...output.matchAll(/:(\d+)$/gm)].map((match) => Number(match[1]));
}

test("the packaged Croki app boots its Brain and trusted founder bridge", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "drover-package-acceptance-"));
  const output = path.join(temp, "release");
  const builder = path.join(ROOT, "node_modules", ".bin", "electron-builder");
  const built = spawnSync(builder, ["--mac", "dir", "--arm64", `--config.directories.output=${output}`], {
    cwd: ROOT, encoding: "utf8", timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(built.status, 0, `The packaged app could not be built.\n${built.stdout}\n${built.stderr}`);

  const executable = path.join(output, "mac-arm64", "Croki.app", "Contents", "MacOS", "Croki");
  const appBundle = path.resolve(path.dirname(executable), "../..");
  const infoPlist = path.join(appBundle, "Contents", "Info.plist");
  const iconName = execFileSync("/usr/bin/plutil", ["-extract", "CFBundleIconFile", "raw", infoPlist], { encoding: "utf8" }).trim();
  assert.equal(iconName, "icon.icns", "the packaged app did not declare Croki's application icon");
  assert.ok(fs.statSync(path.join(appBundle, "Contents", "Resources", iconName)).size > 100_000, "the packaged Croki icon was missing or incomplete");
  const home = path.join(temp, "home");
  fs.mkdirSync(home, { recursive: true });
  let app = null;
  try {
    const debugPort = await freePort();
    app = await launchPackagedDroverElectron({ executable, home, port: debugPort });
    await waitForDom(app.client, `document.title === "Croki"`, "the package did not open the Croki renderer");
    await waitForDom(app.client, `typeof window.droverDesktop?.selectRepository === "function"`, "the package did not expose the trusted desktop bridge");
    assert.equal(await app.client.evaluate(`location.protocol`), "file:", "the package did not load a local renderer asset");
    assert.equal(await app.client.evaluate(`document.visibilityState`), "visible", "the package did not make its BrowserWindow visible");
    assert.deepEqual([...new Set(listeningTcpPorts(app.child.pid))], [debugPort], "the package opened a TCP listener beyond the test-only DevTools port");
    const health = await app.client.evaluate(`window.droverDesktop.api.request({ path: "/api/health", method: "GET", headers: {}, body: "" }).then((response) => JSON.parse(response.body))`);
    assert.equal(health.ok, true, "the packaged renderer could not reach its in-process Brain");
    assert.equal(fs.existsSync(path.join(home, ".runtime", "brain.json")), false, "the package published a web-server runtime record");
  } finally {
    await app?.close().catch(() => {});
    assert.equal(fs.existsSync(path.join(home, ".runtime", "brain.json")), false, "the package wrote a Brain web-server location");
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 });
  }
});
