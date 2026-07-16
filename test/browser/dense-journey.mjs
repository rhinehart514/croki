#!/usr/bin/env node

import assert from "node:assert/strict";
import { test } from "node:test";

import { createDenseVentureFixture } from "../fixtures/firm-fixtures.mjs";
import {
  assertBasicAccessibility,
  assertDesktopViewports,
  assertNoUnhandledRejections,
  assertPerformanceBudgets,
  bootFixture,
  captureEvidence,
  openFixtureVenture,
  waitForDom,
} from "./fixtures/browser-harness.mjs";

test("dense firm: legacy operating scale stays durable while Atlas compresses machinery", async () => {
  const drover = await bootFixture(createDenseVentureFixture);
  const chrome = await openFixtureVenture(drover);
  try {
    const { client } = chrome;
    const ventureId = drover.fixture.venture.id;
    await waitForDom(client, `Boolean(document.querySelector('[data-venture-atlas]'))`, "dense fixture did not settle into the Atlas");
    await assertPerformanceBudgets(client);

    const durableState = await client.evaluate(`Promise.all([
      fetch('/api/ventures/${ventureId}/lens').then((response) => response.json()),
      fetch('/api/ventures/${ventureId}/wall').then((response) => response.json()),
      fetch('/api/ventures/${ventureId}/architecture/projection').then((response) => response.json()),
    ]).then(([lensResponse, wall, { projection }]) => {
      const lens = lensResponse.lens;
      return {
        crew: lens.crew.length,
        bets: lens.bets.length,
        outcomes: lens.bets.filter((bet) => bet.latestOutcome).length,
        wall: wall.queue.length,
        longCopy: lens.bets.every((bet) => bet.intent.length > 250),
        projectedOutcomes: projection.joins.outcomes.length,
        durableArchitecture: projection.elements.length,
      };
    })`);
    assert.deepEqual(durableState, {
      crew: drover.fixture.expected.teammates,
      bets: drover.fixture.expected.bets,
      outcomes: drover.fixture.expected.outcomes,
      wall: drover.fixture.expected.wallItems,
      longCopy: true,
      projectedOutcomes: drover.fixture.expected.outcomes,
      durableArchitecture: 0,
    });

    await assertDesktopViewports(client, async () => {
      const state = await client.evaluate(`(() => ({
        atlas: Boolean(document.querySelector('[data-venture-atlas]')),
        altitude: document.querySelector('[data-venture-atlas]')?.dataset.atlasAltitude,
        renderedNodes: document.querySelectorAll('.react-flow__node').length,
        renderedBets: document.querySelectorAll('.atlas-bet-node').length,
        exactWork: document.querySelectorAll('.atlas-element[data-kind="work"]').length,
        returnedReality: document.querySelectorAll('.atlas-element[data-kind="outcome"]').length,
        primaryAgents: document.querySelectorAll('.firm-lens-crew-node, .firm-lens-participant-card').length,
        wallText: document.querySelector('[data-atlas-wall]')?.textContent,
        composer: Boolean(document.querySelector('.firm-app-composer textarea')),
        diagnostics: /architecture elements|placement is presentation only/i.test(document.body.textContent || ''),
      }))()`);
      assert.equal(state.atlas, true);
      assert.ok(["venture", "architecture", "detail"].includes(state.altitude));
      assert.equal(state.returnedReality, 30, "returned reality was dropped at legacy scale");
      assert.equal(state.renderedBets, 120, "a durable bet was dropped at legacy scale");
      assert.equal(state.exactWork, 15, "exact staged work was dropped at legacy scale");
      assert.equal(state.renderedNodes, state.renderedBets + state.returnedReality + state.exactWork + 3, "Atlas scene contains an unexplained or missing semantic node");
      assert.equal(state.primaryAgents, 0, "configured machinery returned as primary far-view objects");
      assert.match(state.wallText ?? "", /20 decisions need you/i);
      assert.equal(state.composer, true);
      assert.equal(state.diagnostics, false, "internal architecture diagnostics returned to founder space");
    }, { evidencePrefix: "dense-atlas-legacy-scale" });

    const openedOutline = await client.evaluate(`(() => { const button = document.querySelector('.atlas-outline-toggle'); button?.click(); return Boolean(button); })()`);
    assert.equal(openedOutline, true);
    await waitForDom(client, `document.querySelectorAll('#atlas-outline-panel [role="option"]').length >= 31`, "dense Atlas outline did not retain deterministic access to returned reality");
    const outline = await client.evaluate(`(() => ({
      rows: document.querySelectorAll('#atlas-outline-panel [role="option"]').length,
      lastReturn: [...document.querySelectorAll('#atlas-outline-panel [role="option"]')].some((row) => /Market return 030/.test(row.textContent || '')),
      active: document.activeElement?.getAttribute('role'),
      atlasMounted: Boolean(document.querySelector('[data-venture-atlas]')),
    }))()`);
    assert.ok(outline.rows >= 31);
    assert.equal(outline.lastReturn, true);
    assert.equal(outline.active, "option");
    assert.equal(outline.atlasMounted, true);
    await client.evaluate(`[...document.querySelectorAll('button')].find((entry) => /Close atlas outline/i.test(entry.getAttribute('aria-label') || entry.textContent || ''))?.click()`);
    await waitForDom(client, `!document.querySelector('#atlas-outline-panel')`, "dense Atlas outline did not close");

    const canvas = await client.evaluate(`(() => {
      const pane = document.querySelector('.react-flow__pane'); const rect = pane?.getBoundingClientRect();
      if (!pane || !rect) return null;
      for (let y = rect.top + 40; y < rect.bottom - 40; y += 40) for (let x = rect.left + 40; x < rect.right - 40; x += 40) if (document.elementFromPoint(x, y) === pane) return { x, y };
      return null;
    })()`);
    assert.ok(canvas, "dense Atlas left no direct-manipulation point on its pane");
    const beforeZoom = await client.evaluate("document.querySelector('.react-flow__viewport')?.style.transform");
    await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: canvas.x, y: canvas.y, deltaX: 0, deltaY: -720 });
    await waitForDom(client, `document.querySelector('.react-flow__viewport')?.style.transform !== ${JSON.stringify(beforeZoom)}`, "dense Atlas did not respond to direct semantic zoom");
    assert.equal(await client.evaluate("location.pathname"), "/");

    await client.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 640, deviceScaleFactor: 1.25, mobile: false });
    await client.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    const zoomed = await client.evaluate(`(() => {
      const visible = (element) => { if (!element) return false; const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight; };
      return {
        overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
        wall: visible(document.querySelector('.atlas-wall')),
        outline: visible(document.querySelector('.atlas-outline-toggle')),
        composer: visible(document.querySelector('.firm-app-composer textarea')),
        atlas: visible(document.querySelector('[data-venture-atlas]')),
      };
    })()`);
    assert.ok(zoomed.overflow <= 1, `125% browser zoom introduced ${zoomed.overflow}px horizontal overflow`);
    assert.deepEqual({ wall: zoomed.wall, outline: zoomed.outline, composer: zoomed.composer, atlas: zoomed.atlas }, { wall: true, outline: true, composer: true, atlas: true });
    await captureEvidence(client, "dense-atlas-legacy-scale-125-percent");

    await assertBasicAccessibility(client);
    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
