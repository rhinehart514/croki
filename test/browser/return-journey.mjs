#!/usr/bin/env node

// Return/offline acceptance for the chat-first shell. Canonical venture truth is unchanged; the receipt
// proves that attention, returned evidence, composer draft, and exact founder holds stay in one thread.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createOvernightVentureFixture, createReturnContinuityFixture } from "../fixtures/firm-fixtures.mjs";
import { assertNoUnhandledRejections, assertPerformanceBudgets, bootFixture, openFixtureVenture, setNetworkOffline, waitForDom } from "./fixtures/browser-harness.mjs";

async function selectThread(client, intent) {
  await waitForDom(
    client,
    `[...document.querySelectorAll('.thread-rail-row, .thread-rail-card')].some((entry) => entry.textContent.includes(${JSON.stringify(intent)}))`,
    `thread was unavailable: ${intent}`,
  );
  const selected = await client.evaluate(`(() => { const row = [...document.querySelectorAll('.thread-rail-row, .thread-rail-card')].find((entry) => entry.textContent.includes(${JSON.stringify(intent)})); row?.click(); return Boolean(row); })()`);
  assert.equal(selected, true, `thread was unavailable: ${intent}`);
  await waitForDom(client, `document.querySelector('.thread-header-copy h1')?.textContent?.includes(${JSON.stringify(intent)})`, `thread did not open: ${intent}`);
}

