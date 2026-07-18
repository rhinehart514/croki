#!/usr/bin/env node

// The retired VentureAtlas semantic-zoom surface (named altitude tiers, `.atlas-element`/`.atlas-effort`
// discrete zoom-density tiers, `.atlas-canvas[data-atlas-density]`) is gone. The default center is the
// workbench; openAtlasFixture intentionally summons VentureCanvasStage for this map-specific journey. That
// summoned map has NO discrete density-tier concept at all (grepped for `data-density` /
// `data-atlas-density` anywhere under ui/src/components/canvas: zero hits). Canvas cards render
// continuously, not through named tiers, so the structural-legibility-by-tier and selection-forces-full-
// detail assertions have no home on the summoned map and are dropped, not faked.
//
// TEST A ("empty venture asks for intent without inventing architecture") is DROPPED as its own test here:
// `createEmptyAtlasFixture` (empty venture, 0 elements/bets/outcomes) and `createEmptyCanvasVentureFixture`
// are functionally identical shapes (a fresh venture with nothing seeded), and canvas-journey.mjs's
// "default workspace empty venture reads as named geography with first-direction affordances" test already
// proves the modern equivalent claim (VentureHome present at rest, 0 bet cards after summoning the map,
// dock composer offers first-direction chips) against that shape. Porting it again here would be a
// pure duplicate assertion, not new coverage.
//
// TEST C ("card detail responds to zoom continuously, with no mode chrome") is DROPPED as its own test:
// its core claim (continuous zoom-density re-detailing, selection-forces-full-detail) has no canvas analog
// per the grep above, and its one surviving claim (no named-altitude switcher / mode selector exists) is
// too thin to justify its own browser-boot test — it is folded into Test B below as one extra assertion.
//
// TEST B ("dense architecture stays canvas-like across zoom") is PORTED: openAtlasFixture summons the map,
// then outline access at dense scale, direct wheel-zoom moving the camera, and 5-tier browser zoom
// (80/100/125/150/200%) preserve reachability of map/composer/outline/rail with no horizontal overflow.

import assert from "node:assert/strict";
import { test } from "node:test";

import { createDenseAtlasPortfolioFixture } from "../fixtures/atlas-fixtures.mjs";
import { bootFixture, waitForDom } from "./fixtures/browser-harness.mjs";
import { openAtlasFixture, setBrowserZoom } from "./fixtures/atlas-browser-harness.mjs";

