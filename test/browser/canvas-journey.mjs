#!/usr/bin/env node

// Generated Product / GTM acceptance. Work remains the resting product; Map routes directly to the
// truth-backed canvas while contextual conversation stays closed until requested.

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

async function pickMapView(client, label) {
  const picked = await client.evaluate(`(() => {
    const tab = [...document.querySelectorAll('.product-rail-body nav button')]
      .find((entry) => entry.textContent.trim() === ${JSON.stringify(label)});
    tab?.click();
    return Boolean(tab);
  })()`);
  assert.equal(picked, true, `${label} graph tab was unavailable`);
  await waitForDom(
    client,
    `document.querySelector('.system-workspace-title h1')?.textContent?.trim() === ${JSON.stringify(label)}`,
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
    await waitForDom(client, `document.querySelectorAll('.react-flow__edge').length >= 5`, "whole-venture relationships did not finish rendering");
    const system = await client.evaluate(`(() => ({
      heading: document.querySelector('.system-workspace-title h1')?.textContent?.trim(),
      names: [...document.querySelectorAll('.venture-graph-node strong')].map((entry) => entry.textContent.trim()),
      motions: [...document.querySelectorAll('.venture-graph-node[data-kind="motion"] strong')].map((entry) => entry.textContent.trim()),
      links: document.querySelectorAll('.react-flow__edge').length,
      draggable: document.querySelectorAll('.react-flow__node.draggable').length,
    }))()`);
    assert.equal(system.heading, "Whole venture");
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
    assert.ok(gtm.productSupport >= 1, "GTM scope hid the Product capacity powering the route");

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
      open: [...document.querySelectorAll('.system-inspector-actions button')].find((entry) => /open thread/i.test(entry.textContent || ''))?.textContent?.trim(),
    }))()`);
    assert.ok(route.connected >= 1, "campaign inspection did not expose its in-scope operating links");
    assert.ok(route.quiet >= 1, "route focus did not quiet unrelated nodes");
    assert.equal(route.open, "Open thread");

    await client.evaluate(`[...document.querySelectorAll('.system-inspector-actions button')].find((entry) => /open thread/i.test(entry.textContent || ''))?.click()`);
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
    const directMode = await client.evaluate(`(() => ({
      system: document.querySelector('.workspace-shell')?.dataset.mode === 'system',
      map: Boolean(document.querySelector('.system-workspace > .venture-maps')),
      agent: Boolean(document.querySelector('.workspace-chat .thread-conversation [role="log"]')),
      ask: Boolean(document.querySelector('.workspace-fab button')),
      overlay: Boolean(document.querySelector('.visual-stage')),
    }))()`);
    assert.deepEqual(directMode, { system: true, map: true, agent: false, ask: true, overlay: false }, "Map did not remain a first-class Product / GTM surface");

    await assertBasicAccessibility(client);
    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
