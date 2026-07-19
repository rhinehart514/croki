#!/usr/bin/env node

// Generated operating-graph acceptance. Chat remains the resting product; Map summons one truth-backed
// side visual where Product capacity, GTM motions, campaigns, and returned evidence stay connected.

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
      rail: Boolean(document.querySelector('.thread-rail')),
      chat: Boolean(document.querySelector('.thread-conversation [role="log"]')),
      graph: Boolean(document.querySelector('.venture-system-graph')),
      visual: Boolean(document.querySelector('.visual-stage')),
    }))()`);
    assert.deepEqual(rest, { rail: true, chat: true, graph: false, visual: false });

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
      `document.querySelector('.thread-header-copy h1')?.textContent?.trim() === ${JSON.stringify(expected.direction)} && !document.querySelector('.venture-maps')`,
      "the explicit Open thread action did not return to its conversation",
    );
    const work = await client.evaluate(`(() => ({
      heading: document.querySelector('.thread-header-copy h1')?.textContent?.trim() || '',
      scoped: Boolean(document.querySelector('.thread-composer .now-composer-scope')),
      chat: Boolean(document.querySelector('.thread-conversation [role="log"]')),
    }))()`);
    assert.equal(work.heading, expected.direction);
    assert.equal(work.scoped, true, "opening graph work did not preserve its execution scope");
    assert.equal(work.chat, true, "opening graph work hid the conversation");

    await summonMap(client);
    await pressEscape(client);
    await waitForDom(client, `!document.querySelector('.visual-stage') && !!document.querySelector('.thread-conversation [role="log"]')`, "Escape did not close the map beside the persistent conversation");

    await assertBasicAccessibility(client);
    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
