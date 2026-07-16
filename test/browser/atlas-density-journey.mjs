#!/usr/bin/env node

import assert from "node:assert/strict";
import { test } from "node:test";

import { createDenseAtlasPortfolioFixture, createEmptyAtlasFixture } from "../fixtures/atlas-fixtures.mjs";
import { bootFixture } from "./fixtures/browser-harness.mjs";
import {
  assertAtlasAccessibility,
  assertAtlasViewport,
  assertReducedMotionSettled,
  captureAtlasEvidence,
  clickButton,
  openAtlasFixture,
  setAtlasViewport,
  setBrowserZoom,
  waitForAtlas,
} from "./fixtures/atlas-browser-harness.mjs";

test("living venture atlas: an empty venture asks for intent without inventing architecture", async () => {
  const drover = await bootFixture(createEmptyAtlasFixture);
  const chrome = await openAtlasFixture(drover);
  try {
    const { client } = chrome;
    const ventureId = drover.fixture.venture.id;
    const state = await client.evaluate(`Promise.all([
      fetch('/api/ventures/${ventureId}/architecture/projection').then((response) => response.json()),
      Promise.resolve(document.body.textContent || ''),
    ]).then(([{ projection }, text]) => ({
      revision: projection.revision,
      elements: projection.elements.length,
      bets: projection.joins.bets.length,
      outcomes: projection.joins.outcomes.length,
      generatedProduct: /product loop|reusable capability|route to value|activating now/i.test(text),
      invitation: /What should change|Tell Drover what should change/i.test(text),
      directionComposer: Boolean(document.querySelector('.firm-app-composer textarea')),
      machinery: Boolean(document.querySelector('[data-atlas-machinery]')),
      returnBand: Boolean(document.querySelector('.atlas-return-band')),
    }))`);
    assert.deepEqual(state, {
      revision: 0,
      elements: 0,
      bets: 0,
      outcomes: 0,
      generatedProduct: false,
      invitation: true,
      directionComposer: true,
      machinery: false,
      returnBand: false,
    });
    await assertAtlasViewport(client, { width: 1920, height: 1080, reducedMotion: false });
    await assertAtlasAccessibility(client);
    await captureAtlasEvidence(client, "empty-atlas-1920x1080");
  } finally {
    await chrome.close();
    await drover.close();
  }
});

