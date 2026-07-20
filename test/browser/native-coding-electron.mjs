#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { discardCodingWorkspace } from "../../brain/src/firm/code-workspace.mjs";
import { brainGet } from "../../brain/src/mcp.mjs";
import { freePort, ROOT, waitForDom } from "./fixtures/browser-harness.mjs";
import { seedNativeCoding } from "./fixtures/native-coding-fixture.mjs";
import { launchDroverElectron } from "./lib/electron-app.mjs";

function clickButton(label) {
  return `(() => {
    const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent.trim() === ${JSON.stringify(label)});
    button?.click(); return Boolean(button && !button.disabled);
  })()`;
}

test("native coding: the real Electron host restores work and holds founder authority", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "drover-native-electron-"));
  const previousPersistence = process.env.GTM_IDE_PERSISTENCE;
  process.env.GTM_IDE_PERSISTENCE = "json";
  let fixture;
  let app = null;
  try {
    fixture = await seedNativeCoding({ root: home });
    app = await launchDroverElectron({ root: ROOT, home, port: await freePort() });
    const firstRuntime = JSON.parse(fs.readFileSync(path.join(home, ".runtime", "brain.json"), "utf8"));
    const previousHome = process.env.GTM_IDE_HOME;
    const previousBrainUrl = process.env.DROVER_BRAIN_URL;
    process.env.GTM_IDE_HOME = home;
    delete process.env.DROVER_BRAIN_URL;
    const firstHealth = await brainGet("/api/health").finally(() => {
      if (previousHome === undefined) delete process.env.GTM_IDE_HOME;
      else process.env.GTM_IDE_HOME = previousHome;
      if (previousBrainUrl === undefined) delete process.env.DROVER_BRAIN_URL;
      else process.env.DROVER_BRAIN_URL = previousBrainUrl;
    });
    assert.equal(firstRuntime.instanceId, firstHealth.instanceId, "Electron and MCP did not resolve the same Brain instance");
    await waitForDom(app.client, `typeof window.droverDesktop?.selectRepository === 'function'`, "the actual Electron preload did not mount");
    await waitForDom(app.client, `document.querySelectorAll('.thread-material[data-kind="native-code"]').length === 2`, "Electron did not restore both coding attempts");
    assert.equal(await app.client.evaluate(`/Drover restarted before the provider turn settled/.test(document.body.textContent)`), true, "the Electron restart hid interrupted provider work");

    await waitForDom(app.client, `!!document.querySelector('.work-workbench .code-workspace')`, "Electron did not mount exact code beside conversation");
    await app.client.evaluate(`(() => { const select = document.querySelector('.work-workbench-tools select'); const option = [...(select?.options || [])].find((entry) => entry.textContent.includes('reviewable')); if (!select || !option) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, option.value); select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await waitForDom(app.client, `/native-coding-browser-proof.txt/.test(document.querySelector('.work-workbench')?.textContent || '')`, "Electron did not select the reviewable attempt");
    assert.equal(await app.client.evaluate(clickButton("Approve checkpoint")), true, "the trusted Electron host could not exercise founder review authority");
    await waitForDom(app.client, `/Exact checkpoint approved/.test(document.querySelector('.work-workbench')?.textContent || '')`, "Electron did not persist founder review");

    await app.close();
    assert.equal(fs.existsSync(path.join(home, ".runtime", "brain.json")), false, "Electron left a stale Brain location after shutdown");
    app = await launchDroverElectron({ root: ROOT, home, port: await freePort() });
    const secondRuntime = JSON.parse(fs.readFileSync(path.join(home, ".runtime", "brain.json"), "utf8"));
    assert.notEqual(secondRuntime.instanceId, firstRuntime.instanceId, "a relaunch reused the stopped Brain identity");
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
