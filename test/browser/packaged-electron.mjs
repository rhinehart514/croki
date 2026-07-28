#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { test } from "node:test";

import { discardCodingWorkspace } from "../../brain/src/firm/code-workspace.mjs";
import { freePort, ROOT, waitForDom } from "./fixtures/browser-harness.mjs";
import { seedNativeCoding } from "./fixtures/native-coding-fixture.mjs";
import { launchPackagedDroverElectron } from "./lib/electron-app.mjs";

function listeningTcpPorts(pid) {
  const output = execFileSync("/usr/sbin/lsof", ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN", "-Fn"], { encoding: "utf8" });
  return [...output.matchAll(/:(\d+)$/gm)].map((match) => Number(match[1]));
}

function processTreeResources(rootPid) {
  const rows = execFileSync("/bin/ps", ["-axo", "pid=,ppid=,rss=,command="], { encoding: "utf8" })
    .split("\n")
    .flatMap((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
      return match ? [{ pid: Number(match[1]), parentPid: Number(match[2]), rssKiB: Number(match[3]), command: match[4] }] : [];
    });
  const selected = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (selected.has(row.parentPid) && !selected.has(row.pid)) {
        selected.add(row.pid);
        changed = true;
      }
    }
  }
  const processes = rows.filter((row) => selected.has(row.pid));
  return {
    processCount: processes.length,
    rssMiB: Math.round(processes.reduce((sum, row) => sum + row.rssKiB, 0) / 1024),
    commands: processes.map((row) => path.basename(row.command.split(/\s+/)[0])).sort(),
  };
}

