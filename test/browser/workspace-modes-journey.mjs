#!/usr/bin/env node

import assert from "node:assert/strict";
import { test } from "node:test";
import { createGeneratedMapsFixture } from "../fixtures/atlas-fixtures.mjs";
import { assertNoUnhandledRejections, bootFixture, openFixtureVenture, waitForDom } from "./fixtures/browser-harness.mjs";

async function chooseMode(client, label) {
  const clicked = await client.evaluate(`(() => { const button = [...document.querySelectorAll('.workspace-mode-nav button')].find((entry) => entry.textContent.includes(${JSON.stringify(label)})); button?.click(); return Boolean(button); })()`);
  assert.equal(clicked, true, `${label} mode was unavailable`);
  await waitForDom(client, `document.querySelector('.workspace-mode-nav button[aria-current="page"]')?.textContent.includes(${JSON.stringify(label)})`, `${label} mode did not become current`);
}

async function chooseNode(client, name) {
  await waitForDom(client, `!!document.querySelector('.system-workspace .venture-system-graph')`, "Product / GTM graph did not mount");
  const clicked = await client.evaluate(`(() => { const node = [...document.querySelectorAll('.system-workspace .venture-graph-node-main')].find((entry) => entry.querySelector('strong')?.textContent.trim() === ${JSON.stringify(name)}); node?.click(); return Boolean(node); })()`);
  assert.equal(clicked, true, `system object was unavailable: ${name}`);
  await waitForDom(client, `document.querySelector('.venture-map-inspector h2')?.textContent.trim() === ${JSON.stringify(name)}`, `system context did not select ${name}`);
}

async function chooseRelease(client, name) {
  await waitForDom(client, `!![...document.querySelectorAll('.releases-rail-body section > button')].find((entry) => entry.querySelector('strong')?.textContent.trim() === ${JSON.stringify(name)})`, "Release rail did not mount");
  const changed = await client.evaluate(`(() => { const button = [...document.querySelectorAll('.releases-rail-body section > button')].find((entry) => entry.querySelector('strong')?.textContent.trim() === ${JSON.stringify(name)}); button?.click(); return Boolean(button); })()`);
  assert.equal(changed, true, `release was unavailable in its mode rail: ${name}`);
  await waitForDom(client, `document.querySelector('.release-workspace-header h1')?.textContent.trim() === ${JSON.stringify(name)}`, `${name} did not become current`);
}

