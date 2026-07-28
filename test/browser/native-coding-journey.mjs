#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { bootFixture, hideCanvas, openCanvas, openFixtureVenture, ROOT, waitForDom } from "./fixtures/browser-harness.mjs";
import { seedNativeCoding } from "./fixtures/native-coding-fixture.mjs";

function clickButton(label) {
  return `(() => {
    const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent.trim() === ${JSON.stringify(label)});
    button?.click();
    return Boolean(button && !button.disabled);
  })()`;
}

test("native coding: exact work, restart recovery, and the reviewed ship plan stay beside chat", async () => {
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
    assert.equal(await client.evaluate(`/Provider turn interrupted/.test(document.body.textContent) && /isolated workspace were retained/.test(document.body.textContent)`), true, "provider recovery did not name its layer and retained state");
    assert.equal(await client.evaluate(`/Implementation attempts/.test(document.body.textContent)`), true, "separate approaches were not comparable in the thread");

    await waitForDom(client, `!!document.querySelector('.work-workbench .code-workspace')`, "the native code workbench did not mount beside conversation");
    await client.evaluate(`(() => { const select = document.querySelector('.work-workbench-tools select'); const option = [...(select?.options || [])].find((entry) => entry.textContent.includes('reviewable')); if (!select || !option) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, option.value); select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await waitForDom(client, `/native-coding-browser-proof.txt/.test(document.querySelector('.work-workbench')?.textContent || '')`, "the reviewable implementation was not selectable");
    assert.equal(await client.evaluate(`/git diff --check/.test(document.querySelector('.work-workbench')?.textContent || '')`), true, "attributed verification was not visible");
    assert.equal(await client.evaluate(`document.querySelector('.work-review-evidence')?.dataset.state`), "verified", "exact passing checks did not verify the current checkpoint");
    assert.equal(await client.evaluate(`!(document.querySelector('.work-workbench')?.textContent || '').includes('Distribution question')`), true, "routine coding invented a distribution question");
    assert.equal(await client.evaluate(`!document.querySelector('.code-workspace-product')`), true, "routine coding invented a Product or market consequence");
    assert.equal(await client.evaluate(`!document.querySelector('.visual-stage .code-workspace')`), true, "code work regressed into an optional visual stage");

    // Canvas remains an optional view beside the same coding spine; opening it does not manufacture
    // a Product interpretation from an otherwise exact repository change.
    await openCanvas(client);
    await waitForDom(client, `document.querySelector('.workspace-shell')?.getAttribute('data-canvas-open') === 'true' && !!document.querySelector('.thread-conversation[data-surface="work"]')`, "opening Canvas displaced the coding spine");

    await hideCanvas(client);
    await client.evaluate(`(() => { const row = [...document.querySelectorAll('.thread-rail-row')].find((entry) => entry.querySelector('span')?.textContent.trim() === 'Implement the native coding browser proof'); row?.click(); return Boolean(row); })()`);
    await waitForDom(client, `!!document.querySelector('.work-workbench .code-workspace')`, "returning to Work lost the exact implementation");
    await client.evaluate(`(() => { const select = document.querySelector('.work-workbench-tools select'); const option = [...(select?.options || [])].find((entry) => entry.textContent.includes('reviewable')); if (!select || !option) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, option.value); select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await waitForDom(client, `/native-coding-browser-proof.txt/.test(document.querySelector('.work-workbench')?.textContent || '')`, "returning from Product / GTM did not restore the reviewable implementation");

    assert.equal(await client.evaluate(clickButton("Approve checkpoint")), true);
    try {
      await waitForDom(client, `/Checkpoint approved/.test(document.querySelector('.work-workbench')?.textContent || '')`, "the exact checkpoint review did not persist");
    } catch (error) {
      const state = await client.evaluate(`({ text: document.querySelector('.work-workbench')?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 1200), alerts: [...document.querySelectorAll('.work-workbench [role="alert"]')].map((entry) => entry.textContent?.trim()) })`);
      throw new Error(`${error.message}: ${JSON.stringify(state)}`);
    }
    await waitForDom(
      client,
      `(() => { const facts = document.querySelector('.ship-review-facts'); const text = facts?.textContent || ''; return Boolean(facts && /Base/.test(text) && /Current/.test(text) && /Working tree/.test(text) && /Verification/.test(text) && /What confirmation will change/.test(text)); })()`,
      "the exact source-control review facts did not appear inside Review",
    );
    assert.equal(await client.evaluate(clickButton("Preview without shipping")), true);
    await waitForDom(client, `/This was a preview\\. Nothing left your machine\\./.test(document.querySelector('.work-workbench')?.textContent || '')`, "the browser dry-run receipt did not prove that nothing left the machine");
    assert.equal(await client.evaluate(`[...document.querySelectorAll('.work-workbench button')].every((entry) => entry.textContent.trim() !== 'Commit in isolated branch')`), true, "a second non-previewable commit path competed with the exact Ship plan");
    assert.equal(fs.existsSync(path.join(ROOT, "native-coding-browser-proof.txt")), false, "previewing the ship plan changed the founder source workspace");

    await client.send("Page.reload", { ignoreCache: true });
    await waitForDom(client, `!!document.querySelector('.workspace-shell .thread-rail') && document.querySelector('button[aria-label="Canvas"]')?.getAttribute('aria-pressed') === 'false'`, "the venture did not return to the coding spine after reload");
    await client.evaluate(`(() => { const row = [...document.querySelectorAll('.thread-rail-row')].find((entry) => entry.querySelector('span')?.textContent.trim() === 'Implement the native coding browser proof'); row?.click(); return Boolean(row); })()`);
    await waitForDom(client, `!!document.querySelector('.work-workbench-tools select')`, "the reviewed implementation did not restore its exact workbench");
    await client.evaluate(`(() => { const select = document.querySelector('.work-workbench-tools select'); const option = [...(select?.options || [])].find((entry) => entry.textContent.includes('reviewable')); if (!select || !option) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, option.value); select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await waitForDom(client, `/This was a preview\\. Nothing left your machine\\./.test(document.querySelector('.work-workbench')?.textContent || '')`, "the exact dry-run ship receipt was not visible after reload");
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
