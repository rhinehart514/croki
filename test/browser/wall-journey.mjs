#!/usr/bin/env node

// Founder authority in the chat-first shell. Consequences appear inside their owning threads, open exact
// review beside chat, settle once through existing wall controls, and remain durably decided after reload.

import assert from "node:assert/strict";
import { test } from "node:test";
import { getVentureDoc } from "../../brain/src/firm/venture-store.mjs";
import { createWallVentureFixture } from "../fixtures/firm-fixtures.mjs";
import { assertBasicAccessibility, assertNoUnhandledRejections, bootFixture, openFixtureVenture, waitForDom } from "./fixtures/browser-harness.mjs";

const intents = {
  release: "Hold the exact private preview until the founder reviews it",
  answer: "Ask for the one constraint the repository cannot answer",
  reviewOutcome: "Learn from the attributable buyer reply",
  endBet: "End a disproven line only through the founder",
};

async function openGate(client, intent) {
  const selected = await client.evaluate(`(() => { const row = [...document.querySelectorAll('.thread-rail-row, .thread-rail-card')].find((entry) => entry.textContent.includes(${JSON.stringify(intent)})); row?.click(); return Boolean(row); })()`);
  assert.equal(selected, true, `thread was unavailable: ${intent}`);
  await waitForDom(client, `document.querySelector('.thread-header-copy h1')?.textContent?.includes(${JSON.stringify(intent)})`, `thread did not open: ${intent}`);
  await waitForDom(client, `!!document.querySelector('.thread-material[data-kind="consequence"] button')`, `consequence did not appear in: ${intent}`);
  await client.evaluate(`document.querySelector('.thread-material[data-kind="consequence"] button')?.click()`);
  await waitForDom(client, `!!document.querySelector('.visual-stage .now-gate')`, `exact founder gate did not open beside chat: ${intent}`);
  assert.equal(await client.evaluate(`!!document.querySelector('.thread-conversation [role="log"]')`), true, "opening founder review hid chat");
}

async function wallCount(client, ventureId, expected) {
  await waitForDom(client, `fetch('/api/ventures/${ventureId}/wall').then(r=>r.json()).then(w=>w.queue.length===${expected})`, `wall did not settle to ${expected}`);
}

test("all founder consequences settle once from their owning threads and survive reload", async () => {
  const drover = await bootFixture(createWallVentureFixture);
  const chrome = await openFixtureVenture(drover, { viewport: { width: 1440, height: 900 } });
  try {
    const { client } = chrome;
    const ventureId = drover.fixture.venture.id;
    await wallCount(client, ventureId, 4);

    await openGate(client, intents.release);
    let releaseRequests = 0;
    await client.send("Network.enable");
    client.on("Network.requestWillBeSent", ({ request }) => { if (request.method === "POST" && /wall-purpose-release\/decide$/.test(request.url)) releaseRequests += 1; });
    assert.equal(await client.evaluate(`(() => { const b=[...document.querySelectorAll('.visual-stage .now-gate-btn')].find((entry) => entry.textContent.trim() === 'Approve & send'); b?.click(); return Boolean(b); })()`), true);
    await waitForDom(client, `document.querySelector('.visual-stage .now-gate-execution-failure')?.textContent.includes('Nothing was sent') && [...document.querySelectorAll('.visual-stage .now-gate-btn')].some((entry) => entry.textContent.trim() === 'Retry send')`, "the failed send did not return as a retryable founder action");
    await wallCount(client, ventureId, 4);
    assert.equal(releaseRequests, 1, "one failed send produced more than one release attempt");
    const failed = getVentureDoc(ventureId, "decisions", "wall-purpose-release", { root: drover.home });
    assert.equal(failed.decision, null, "a transport failure consumed the founder decision");
    assert.match(failed.lastExecutionError, /no recipient/i);
    releaseRequests = 0;
    assert.equal(await client.evaluate(`(() => { const b=document.querySelector('.visual-stage .now-gate-btn[data-intent="reject"]'); b?.click(); b?.click(); return Boolean(b); })()`), true);
    await wallCount(client, ventureId, 3);
    assert.equal(releaseRequests, 1, "double activation escaped the in-flight founder guard");

    await openGate(client, intents.answer);
    assert.equal(await client.evaluate(`(() => { const f=document.querySelector('.visual-stage input[aria-label="Your answer"]'); if(!f)return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(f,'Use the weekly handoff constraint; do not name a customer.'); f.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`), true);
    await client.evaluate(`[...document.querySelectorAll('.visual-stage .now-gate-btn')].find(b=>b.textContent.trim()==='Send answer')?.click()`);
    await wallCount(client, ventureId, 2);

    await openGate(client, intents.reviewOutcome);
    await client.evaluate(`[...document.querySelectorAll('.visual-stage .now-gate-btn')].find(b=>b.textContent.trim()==='Acknowledge')?.click()`);
    await wallCount(client, ventureId, 1);

    await openGate(client, intents.endBet);
    await client.evaluate(`[...document.querySelectorAll('.visual-stage .now-gate-btn')].find(b=>b.textContent.trim()==='Keep it going')?.click()`);
    await wallCount(client, ventureId, 0);

    const receipts = Object.fromEntries(drover.fixture.wall.map((item) => [item.id, getVentureDoc(ventureId, "decisions", item.id, { root: drover.home })]));
    assert.equal(receipts["wall-purpose-release"].decision, "reject");
    assert.equal(receipts["wall-purpose-answer"].decision, "answer");
    assert.equal(receipts["wall-purpose-review-outcome"].decision, "acknowledge");
    assert.equal(receipts["wall-purpose-end-bet"].decision, "keep");

    await client.send("Page.reload", { ignoreCache: true });
    await waitForDom(client, `!!document.querySelector('.workspace-shell .thread-conversation')`, "workspace shell did not return after reload");
    await wallCount(client, ventureId, 0);
    assert.equal(await client.evaluate(`!!document.querySelector('.thread-conversation [role="log"]')`), true);
    await assertBasicAccessibility(client);
    await assertNoUnhandledRejections(client);
  } finally { await chrome.close(); await drover.close(); }
});