test("mode-owned rails and contextual conversation connect Product / GTM to Releases", async () => {
  const drover = await bootFixture(createGeneratedMapsFixture);
  const chrome = await openFixtureVenture(drover, { viewport: { width: 1440, height: 900 } });
  try {
    const { client } = chrome;
    const expected = drover.fixture.expected.maps;
    await chooseMode(client, "Product / GTM");
    assert.equal(await client.evaluate(`!document.querySelector('.workspace-chat .work-composer-bar')`), true, "coding controls leaked into Product / GTM");
    await chooseNode(client, expected.campaign);
    await waitForDom(client, `document.querySelector('.venture-map-agent')?.textContent.includes(${JSON.stringify(expected.direction)})`, "the selected node did not expose its linked agent context");
    assert.equal(await client.evaluate(`!document.querySelector('.workspace-chat') && !document.querySelector('.workspace-rail .thread-rail-list') && !!document.querySelector('.product-rail-body')`), true, "Product / GTM did not own the center and rail");
    await client.evaluate(`[...document.querySelectorAll('.workspace-fab button')].find((entry) => entry.textContent.includes('Ask Drover'))?.click()`);
    try {
      await waitForDom(client, `document.querySelector('.workspace-chat .thread-header-copy h1')?.textContent.includes(${JSON.stringify(expected.direction)})`, "the persistent agent did not open the node's linked thread");
    } catch (error) {
      const [systemResponse, workResponse] = await Promise.all([
        drover.founderFetch(`/api/ventures/${drover.fixture.venture.id}/system-index?scope=system`),
        drover.founderFetch(`/api/ventures/${drover.fixture.venture.id}/work-index`),
      ]);
      const system = (await systemResponse.json()).systemIndex;
      const work = (await workResponse.json()).workIndex;
      const campaign = system.objects.find((entry) => entry.name === expected.campaign);
      const state = await client.evaluate(`(() => ({
        header: document.querySelector('.workspace-chat .thread-header-copy h1')?.textContent?.trim() || null,
        agent: document.querySelector('.venture-map-agent')?.textContent?.replace(/\\s+/g, ' ').trim() || null,
        selectedRows: [...document.querySelectorAll('.thread-rail-row[aria-current="true"]')].map((entry) => entry.textContent?.replace(/\\s+/g, ' ').trim()),
      }))()`);
      throw new Error(`${error.message}: ${JSON.stringify({ ...state, campaignThreads: campaign?.threadRefs, workThreads: work.items.map((entry) => entry.threadRef) })}`);
    }
    assert.equal(await client.evaluate(`!!document.querySelector('.workspace-chat') && !!document.querySelector('.workspace-chat-close')`), true, "contextual conversation did not open as a closable surface");

    await chooseMode(client, "Releases");
    assert.equal(await client.evaluate(`!document.querySelector('.workspace-chat .work-composer-bar')`), true, "coding controls leaked into Releases");
    await waitForDom(client, `document.querySelector('.workspace-chat .thread-header-copy h1')?.textContent.includes(${JSON.stringify(expected.direction)})`, "switching modes replaced the selected thread");
    assert.equal(await client.evaluate(`!document.querySelector('.workspace-rail .thread-rail-list') && !!document.querySelector('.releases-rail-body')`), true, "Releases did not own its rail");
    await chooseRelease(client, "Project-drop invitation v1");
    assert.equal(await client.evaluate(`document.querySelector('.release-workspace-header > div > span')?.textContent.trim()`), "In market", "a released joined action did not derive in-market lifecycle");
    await waitForDom(client, `["Product delta", "Customer consequence", "Distribution", "Outward action", "Evidence"].every((label) => (document.querySelector('.release-path')?.textContent || '').includes(label))`, "the connected release path was incomplete");
    await waitForDom(client, `!!document.querySelector('.release-path .now-gate') && document.querySelector('.release-activity')?.textContent.includes('Evidence returned')`, "the path lost its exact founder gate or returned evidence");
    assert.equal(await client.evaluate(`!document.querySelector('.release-subnav') && ![...document.querySelectorAll('.release-workspace button')].some((entry) => entry.textContent.trim() === 'Open chat')`), true, "legacy release navigation returned");

    await client.evaluate(`document.querySelector('.release-details summary')?.click()`);
    await client.evaluate(`[...document.querySelectorAll('.release-details button')].find((entry) => entry.textContent.trim() === 'End release')?.click()`);
    await waitForDom(client, `document.querySelector('.release-workspace-header > div > span')?.textContent.trim() === 'Ended'`, "the founder could not explicitly end the release");
    await client.evaluate(`[...document.querySelectorAll('.release-details button')].find((entry) => entry.textContent.trim() === 'Reopen')?.click()`);
    await waitForDom(client, `document.querySelector('.release-workspace-header > div > span')?.textContent.trim() !== 'Ended'`, "the ended release did not reopen");

    await chooseMode(client, "Product / GTM");
    await chooseNode(client, "A project worth advancing");
    await waitForDom(client, `document.querySelector('.thread-composer')?.textContent.includes('A project worth advancing')`, "an unlinked node did not scope the persistent agent draft");
    await chooseMode(client, "Releases");
    await client.evaluate(`document.querySelector('.releases-rail-body > .thread-new')?.click()`);
    await waitForDom(client, `document.querySelector('.release-workspace h1')?.textContent.trim() === 'New release from this' && !!document.querySelector('.release-draft')`, "an unlinked object did not seed an unsaved release draft");
    const draft = await client.evaluate(`(() => { const set = (node, value) => { const setter = Object.getOwnPropertyDescriptor(node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set; setter.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); }; const name = document.querySelector('.release-draft input[placeholder="What is moving to market?"]'); const intent = document.querySelector('.release-draft textarea'); if (!name || !intent) return false; set(name, 'Project need release'); set(intent, 'Test the project-first need in market.'); return true; })()`);
    assert.equal(draft, true);
    await client.evaluate(`[...document.querySelectorAll('.release-draft button')].find((entry) => entry.textContent.trim() === 'Save release')?.click()`);
    await waitForDom(client, `document.querySelector('.release-workspace-header h1')?.textContent.trim() === 'Project need release'`, "the meaningful release save did not persist");
    await waitForDom(client, `document.querySelector('.release-path')?.textContent.includes('A project worth advancing') && document.querySelector('.release-path')?.textContent.includes('Distribution')`, "the founder-confirmed context link was not canonical in the release path");
    assert.equal(await client.evaluate(`document.querySelectorAll('.release-path-step[data-empty="true"]').length > 0`), true, "missing release connections were hidden or fabricated");
    assert.equal(await client.evaluate(`!/\b\d+%/.test(document.querySelector('.release-workspace')?.textContent || '')`), true, "release readiness became a percentage");
    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
