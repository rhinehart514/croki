#!/usr/bin/env node

// The retired VentureAtlas shell (semantic-zoom altitude, focus-to-trace glow, promotion dialogs, keyboard
// concept creation, an explicit machinery panel, Dive) is GONE. VentureWorkspace now rests on its adaptive
// workbench and summons VentureCanvasStage only for map work. Grepping the reachable component tree confirms:
// `ArchitectureElement`'s "Use in Drover" and "How this runs" buttons still render on canvas
// architecture cards (the component is reused for its node visuals), but the canvas feeds them through
// `atlasInertData()`, which wires `onPromote` and `onRevealMachinery` to `() => undefined` — genuinely dead
// clicks on the summoned map. Dive is explicitly superseded by the workbench descent.
// Keyboard `n`-to-create-concept has no listener anywhere in canvas/workspace. So promotion, machinery, and
// Dive assertions are DROPPED, not faked. What DOES survive and is ported here: the architecture-projection
// API truth (revision/elements/roles/joins/pressure — untouched by the shell), the shared-system-powers-
// multiple-motions dedup check (architecture: elements DO render as canvas nodes, confirmed in
// VentureCanvasStage.tsx), the outline's deterministic keyboard access (the projection's own `outline`
// field), cross-venture isolation via NowRail's real `.now-rail-venture-btn` switcher (a live, reachable
// mechanism, and the one assertion here canvas-journey.mjs's single-venture tests cannot cover), and offline
// last-coherent-view honesty (canvas-journey.mjs's proven pattern).

import assert from "node:assert/strict";
import { test } from "node:test";

import { createAtlasPortfolioFixture } from "../fixtures/atlas-fixtures.mjs";
import { bootFixture, setNetworkOffline, summonMap, waitForDom } from "./fixtures/browser-harness.mjs";
import { openAtlasFixture } from "./fixtures/atlas-browser-harness.mjs";

function projectionExpression(ventureId, body) {
  return `fetch('/api/ventures/${ventureId}/architecture/projection')
    .then((response) => response.json())
    .then(({ projection }) => (${body}))`;
}

