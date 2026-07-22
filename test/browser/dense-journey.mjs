#!/usr/bin/env node

import assert from "node:assert/strict";
import { test } from "node:test";
import { createDenseGeneratedMapsFixture } from "../fixtures/atlas-fixtures.mjs";
import { assertNoUnhandledRejections, bootFixture, openFixtureVenture, waitForCanvasViewportStable, waitForDom } from "./fixtures/browser-harness.mjs";

test("dense Product/GTM remains causal, contained, and reachable under semantic zoom", async () => {
  const drover = await bootFixture(createDenseGeneratedMapsFixture);
  const chrome = await openFixtureVenture(drover, { viewport: { width: 1440, height: 900 } });
  try {
    const { client } = chrome;
    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('.workspace-mode-nav button')].find((entry) => entry.textContent.includes('Product / GTM')); button?.click(); return Boolean(button); })()`), true);
    await waitForDom(client, `document.querySelectorAll('.product-gtm-node').length >= 126`, "the broad Product/GTM portfolio was truncated");
    const normal = await client.evaluate(`(() => {
      const surface = document.querySelector('.product-gtm-surface')?.getBoundingClientRect();
      const flow = document.querySelector('.product-gtm-surface .react-flow')?.getBoundingClientRect();
      return {
        nodes: document.querySelectorAll('.product-gtm-node').length,
        pageOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
        contained: Boolean(surface && flow && flow.left >= surface.left - 1 && flow.right <= surface.right + 1),
        minimap: Boolean(document.querySelector('.product-gtm-surface .react-flow__minimap')),
        controls: Boolean(document.querySelector('.product-gtm-surface .react-flow__controls')),
      };
    })()`);
    assert.ok(normal.nodes >= 126, JSON.stringify(normal));
    assert.ok(normal.pageOverflow <= 1, `dense Product/GTM introduced ${normal.pageOverflow}px page overflow`);
    assert.equal(normal.contained, true, JSON.stringify(normal));
    assert.equal(normal.minimap && normal.controls, true, "dense navigation lost minimap or direct zoom controls");

    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((entry) => entry.getAttribute('aria-label') === 'Open Category creation launch play'); button?.click(); return Boolean(button); })()`), true, "the ambitious GTM play was not directly openable");
    await waitForDom(client, `document.querySelectorAll('.product-gtm-node[data-role="workflow-step"]').length === 12`, "the complete ambitious play did not unfold");
    await waitForCanvasViewportStable(client, "the ambitious play camera did not settle");
    const play = await client.evaluate(`(() => ({
      steps: document.querySelectorAll('.product-gtm-node[data-role="workflow-step"]').length,
      drafted: document.querySelectorAll('.product-gtm-node[data-role="workflow-step"][data-workflow-register="drafted"]').length,
      first: document.querySelector('.product-gtm-node[data-role="workflow-step"] .product-gtm-node-copy small b')?.textContent,
      width: Math.max(...[...document.querySelectorAll('.product-gtm-node[data-role="workflow-step"]')].map((node) => node.getBoundingClientRect().right)) - Math.min(...[...document.querySelectorAll('.product-gtm-node[data-role="workflow-step"]')].map((node) => node.getBoundingClientRect().left)),
      zoom: Number((document.querySelector('.react-flow__viewport')?.style.transform.match(/scale\\(([^)]+)\\)/) || [])[1] || 0),
    }))()`);
    assert.deepEqual({ steps: play.steps, drafted: play.drafted, first: play.first }, { steps: 12, drafted: 12, first: "Step 1 of 12" });
    assert.ok(play.width > 1800, `the ambitious play was compressed instead of rendered at full length: ${JSON.stringify(play)}`);
    assert.ok(play.zoom >= 0.72, `the ambitious play opened below readable scale: ${JSON.stringify(play)}`);

    await client.send("Emulation.setDeviceMetricsOverride", { width: 720, height: 450, deviceScaleFactor: 2, mobile: false });
    await client.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await waitForDom(client, `document.querySelectorAll('.product-gtm-node').length >= 126 && Boolean(document.querySelector('.product-gtm-surface .react-flow'))`, "the complete model did not return after 200% zoom remounted the responsive surface");
    const zoomed = await client.evaluate(`Promise.all([
      fetch('/api/ventures/${drover.fixture.venture.id}/model').then((response) => response.json()),
      fetch('/api/ventures/${drover.fixture.venture.id}/market-movement').then((response) => response.json()),
    ]).then(([model, movement]) => ({
      pageOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
      surface: Boolean(document.querySelector('.product-gtm-surface .react-flow')),
      current: Boolean(document.querySelector('.product-gtm-node[data-kind="truth"]')),
      canvasLabel: document.querySelector('.product-gtm-surface .react-flow')?.getAttribute('aria-label') || '',
      minimap: Boolean(document.querySelector('.product-gtm-surface .react-flow__minimap')),
      objects: model.model.objects.length,
      branches: model.model.modelBranches.filter((branch) => !branch.closedAt).length,
      actions: movement.marketMovement.actions.length,
      modes: document.querySelectorAll('.workspace-mode-nav button').length,
    }))`);
    assert.ok(zoomed.pageOverflow <= 1, `200% zoom introduced ${zoomed.pageOverflow}px horizontal overflow`);
    assert.deepEqual({ surface: zoomed.surface, current: zoomed.current, modes: zoomed.modes }, { surface: true, current: true, modes: 2 });
    assert.match(zoomed.canvasLabel, /Living Product and go-to-market model/);
    assert.equal(zoomed.minimap, true, "semantic zoom lost direct portfolio navigation");
    assert.ok(zoomed.objects >= 126 && zoomed.branches >= 1 && zoomed.actions >= 1, `semantic zoom lost venture breadth: ${JSON.stringify(zoomed)}`);
    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
