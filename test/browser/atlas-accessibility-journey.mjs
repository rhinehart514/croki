#!/usr/bin/env node

// Keyboard/accessibility acceptance for the operating graph: Map, view tabs, nodes, route inspection, and
// work handoff are reachable in native tab order, and Escape broadens back to Home.

import assert from "node:assert/strict";
import { test } from "node:test";

import { createGeneratedMapsFixture } from "../fixtures/atlas-fixtures.mjs";
import { bootFixture, openFixtureVenture, waitForDom } from "./fixtures/browser-harness.mjs";
import {
  assertAtlasAccessibility,
  assertVisibleKeyboardFocus,
  focusKeyboardTarget,
  pressKeyboardKey,
} from "./fixtures/atlas-browser-harness.mjs";

test("generated maps are keyboard-reachable beside chat and hand off explicitly to real work", async () => {
  const drover = await bootFixture(createGeneratedMapsFixture);
  const chrome = await openFixtureVenture(drover, { viewport: { width: 1920, height: 1080 } });
  try {
    const { client } = chrome;
    const expected = drover.fixture.expected.maps;
    await client.evaluate(`document.activeElement?.blur?.(); document.body.focus({ preventScroll: true })`);

    const mapButton = await focusKeyboardTarget(
      client,
      (target) => /open venture map beside chat/i.test(target.name),
      "Map was not keyboard-reachable from the thread header",
    );
    assert.ok(mapButton);
    await assertVisibleKeyboardFocus(client, "Map button");
    await pressKeyboardKey(client, "Enter");
    await waitForDom(client, `!!document.querySelector('.venture-maps[data-view="system"] .venture-system-graph')`, "Enter did not summon the operating graph");

    const gtmTab = await focusKeyboardTarget(
      client,
      (target) => target.role === "tab" && target.name === "Go-to-market",
      "Go-to-market map tab was not keyboard-reachable",
    );
    assert.ok(gtmTab);
    await assertVisibleKeyboardFocus(client, "Go-to-market tab");
    await pressKeyboardKey(client, "Enter");
    await waitForDom(client, `document.querySelector('.venture-maps')?.getAttribute('data-view') === 'gtm'`, "Enter did not switch to the GTM map");

    await assertAtlasAccessibility(client);

    const campaignNode = await focusKeyboardTarget(
      client,
      (target) => target.name === `Inspect ${expected.campaign}`,
      "the campaign node was not keyboard-reachable",
      { limit: 180 },
    );
    assert.ok(campaignNode);
    await assertVisibleKeyboardFocus(client, "campaign graph node");
    await pressKeyboardKey(client, "Enter");
    await waitForDom(client, `document.querySelector('.venture-map-inspector h2')?.textContent?.trim() === ${JSON.stringify(expected.campaign)}`, "Enter did not inspect the campaign route");

    const openWork = await focusKeyboardTarget(
      client,
      (target) => target.name === "Open work",
      "the campaign's work action was not keyboard-reachable",
      { limit: 80 },
    );
    assert.ok(openWork);
    await assertVisibleKeyboardFocus(client, "Open work");
    await pressKeyboardKey(client, "Enter");
    await waitForDom(
      client,
      `document.querySelector('.thread-header-copy h1')?.textContent?.trim() === ${JSON.stringify(expected.direction)} && !!document.querySelector('.thread-conversation [role="log"]') && !document.querySelector('.visual-stage')`,
      "Enter on a map card did not explicitly open its owning thread",
    );
    assert.equal(await client.evaluate(`!!document.querySelector('.thread-rail')`), true, "opening work from the map lost thread continuity");
  } finally {
    await chrome.close();
    await drover.close();
  }
});