test("venture workspace: dense architecture stays canvas-like and keyboard/zoom-reachable, with no mode-switcher chrome", async () => {
  const drover = await bootFixture(createDenseAtlasPortfolioFixture);
  const chrome = await openAtlasFixture(drover, { width: 1920, height: 1080 });
  try {
    const { client } = chrome;
    const ventureId = drover.fixture.venture.id;
    await waitForDom(
      client,
      `fetch('/api/ventures/${ventureId}/architecture/projection').then((response) => response.json()).then(({ projection }) => projection.elements.length === 83)`,
      "dense architecture did not reach the workspace",
    );
    await waitForDom(client, `!!document.querySelector('.venture-workspace .venture-canvas-flow.atlas-canvas')`, "canvas did not mount");

    // NO MODE CHROME — folded from the retired Test C: no named-altitude switcher / mode selector exists
    // anywhere on the summoned map (density is not a navigable state at all here).
    const modeChrome = await client.evaluate(`Boolean(document.querySelector('[data-altitude-switcher], .atlas-altitude-switcher, .atlas-mode-selector, [data-atlas-mode-selector]'))`);
    assert.equal(modeChrome, false, "a named-altitude switcher / mode selector leaked onto the summoned map");

    // OUTLINE — deterministic keyboard access to the full 83-element dense set.
    await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "o", code: "KeyO", text: "o", windowsVirtualKeyCode: 79 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "o", code: "KeyO", windowsVirtualKeyCode: 79 });
    await waitForDom(client, `!!document.querySelector('#atlas-outline-panel [role="listbox"]')`, "the outline did not open on 'o'");
    const outline = await client.evaluate(`(() => {
      const listbox = document.querySelector('#atlas-outline-panel [role="listbox"]');
      const options = [...(listbox?.querySelectorAll('[role="option"]') || [])];
      return { count: options.length, focusedIsOption: document.activeElement?.getAttribute('role') === 'option' };
    })()`);
    assert.ok(outline.count >= 30, `dense outline exposed too few objects for an 83-element dense fixture: ${outline.count}`);
    assert.equal(outline.focusedIsOption, true, "opening the outline did not move focus onto a reachable option");
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitForDom(client, `!document.querySelector('#atlas-outline-panel')`, "the outline did not close on Escape");

    // DIRECT WHEEL ZOOM — the pane responds to direct semantic/browser zoom by moving the camera.
    const canvasPoint = await client.evaluate(`(() => {
      const pane = document.querySelector('.react-flow__pane'); const rect = pane?.getBoundingClientRect();
      if (!pane || !rect) return null;
      for (let y = rect.top + 40; y < rect.bottom - 40; y += 40) for (let x = rect.left + 40; x < rect.right - 40; x += 40) if (document.elementFromPoint(x, y) === pane) return { x, y };
      return null;
    })()`);
    assert.ok(canvasPoint, "dense canvas left no direct-manipulation point on its pane");
    let transform = await client.evaluate("document.querySelector('.react-flow__viewport')?.style.transform");
    for (const delta of [-360, -480, 480]) {
      const began = Date.now();
      await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: canvasPoint.x, y: canvasPoint.y, deltaX: 0, deltaY: delta });
      await waitForDom(client, `document.querySelector('.react-flow__viewport')?.style.transform !== ${JSON.stringify(transform)}`, `dense canvas did not respond to a ${delta} wheel zoom`);
      assert.ok(Date.now() - began < 1_000, `dense zoom took too long to acknowledge direct input`);
      transform = await client.evaluate("document.querySelector('.react-flow__viewport')?.style.transform");
    }

    // 5-TIER BROWSER ZOOM — canvas/composer/rail/outline stay reachable, no horizontal overflow, at each tier.
    for (const percent of [80, 100, 125, 150, 200]) {
      await setBrowserZoom(client, { percent });
      const expectedWidth = Math.round(1920 / (percent / 100));
      const expectedHeight = Math.round(1080 / (percent / 100));
      await waitForDom(client, `innerWidth === ${expectedWidth} && innerHeight === ${expectedHeight}`, `${percent}% browser zoom did not settle`);
      const reachability = await client.evaluate(`(() => {
        const visible = (element) => {
          if (!element) return false;
          const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && Number(style.opacity) > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };
        return {
          canvas: visible(document.querySelector('.venture-canvas-flow.atlas-canvas')),
          composer: visible(document.querySelector('.venture-workspace-dock .now-composer textarea')),
          rail: visible(document.querySelector('.venture-workspace .vw-index')),
          overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
        };
      })()`);
      assert.equal(reachability.canvas, true, `${percent}% lost the canvas`);
      assert.equal(reachability.composer, true, `${percent}% lost the composer`);
      assert.equal(reachability.rail, true, `${percent}% lost the rail`);
      assert.ok(reachability.overflow <= 1, `${percent}% browser zoom introduced ${reachability.overflow}px page overflow`);
    }
    // The outline is still reachable after cycling browser zoom levels.
    await setBrowserZoom(client, { percent: 100 });
    await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "o", code: "KeyO", text: "o", windowsVirtualKeyCode: 79 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "o", code: "KeyO", windowsVirtualKeyCode: 79 });
    await waitForDom(client, `!!document.querySelector('#atlas-outline-panel [role="listbox"]')`, "the outline lost reachability after cycling browser zoom");
  } finally {
    await chrome.close();
    await drover.close();
  }
});