async function settledProcessTreeResources(rootPid) {
  const deadline = Date.now() + 10_000;
  let previous = null;
  let stableSamples = 0;
  while (Date.now() < deadline) {
    const current = processTreeResources(rootPid);
    const providerProbeActive = current.commands.some((command) => /claude|codex/i.test(command));
    const stable = previous
      && current.processCount === previous.processCount
      && Math.abs(current.rssMiB - previous.rssMiB) <= 32;
    stableSamples = !providerProbeActive && stable ? stableSamples + 1 : 0;
    if (stableSamples >= 3) return current;
    previous = current;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`The packaged process tree did not reach idle: ${JSON.stringify(previous)}`);
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
  const appResources = path.join(appBundle, "Contents", "Resources", "app");
  const claudeExecutable = path.join(appResources, "node_modules", "@anthropic-ai", "claude-agent-sdk-darwin-arm64", "claude");
  const ptyNative = path.join(appResources, "node_modules", "node-pty", "prebuilds", "darwin-arm64", "pty.node");
  const ptyHelper = path.join(appResources, "node_modules", "node-pty", "prebuilds", "darwin-arm64", "spawn-helper");
  for (const target of [claudeExecutable, ptyNative, ptyHelper]) assert.ok(fs.existsSync(target), `The arm64 package omitted ${path.relative(appResources, target)}.`);
  assert.match(execFileSync("/usr/bin/file", [claudeExecutable], { encoding: "utf8" }), /Mach-O 64-bit executable arm64/);
  assert.match(execFileSync("/usr/bin/file", [ptyNative], { encoding: "utf8" }), /Mach-O 64-bit bundle arm64/);
  assert.match(execFileSync("/usr/bin/file", [ptyHelper], { encoding: "utf8" }), /Mach-O 64-bit executable arm64/);
  assert.ok((fs.statSync(claudeExecutable).mode & 0o111) !== 0, "The bundled Claude executable lost its executable bit.");
  assert.ok((fs.statSync(ptyHelper).mode & 0o111) !== 0, "The bundled node-pty helper lost its executable bit.");
  const home = path.join(temp, "home");
  fs.mkdirSync(home, { recursive: true });
  const previousPersistence = process.env.GTM_IDE_PERSISTENCE;
  const previousUpdateCheck = process.env.GTM_IDE_DISABLE_RELEASE_CHECK;
  process.env.GTM_IDE_PERSISTENCE = "json";
  process.env.GTM_IDE_DISABLE_RELEASE_CHECK = "1";
  let fixture;
  let app = null;
  try {
    fixture = await seedNativeCoding({ root: home });
    const debugPort = await freePort();
    app = await launchPackagedDroverElectron({ executable, home, port: debugPort });
    await waitForDom(app.client, `document.title === "Croki"`, "the package did not open the Croki renderer");
    await waitForDom(app.client, `typeof window.droverDesktop?.selectRepository === "function"`, "the package did not expose the trusted desktop bridge");
    assert.equal(await app.client.evaluate(`location.protocol`), "file:", "the package did not load a local renderer asset");
    assert.equal(await app.client.evaluate(`document.visibilityState`), "visible", "the package did not make its BrowserWindow visible");
    assert.deepEqual([...new Set(listeningTcpPorts(app.child.pid))], [debugPort], "the package opened a TCP listener beyond the test-only DevTools port");
    const health = await app.client.evaluate(`window.droverDesktop.api.request({ path: "/api/health", method: "GET", headers: {}, body: "" }).then((response) => JSON.parse(response.body))`);
    assert.equal(health.ok, true, "the packaged renderer could not reach its supervised Brain");
    assert.deepEqual(await app.client.evaluate(`window.droverDesktop.update.status()`), {
      mode: "manual-download",
      channel: "production",
      currentVersion: "0.3.4",
      canCheck: true,
      automaticCheck: false,
      automaticInstall: false,
      configured: true,
      reason: "Automatic installation is unavailable without a Developer ID; Croki opens the verified release download instead.",
      lastCheckedAt: null,
      requiresDeveloperIdForAutomaticInstall: true,
      requiresHttpsFeed: true,
      installBoundary: "durable-quiescence-or-explicit-founder-drain",
    });
    await waitForDom(app.client, `document.querySelectorAll('.thread-material[data-kind="native-code"]').length === 2`, "the package did not restore the exact coding attempts");
    await waitForDom(app.client, `!!document.querySelector('.work-workbench .code-workspace')`, "the package did not restore exact Review beside the Thread");
    const firstResources = await settledProcessTreeResources(app.child.pid);
    assert.ok(firstResources.processCount <= 20, `The idle package used ${firstResources.processCount} processes.`);
    assert.ok(firstResources.rssMiB <= 1_500, `The idle package used ${firstResources.rssMiB} MiB RSS.`);
    assert.equal(fs.existsSync(path.join(home, ".runtime", "brain.json")), false, "the package published a web-server runtime record");

    await app.close();
    app = await launchPackagedDroverElectron({ executable, home, port: await freePort() });
    await waitForDom(app.client, `document.querySelectorAll('.thread-material[data-kind="native-code"]').length === 2`, "the package relaunch lost the exact coding attempts", 30_000);
    await waitForDom(app.client, `!!document.querySelector('.work-workbench .code-workspace')`, "the package relaunch lost the exact Review", 30_000);
    const recoveredResources = await settledProcessTreeResources(app.child.pid);
    assert.ok(recoveredResources.processCount <= 20, `The recovered package used ${recoveredResources.processCount} processes.`);
    assert.ok(recoveredResources.rssMiB <= 1_500, `The recovered package used ${recoveredResources.rssMiB} MiB RSS.`);
    console.log(`PACKAGED_RESOURCE_RECEIPT ${JSON.stringify({ idle: firstResources, recovered: recoveredResources })}`);
  } finally {
    await app?.close().catch(() => {});
    assert.equal(fs.existsSync(path.join(home, ".runtime", "brain.json")), false, "the package wrote a Brain web-server location");
    if (fixture) {
      for (const workspace of [fixture.interrupted, fixture.completed]) {
        try { discardCodingWorkspace(fixture.venture.id, workspace.id, { root: home }); } catch { /* preserve the primary receipt */ }
      }
    }
    if (previousPersistence === undefined) delete process.env.GTM_IDE_PERSISTENCE;
    else process.env.GTM_IDE_PERSISTENCE = previousPersistence;
    if (previousUpdateCheck === undefined) delete process.env.GTM_IDE_DISABLE_RELEASE_CHECK;
    else process.env.GTM_IDE_DISABLE_RELEASE_CHECK = previousUpdateCheck;
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 });
  }
});
