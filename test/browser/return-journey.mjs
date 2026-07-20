#!/usr/bin/env node

// Return/offline acceptance for the chat-first shell. Canonical venture truth is unchanged; the receipt
// proves that attention, returned evidence, composer draft, and exact founder holds stay in one thread.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createOvernightVentureFixture } from "../fixtures/firm-fixtures.mjs";
import { assertNoUnhandledRejections, assertPerformanceBudgets, bootFixture, openFixtureVenture, setNetworkOffline, waitForDom } from "./fixtures/browser-harness.mjs";

async function selectThread(client, intent) {
  const selected = await client.evaluate(`(() => { const row = [...document.querySelectorAll('.thread-rail-row, .thread-rail-card')].find((entry) => entry.textContent.includes(${JSON.stringify(intent)})); row?.click(); return Boolean(row); })()`);
  assert.equal(selected, true, `thread was unavailable: ${intent}`);
  await waitForDom(client, `document.querySelector('.thread-header-copy h1')?.textContent?.includes(${JSON.stringify(intent)})`, `thread did not open: ${intent}`);
}

test("overnight return stays coherent in chat through evidence, founder hold, and offline recovery", async () => {
  const drover = await bootFixture(createOvernightVentureFixture);
  const chrome = await openFixtureVenture(drover, { viewport: { width: 1440, height: 900 } });
  try {
    const { client } = chrome;
    const ventureId = drover.fixture.venture.id;
    await assertPerformanceBudgets(client);
    const durable = await client.evaluate(`Promise.all([fetch('/api/ventures/${ventureId}/lens').then(r=>r.json()),fetch('/api/ventures/${ventureId}/wall').then(r=>r.json()),fetch('/api/ventures/${ventureId}/work-index').then(r=>r.json())]).then(([l,w,i])=>({bets:l.lens.bets.length,outcomes:l.lens.bets.filter(b=>b.latestOutcome).length,wall:w.queue.length,attention:i.workIndex.counts.attention,threads:i.workIndex.counts.total}))`);
    assert.deepEqual({ bets: durable.bets, outcomes: durable.outcomes, wall: durable.wall }, { bets: 4, outcomes: 1, wall: 3 });
    assert.ok(durable.attention >= 1 && durable.threads >= 1, "return index lost founder attention or durable threads");
    assert.equal(await client.evaluate(`!!document.querySelector('.thread-rail') && !!document.querySelector('.thread-conversation [role="log"]') && !document.querySelector('.visual-stage')`), true);

    const intent = "Find the narrowest product truth worth testing overnight";
    await selectThread(client, intent);
    await waitForDom(client, `!!document.querySelector('.thread-material[data-kind="evidence"], .thread-material[data-kind="consequence"]')`, "returned evidence or consequence did not appear in its thread");
    assert.match(await client.evaluate(`document.querySelector('.thread-conversation')?.textContent || ''`), /This is timely|Evidence returned|Founder boundary/i);

    const draft = "Keep this correction with the evidence while the connection recovers.";
    await client.evaluate(`document.querySelector('.thread-composer textarea')?.focus()`);
    await client.send("Input.insertText", { text: draft });
    await setNetworkOffline(client, true);
    await client.evaluate(`window.dispatchEvent(new Event('offline'))`);
    await waitForDom(client, `/Offline/i.test(document.querySelector('.firm-freshness')?.textContent || '')`, "offline state was not visible");
    const offline = await client.evaluate(`(() => ({ chat: Boolean(document.querySelector('.thread-conversation [role="log"]')), draft: document.querySelector('.thread-composer textarea')?.value, disabled: document.querySelector('.thread-composer textarea')?.disabled === true, visual: Boolean(document.querySelector('.visual-stage')) }))()`);
    assert.deepEqual(offline, { chat: true, draft, disabled: true, visual: false });

    await setNetworkOffline(client, false);
    await client.evaluate(`window.dispatchEvent(new Event('online'))`);
    await waitForDom(client, `!/Offline|Reconnecting/i.test(document.querySelector('.firm-freshness')?.textContent || '')`, "thread did not recover after reconnect");
    assert.equal(await client.evaluate(`document.querySelector('.thread-composer textarea')?.value`), draft, "thread draft was lost across reconnect");
    assert.equal(await client.evaluate(`document.querySelector('.thread-composer textarea')?.disabled`), false, "composer stayed held after reconnect");
    await assertNoUnhandledRejections(client);
  } finally { await chrome.close(); await drover.close(); }
});
