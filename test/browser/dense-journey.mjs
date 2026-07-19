#!/usr/bin/env node

// Dense acceptance for the operating graph. Legacy operating records remain durable, but they are not promoted
// into graph truth without canonical Product/GTM objects and relationships. The graph therefore stays honestly
// empty and contained at the supported desktop size and at 125% browser zoom.

import assert from "node:assert/strict";
import { test } from "node:test";

import { createDenseVentureFixture } from "../fixtures/firm-fixtures.mjs";
import {
  assertBasicAccessibility,
  assertNoUnhandledRejections,
  bootFixture,
  openFixtureVenture,
  summonMap,
  waitForDom,
} from "./fixtures/browser-harness.mjs";

async function pickView(client, label, heading) {
  const clicked = await client.evaluate(`(() => {
    const tab = [...document.querySelectorAll('.venture-map-tabs [role="tab"]')]
      .find((entry) => entry.textContent.trim() === ${JSON.stringify(label)});
    tab?.click();
    return Boolean(tab);
  })()`);
  assert.equal(clicked, true, `${label} map tab was unavailable`);
  await waitForDom(client, `document.querySelector('.venture-maps h1')?.textContent?.trim() === ${JSON.stringify(heading)}`, `${heading} did not render`);
}

test("dense venture: generated maps stay honest and contained without canonical map truth", async () => {
  const drover = await bootFixture(createDenseVentureFixture);
  const chrome = await openFixtureVenture(drover, { viewport: { width: 1440, height: 900 } });
  try {
    const { client } = chrome;
    const ventureId = drover.fixture.venture.id;

    const durable = await client.evaluate(`Promise.all([
      fetch('/api/ventures/${ventureId}/lens').then((response) => response.json()),
      fetch('/api/ventures/${ventureId}/wall').then((response) => response.json()),
      fetch('/api/ventures/${ventureId}/work-index').then((response) => response.json()),
    ]).then(([lensResponse, wall, indexResponse]) => ({
      bets: lensResponse.lens.bets.length,
      outcomes: lensResponse.lens.bets.filter((bet) => bet.latestOutcome).length,
      wall: wall.queue.length,
      mapObjects: indexResponse.workIndex.outline.objects.length,
    }))`);
    assert.deepEqual(durable, {
      bets: drover.fixture.expected.bets,
      outcomes: drover.fixture.expected.outcomes,
      wall: drover.fixture.expected.wallItems,
      mapObjects: 0,
    });

    assert.ok(await client.evaluate(`!!document.querySelector('.thread-conversation [role="log"]') && !document.querySelector('.venture-maps')`), "dense venture did not rest in chat");
    await summonMap(client);
    await waitForDom(client, `/No connected system yet/i.test(document.querySelector('.venture-map-empty')?.textContent || '')`, "empty whole-system graph overstated legacy records as map truth");

    await pickView(client, "Go-to-market", "Go-to-market");
    await waitForDom(client, `/No connected system yet/i.test(document.querySelector('.venture-map-empty')?.textContent || '')`, "empty GTM graph was not honest");
    await pickView(client, "Product", "Product");
    await waitForDom(client, `/No connected system yet/i.test(document.querySelector('.venture-map-empty')?.textContent || '')`, "empty Product graph was not honest");

    const contained = await client.evaluate(`(() => {
      const map = document.querySelector('.venture-maps')?.getBoundingClientRect();
      const center = document.querySelector('.visual-stage')?.getBoundingClientRect();
      return {
        pageOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
        mapWithinCenter: Boolean(map && center && map.left >= center.left - 1 && map.right <= center.right + 1),
        mapRect: map ? { left: map.left, right: map.right, width: map.width } : null,
        centerRect: center ? { left: center.left, right: center.right, width: center.width } : null,
        editableCanvas: Boolean(document.querySelector('.venture-canvas-flow')),
      };
    })()`);
    assert.ok(contained.pageOverflow <= 1, `dense generated maps introduced ${contained.pageOverflow}px page overflow`);
    assert.equal(contained.mapWithinCenter, true, `generated maps escaped the side visual: ${JSON.stringify(contained)}`);
    assert.equal(contained.editableCanvas, false, "dense operating graph mounted the retired free canvas");

    await client.send("Emulation.setDeviceMetricsOverride", { width: 1152, height: 720, deviceScaleFactor: 1.25, mobile: false });
    await client.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    const zoomed = await client.evaluate(`(() => ({
      overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
      map: Boolean(document.querySelector('.venture-maps')),
      composer: Boolean(document.querySelector('.thread-composer .now-composer textarea')),
      index: Boolean(document.querySelector('.thread-rail')),
    }))()`);
    assert.ok(zoomed.overflow <= 1, `125% browser zoom introduced ${zoomed.overflow}px horizontal overflow`);
    assert.deepEqual({ map: zoomed.map, composer: zoomed.composer, index: zoomed.index }, { map: true, composer: true, index: true });

    await assertBasicAccessibility(client);
    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