test("venture workspace: architecture truth stays durable, portable across ventures, keyboard-reachable, and offline-honest", async () => {
  const drover = await bootFixture(createAtlasPortfolioFixture);
  const chrome = await openAtlasFixture(drover, { width: 1440, height: 900 });
  try {
    const { client } = chrome;
    const ventureId = drover.fixture.venture.id;
    const unrelatedVentureId = drover.fixture.unrelatedVenture.id;

    // DURABLE ARCHITECTURE STATE — revision/elements/roles/joins/pressure. Untouched by the shell change.
    await waitForDom(
      client,
      projectionExpression(ventureId, `projection.revision === 7 && projection.elements.length === 11`),
      "Buffalo architecture projection did not settle",
    );
    const durable = await client.evaluate(`fetch('/api/ventures/${ventureId}/architecture/projection')
      .then((response) => response.json())
      .then(({ projection }) => ({
        revision: projection.revision,
        roles: Object.fromEntries(['concept', 'product-loop', 'system', 'motion', 'campaign'].map((role) => [role, projection.elements.filter((entry) => entry.role === role).length])),
        sharedSystemMotions: projection.elements.filter((entry) => entry.role === 'motion' && entry.systemIds.includes('arch-buffalo-system-proof')).map((entry) => entry.id).sort(),
        work: projection.joins.work.map((entry) => entry.id).sort(),
        released: projection.joins.wall.filter((entry) => entry.decision === 'release').length,
        held: projection.joins.wall.filter((entry) => entry.decision == null).length,
        outcome: projection.joins.outcomes.map((entry) => ({ id: entry.id, level: entry.join.level, causal: entry.join.causal })),
        pressure: projection.pressure.map((entry) => entry.reason),
      }))`);
    assert.deepEqual(durable.roles, { concept: 3, "product-loop": 1, system: 3, motion: 3, campaign: 1 });
    assert.deepEqual(durable.sharedSystemMotions, [
      "arch-buffalo-motion-flagship",
      "arch-buffalo-motion-graduate",
      "arch-buffalo-motion-institutional",
    ]);
    assert.deepEqual(durable.work, ["buffalo-work-project-drop-v1", "buffalo-work-project-drop-v2"]);
    assert.equal(durable.released, 1);
    assert.equal(durable.held, 1);
    assert.deepEqual(durable.outcome, [{ id: "buffalo-outcome-project-drop", level: "exact", causal: false }]);
    assert.ok(durable.pressure.includes("held-release"));

    // SHARED-SYSTEM DEDUP — one reusable system identity powers several motions without a duplicate DOM
    // node. architecture: elements DO render as nodes after the map is summoned (VentureCanvasStage.tsx
    // resolves "architecture:" ids into targets), so this claim survives.
    await waitForDom(client, `!!document.querySelector('.venture-workspace .venture-canvas-flow.atlas-canvas')`, "canvas did not mount");
    const sharedNode = await client.evaluate(`document.querySelectorAll('.react-flow__node[data-id="architecture:arch-buffalo-system-proof"]').length`);
    assert.equal(sharedNode, 1, "the shared system identity rendered more than one canvas node");

    // OUTLINE — deterministic keyboard access lists every projected architecture object (the projection's
    // own `outline` field), not just what is painted.
    await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "o", code: "KeyO", text: "o", windowsVirtualKeyCode: 79 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "o", code: "KeyO", windowsVirtualKeyCode: 79 });
    await waitForDom(client, `!!document.querySelector('#atlas-outline-panel [role="listbox"]')`, "the venture outline did not open on 'o'");
    const outline = await client.evaluate(`Promise.all([
      fetch('/api/ventures/${ventureId}/architecture/projection').then((response) => response.json()),
      Promise.resolve([...document.querySelectorAll('#atlas-outline-panel [role="option"]')].map((entry) => entry.textContent || '')),
    ]).then(([{ projection }, rows]) => ({
      expected: projection.outline.map((entry) => entry.name),
      rows,
      active: document.activeElement?.getAttribute('role'),
      canvasMounted: Boolean(document.querySelector('.venture-workspace .venture-canvas-flow.atlas-canvas')),
    }))`);
    assert.ok(outline.expected.length > 0, "the projection's own outline field was empty — nothing to prove reachability against");
    assert.ok(outline.expected.every((name) => outline.rows.some((row) => row.includes(name))), "outline omitted architecture objects");
    assert.equal(outline.active, "option");
    assert.equal(outline.canvasMounted, true, "outline must not route away from the canvas");
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitForDom(client, `!document.querySelector('#atlas-outline-panel')`, "the outline did not close on Escape");

    // CROSS-VENTURE ISOLATION / PORTABILITY — a founder-authority-adjacent claim canvas-journey.mjs cannot
    // cover (its tests open one venture only). Switch via the real .now-rail-venture-btn menu.
    const openedMenu = await client.evaluate(`(() => { const button = document.querySelector('.now-rail-venture-btn'); button?.click(); return Boolean(button) && !button.disabled; })()`);
    assert.equal(openedMenu, true, "the venture switcher was not reachable or had no other venture to switch to");
    await waitForDom(client, `!!document.querySelector('.now-rail-venture-menu')`, "the venture switcher menu did not open");
    const switchedVenture = await client.evaluate(`(() => {
      const option = [...document.querySelectorAll('.now-rail-venture-menu button')].find((entry) => /DenialShield/i.test(entry.textContent || ''));
      option?.click();
      return Boolean(option);
    })()`);
    assert.equal(switchedVenture, true, "DenialShield was not offered in the venture switcher");
    await waitForDom(
      client,
      `!!document.querySelector('.venture-workspace[data-mode="work"] [data-testid="venture-workbench"][data-mode="work"]')`,
      "DenialShield did not open on its venture workbench",
    );
    const switchedRestingSurface = await client.evaluate(`(() => ({
      workbench: Boolean(document.querySelector('.venture-workspace[data-mode="work"] [data-testid="venture-workbench"][data-mode="work"]')),
      map: Boolean(document.querySelector('.venture-workspace .venture-canvas-flow.atlas-canvas')),
    }))()`);
    assert.equal(switchedRestingSurface.workbench, true, "DenialShield's workbench was not mounted at rest");
    assert.equal(switchedRestingSurface.map, false, "DenialShield opened on the map instead of its workbench");
    await summonMap(client);
    await waitForDom(
      client,
      projectionExpression(unrelatedVentureId, `projection.elements.length > 0`),
      "DenialShield's architecture projection did not settle",
    );
    const portability = await client.evaluate(`Promise.all([
      fetch('/api/ventures/${unrelatedVentureId}/architecture/projection').then((response) => response.json()),
      Promise.resolve(document.body.textContent || ''),
    ]).then(([{ projection }, text]) => ({
      roles: [...new Set(projection.elements.map((entry) => entry.role))].sort(),
      preflightCount: projection.elements.filter((entry) => entry.id === 'arch-denial-system-preflight').length,
      sharedBy: projection.elements.filter((entry) => entry.role === 'motion' && entry.systemIds.includes('arch-denial-system-preflight')).length,
      buffaloLeak: /Builder intake|Project-first graduate entry|Buffalo Projects/.test(text),
    }))`);
    assert.deepEqual(portability.roles, ["campaign", "motion", "product-loop", "system"]);
    assert.equal(portability.preflightCount, 1);
    assert.equal(portability.sharedBy, 2);
    assert.equal(portability.buffaloLeak, false, "the prior venture's content leaked into the newly opened venture's workspace");

    // OFFLINE — a disconnected external source cannot erase the last coherent workspace (canvas-
    // journey.mjs's proven pattern).
    const cardsBefore = await client.evaluate(`document.querySelectorAll('.venture-workspace .react-flow__node').length`);
    assert.ok(cardsBefore >= 1, "expected a populated canvas before going offline");
    await setNetworkOffline(client, true);
    await client.evaluate(`window.dispatchEvent(new Event('offline'))`);
    await waitForDom(
      client,
      `/Offline|Reconnecting/i.test(document.querySelector('.venture-workspace-freshness .firm-freshness')?.textContent || '')`,
      "offline/stale freshness chip never appeared",
    );
    const offline = await client.evaluate(`(() => ({
      canvasStillMounted: Boolean(document.querySelector('.venture-workspace .venture-canvas-flow.atlas-canvas')),
      cards: document.querySelectorAll('.venture-workspace .react-flow__node').length,
    }))()`);
    assert.ok(offline.canvasStillMounted, "the canvas unmounted when the connection dropped");
    assert.ok(offline.cards >= 1, "the last coherent cards disappeared when offline instead of holding");
    await setNetworkOffline(client, false);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