async function switchProject(client, name) {
  const opened = await client.evaluate(`(() => {
    const summary = document.querySelector('.thread-venture-switcher summary');
    if (!summary) return false;
    summary.click();
    return true;
  })()`);
  assert.equal(opened, true, "Project switcher was unavailable");
  await waitForDom(
    client,
    `[...document.querySelectorAll('.thread-venture-switcher > div button')].some((entry) => entry.textContent.includes(${JSON.stringify(name)}))`,
    `Project switcher did not offer ${name}`,
  );
  const started = await client.evaluate(`(() => {
    const option = [...document.querySelectorAll('.thread-venture-switcher > div button')]
      .find((entry) => entry.textContent.includes(${JSON.stringify(name)}));
    if (!option) return null;
    const startedAt = performance.now();
    option.click();
    return startedAt;
  })()`);
  assert.notEqual(started, null, `Project switcher could not open ${name}`);
  await waitForDom(
    client,
    `document.querySelector('.thread-venture-switcher summary strong')?.textContent?.trim() === ${JSON.stringify(name)} && Boolean(document.querySelector('.thread-composer textarea'))`,
    `${name} did not paint its identity and primary action`,
  );
  return client.evaluate(`performance.now() - ${Number(started)}`);
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

    const reviewIntent = "Find the narrowest product truth worth testing overnight";
    await selectThread(client, reviewIntent);
    await waitForDom(client, `!!document.querySelector('.thread-interventions .now-gate')`, "founder-review consequence did not appear at its point of action");
    assert.match(await client.evaluate(`document.querySelector('.thread-conversation')?.textContent || ''`), /Waiting for your review|Action ready for review/i);

    await waitForDom(client, `!!document.querySelector('.thread-material[data-kind="evidence"]')`, "returned evidence did not appear in its thread");
    assert.match(await client.evaluate(`document.querySelector('.thread-conversation')?.textContent || ''`), /This is timely|Evidence returned/i);

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

test("Project A → B → A restores exact state and measures warm return p95", async (t) => {
  const drover = await bootFixture(createReturnContinuityFixture);
  const chrome = await openFixtureVenture(drover, { viewport: { width: 1440, height: 900 } });
  try {
    const { client } = chrome;
    const projectA = drover.fixture.venture.name;
    const projectB = drover.fixture.otherVenture.name;
    const intent = "Find the narrowest product truth worth testing overnight";
    const draftA = "Keep this exact Project A draft through return.";

    await selectThread(client, intent);
    await client.evaluate(`document.querySelector('.thread-composer textarea')?.focus()`);
    await client.send("Input.insertText", { text: draftA });
    await waitForDom(client, `localStorage.getItem('drover:composer-drafts:v2')?.includes(${JSON.stringify(draftA)})`, "Project A draft was not persisted before switching");
    assert.equal(await client.evaluate(`(() => { const toggle = document.querySelector('.work-composer-bar button[aria-label="Canvas"]'); toggle?.click(); return Boolean(toggle); })()`), true);
    await waitForDom(client, `document.querySelector('.work-composer-bar button[aria-label="Canvas"]')?.getAttribute('aria-pressed') === 'true' && Boolean(document.querySelector('.workspace-canvas'))`, "Project A Canvas did not open beside its Thread");
    await waitForDom(client, `localStorage.getItem('drover:workspace-session:v14:${drover.fixture.venture.id}')?.includes('thread:')`, "Project A presentation snapshot was not recorded");

    await switchProject(client, projectB);
    await waitForDom(client, `document.querySelector('.thread-header-copy h1')?.textContent?.trim() === 'Croki'`, "Project B did not settle on its root Thread before drafting");
    assert.notEqual(await client.evaluate(`document.querySelector('.thread-composer textarea')?.value`), draftA, "Project A draft crossed into Project B");

    const durations = [];
    durations.push(await switchProject(client, projectA));
    await waitForDom(client, `document.querySelector('.thread-header-copy h1')?.textContent?.includes(${JSON.stringify(intent)})`, "Project A did not restore its exact Thread");
    try {
      await waitForDom(client, `document.querySelector('.thread-composer textarea')?.value === ${JSON.stringify(draftA)}`, "Project A did not restore its draft");
    } catch (error) {
      const state = await client.evaluate(`({
        value: document.querySelector('.thread-composer textarea')?.value,
        drafts: localStorage.getItem('drover:composer-drafts:v2'),
        session: localStorage.getItem('drover:workspace-session:v14:${drover.fixture.venture.id}'),
        heading: document.querySelector('.thread-header-copy h1')?.textContent,
      })`);
      throw new Error(`${error.message}: ${JSON.stringify(state)}`);
    }
    assert.equal(await client.evaluate(`document.querySelector('.thread-composer textarea')?.value`), draftA);
    assert.equal(await client.evaluate(`document.querySelector('.work-composer-bar button[aria-label="Canvas"]')?.getAttribute('aria-pressed')`), "true");

    for (let index = 0; index < 11; index += 1) {
      durations.push(await switchProject(client, projectB));
      assert.notEqual(await client.evaluate(`document.querySelector('.thread-composer textarea')?.value`), draftA, "Project A draft crossed into Project B");
      durations.push(await switchProject(client, projectA));
      await waitForDom(client, `document.querySelector('.thread-composer textarea')?.value === ${JSON.stringify(draftA)}`, "Project A draft was not restored");
      assert.equal(await client.evaluate(`document.querySelector('.thread-composer textarea')?.value`), draftA);
    }
    const ordered = durations.toSorted((left, right) => left - right);
    const p95 = ordered[Math.ceil(ordered.length * 0.95) - 1];
    assert.ok(p95 <= 250, `warm Project return p95 ${p95.toFixed(1)}ms exceeds 250ms: ${JSON.stringify(durations.map((value) => Math.round(value)))}`);
    t.diagnostic(`warm Project/Thread return p95 ${p95.toFixed(1)}ms across ${durations.length} switches`);

    await client.send("Page.reload", { ignoreCache: true });
    await waitForDom(client, `document.querySelector('.thread-header-copy h1')?.textContent?.includes(${JSON.stringify(intent)})`, "restart did not restore Project A's exact Thread");
    await waitForDom(client, `document.querySelector('.thread-composer textarea')?.value === ${JSON.stringify(draftA)}`, "restart did not restore Project A's draft");
    assert.equal(await client.evaluate(`document.querySelector('.thread-composer textarea')?.value`), draftA);
    assert.equal(await client.evaluate(`document.querySelector('.work-composer-bar button[aria-label="Canvas"]')?.getAttribute('aria-pressed')`), "true");

    await client.evaluate(`(() => {
      const key = 'drover:workspace-session:v14:${drover.fixture.venture.id}';
      const snapshot = JSON.parse(localStorage.getItem(key));
      const threadRef = snapshot.activeThreadRef;
      snapshot.threads[threadRef].canvasOpen = true;
      snapshot.threads[threadRef].selectedObjectRef = 'object:deleted-return-address';
      snapshot.threads[threadRef].systemCamera = { x: 800, y: -200, zoom: 1.2 };
      localStorage.setItem(key, JSON.stringify(snapshot));
    })()`);
    await client.send("Page.reload", { ignoreCache: true });
    await waitForDom(client, `/Canvas return.*saved Canvas item is no longer available/i.test(document.querySelector('.workspace-return-break')?.textContent || '')`, "invalid local Canvas address did not produce a precise local break");
    await waitForDom(client, `document.querySelector('.thread-composer textarea')?.value === ${JSON.stringify(draftA)}`, "the local Canvas break discarded the Thread draft");
    assert.equal(await client.evaluate(`document.querySelector('.thread-header-copy h1')?.textContent?.includes(${JSON.stringify(intent)})`), true);
    assert.equal(await client.evaluate(`document.querySelector('.thread-composer textarea')?.value`), draftA);
    assert.equal(await client.evaluate(`JSON.parse(localStorage.getItem('drover:workspace-session:v14:${drover.fixture.venture.id}')).threads[JSON.parse(localStorage.getItem('drover:workspace-session:v14:${drover.fixture.venture.id}')).activeThreadRef].selectedObjectRef`), null);

    const privateMetrics = await client.evaluate(`JSON.parse(localStorage.getItem('drover:private-ux-metrics:v1') || '[]').filter((entry) => entry.event === 'warm_destination_painted')`);
    assert.ok(privateMetrics.length >= durations.length, "warm destination paints were not recorded separately");
    assert.ok(privateMetrics.every((entry) => Number.isFinite(entry.durationMs) && entry.durationMs <= 250), `recorded warm destination target missed: ${JSON.stringify(privateMetrics)}`);
    await assertNoUnhandledRejections(client);
  } finally { await chrome.close(); await drover.close(); }
});
