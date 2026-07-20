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
  await waitForDom(client, `document.querySelector('.mode-workspace-header h1')?.textContent.trim() === ${JSON.stringify(name)}`, `system context did not select ${name}`);
}

test("shared context moves through Product / GTM, Releases, and contextual chat", async () => {
  const drover = await bootFixture(createGeneratedMapsFixture);
  const chrome = await openFixtureVenture(drover, { viewport: { width: 1440, height: 900 } });
  try {
    const { client } = chrome;
    const expected = drover.fixture.expected.maps;
    await chooseMode(client, "Product / GTM");
    await chooseNode(client, expected.campaign);
    await chooseMode(client, "Releases");
    await waitForDom(client, `document.querySelector('.release-workspace .mode-workspace-header h1')?.textContent.trim() === 'Project-drop invitation v1'`, "the linked canonical release did not open");
    assert.equal(await client.evaluate(`document.querySelector('.release-workspace .mode-workspace-header span')?.textContent.trim()`), "in market", "a successfully released joined action did not derive in-market lifecycle");

    const openedChat = await client.evaluate(`(() => { const button = document.querySelector('.release-workspace .mode-workspace-header button'); button?.click(); return Boolean(button); })()`);
    assert.equal(openedChat, true);
    await waitForDom(client, `document.querySelector('.workspace-shell')?.dataset.chatOpen === 'true' && document.querySelector('.thread-header-copy h1')?.textContent.includes(${JSON.stringify(expected.direction)})`, "release chat did not resolve to its linked thread");
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitForDom(client, `document.querySelector('.workspace-shell')?.dataset.chatOpen !== 'true' && document.activeElement?.textContent.trim() === 'Open chat'`, "Escape did not close contextual chat and restore its opener");

    await client.evaluate(`[...document.querySelectorAll('.release-subnav button')].find((entry) => entry.textContent.trim() === 'activity')?.click()`);
    await waitForDom(client, `!!document.querySelector('.release-activity .now-gate') && document.querySelector('.release-activity')?.textContent.includes('Evidence returned')`, "joined founder gate and returned evidence did not appear in Activity");
    await client.evaluate(`[...document.querySelectorAll('.release-subnav button')].find((entry) => entry.textContent.trim() === 'build')?.click()`);
    await waitForDom(client, `!!document.querySelector('.release-build') && document.querySelector('.release-build')?.textContent.includes(${JSON.stringify(expected.direction)})`, "release Build did not expose exact linked work");
    await client.evaluate(`[...document.querySelectorAll('.release-subnav button')].find((entry) => entry.textContent.trim() === 'settings')?.click()`);
    await client.evaluate(`[...document.querySelectorAll('.release-settings button')].find((entry) => entry.textContent.trim() === 'End release')?.click()`);
    await waitForDom(client, `document.querySelector('.release-workspace .mode-workspace-header span')?.textContent.trim() === 'ended'`, "the founder could not explicitly end the release");
    await client.evaluate(`[...document.querySelectorAll('.release-settings button')].find((entry) => entry.textContent.trim() === 'Reopen')?.click()`);
    await waitForDom(client, `document.querySelector('.release-workspace .mode-workspace-header span')?.textContent.trim() !== 'ended'`, "the ended release did not reopen");

    await chooseMode(client, "Product / GTM");
    await chooseNode(client, "A project worth advancing");
    await chooseMode(client, "Releases");
    await waitForDom(client, `document.querySelector('.release-workspace h1')?.textContent.trim() === 'New release from this' && !!document.querySelector('.release-draft')`, "an unlinked object did not seed an unsaved release draft");
    const draft = await client.evaluate(`(() => { const set = (node, value) => { const setter = Object.getOwnPropertyDescriptor(node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set; setter.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); }; const name = document.querySelector('.release-draft input[placeholder="What is moving to market?"]'); const intent = document.querySelector('.release-draft textarea'); if (!name || !intent) return false; set(name, 'Project need release'); set(intent, 'Test the project-first need in market.'); return true; })()`);
    assert.equal(draft, true);
    await client.evaluate(`[...document.querySelectorAll('.release-draft button')].find((entry) => entry.textContent.trim() === 'Save release')?.click()`);
    await waitForDom(client, `document.querySelector('.release-workspace .mode-workspace-header h1')?.textContent.trim() === 'Project need release'`, "the meaningful release save did not persist");
    await client.evaluate(`[...document.querySelectorAll('.release-subnav button')].find((entry) => entry.textContent.trim() === 'build')?.click()`);
    await waitForDom(client, `document.querySelector('.release-build')?.textContent.includes('A project worth advancing') && document.querySelector('.release-build')?.textContent.includes('Distribution')`, "the founder-confirmed context link was not canonical in Build");
    assert.equal(await client.evaluate(`!/\b\d+%/.test(document.querySelector('.release-workspace')?.textContent || '')`), true, "release readiness became a percentage");
    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
