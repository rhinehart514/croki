#!/usr/bin/env node

import assert from "node:assert/strict";
import { test } from "node:test";

import { getVentureDoc } from "../../brain/src/firm/venture-store.mjs";
import { createWallVentureFixture } from "../fixtures/firm-fixtures.mjs";
import {
  assertBasicAccessibility,
  assertNoUnhandledRejections,
  assertPerformanceBudgets,
  bootFixture,
  captureEvidence,
  openFixtureVenture,
  waitForDom,
} from "./fixtures/browser-harness.mjs";

async function selectWallItem(client, pattern) {
  const selected = await client.evaluate(`(() => {
    const pattern = new RegExp(${JSON.stringify(pattern.source)}, ${JSON.stringify(pattern.flags)});
    const button = [...document.querySelectorAll('.firm-wall-queue button')]
      .find((entry) => pattern.test(entry.textContent));
    button?.click();
    return Boolean(button);
  })()`);
  assert.equal(selected, true, `wall queue item ${pattern} was not selectable`);
}

async function activateWallAction(client, label, note = null) {
  if (note != null) {
    const set = await client.evaluate(`(() => {
      const field = document.querySelector('.firm-wall-review-item textarea');
      if (!field) return false;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, ${JSON.stringify(note)});
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    assert.equal(set, true, "wall note field was not available");
  }
  await waitForDom(
    client,
    `[...document.querySelectorAll('.firm-wall-review-actions button')].some((button) => button.textContent.trim() === ${JSON.stringify(label)} && !button.disabled)`,
    `${label} did not become available`,
  );
  const clicked = await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('.firm-wall-review-actions button')]
      .find((entry) => entry.textContent.trim() === ${JSON.stringify(label)});
    button?.click();
    return Boolean(button);
  })()`);
  assert.equal(clicked, true, `${label} could not be activated`);
}

test("the wall: every purpose settles once, leaves a receipt, and recovers clear", async () => {
  const drover = await bootFixture(createWallVentureFixture);
  const chrome = await openFixtureVenture(drover);
  try {
    const { client } = chrome;
    const ventureId = drover.fixture.venture.id;
    await waitForDom(client, `Promise.all([
      fetch('/api/ventures/${ventureId}/wall').then((response) => response.json()),
      Promise.resolve(document.querySelector('[data-atlas-wall] .firm-lens-wall-band')?.textContent || ''),
    ]).then(([wall, text]) => wall.queue.length === 4 && /4 decisions need you/i.test(text))`, "four-purpose wall fixture did not render four durable, founder-visible decisions");
    await assertPerformanceBudgets(client);
    await client.evaluate(`document.querySelector('.firm-lens-wall-band')?.click()`);
    await waitForDom(client, `!!document.querySelector('[aria-label="Founder decisions"]')`, "decision workbench did not open");

    const matrix = await client.evaluate(`(async () => {
      const result = {};
      for (const item of document.querySelectorAll('.firm-wall-queue button')) {
        item.click();
        await new Promise(requestAnimationFrame);
        const key = item.textContent.trim();
        result[key] = [...document.querySelectorAll('.firm-wall-review-actions button')]
          .map((button) => button.textContent.trim());
      }
      return result;
    })()`);
    const actions = Object.values(matrix).flat();
    for (const expected of ["Release", "Reject", "Answer", "Dismiss", "Acknowledge", "End this work", "Keep it going"]) {
      assert.ok(actions.includes(expected), `wall action matrix omitted ${expected}`);
    }

    await client.send("Network.enable");
    let rejectRequests = 0;
    client.on("Network.requestWillBeSent", ({ request }) => {
      if (request.method === "POST" && /\/wall\/wall-purpose-release\/decide$/.test(request.url)) rejectRequests += 1;
    });
    await selectWallItem(client, /Private preview/i);
    const activatedTwice = await client.evaluate(`(() => {
      const button = [...document.querySelectorAll('.firm-wall-review-actions button')]
        .find((entry) => entry.textContent.trim() === 'Reject');
      if (!button) return false;
      button?.click();
      button?.click();
      return true;
    })()`);
    assert.equal(activatedTwice, true, "the wall reject action was not available");
    await waitForDom(client, `/3 decisions need you/i.test(document.body.textContent)`, "rejected release did not settle");
    assert.equal(rejectRequests, 1, "double activation emitted more than one wall decision request");

    await selectWallItem(client, /Needs your input|A teammate needs your answer/i);
    await activateWallAction(client, "Answer", "Use the weekly handoff constraint; do not name a customer.");
    await waitForDom(client, `/2 decisions need you/i.test(document.body.textContent)`, "founder answer did not settle");

    await selectWallItem(client, /From the market|A reply came back/i);
    await activateWallAction(client, "Acknowledge");
    await waitForDom(client, `/1 decision needs you/i.test(document.body.textContent)`, "returned evidence review did not settle");

    await selectWallItem(client, /Ending decision|Should this work end/i);
    await activateWallAction(client, "Keep it going");
    await waitForDom(client, `/Nothing needs you yet/i.test(document.querySelector('.firm-lens-wall-band')?.textContent || '')`, "the founder decision boundary did not return to its safe clear state");
    assert.equal(await client.evaluate(`!!document.querySelector('[aria-label="Founder decisions"]')`), false);
    const clearState = await client.evaluate(`(() => ({
      band: document.querySelector('.firm-lens-wall-band')?.textContent,
      composerVisible: Boolean(document.querySelector('.firm-app-composer textarea')),
      atlasVisible: Boolean(document.querySelector('[data-venture-atlas]')),
      machineryVisible: Boolean(document.querySelector('[data-atlas-machinery]')),
    }))()`);
    assert.match(clearState.band ?? "", /Outward work still stops here/i);
    assert.equal(clearState.composerVisible, true);
    assert.equal(clearState.atlasVisible, true);
    assert.equal(clearState.machineryVisible, false, "settling the wall must not expose execution machinery by default");

    const receipts = Object.fromEntries(drover.fixture.wall.map((item) => [
      item.id,
      getVentureDoc(ventureId, "decisions", item.id, { root: drover.home }),
    ]));
    assert.equal(receipts["wall-purpose-release"].decision, "reject");
    assert.equal(receipts["wall-purpose-answer"].decision, "answer");
    assert.equal(receipts["wall-purpose-answer"].note, "Use the weekly handoff constraint; do not name a customer.");
    assert.equal(receipts["wall-purpose-review-outcome"].decision, "acknowledge");
    assert.equal(receipts["wall-purpose-end-bet"].decision, "keep");
    assert.ok(Object.values(receipts).every((receipt) => receipt.decidedAt && receipt.decidedBy), "every wall decision needs a durable receipt");

    await client.send("Page.reload", { ignoreCache: true });
    await waitForDom(client, `/Continue a venture/i.test(document.body.textContent)`, "venture picker did not return after receipt reload");
    assert.equal(await client.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((entry) => /Wall venture/.test(entry.textContent));
      button?.click();
      return Boolean(button);
    })()`), true);
    await waitForDom(client, `/Nothing needs you yet/i.test(document.querySelector('.firm-lens-wall-band')?.textContent || '')`, "clear decision boundary did not survive a full reload");
    assert.equal(await client.evaluate(`fetch('/api/ventures/${ventureId}/wall').then((response) => response.json()).then((body) => body.queue.length)`), 0);
    await assertBasicAccessibility(client);
    await captureEvidence(client, "wall-clear-after-four-receipts");
    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
