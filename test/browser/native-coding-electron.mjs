#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import { discardCodingWorkspace } from "../../brain/src/firm/code-workspace.mjs";
import { freePort, ROOT, waitForDom } from "./fixtures/browser-harness.mjs";
import { seedNativeCoding } from "./fixtures/native-coding-fixture.mjs";
import { launchDroverElectron } from "./lib/electron-app.mjs";

function clickButton(label) {
  return `(() => {
    const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent.trim() === ${JSON.stringify(label)});
    button?.click(); return Boolean(button && !button.disabled);
  })()`;
}

function listeningTcpPorts(pid) {
  const output = execFileSync("/usr/sbin/lsof", ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN", "-Fn"], { encoding: "utf8" });
  return [...output.matchAll(/:(\d+)$/gm)].map((match) => Number(match[1]));
}

test("native coding: the real Electron host restores work and holds founder authority", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "drover-native-electron-"));
  const previousPersistence = process.env.GTM_IDE_PERSISTENCE;
  process.env.GTM_IDE_PERSISTENCE = "json";
  let fixture;
  let app = null;
  try {
    fixture = await seedNativeCoding({ root: home });
    const firstDebugPort = await freePort();
    app = await launchDroverElectron({ root: ROOT, home, port: firstDebugPort });
    assert.equal(fs.existsSync(path.join(home, ".runtime", "brain.json")), false, "Electron published a web-server runtime record");
    assert.equal(await app.client.evaluate(`location.protocol`), "file:", "Electron did not load the renderer as a local application asset");
    assert.equal(await app.client.evaluate(`document.visibilityState`), "visible", "Electron loaded the renderer without making its BrowserWindow visible");
    await waitForDom(app.client, `!!document.querySelector('.workspace-shell')`, "the visible Electron window did not render its workspace");
    assert.equal(await app.client.evaluate(`document.querySelector('.workspace-shell')?.dataset.desktopPlatform`), "darwin", "the renderer did not receive the native window platform");
    assert.equal(await app.client.evaluate(`(() => { const rect = document.querySelector('.thread-venture-switcher')?.getBoundingClientRect(); return Boolean(rect && (rect.top >= 42 || rect.left >= 78)); })()`), true, "the venture switcher still collided with the macOS traffic lights");
    assert.deepEqual([...new Set(listeningTcpPorts(app.child.pid))], [firstDebugPort], "Electron opened a TCP listener beyond the test-only DevTools port");
    const firstHealth = await app.client.evaluate(`window.droverDesktop.api.request({ path: "/api/health", method: "GET", headers: {}, body: "" }).then((response) => JSON.parse(response.body))`);
    assert.equal(firstHealth.ok, true, "the in-process desktop Brain did not answer through IPC");
    await waitForDom(app.client, `typeof window.droverDesktop?.selectRepository === 'function'`, "the actual Electron preload did not mount");
    await waitForDom(app.client, `document.querySelectorAll('.thread-material[data-kind="native-code"]').length === 2`, "Electron did not restore both coding attempts");
    assert.equal(await app.client.evaluate(`/Croki restarted before the provider turn settled/.test(document.body.textContent)`), true, "the Electron restart hid interrupted provider work");

    await waitForDom(app.client, `!!document.querySelector('.work-workbench .code-workspace')`, "Electron did not mount exact code beside conversation");
    await waitForDom(app.client, `!!document.querySelector('button[aria-label="Rename thread"]')`, "the native thread title never became editable");
    assert.equal(await app.client.evaluate(`(() => { const button = document.querySelector('button[aria-label="Rename thread"]'); button?.click(); return Boolean(button); })()`), true, "the native thread title did not enter its rename state");
    await waitForDom(app.client, `!!document.querySelector('input[aria-label="Thread name"]')`, "the native thread name editor did not render");
    const renamed = await app.client.evaluate(`(() => {
      const input = document.querySelector('input[aria-label="Thread name"]');
      if (!input) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Native coding review');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.form?.requestSubmit();
      return true;
    })()`);
    assert.equal(renamed, true, "the native thread title editor could not submit");
    await waitForDom(app.client, `document.querySelector('.thread-header h1')?.textContent === 'Native coding review'`, "the renamed thread title did not persist through the desktop host");
    await app.client.evaluate(`(() => { const select = document.querySelector('.work-workbench-tools select'); const option = [...(select?.options || [])].find((entry) => entry.textContent.includes('reviewable')); if (!select || !option) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, option.value); select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await waitForDom(app.client, `/native-coding-browser-proof.txt/.test(document.querySelector('.work-workbench')?.textContent || '')`, "Electron did not select the reviewable attempt");
    assert.equal(await app.client.evaluate(clickButton("Approve checkpoint")), true, "the trusted Electron host could not exercise founder review authority");
    await waitForDom(app.client, `/Checkpoint approved/.test(document.querySelector('.work-workbench')?.textContent || '')`, "Electron did not persist founder review");

    await app.close();
    assert.equal(fs.existsSync(path.join(home, ".runtime", "brain.json")), false, "Electron wrote a Brain web-server location");
    app = await launchDroverElectron({ root: ROOT, home, port: await freePort() });
    const secondHealth = await app.client.evaluate(`window.droverDesktop.api.request({ path: "/api/health", method: "GET", headers: {}, body: "" }).then((response) => JSON.parse(response.body))`);
    assert.notEqual(secondHealth.instanceId, firstHealth.instanceId, "a relaunch reused the stopped Brain identity");
    await waitForDom(app.client, `document.querySelectorAll('.thread-material[data-kind="native-code"]').length === 2`, "a full Electron relaunch lost coding state");
    assert.equal(await app.client.evaluate(`/native coding browser proof/i.test(document.body.textContent)`), true, "the durable implementation did not return after Electron relaunch");
  } finally {
    await app?.close().catch(() => {});
    if (fixture) {
      for (const id of [fixture.interrupted.id, fixture.completed.id]) {
        try { discardCodingWorkspace(fixture.venture.id, id, { root: home }); } catch { /* preserve the primary receipt failure */ }
      }
    }
    if (previousPersistence === undefined) delete process.env.GTM_IDE_PERSISTENCE;
    else process.env.GTM_IDE_PERSISTENCE = previousPersistence;
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 });
  }
});
