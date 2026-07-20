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

test("native coding: exact work, restart recovery, and founder commit stay beside chat", async () => {
  const drover = await bootFixture(seedNativeCoding);
  let chrome = null;
  try {
    chrome = await openFixtureVenture(drover);
    const { client } = chrome;
    await waitForDom(client, `document.querySelectorAll('.thread-rich-card[data-kind="native-code"]').length === 2`, "both durable coding attempts did not return to the thread");
    assert.equal(await client.evaluate(`!!document.querySelector('.thread-composer textarea')`), true, "conversation composer was not available beside completed work");
    assert.equal(await client.evaluate(`/Drover restarted before the provider turn settled/.test(document.body.textContent)`), true, "restart recovery did not surface honestly");
    assert.equal(await client.evaluate(`/Implementation attempts/.test(document.body.textContent)`), true, "separate approaches were not comparable in the thread");

    await waitForDom(client, `!!document.querySelector('.work-workbench .code-workspace')`, "the native code workbench did not mount beside conversation");
    await client.evaluate(`(() => { const select = document.querySelector('.work-attempt select'); const option = [...(select?.options || [])].find((entry) => entry.textContent.includes('reviewable')); if (!select || !option) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, option.value); select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await waitForDom(client, `/native-coding-browser-proof.txt/.test(document.querySelector('.work-workbench')?.textContent || '')`, "the reviewable implementation was not selectable");
    assert.equal(await client.evaluate(`/git diff --check/.test(document.querySelector('.work-workbench')?.textContent || '')`), true, "attributed verification was not visible");
    assert.equal(await client.evaluate(`(document.querySelector('.work-workbench')?.textContent || '').includes('Release / distribution question')`), true, "the Product change lost its release question");
    assert.equal(await client.evaluate(`!document.querySelector('.visual-stage .code-workspace')`), true, "code work regressed into an optional visual stage");

    assert.equal(await client.evaluate(clickButton("Approve checkpoint")), true);
    await waitForDom(client, `/Exact checkpoint approved/.test(document.querySelector('.work-workbench')?.textContent || '')`, "the exact checkpoint review did not persist");
    assert.equal(await client.evaluate(`(() => {
      const input = document.querySelector('[aria-label="Commit message"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'prove native coding journey');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`), true);
    await waitForDom(client, `[...document.querySelectorAll('button')].some((entry) => entry.textContent.trim() === 'Commit in isolated branch' && !entry.disabled)`, "commit consequence did not become available");
    assert.equal(await client.evaluate(clickButton("Commit in isolated branch")), true);
    await waitForDom(client, `document.querySelector('.code-workspace-error') || (document.querySelector('.code-workspace-summary [data-status]')?.textContent || '').trim() === 'committed'`, "the isolated branch commit produced no receipt");
    const commitState = await client.evaluate(`({ status: document.querySelector('.code-workspace-summary [data-status]')?.textContent?.trim(), error: document.querySelector('.code-workspace-error')?.textContent?.trim() })`);
    assert.equal(commitState.status, "committed", commitState.error || "the isolated branch commit was not recorded");
    assert.equal(fs.existsSync(path.join(ROOT, "native-coding-browser-proof.txt")), false, "committing isolated work changed the founder source workspace");

    await client.send("Page.reload", { ignoreCache: true });
    await waitForDom(client, `document.querySelectorAll('.thread-rich-card[data-kind="native-code"]').length === 2`, "refresh lost durable coding attempts");

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
