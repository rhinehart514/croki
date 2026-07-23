#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { bootFixture, openFixtureVenture, ROOT, waitForDom } from "./fixtures/browser-harness.mjs";
import { seedNativeCoding } from "./fixtures/native-coding-fixture.mjs";

function clickButton(label) {
  return `(() => {
    const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent.trim() === ${JSON.stringify(label)});
    button?.click();
    return Boolean(button && !button.disabled);
  })()`;
}

function clickMode(label) {
  return `(() => {
    const button = [...document.querySelectorAll('.workspace-mode-nav button')].find((entry) => entry.textContent.includes(${JSON.stringify(label)}));
    if (!button) return false;
    if (button.getAttribute('aria-current') !== 'page') button.click();
    return true;
  })()`;
}

test("native coding: exact work, restart recovery, and founder commit stay beside chat", async () => {
  const drover = await bootFixture(seedNativeCoding);
  let chrome = null;
  try {
    chrome = await openFixtureVenture(drover);
    const { client } = chrome;
    await waitForDom(client, `document.querySelectorAll('.thread-material[data-kind="native-code"]').length === 2`, "both durable coding attempts did not return to the thread");
    assert.equal(await client.evaluate(`!!document.querySelector('.thread-composer textarea')`), true, "conversation composer was not available beside completed work");
    await waitForDom(client, `!!document.querySelector('.thread-conversation[data-surface="work"] .thread-message[data-role="founder"]')`, "the Work timeline did not render a founder turn");
    const chatGeometry = await client.evaluate(`(() => {
      const conversation = document.querySelector('.thread-conversation[data-surface="work"]');
      const founder = conversation?.querySelector('.thread-message[data-role="founder"]');
      const founderBody = founder?.querySelector('.thread-message-body');
      const agent = conversation?.querySelector('.thread-message:not([data-role="founder"]) .thread-message-body');
      const scroll = conversation?.querySelector('.thread-log-scroll');
      const composer = conversation?.querySelector('.thread-composer');
      const composerShell = conversation?.querySelector('.now-composer-shell');
      const scope = conversation?.querySelector('.now-composer-scope');
      const log = conversation?.querySelector('.thread-log');
      const workSurface = conversation?.closest('.work-surface');
      const shell = conversation?.closest('.workspace-shell');
      const style = (node) => node ? getComputedStyle(node) : null;
      return {
        founderMax: style(founderBody)?.maxWidth,
        founderRadius: style(founderBody)?.borderRadius,
        founderAligned: style(founder)?.justifyContent,
        agentBorder: style(agent)?.borderTopWidth,
        scrollOverflow: style(scroll)?.overflowY,
        scrollContained: style(scroll)?.overscrollBehaviorY,
        composerHeight: style(composerShell)?.minHeight,
        scopeDisplay: style(scope)?.display,
        composerBelowTimeline: Boolean(composer && log && composer.getBoundingClientRect().top >= log.getBoundingClientRect().bottom - 1),
        fullHeight: Boolean(workSurface && shell && Math.abs(workSurface.getBoundingClientRect().height - shell.getBoundingClientRect().height) <= 1),
      };
    })()`);
    assert.deepEqual(chatGeometry, {
      founderMax: "80%",
      founderRadius: "16px",
      founderAligned: "flex-end",
      agentBorder: "0px",
      scrollOverflow: "auto",
      scrollContained: "contain",
      composerHeight: "80px",
      scopeDisplay: "none",
      composerBelowTimeline: true,
      fullHeight: true,
    }, "Work chat lost the T3 conversation geometry or single-scroll contract");
    assert.equal(await client.evaluate(`/Croki restarted before the provider turn settled/.test(document.body.textContent)`), true, "restart recovery did not surface honestly");
    assert.equal(await client.evaluate(`/Implementation attempts/.test(document.body.textContent)`), true, "separate approaches were not comparable in the thread");

    await waitForDom(client, `!!document.querySelector('.work-workbench .code-workspace')`, "the native code workbench did not mount beside conversation");
    await client.evaluate(`(() => { const select = document.querySelector('.work-workbench-tools select'); const option = [...(select?.options || [])].find((entry) => entry.textContent.includes('reviewable')); if (!select || !option) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, option.value); select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await waitForDom(client, `/native-coding-browser-proof.txt/.test(document.querySelector('.work-workbench')?.textContent || '')`, "the reviewable implementation was not selectable");
    assert.equal(await client.evaluate(`/git diff --check/.test(document.querySelector('.work-workbench')?.textContent || '')`), true, "attributed verification was not visible");
    assert.equal(await client.evaluate(`(document.querySelector('.work-workbench')?.textContent || '').includes('Distribution question')`), true, "the Product change lost its distribution question");
    assert.equal(await client.evaluate(`(document.querySelector('.work-workbench')?.textContent || '').includes('does not alter Product / GTM truth until you adopt it')`), true, "the Product consequence was not visibly provisional");
    assert.equal(await client.evaluate(`!document.querySelector('.visual-stage .code-workspace')`), true, "code work regressed into an optional visual stage");

    assert.equal(await client.evaluate(`(() => {
      const capability = document.querySelector('[aria-label="What became possible"]');
      const question = document.querySelector('[aria-label="Distribution question"]');
      if (!capability || !question) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(capability, 'Founders can review verified code without leaving venture context');
      capability.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(question, 'Which founders should receive this exact verified change first?');
      question.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`), true, "the Product consequence was not editable");
    assert.equal(await client.evaluate(clickButton("Adopt Product consequence")), true);
    await waitForDom(client, `document.querySelector('.code-workspace-product')?.dataset.review === 'adopted'`, "founder adoption did not persist");

    assert.equal(await client.evaluate(clickMode("Product / GTM")), true);
    try {
      await waitForDom(client, `document.querySelector('.product-gtm-surface')?.dataset.projection === 'consequence-trace' && [...document.querySelectorAll('.product-gtm-node[data-kind="truth"] strong')].some((entry) => entry.textContent.trim() === 'Founders can review verified code')`, "the adopted consequence did not appear in its consequence trace");
    } catch (error) {
      const state = await client.evaluate(`({ mode: document.querySelector('.workspace-shell')?.dataset.mode, productGtm: Boolean(document.querySelector('.product-gtm-surface')), text: document.querySelector('.workspace-primary')?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 500) })`);
      throw new Error(`${error.message}: ${JSON.stringify(state)}`);
    }
    assert.equal(await client.evaluate(`(() => { const name = 'Founders can review verified code'; if (document.querySelector('.product-gtm-node[data-expanded="true"] strong')?.textContent.trim() === name) return true; const node = [...document.querySelectorAll('.product-gtm-node[data-kind="truth"]')].find((entry) => entry.querySelector('strong')?.textContent.trim() === name); node?.click(); return Boolean(node); })()`), true, "mode switching did not preserve the exact linked Product subject");
    await waitForDom(client, `document.querySelector('.product-gtm-node[data-expanded="true"] strong')?.textContent.trim() === 'Founders can review verified code' && /without leaving venture context/.test(document.querySelector('.product-gtm-node[data-expanded="true"]')?.textContent || '') && !document.querySelector('.product-gtm-inspector')`, "the adopted Product consequence did not expand in the living model");

    assert.equal(await client.evaluate(clickMode("Work")), true);
    await client.evaluate(`(() => { const row = [...document.querySelectorAll('.thread-rail-row')].find((entry) => entry.querySelector('span')?.textContent.trim() === 'Implement the native coding browser proof'); row?.click(); return Boolean(row); })()`);
    await waitForDom(client, `!!document.querySelector('.work-workbench .code-workspace')`, "returning to Work lost the exact implementation");
    await client.evaluate(`(() => { const select = document.querySelector('.work-workbench-tools select'); const option = [...(select?.options || [])].find((entry) => entry.textContent.includes('reviewable')); if (!select || !option) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, option.value); select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await waitForDom(client, `/native-coding-browser-proof.txt/.test(document.querySelector('.work-workbench')?.textContent || '')`, "returning from Product / GTM did not restore the reviewable implementation");

    assert.equal(await client.evaluate(clickButton("Approve checkpoint")), true);
    await waitForDom(client, `/Checkpoint approved/.test(document.querySelector('.work-workbench')?.textContent || '')`, "the exact checkpoint review did not persist");
    assert.equal(await client.evaluate(`(() => {
      const input = document.querySelector('.work-workbench [aria-label="Commit message"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'prove native coding journey');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`), true);
    await waitForDom(client, `[...document.querySelectorAll('.work-workbench button')].some((entry) => entry.textContent.trim() === 'Commit in isolated branch' && !entry.disabled)`, "commit consequence did not become available");
    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('.work-workbench button')].find((entry) => entry.textContent.trim() === 'Commit in isolated branch'); button?.click(); return Boolean(button && !button.disabled); })()`), true);
    const commitDeadline = Date.now() + 12_000;
    let committed = null;
    while (Date.now() < commitDeadline && committed?.workspace?.status !== "committed") {
      const response = await drover.founderFetch(`/api/ventures/${encodeURIComponent(drover.fixture.venture.id)}/coding-workspaces/${encodeURIComponent(drover.fixture.completed.id)}`);
      committed = await response.json();
      if (committed.workspace?.status !== "committed") await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(committed?.workspace?.status, "committed", committed?.error || "the isolated branch commit was not recorded");
    assert.equal(fs.existsSync(path.join(ROOT, "native-coding-browser-proof.txt")), false, "committing isolated work changed the founder source workspace");

    await client.send("Page.reload", { ignoreCache: true });
    await waitForDom(client, `[...document.querySelectorAll('.workspace-mode-nav button')].some((entry) => entry.textContent.includes('Work'))`, "the venture did not return after reload");
    await waitForDom(client, clickMode("Work"), "Work did not become available after reload");
    await client.evaluate(`(() => { const row = [...document.querySelectorAll('.thread-rail-row')].find((entry) => entry.querySelector('span')?.textContent.trim() === 'Implement the native coding browser proof'); row?.click(); return Boolean(row); })()`);
    await waitForDom(client, `!!document.querySelector('.work-workbench-tools select')`, "the committed implementation did not restore its exact workbench");
    await client.evaluate(`(() => { const select = document.querySelector('.work-workbench-tools select'); const option = [...(select?.options || [])].find((entry) => entry.textContent.includes('committed')); if (!select || !option) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, option.value); select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await waitForDom(client, `(document.querySelector('.work-workbench .work-status')?.textContent || '').trim() === 'committed'`, "the durable commit receipt was not visible after reload");
    await waitForDom(client, `document.querySelectorAll('.thread-material[data-kind="native-code"]').length === 2`, "refresh lost durable coding attempts");

  } finally {
    for (const id of [drover.fixture.interrupted.id, drover.fixture.completed.id]) {
      await drover.founderFetch(`/api/ventures/${encodeURIComponent(drover.fixture.venture.id)}/coding-workspaces/${encodeURIComponent(id)}/discard`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true }),
      }).catch(() => null);
    }
    await chrome?.close();
    await drover.close();
  }
});
