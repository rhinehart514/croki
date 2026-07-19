#!/usr/bin/env node

// Generated operating-graph acceptance. The workbench remains the resting product; Map summons one
// truth-backed graph where Product capacity, GTM motions, campaigns, and returned evidence stay connected.

import assert from "node:assert/strict";
import { test } from "node:test";

import { createGeneratedMapsFixture } from "../fixtures/atlas-fixtures.mjs";
import {
  assertBasicAccessibility,
  assertNoUnhandledRejections,
  bootFixture,
  openFixtureVenture,
  summonMap,
  waitForDom,
} from "./fixtures/browser-harness.mjs";

async function pressEscape(client) {
  await client.evaluate(`document.activeElement?.blur?.()`);
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
}

async function pickMapView(client, label) {
  const picked = await client.evaluate(`(() => {
    const tab = [...document.querySelectorAll('.venture-map-tabs [role="tab"]')]
      .find((entry) => entry.textContent.trim() === ${JSON.stringify(label)});
    tab?.click();
    return Boolean(tab);
  })()`);
  assert.equal(picked, true, `${label} graph tab was unavailable`);
  await waitForDom(
    client,
    `document.querySelector('.venture-maps h1')?.textContent?.trim() === ${JSON.stringify(label)}`,
    `${label} graph did not render`,
  );
}

test("the operating graph exposes the whole Product and go-to-market system", async () => {
  const drover = await bootFixture(createGeneratedMapsFixture);
  const chrome = await openFixtureVenture(drover, { viewport: { width: 1440, height: 900 } });
  try {
    const { client } = chrome;
    const expected = drover.fixture.expected.maps;

    const rest = await client.evaluate(`(() => ({
      workbench: Boolean(document.querySelector('[data-testid="venture-workbench"]')),
      home: Boolean(document.querySelector('.vh[aria-label]')),
      graph: Boolean(document.querySelector('.venture-system-graph')),
      mapButton: Boolean(document.querySelector('.workbench-map')),
    }))()`);
    assert.deepEqual(rest, { workbench: true, home: true, graph: false, mapButton: true });

    await summonMap(client);
    const system = await client.evaluate(`(() => ({
      heading: document.querySelector('.venture-maps h1')?.textContent?.trim(),
      names: [...document.querySelectorAll('.venture-graph-node strong')].map((entry) => entry.textContent.trim()),
      motions: [...document.querySelectorAll('.venture-graph-node[data-kind="motion"] strong')].map((entry) => entry.textContent.trim()),
      links: document.querySelectorAll('.react-flow__edge').length,
      draggable: document.querySelectorAll('.react-flow__node.draggable').length,
    }))()`);
    assert.equal(system.heading, "Whole system");
    for (const name of ["A project worth advancing", "Start with the work", "Project intake", "Project-drop invitation v1", expected.campaign, "Builder started with the project"]) {
      assert.ok(system.names.includes(name), `whole-system graph omitted ${name}`);
    }
    assert.ok(system.motions.length >= 1, "whole-system graph hid the venture's GTM motions");
    assert.ok(system.links >= 5, `whole-system graph exposed only ${system.links} links`);
    assert.equal(system.draggable, 0, "the generated operating graph became a manual diagram editor");

    await pickMapView(client, "Go-to-market");
    const gtm = await client.evaluate(`(() => ({
      names: [...document.querySelectorAll('.venture-graph-node strong')].map((entry) => entry.textContent.trim()),
      motions: document.querySelectorAll('.venture-graph-node[data-kind="motion"]').length,
      productSupport: document.querySelectorAll('.venture-graph-node[data-territory="product"]').length,
    }))()`);
    assert.ok(gtm.names.includes(expected.campaign));
    assert.ok(gtm.names.includes("Builder started with the project"));
    assert.ok(gtm.motions >= 1, "GTM focus hid all motions");
    assert.ok(gtm.productSupport >= 1, "GTM focus hid the Product capacity powering the route");

    const inspected = await client.evaluate(`(() => {
      const node = [...document.querySelectorAll('.venture-graph-node-main')]
        .find((entry) => entry.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(expected.campaign)});
      node?.click();
      return Boolean(node);
    })()`);
    assert.equal(inspected, true, "the campaign node was not inspectable");
    await waitForDom(client, `document.querySelector('.venture-map-inspector h2')?.textContent?.trim() === ${JSON.stringify(expected.campaign)}`, "campaign route did not open");
    const route = await client.evaluate(`(() => ({
      connected: document.querySelectorAll('.venture-map-inspector li').length,
      quiet: document.querySelectorAll('.venture-graph-node[data-quiet="true"]').length,
      open: document.querySelector('.venture-map-open')?.textContent?.trim(),
    }))()`);
    assert.ok(route.connected >= 2, "campaign inspection did not expose its operating links");
    assert.ok(route.quiet >= 1, "route focus did not quiet unrelated nodes");
    assert.equal(route.open, "Open work");

    await client.evaluate(`document.querySelector('.venture-map-open')?.click()`);
    await waitForDom(
      client,
      `!!document.querySelector('[data-testid="venture-workbench"] [data-testid="stage-workspace"]') && !document.querySelector('.venture-maps')`,
      "the campaign route did not hand back to real work",
    );
    const work = await client.evaluate(`(() => ({
      heading: document.querySelector('.work-narrative-head h2')?.textContent?.trim() || '',
      scoped: Boolean(document.querySelector('.venture-workspace-dock .now-composer-scope')),
    }))()`);
    assert.equal(work.heading, expected.direction);
    assert.equal(work.scoped, true, "opening graph work did not preserve its execution scope");

    await pressEscape(client);
    await waitForDom(client, `!!document.querySelector('.vh[aria-label]') && !document.querySelector('[data-testid="stage-workspace"]')`, "Escape did not broaden selected graph work back to Venture Home");

    await summonMap(client);
    const backed = await client.evaluate(`(() => {
      const button = document.querySelector('.venture-workspace-map-return');
      button?.click();
      return Boolean(button);
    })()`);
    assert.equal(backed, true, "Back to work was unavailable from the graph");
    await waitForDom(client, `!!document.querySelector('.vh[aria-label]') && !document.querySelector('.venture-maps')`, "Back to work did not restore Venture Home");

    await assertBasicAccessibility(client);
    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