test("living venture atlas: dense architecture stays canvas-like across semantic and browser zoom", async () => {
  const drover = await bootFixture(createDenseAtlasPortfolioFixture);
  const chrome = await openAtlasFixture(drover);
  try {
    const { client } = chrome;
    const ventureId = drover.fixture.venture.id;
    await waitForAtlas(
      client,
      `fetch('/api/ventures/${ventureId}/architecture/projection').then((response) => response.json()).then(({ projection }) => projection.elements.length === 83)`,
      "dense architecture did not reach the atlas",
    );
    await waitForAtlas(client, `[...document.querySelectorAll('.atlas-element[data-kind="bet"]')].every((element) => Number(getComputedStyle(element).opacity) > 0)`, "orbit bets did not finish settling");
    const resting = await client.evaluate(`(() => ({
      altitude: document.querySelector('[data-venture-atlas]')?.dataset.atlasAltitude,
      semanticElements: document.querySelectorAll('.atlas-element[data-kind]').length,
      openConcepts: document.querySelectorAll('.atlas-element[data-kind="concept"]').length,
      detailedOpenStatements: document.querySelectorAll('.atlas-element[data-kind="concept"] .atlas-element-statement').length,
      permanentPanels: document.querySelectorAll('.atlas-inspector, [data-atlas-inspector], [data-atlas-machinery]').length,
      nodeKinds: [...new Set([...document.querySelectorAll('.atlas-element[data-kind]')].map((entry) => entry.dataset.kind))],
      structuralLegibility: Object.fromEntries(['product-loop', 'system', 'motion', 'campaign'].map((kind) => {
        const element = document.querySelector('.atlas-element[data-kind="' + kind + '"]');
        const title = element?.querySelector('strong');
        // Placement is engine-owned and fitView frames the whole field, so the on-screen rect scales
        // with camera zoom (zoom-responsive reading is the design). Structural legibility is the card's
        // intrinsic, un-zoomed size — offsetWidth/Height — which proves the engine did not shrink the card.
        return [kind, element ? { width: element.offsetWidth, height: element.offsetHeight, fontSize: parseFloat(getComputedStyle(title).fontSize) } : null];
      })),
      consequenceLegibility: Object.fromEntries(['bet', 'work', 'outcome'].map((kind) => {
        const element = document.querySelector('.atlas-element[data-kind="' + kind + '"]');
        // The effort card is the composite .effort: its content title is a span (.e-title), not a
        // <strong>. Other kinds keep their <strong> title. Fall back to whichever this kind renders.
        const title = element?.querySelector('.e-title, strong');
        const style = element ? getComputedStyle(element) : null;
        // Structural title size (un-zoomed): fitView frames the whole engine-placed field, so on-screen
        // size scales with camera zoom (zoom-responsive reading is the design). The intrinsic title size
        // proves the bet stays legibly built; interactivity (opacity/pointer-events) is zoom-independent.
        return [kind, element ? {
          opacity: Number(style.opacity),
          pointerEvents: style.pointerEvents,
          structuralTitleSize: parseFloat(getComputedStyle(title).fontSize),
        } : null];
      })),
      wallVisible: (() => {
        const wall = document.querySelector('.react-flow__node[data-id="atlas:wall"]');
        const style = wall ? getComputedStyle(wall) : null;
        return Boolean(wall && Number(style.opacity) > 0 && style.pointerEvents !== 'none');
      })(),
      camera: document.querySelector('.react-flow__viewport')?.style.transform,
    }))()`);
    assert.equal(resting.altitude, "venture");
    assert.equal(resting.semanticElements >= 83, true, "dense projection lost durable architecture elements");
    assert.equal(resting.openConcepts, 75, "dense atlas must preserve open concepts in the projection/DOM even when it quiets them");
    assert.equal(resting.detailedOpenStatements, 0, "far altitude rendered paragraphs inside every open concept");
    assert.equal(resting.permanentPanels, 0);
    for (const kind of ["concept", "product-loop", "system", "motion", "campaign", "bet", "work", "outcome"]) {
      assert.ok(resting.nodeKinds.includes(kind), `dense atlas is missing ${kind}`);
    }
    assert.ok(resting.structuralLegibility["product-loop"].width >= 220, `dense default made product terrain illegible: ${JSON.stringify(resting.structuralLegibility["product-loop"])}`);
    assert.ok(resting.structuralLegibility.system.width >= 70, `dense default made systems illegible: ${JSON.stringify(resting.structuralLegibility.system)}`);
    assert.ok(resting.structuralLegibility.motion.width >= 110, `dense default made motions illegible: ${JSON.stringify(resting.structuralLegibility.motion)}`);
    assert.ok(resting.structuralLegibility.campaign.width >= 100, `dense default made campaign pressure illegible: ${JSON.stringify(resting.structuralLegibility.campaign)}`);
    assert.ok(Object.values(resting.structuralLegibility).every((entry) => entry.fontSize >= 11), `dense default dropped essential labels below 11px: ${JSON.stringify(resting.structuralLegibility)}`);
    assert.ok(resting.consequenceLegibility.bet.opacity > 0 && resting.consequenceLegibility.bet.pointerEvents !== "none", `dense default hid the efforts: ${JSON.stringify(resting.consequenceLegibility.bet)}`);
    assert.ok(resting.consequenceLegibility.bet.structuralTitleSize >= 11, `dense default made effort titles illegibly built: ${JSON.stringify(resting.consequenceLegibility.bet)}`);
    for (const kind of ["work", "outcome"]) {
      const entry = resting.consequenceLegibility[kind];
      assert.equal(entry.opacity, 0, `venture altitude did not quiet ${kind} detail behind the bet machinery/return summary: ${JSON.stringify(entry)}`);
      assert.equal(entry.pointerEvents, "none");
    }
    assert.equal(resting.wallVisible, true, "dense default hid the founder wall landmark");

    assert.equal(await clickButton(client, /Outline/i), true);
    await waitForAtlas(client, `document.querySelectorAll('#atlas-outline-panel [role="option"]').length >= 84`, "dense outline did not retain complete deterministic access");
    await waitForAtlas(client, `document.activeElement?.getAttribute('role') === 'option'`, "dense outline did not move keyboard focus to its first option");
    const outline = await client.evaluate(`(() => ({
      rows: document.querySelectorAll('#atlas-outline-panel [role="option"]').length,
      denseLast: [...document.querySelectorAll('#atlas-outline-panel [role="option"]')].some((row) => /Founder question 072/.test(row.textContent || '')),
      active: document.activeElement?.getAttribute('role'),
    }))()`);
    assert.ok(outline.rows >= 84);
    assert.equal(outline.denseLast, true);
    assert.equal(outline.active, "option");
    assert.equal(await clickButton(client, /Close atlas outline/i), true);

    const canvas = await client.evaluate(`(() => { const rect = document.querySelector('.atlas-canvas').getBoundingClientRect(); return { x: rect.left + rect.width * 0.62, y: rect.top + rect.height * 0.5 }; })()`);
    let transform = await client.evaluate("document.querySelector('.react-flow__viewport')?.style.transform");
    for (const [delta, altitude] of [[-360, "architecture"], [-480, "detail"], [480, "broader"]]) {
      const began = Date.now();
      await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: canvas.x, y: canvas.y, deltaX: 0, deltaY: delta });
      await waitForAtlas(client, `document.querySelector('.react-flow__viewport')?.style.transform !== ${JSON.stringify(transform)}`, `dense canvas did not respond to ${altitude} zoom`);
      assert.ok(Date.now() - began < 1_000, `dense ${altitude} zoom took too long to acknowledge direct input`);
      transform = await client.evaluate("document.querySelector('.react-flow__viewport')?.style.transform");
    }
    assert.equal(await clickButton(client, /Whole venture/i), true);
    await waitForAtlas(client, `document.querySelector('[data-venture-atlas]')?.dataset.atlasAltitude === 'venture'`, "dense canvas did not return to venture altitude");
    await captureAtlasEvidence(client, "dense-atlas-venture-altitude-1920x1080");

    assert.equal(await clickButton(client, /Hide conversation/i), true);
    await waitForAtlas(client, `Boolean(document.querySelector('.atlas-return-band'))`, "collapsing the detailed briefing did not reveal its compact Atlas summary");
    for (const percent of [80, 100, 125, 150, 200]) {
      await setBrowserZoom(client, { percent });
      const expectedWidth = Math.round(1920 / (percent / 100));
      const expectedHeight = Math.round(1080 / (percent / 100));
      await waitForAtlas(client, `innerWidth === ${expectedWidth} && innerHeight === ${expectedHeight}`, `${percent}% browser zoom did not settle`);
      const reachability = await client.evaluate(`(() => {
        const visible = (element) => {
          if (!element) return false;
          const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && Number(style.opacity) > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };
        return {
          atlas: visible(document.querySelector('[data-venture-atlas]')),
          conversationControl: [...document.querySelectorAll('button')].some((button) => /Open conversation/i.test(button.textContent || '') && visible(button)),
          outline: visible(document.querySelector('.atlas-outline-toggle')),
          wall: Boolean(document.querySelector('.atlas-wall')),
          needsYou: Boolean(document.querySelector('.atlas-wall[data-active="true"]')),
          returnedReality: visible(document.querySelector('.atlas-return-outcome')),
          canvas: visible(document.querySelector('.atlas-canvas')),
          overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
        };
      })()`);
      assert.equal(reachability.atlas, true, `${percent}% lost the atlas`);
      assert.equal(reachability.conversationControl, true, `${percent}% lost the route back to direction and conversation`);
      assert.equal(reachability.outline, true, `${percent}% lost deterministic outline access`);
      assert.equal(reachability.wall, true, `${percent}% lost the founder wall`);
      assert.equal(reachability.needsYou, true, `${percent}% hid Needs you before lower-priority return context`);
      assert.equal(reachability.returnedReality, true, `${percent}% hid Reality returned before lower-priority return context`);
      assert.equal(reachability.canvas, true, `${percent}% lost the canvas`);
      assert.ok(reachability.overflow <= 1, `${percent}% browser zoom introduced ${reachability.overflow}px page overflow`);
      await captureAtlasEvidence(client, `dense-atlas-browser-zoom-${percent}-percent`);
    }

    await setBrowserZoom(client, { percent: 100 });
    assert.equal(await clickButton(client, /Open conversation/i), true);
    await waitForAtlas(client, `Boolean(document.querySelector('.firm-app-composer textarea')) && !document.querySelector('.atlas-return-band')`, "restoring the detailed briefing did not remove the duplicate compact summary");
    await setAtlasViewport(client, { width: 1280, height: 800, reducedMotion: true });
    await assertAtlasViewport(client, { width: 1280, height: 800, reducedMotion: true });
    await assertReducedMotionSettled(client);
    await captureAtlasEvidence(client, "dense-atlas-1280x800-reduced-motion");
    await assertAtlasAccessibility(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});

