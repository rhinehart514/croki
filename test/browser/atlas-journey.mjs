#!/usr/bin/env node

// Portfolio acceptance for generated maps: canonical/compatibility truth stays venture-isolated, switching
// ventures returns to its last thread, and a disconnected source cannot erase the last coherent map.

import assert from "node:assert/strict";
import { test } from "node:test";

import { createGeneratedMapsFixture } from "../fixtures/atlas-fixtures.mjs";
import {
  assertNoUnhandledRejections,
  bootFixture,
  openFixtureVenture,
  setNetworkOffline,
  summonMap,
  waitForDom,
} from "./fixtures/browser-harness.mjs";

test("generated maps stay isolated across ventures and hold their last coherent read offline", async () => {
  const drover = await bootFixture(createGeneratedMapsFixture);
  const chrome = await openFixtureVenture(drover, { viewport: { width: 1440, height: 900 } });
  try {
    const { client } = chrome;
    const buffaloId = drover.fixture.venture.id;
    const denialId = drover.fixture.unrelatedVenture.id;

    const durable = await client.evaluate(`fetch('/api/ventures/${buffaloId}/architecture/projection')
      .then((response) => response.json())
      .then(({ projection }) => ({
        revision: projection.revision,
        elements: projection.elements.length,
        work: projection.joins.work.map((entry) => entry.id).sort(),
        released: projection.joins.wall.filter((entry) => entry.decision === 'release').length,
        outcomes: projection.joins.outcomes.map((entry) => entry.id),
      }))`);
    assert.deepEqual(durable, {
      revision: 7,
      elements: 11,
      work: ["buffalo-work-project-drop-v1", "buffalo-work-project-drop-v2"],
      released: 1,
      outcomes: ["buffalo-outcome-project-drop"],
    });

    await summonMap(client);
    await waitForDom(client, `/A project worth advancing/i.test(document.querySelector('.venture-maps')?.textContent || '')`, "Buffalo Product map did not render its customer need");

    const openedMenu = await client.evaluate(`(() => {
      const button = document.querySelector('.thread-venture-switcher summary');
      button?.click();
      return Boolean(button);
    })()`);
    assert.equal(openedMenu, true, "venture switcher was unavailable from maps");
    await waitForDom(client, `[...document.querySelectorAll('.thread-venture-switcher > div button')].some((entry) => /DenialShield/i.test(entry.textContent || ''))`, "DenialShield was not offered in the venture switcher");
    const switched = await client.evaluate(`(() => {
      const option = [...document.querySelectorAll('.thread-venture-switcher > div button')]
        .find((entry) => /DenialShield/i.test(entry.textContent || ''));
      option?.click();
      return Boolean(option);
    })()`);
    assert.equal(switched, true);
    await waitForDom(
      client,
      `document.querySelector('.thread-venture-switcher summary strong')?.textContent?.trim() === 'DenialShield' && !!document.querySelector('.thread-conversation [role="log"]') && !document.querySelector('.visual-stage')`,
      "venture switch did not return DenialShield to its conversation",
    );

    await summonMap(client);
    await waitForDom(client, `/Claim preflight/i.test(document.querySelector('.venture-maps')?.textContent || '')`, "DenialShield Product map did not render");
    const isolation = await client.evaluate(`Promise.all([
      fetch('/api/ventures/${denialId}/architecture/projection').then((response) => response.json()),
      Promise.resolve(document.querySelector('.venture-maps')?.textContent || ''),
    ]).then(([{ projection }, text]) => ({
      elements: projection.elements.length,
      preflight: projection.elements.filter((entry) => entry.id === 'arch-denial-system-preflight').length,
      buffaloLeak: /A project worth advancing|Builder intake|Project-first invitation test/i.test(text),
      nodes: document.querySelectorAll('.venture-graph-node').length,
    }))`);
    assert.ok(isolation.elements > 0);
    assert.equal(isolation.preflight, 1);
    assert.equal(isolation.buffaloLeak, false, "Buffalo map truth leaked into DenialShield");
    assert.ok(isolation.nodes >= 1, "DenialShield graph had no coherent nodes before disconnecting");

    await setNetworkOffline(client, true);
    await client.evaluate(`window.dispatchEvent(new Event('offline'))`);
    await waitForDom(
      client,
      `/Offline|Reconnecting/i.test(document.querySelector('.mode-connection-state')?.textContent || '')`,
      "offline freshness state never appeared",
    );
    const offline = await client.evaluate(`(() => ({
      map: Boolean(document.querySelector('.venture-maps')),
      nodes: document.querySelectorAll('.venture-graph-node').length,
      draggable: document.querySelectorAll('.venture-system-graph .react-flow__node.draggable').length,
    }))()`);
    assert.equal(offline.map, true, "offline transition erased the generated map");
    assert.ok(offline.nodes >= 1, "offline transition erased the last coherent nodes");
    assert.equal(offline.draggable, 0, "offline graph became a manual diagram editor");
    await setNetworkOffline(client, false);
    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
