#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { discardCodingWorkspace } from "../../brain/src/firm/code-workspace.mjs";
import { freePort, ROOT, waitForDom } from "./fixtures/browser-harness.mjs";
import { seedNativeCoding } from "./fixtures/native-coding-fixture.mjs";
import { launchDroverElectron } from "./lib/electron-app.mjs";

function clickButton(label) {
  return `(() => {
    const button = [...document.querySelectorAll('.work-workbench button')].find((entry) => {
      const rect = entry.getBoundingClientRect();
      const style = getComputedStyle(entry);
      return entry.textContent.trim() === ${JSON.stringify(label)}
        && rect.width > 0 && rect.height > 0
        && style.display !== 'none' && style.visibility !== 'hidden';
    });
    button?.click(); return Boolean(button && !button.disabled);
  })()`;
}

async function openFlagshipGate(client) {
  assert.equal(await client.evaluate(`(() => {
    const toggle = document.querySelector('.work-composer-bar button[aria-label="Canvas"]');
    if (!toggle) return false;
    if (toggle.getAttribute('aria-pressed') !== 'true') toggle.click();
    return true;
  })()`), true, "the flagship receipt could not open Canvas beside the Thread");
  await waitForDom(client, `document.querySelector('button[aria-label="Canvas"]')?.getAttribute('aria-pressed') === 'true' && Boolean(document.querySelector('.workspace-canvas .product-gtm-surface'))`, "Canvas did not open inside Electron");
  await waitForDom(
    client,
    `document.querySelector('.product-gtm-surface')?.dataset.projection === 'product-walk'
      && [...document.querySelectorAll('.product-gtm-node strong')].some((entry) => entry.textContent.trim() === 'Croki shell')`,
    "the Product dependency did not appear in the Product walk",
  );
  await waitForDom(
    client,
    `[...document.querySelectorAll('.product-gtm-node strong')].some((entry) => entry.textContent.trim() === 'message')`,
    "the prepared outward action did not join the selected Product page",
  );
  assert.equal(await client.evaluate(`(() => {
    const node = [...document.querySelectorAll('.product-gtm-node')].find((entry) => entry.querySelector('strong')?.textContent.trim() === 'message');
    node?.click();
    return Boolean(node);
  })()`), true, "the prepared outward action was absent from the Product consequence");
  await waitForDom(client, `!!document.querySelector('.product-gtm-outward-review')`, "the exact outward gate did not expand in place");
}

async function actionState(client, ventureId, actionId) {
  return client.evaluate(`window.droverDesktop.api.request({
    path: ${JSON.stringify(`/api/ventures/${ventureId}/market-movement`)},
    method: "GET", headers: {}, body: "",
  }).then((response) => JSON.parse(response.body).marketMovement.actions.find((entry) => entry.id === ${JSON.stringify(actionId)}))`);
}

