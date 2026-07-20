#!/usr/bin/env node

// Dense operating-graph acceptance: 120 earned Product/GTM records remain present inside the pannable,
// zoomable read projection without expanding the desktop page or becoming a manual diagram editor.

import assert from "node:assert/strict";
import { test } from "node:test";

import { createDenseGeneratedMapsFixture } from "../fixtures/atlas-fixtures.mjs";
import {
  assertNoUnhandledRejections,
  bootFixture,
  openFixtureVenture,
  summonMap,
  waitForDom,
} from "./fixtures/browser-harness.mjs";
import { setBrowserZoom } from "./fixtures/atlas-browser-harness.mjs";

test("dense generated maps contain 120 earned records without desktop overflow", async () => {
  const drover = await bootFixture(createDenseGeneratedMapsFixture);
  const chrome = await openFixtureVenture(drover, { viewport: { width: 1920, height: 1080 } });
  try {
    const { client } = chrome;
    const ventureId = drover.fixture.venture.id;
    await waitForDom(
      client,
      `fetch('/api/ventures/${ventureId}/work-index').then((response) => response.json()).then(({ workIndex }) => workIndex.outline.objects.length >= ${drover.fixture.expected.denseMapObjects})`,
      "dense canonical map truth did not reach the work index",
    );
    await summonMap(client);

    const system = await client.evaluate(`(() => ({
      productNodes: [...document.querySelectorAll('.venture-graph-node strong')].filter((entry) => /^Product capability \\d+/.test(entry.textContent || '')).length,
      marketNodes: [...document.querySelectorAll('.venture-graph-node strong')].filter((entry) => /^Market test \\d+/.test(entry.textContent || '')).length,
      graph: Boolean(document.querySelector('.venture-system-graph .react-flow')),
      draggable: document.querySelectorAll('.venture-system-graph .react-flow__node.draggable').length,
    }))()`);
    assert.equal(system.productNodes, 60, "whole-system graph did not preserve all 60 dense capabilities");
    assert.equal(system.marketNodes, 60, "whole-system graph did not preserve all 60 dense market records");
    assert.equal(system.graph, true, "dense system truth did not render as a graph");
    assert.equal(system.draggable, 0, "dense system graph became a manual diagram editor");

    const switched = await client.evaluate(`(() => {
      const tab = [...document.querySelectorAll('.product-rail-body nav button')].find((entry) => entry.textContent.trim() === 'Go-to-market');
      tab?.click();
      return Boolean(tab);
    })()`);
    assert.equal(switched, true);
    await waitForDom(client, `document.querySelector('.system-workspace-title h1')?.textContent?.trim() === 'Go-to-market'`, "dense GTM graph did not render");
    const gtmNodes = await client.evaluate(`[...document.querySelectorAll('.venture-graph-node strong')].filter((entry) => /^Market test \\d+/.test(entry.textContent || '')).length`);
    assert.equal(gtmNodes, 60, "GTM graph did not preserve all 60 dense market records");

    for (const percent of [100, 125, 150]) {
      await setBrowserZoom(client, { percent });
      const expectedWidth = Math.round(1920 / (percent / 100));
      const expectedHeight = Math.round(1080 / (percent / 100));
      await waitForDom(client, `innerWidth === ${expectedWidth} && innerHeight === ${expectedHeight}`, `${percent}% browser zoom did not settle`);
      const contained = await client.evaluate(`(() => {
        const map = document.querySelector('.venture-maps')?.getBoundingClientRect();
        const stage = document.querySelector('.system-workspace')?.getBoundingClientRect();
        return {
          pageOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
          mapWithinStage: Boolean(map && stage && map.left >= stage.left - 1 && map.right <= stage.right + 1),
          map: Boolean(document.querySelector('.venture-maps')),
          composer: Boolean(document.querySelector('.thread-composer textarea')),
          chat: Boolean(document.querySelector('.thread-conversation [role="log"]')),
          ask: Boolean(document.querySelector('.workspace-fab button')),
          rail: Boolean(document.querySelector('.thread-rail, .thread-rail-launcher')),
        };
      })()`);
      assert.ok(contained.pageOverflow <= 1, `${percent}% browser zoom introduced ${contained.pageOverflow}px page overflow`);
      assert.equal(contained.mapWithinStage, true, `${percent}% let the map escape Product / GTM`);
      assert.deepEqual({ map: contained.map, composer: contained.composer, chat: contained.chat, ask: contained.ask, rail: contained.rail }, { map: true, composer: false, chat: false, ask: true, rail: true });
    }

    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
