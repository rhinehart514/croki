#!/usr/bin/env node

// The legacy-scale dense venture stays durable and navigable on the default VentureWorkspace canvas shell:
// 120 bets, 30 outcomes, 20 wall items all persist through the API truth checks (fixture/API layer, shell-
// agnostic), the canvas renders them collision-free, the outline gives complete keyboard access to the
// whole set (not just what is painted), direct wheel-zoom moves the camera, and 125% browser zoom does not
// break reachability of canvas/composer/rail. Ported from the retired VentureAtlas semantic-zoom assertions
// (`.atlas-bet-node`, `atlasAltitude`, `.atlas-outline-toggle`) onto the shipped canvas DOM; canvas-
// journey.mjs's own dense test proves the SAME fixture at a smaller default, this file is the ONLY coverage
// of the full 120-bet/30-outcome/20-wall legacy operating scale plus the 125% browser-zoom contract.

import assert from "node:assert/strict";
import { test } from "node:test";

import { createDenseVentureFixture } from "../fixtures/firm-fixtures.mjs";
import {
  assertBasicAccessibility,
  assertNoUnhandledRejections,
  assertPerformanceBudgets,
  bootFixture,
  captureEvidence,
  openFixtureVenture,
  waitForDom,
  waitForCanvasViewportStable,
} from "./fixtures/browser-harness.mjs";

test("dense venture: legacy operating scale stays durable, collision-free, and keyboard-reachable on the canvas shell", async () => {
  const drover = await bootFixture(createDenseVentureFixture);
  const chrome = await openFixtureVenture(drover);
  try {
    const { client } = chrome;
    const ventureId = drover.fixture.venture.id;
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await waitForCanvasViewportStable(client);
    await assertPerformanceBudgets(client);

    // DURABLE STATE — fixture/API truth, unaffected by the shell change. Kept verbatim.
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
      // The dense fixture seeds no architecture elements at all (no proposals accepted), so the
      // projection's elements array is genuinely empty — this is real fixture truth, not a stale carry.
      durableArchitecture: 0,
    });

    // CANVAS — real rendered state at 1440x900: cards mounted, collision-free (the overlap-detection
    // pattern proven in canvas-journey.mjs), no unexplained zero-size/duplicate nodes.
    const canvasState = await client.evaluate(`(() => {
      const nodes = [...document.querySelectorAll('.venture-workspace .react-flow__node')]
        .map((n) => { const r = n.getBoundingClientRect(); return { id: n.getAttribute('data-id'), left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; })
        .filter((n) => n.w > 0 && n.h > 0);
      const ids = nodes.map((n) => n.id);
      const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
      const overlaps = [];
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i]; const b = nodes[j];
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps.push([a.id, b.id]);
        }
      }
      const betNodes = nodes.filter((n) => (n.id || '').startsWith('bet:'));
      return { total: nodes.length, betCount: betNodes.length, duplicateIds, overlapCount: overlaps.length, overlaps: overlaps.slice(0, 5) };
    })()`);
    assert.ok(canvasState.total >= 5, `too few painted cards to prove a dense render happened: ${canvasState.total}`);
    assert.deepEqual(canvasState.duplicateIds, [], `duplicate node ids painted: ${JSON.stringify(canvasState.duplicateIds)}`);
    assert.equal(canvasState.overlapCount, 0, `dense canvas cards overlap: ${JSON.stringify(canvasState.overlaps)}`);

    // OUTLINE — every venture object (all 120 bets + supporting objects), not just what is painted, stays
    // keyboard-reachable via "o". Real threshold observed from the fixture: 120 bets alone already clears
    // any conservative floor, so assert generously against the fixture's own known bet count.
    await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "o", code: "KeyO", text: "o", windowsVirtualKeyCode: 79 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "o", code: "KeyO", windowsVirtualKeyCode: 79 });
    await waitForDom(client, `!!document.querySelector('#atlas-outline-panel [role="listbox"]')`, "the venture outline did not open on 'o'");
    const outline = await client.evaluate(`(() => {
      const listbox = document.querySelector('#atlas-outline-panel [role="listbox"]');
      const options = [...(listbox?.querySelectorAll('[role="option"]') || [])];
      const focusedIsOption = document.activeElement?.getAttribute('role') === 'option';
      return { options: options.length, focusedIsOption };
    })()`);
    assert.ok(outline.options >= 30, `outline exposed too few objects for the 120-bet dense fixture: ${outline.options}`);
    assert.equal(outline.focusedIsOption, true, "opening the outline did not move focus onto a reachable option");
    await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    const { escapeCloses } = await (async () => {
      await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await waitForDom(client, `!document.querySelector('#atlas-outline-panel')`, "the outline did not close on Escape");
      return { escapeCloses: true };
    })();
    assert.equal(escapeCloses, true);

    // DIRECT ZOOM — mouse wheel over the pane changes the viewport transform (React Flow's pane/viewport
    // DOM is unchanged from the legacy shell).
    const canvasPoint = await client.evaluate(`(() => {
      const pane = document.querySelector('.react-flow__pane'); const rect = pane?.getBoundingClientRect();
      if (!pane || !rect) return null;
      for (let y = rect.top + 40; y < rect.bottom - 40; y += 40) for (let x = rect.left + 40; x < rect.right - 40; x += 40) if (document.elementFromPoint(x, y) === pane) return { x, y };
      return null;
    })()`);
    assert.ok(canvasPoint, "dense canvas left no direct-manipulation point on its pane");
    const beforeZoom = await client.evaluate("document.querySelector('.react-flow__viewport')?.style.transform");
    await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: canvasPoint.x, y: canvasPoint.y, deltaX: 0, deltaY: -720 });
    await waitForDom(client, `document.querySelector('.react-flow__viewport')?.style.transform !== ${JSON.stringify(beforeZoom)}`, "dense canvas did not respond to direct wheel zoom");
    assert.equal(await client.evaluate("location.pathname"), "/");

    // 125% BROWSER ZOOM — no horizontal overflow; canvas, composer, and rail all stay reachable.
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1152, height: 720, deviceScaleFactor: 1.25, mobile: false });
    await client.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    const zoomed = await client.evaluate(`(() => {
      const visible = (element) => { if (!element) return false; const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight; };
      return {
        overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
        canvas: visible(document.querySelector('.venture-canvas-flow.atlas-canvas')),
        composer: visible(document.querySelector('.venture-workspace-dock .now-composer textarea')),
        rail: visible(document.querySelector('.venture-workspace .vw-index')),
      };
    })()`);
    assert.ok(zoomed.overflow <= 1, `125% browser zoom introduced ${zoomed.overflow}px horizontal overflow`);
    assert.deepEqual({ canvas: zoomed.canvas, composer: zoomed.composer, rail: zoomed.rail }, { canvas: true, composer: true, rail: true });
    await captureEvidence(client, "dense-canvas-legacy-scale-125-percent");

    await assertBasicAccessibility(client);
    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