test("living venture atlas: card detail responds to zoom continuously, with no mode chrome (contract §3)", async () => {
  const drover = await bootFixture(createDenseAtlasPortfolioFixture);
  const chrome = await openAtlasFixture(drover);
  try {
    const { client } = chrome;
    // Wait for the effort cards to settle on the stage — they are the workhorse zoom-responsive card.
    await waitForAtlas(client, `[...document.querySelectorAll('.atlas-effort')].some((card) => card.dataset.expanded !== 'true')`, "no resting effort card reached the stage");

    // No named-altitude switcher / mode selector exists anywhere — §3 cut them. Density is a rendering
    // function of zoom, not a navigable state, so there is no control to change it.
    const modeChrome = await client.evaluate(`Boolean(document.querySelector('[data-altitude-switcher], .atlas-altitude-switcher, .atlas-mode-selector, [data-atlas-mode-selector]'))`);
    assert.equal(modeChrome, false, "a named-altitude switcher / mode selector leaked onto the stage (contract §3 cut it)");

    const restingCard = `[...document.querySelectorAll('.atlas-effort')].find((card) => card.dataset.expanded !== 'true')`;
    // The card renders at the shipping-default density at rest, and its footer is present (standard).
    const resting = await client.evaluate(`(() => {
      const card = ${restingCard};
      const foot = card?.querySelector('.e-foot');
      return { canvasDensity: document.querySelector('.atlas-canvas')?.dataset.atlasDensity, cardDensity: card?.dataset.density, footShown: Boolean(foot) && getComputedStyle(foot).display !== 'none' };
    })()`);
    assert.ok(["standard", "editorial", "detailed"].includes(resting.cardDensity), "the effort card did not carry a live zoom-density tier");
    assert.equal(resting.cardDensity, resting.canvasDensity, "the card density and the live canvas density disagreed at rest");

    // Zoom in (ctrl+wheel = the pinch-zoom seam React Flow drives) over the pane: card detail re-details
    // continuously — the live canvas density and the card both reach `detailed`, and the footer shows.
    const pane = await client.evaluate(`(() => { const rect = document.querySelector('.react-flow__pane').getBoundingClientRect(); return { x: Math.round(rect.left + 20), y: Math.round(rect.top + 20) }; })()`);
    for (let i = 0; i < 26; i += 1) {
      await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: pane.x, y: pane.y, deltaX: 0, deltaY: -100, modifiers: 2 });
    }
    await waitForAtlas(client, `document.querySelector('.atlas-canvas')?.dataset.atlasDensity === 'detailed'`, "zooming in did not re-detail the field (live density never reached detailed)");
    const detailed = await client.evaluate(`(() => {
      const card = ${restingCard};
      if (!card) return null;
      const foot = card.querySelector('.e-foot');
      const title = card.querySelector('.e-title');
      return { cardDensity: card.dataset.density, titleShown: Boolean(title) && getComputedStyle(title).display !== 'none', footShown: Boolean(foot) && getComputedStyle(foot).display !== 'none' };
    })()`);
    assert.ok(detailed, "no resting effort card was available at detailed zoom");
    assert.equal(detailed.cardDensity, "detailed", "the effort card did not re-detail when zoomed in");
    assert.equal(detailed.titleShown, true, "detailed zoom hid the effort title");
    assert.equal(detailed.footShown, true, "the effort footer stayed hidden at detailed zoom");

    // Selection forces full detail regardless of zoom (contract §3: "selecting an effort expands it").
    // Zoom back out toward the resting fit, then select the effort — it must still read at full detail
    // (density detailed, footer shown) even though the resting zoom tier is not detailed. This proves
    // selection overrides the zoom-density tier rather than the founder having to zoom in to read it.
    for (let i = 0; i < 30; i += 1) {
      await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: pane.x, y: pane.y, deltaX: 0, deltaY: 100, modifiers: 2 });
    }
    await waitForAtlas(client, `document.querySelector('.atlas-canvas')?.dataset.atlasDensity !== 'detailed'`, "the field never eased back below detailed density");
    await client.evaluate(`(() => { const card = ${restingCard}; card?.querySelector('.atlas-effort-card')?.click(); return true; })()`);
    await waitForAtlas(client, `[...document.querySelectorAll('.atlas-effort')].some((card) => card.dataset.expanded === 'true')`, "selecting an effort did not expand it");
    const focused = await client.evaluate(`(() => {
      const selected = document.querySelector('.atlas-effort[data-expanded="true"]');
      const f = selected?.querySelector('.e-foot');
      return {
        canvasDensity: document.querySelector('.atlas-canvas')?.dataset.atlasDensity,
        selectedDensity: selected?.dataset.density,
        selectedFootShown: Boolean(f) && getComputedStyle(f).display !== 'none',
        selectedPresent: selected ? Number(getComputedStyle(selected).opacity) > 0 : false,
      };
    })()`);
    assert.notEqual(focused.canvasDensity, "detailed", "the field did not ease back below detailed before selection — the override is untested");
    assert.equal(focused.selectedDensity, "detailed", "a selected effort must read at full detail regardless of the zoom-density tier");
    assert.equal(focused.selectedFootShown, true, "the selected effort did not show its footer at full detail");
    assert.equal(focused.selectedPresent, true, "the selected effort receded to invisible instead of expanding");

    await captureAtlasEvidence(client, "zoom-responsive-density-1920x1080");
    await assertAtlasAccessibility(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