test("flagship readiness: Electron reaches the exact founder gate without crossing it", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "drover-flagship-readiness-"));
  const previousPersistence = process.env.GTM_IDE_PERSISTENCE;
  process.env.GTM_IDE_PERSISTENCE = "json";
  let fixture;
  let app = null;
  try {
    fixture = await seedNativeCoding({ root: home, flagshipReadiness: true });
    app = await launchDroverElectron({ root: ROOT, home, port: await freePort() });
    await waitForDom(app.client, `document.visibilityState === 'visible' && !!document.querySelector('.workspace-shell')`, "the real Electron window did not become visible");
    assert.equal(fixture.interrupted.id, fixture.completed.id, "the next code turn forked a new workspace instead of continuing the exact Thread workspace");
    assert.equal(fixture.interrupted.runRefs.length, 2, "the same workspace did not retain both exact Run identities");
    try {
      await waitForDom(app.client, `document.querySelectorAll('.thread-material[data-kind="native-code"]').length === 1`, "the code-to-reality Thread did not restore its exact continued workspace");
    } catch (error) {
      const state = await app.client.evaluate(`({
        title: document.querySelector('.thread-header h1')?.textContent?.trim(),
        materials: [...document.querySelectorAll('.thread-material')].map((entry) => ({ kind: entry.getAttribute('data-kind'), text: entry.textContent?.replace(/\\s+/g, ' ').trim() })),
        body: document.body.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 1800),
      })`);
      throw new Error(`${error.message}: ${JSON.stringify(state)}`);
    }
    await waitForDom(app.client, `/Prior local readiness evidence/.test(document.body.textContent)`, "the same Thread did not project its explicitly local prior evidence");
    assert.equal(await app.client.evaluate(`/Implement the next Product correction from the prior local rehearsal evidence/.test(document.body.textContent)`), true, "the evidence-driven next founder turn left the Thread");

    const threadIdentity = await app.client.evaluate(`document.querySelector('.thread-header h1')?.textContent?.trim()`);
    const completedWorkspaceId = await app.client.evaluate(`(() => {
      const select = document.querySelector('.work-workbench-tools select');
      if (!select) return document.querySelector('.work-workbench .code-workspace') ? ${JSON.stringify(fixture.completed.id)} : null;
      const option = [...(select?.options || [])].find((entry) => entry.value === ${JSON.stringify(fixture.completed.id)});
      if (!select || !option) return null;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, option.value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return option.value;
    })()`);
    assert.equal(completedWorkspaceId, fixture.completed.id, "Review did not select the exact isolated implementation");
    await waitForDom(app.client, `/native-coding-browser-proof.txt/.test(document.querySelector('.work-workbench')?.textContent || '')`, "Review did not show the implementation diff");
    assert.match(await app.client.evaluate(`document.querySelector('.work-workbench')?.textContent || ''`), /git diff --check/);
    assert.equal(await app.client.evaluate(`(() => {
      const candidates = [...document.querySelectorAll('.work-workbench .code-workspace-actions button')].filter((entry) => {
        const rect = entry.getBoundingClientRect();
        const style = getComputedStyle(entry);
        return entry.textContent.trim() === 'Approve checkpoint'
          && rect.width > 0 && rect.height > 0
          && style.display !== 'none' && style.visibility !== 'hidden';
      });
      if (candidates.length !== 1 || candidates[0].disabled) return false;
      candidates[0].click();
      return true;
    })()`), true, "the founder could not approve the exact local checkpoint");
    await waitForDom(app.client, `/Checkpoint approved/.test(document.querySelector('.work-workbench')?.textContent || '')`, "checkpoint approval did not persist");
    const approvedWorkspace = await app.client.evaluate(`window.droverDesktop.api.request({
      path: ${JSON.stringify(`/api/ventures/${fixture.venture.id}/coding-workspaces/${fixture.completed.id}`)},
      method: "GET", headers: {}, body: "",
    }).then((response) => JSON.parse(response.body).workspace)`);
    assert.equal(approvedWorkspace?.consequence?.review, "approved", "checkpoint approval did not reach the durable workspace");
    assert.equal(await app.client.evaluate(clickButton("Preview without shipping")), true, "the exact source-control plan could not be previewed");
    await waitForDom(app.client, `/This was a preview\\. Nothing left your machine\\./.test(document.querySelector('.work-workbench')?.textContent || '')`, "the ship preview did not prove its local-only boundary");

    const draft = "Keep this exact founder note at the outward boundary.";
    assert.equal(await app.client.evaluate(`(() => {
      const input = document.querySelector('.thread-composer textarea');
      if (!input) return false;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(draft)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return input.value === ${JSON.stringify(draft)};
    })()`), true, "the Thread could not retain a founder draft before opening the gate");
    await openFlagshipGate(app.client);
    const gate = await app.client.evaluate(`document.querySelector('.product-gtm-outward-review')?.textContent || ''`);
    assert.match(gate, /Founder authority/);
    assert.match(gate, /Nothing crosses into the world until you execute this exact action here/);
    assert.match(gate, /flagship-readiness@example\.invalid/);
    assert.match(gate, /This deterministic draft proves only the founder gate\. It must not be sent\./);
    assert.match(gate, /A reply in this send’s exact Gmail thread/);
    assert.equal(await app.client.evaluate(`(() => {
      const button = [...document.querySelectorAll('.product-gtm-outward-review button')].find((entry) => entry.textContent.trim() === 'Send this email');
      return Boolean(button && !button.disabled);
    })()`), true, "the founder authorization control was not exact and actionable");
    assert.equal(await app.client.evaluate(`document.querySelector('.thread-composer textarea')?.value`), draft, "opening the exact gate lost the founder's Thread draft");

    const beforeLeave = await actionState(app.client, fixture.venture.id, fixture.outwardAction.id);
    assert.equal(beforeLeave.state, "needs-founder");
    assert.equal(beforeLeave.executedAt, null);
    assert.deepEqual(beforeLeave.executionAttempts, []);
    assert.deepEqual(beforeLeave.outcomeRefs, []);
    assert.deepEqual(beforeLeave.observationRefs, []);

    await app.close();
    app = await launchDroverElectron({ root: ROOT, home, port: await freePort() });
    await waitForDom(app.client, `document.querySelector('.thread-header h1')?.textContent?.trim() === ${JSON.stringify(threadIdentity)}`, "Electron did not return to the exact flagship Thread");
    await waitForDom(app.client, `!!document.querySelector('.product-gtm-outward-review')`, "Electron did not return to the exact outward gate");
    assert.equal(await app.client.evaluate(`document.querySelector('.thread-composer textarea')?.value`), draft, "Electron relaunch lost the boundary draft");
    assert.match(await app.client.evaluate(`document.querySelector('.product-gtm-outward-review')?.textContent || ''`), /Founder authority/);
    const afterReturn = await actionState(app.client, fixture.venture.id, fixture.outwardAction.id);
    assert.equal(afterReturn.state, "needs-founder");
    assert.equal(afterReturn.executedAt, null);
    assert.equal(afterReturn.executorReceipt, null);
    assert.deepEqual(afterReturn.executionAttempts, []);
    assert.deepEqual(afterReturn.outcomeRefs, []);
    assert.deepEqual(afterReturn.observationRefs, []);
  } finally {
    await app?.close().catch(() => {});
    if (fixture) {
      for (const id of [...new Set([fixture.interrupted?.id, fixture.completed?.id].filter(Boolean))]) {
        try { discardCodingWorkspace(fixture.venture.id, id, { root: home }); } catch { /* retain the primary failure */ }
      }
    }
    if (previousPersistence === undefined) delete process.env.GTM_IDE_PERSISTENCE;
    else process.env.GTM_IDE_PERSISTENCE = previousPersistence;
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 });
  }
});
