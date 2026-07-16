#!/usr/bin/env node

import assert from "node:assert/strict";
import { test } from "node:test";

import { createAtlasPortfolioFixture } from "../fixtures/atlas-fixtures.mjs";
import { bootFixture, setNetworkOffline } from "./fixtures/browser-harness.mjs";
import {
  assertAtlasAccessibility,
  assertAtlasViewport,
  assertReducedMotionSettled,
  captureAtlasEvidence,
  clickButton,
  dragBy,
  openAtlasFixture,
  selectAtlasElement,
  setAtlasViewport,
  waitForAtlas,
} from "./fixtures/atlas-browser-harness.mjs";

function projectionExpression(ventureId, body) {
  return `fetch('/api/ventures/${ventureId}/architecture/projection')
    .then((response) => response.json())
    .then(({ projection }) => (${body}))`;
}

test("living venture atlas: open architecture operates the complete venture trace", async () => {
  const drover = await bootFixture(createAtlasPortfolioFixture);
  const chrome = await openAtlasFixture(drover);
  try {
    const { client } = chrome;
    const ventureId = drover.fixture.venture.id;
    const unrelatedVentureId = drover.fixture.unrelatedVenture.id;
    const pathAtOpen = await client.evaluate("location.pathname");

    await waitForAtlas(
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
    await waitForAtlas(client, `Boolean(document.querySelector('.atlas-element[data-kind="campaign"][data-active="true"]'))`, "opening atlas did not offer a clear active path");

    const orientation = await client.evaluate(`(() => {
      const text = document.body.textContent || '';
      const kinds = [...document.querySelectorAll('.atlas-element[data-kind]')].map((entry) => entry.dataset.kind);
      const activeCampaignText = document.querySelector('.atlas-element[data-kind="campaign"][data-active="true"]')?.textContent || '';
      return {
        intent: text.includes('Talented builders find the right people through credible work, not polished profiles.'),
        product: text.includes('Work becomes credible proof'),
        motions: text.includes('Project-first graduate entry') && text.includes('Flagship proof acquisition'),
        campaign: text.includes('First twenty project drops'),
        wall: text.includes('Needs your hand') && /1 outward act held for your decision/i.test(text),
        returned: text.includes('I described the project before I thought about making a profile.'),
        entry: activeCampaignText.includes('Start here') && activeCampaignText.includes('Follow to the release'),
        teammates: activeCampaignText.includes('Sable + Mara'),
        kinds: [...new Set(kinds)],
        machinery: Boolean(document.querySelector('[data-atlas-machinery]')),
        inspector: Boolean(document.querySelector('.atlas-inspector, [data-atlas-inspector]')),
      };
    })()`);
    assert.deepEqual(
      { intent: orientation.intent, product: orientation.product, motions: orientation.motions, campaign: orientation.campaign, wall: orientation.wall, returned: orientation.returned, entry: orientation.entry, teammates: orientation.teammates },
      { intent: true, product: true, motions: true, campaign: true, wall: true, returned: true, entry: true, teammates: true },
      "the opening composition must expose venture truth before machinery",
    );
    for (const kind of ["concept", "product-loop", "system", "motion", "campaign", "bet", "work", "outcome"]) {
      assert.ok(orientation.kinds.includes(kind), `opening atlas is missing ${kind} material`);
    }
    assert.equal(orientation.machinery, false);
    assert.equal(orientation.inspector, false);
    await assertAtlasViewport(client, { width: 1920, height: 1080, reducedMotion: false });
    await captureAtlasEvidence(client, "buffalo-opening-1920x1080");

    // One reusable system identity must visibly power several motions without duplicate nodes.
    const sharedNode = await client.evaluate(`(() => ({
      count: document.querySelectorAll('.react-flow__node[data-id="architecture:arch-buffalo-system-proof"]').length,
      powersEdges: document.querySelectorAll('.react-flow__edge[data-id^="powers:arch-buffalo-system-proof:"]').length,
    }))()`);
    assert.deepEqual(sharedNode, { count: 1, powersEdges: 3 });
    await selectAtlasElement(client, /Shared capability: Work record and proof/i);
    await waitForAtlas(client, `/Work record and proof/.test(document.querySelector('.firm-app-direction-target')?.textContent || '')`, "system selection did not target the continuous composer");
    assert.equal(await clickButton(client, /^Trace$/i), true);
    await waitForAtlas(client, `document.querySelector('.react-flow__node[data-id="architecture:arch-buffalo-system-proof"] .atlas-element')?.dataset.focusRole === 'focus'`, "shared system did not enter focus-to-trace");
    const focusedFrame = await client.evaluate(`(() => {
      const focus = document.querySelector('.react-flow__node[data-id="architecture:arch-buffalo-system-proof"]');
      const canvas = document.querySelector('.atlas-canvas');
      const focusRect = focus?.getBoundingClientRect(); const canvasRect = canvas?.getBoundingClientRect();
      return Boolean(focusRect && canvasRect && focusRect.right > canvasRect.left && focusRect.left < canvasRect.right && focusRect.bottom > canvasRect.top && focusRect.top < canvasRect.bottom);
    })()`);
    assert.equal(focusedFrame, true, "focus-to-trace did not keep its anchor in the canvas frame");
    assert.equal(await client.evaluate("location.pathname"), pathAtOpen, "focus must not replace the canvas with a noun route");
    assert.match(await client.evaluate("document.querySelector('[data-atlas-omissions]')?.textContent || ''"), /quiet|omitted|unrelated/i);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await waitForAtlas(client, `(() => {
      const target = document.querySelector('.react-flow__node[data-id="architecture:arch-buffalo-system-proof"]');
      const canvas = document.querySelector('.atlas-canvas');
      const targetRect = target?.getBoundingClientRect(); const canvasRect = canvas?.getBoundingClientRect();
      return !document.querySelector('[data-focus-role="focus"]') && Boolean(targetRect && canvasRect && targetRect.right > canvasRect.left && targetRect.left < canvasRect.right && targetRect.bottom > canvasRect.top && targetRect.top < canvasRect.bottom);
    })()`, "Escape did not broaden the trace back to its selected, visible target");

    // Campaign pressure expands into governing uncertainty, exact work, wall receipt, and return.
    await selectAtlasElement(client, /Work underway: First twenty project drops/i);
    assert.equal(await clickButton(client, /^Trace$/i), true);
    await waitForAtlas(client, `document.querySelector('.react-flow__node[data-id="architecture:arch-buffalo-campaign-first-drops"] .atlas-element')?.dataset.focusRole === 'focus'`, "campaign did not become the focus anchor");
    const trace = await client.evaluate(`(() => {
      const visible = (selector) => [...document.querySelectorAll(selector)].filter((element) => {
        const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
        return style.opacity !== '0' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      }).map((entry) => entry.textContent || '').join(' ');
      const text = visible('.react-flow__node');
      return {
        motion: text.includes('Project-first graduate entry'),
        campaign: text.includes('First twenty project drops'),
        bet: text.includes('Project drop converts better than profile creation'),
        release: text.includes('Project-drop invitation v1'),
        outcome: text.includes('I described the project before I thought about making a profile.'),
        joinedNotCaused: /joined through receipt|join · not causality|not a causal claim/i.test(text),
      };
    })()`);
    assert.deepEqual(trace, { motion: true, campaign: true, bet: true, release: true, outcome: true, joinedNotCaused: true });
    await captureAtlasEvidence(client, "buffalo-campaign-exact-trace-1920x1080");

    // The wall is the external boundary and remains the existing authority surface.
    assert.equal(await client.evaluate(`(() => {
      const wall = document.querySelector('[data-atlas-wall] .firm-lens-wall-band');
      wall?.click();
      return Boolean(wall);
    })()`), true);
    await waitForAtlas(client, `Boolean(document.querySelector('[aria-label="Founder wall decisions"], .firm-wall-review'))`, "atlas wall did not open the founder authority surface");
    assert.match(await client.evaluate("document.querySelector('[data-atlas-wall]')?.textContent || ''"), /Project-drop invitation v2|second-graduate@example.com/i);
    await captureAtlasEvidence(client, "buffalo-wall-exact-release-1920x1080");
    await client.evaluate(`document.querySelector('[data-atlas-wall] .firm-lens-wall-band')?.click()`);
    await waitForAtlas(client, `!document.querySelector('.firm-lens-wall-panel')`, "wall did not return to its closed boundary");
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await waitForAtlas(client, `!document.querySelector('[data-focus-role="focus"]')`, "campaign trace did not broaden before editing open architecture");

    // Open material stays untyped until the founder chooses an operational consequence.
    await selectAtlasElement(client, /Open thought: Referral engine/i);
    assert.equal(await clickButton(client, /Use in Drover/i), true);
    await waitForAtlas(client, `Boolean(document.querySelector('[role="dialog"][aria-label="Use this thought in Drover"]'))`, "promotion consequence preview did not open");
    assert.equal(await client.evaluate(`(() => {
      const button = [...document.querySelectorAll('[role="dialog"] .atlas-role-choices button')]
        .find((entry) => /^Reusable capability/i.test(entry.textContent || ''));
      button?.click();
      return Boolean(button);
    })()`), true);
    await waitForAtlas(client, projectionExpression(ventureId, `projection.elements.some((entry) => entry.id === 'arch-buffalo-referral-engine' && entry.role === 'system')`), "founder promotion did not become durable");
    await waitForAtlas(client, `/Architecture revision/.test(document.querySelector('.atlas-revision-receipt')?.textContent || '')`, "promotion did not expose a revision receipt");
    assert.equal(await client.evaluate(`document.querySelectorAll('.react-flow__node[data-id="architecture:arch-buffalo-referral-engine"]').length`), 1);
    await captureAtlasEvidence(client, "buffalo-founder-promotion-1920x1080");

    // Keyboard creation is form-light and Undo is a forward semantic revision.
    const revisionBeforeCreate = await client.evaluate(`fetch('/api/ventures/${ventureId}/architecture').then((response) => response.json()).then((body) => body.revision)`);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "n", code: "KeyN" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "n", code: "KeyN" });
    await waitForAtlas(client, `Boolean(document.querySelector('[aria-label="Create a venture thought"]'))`, "N did not open concept creation");
    await client.evaluate(`document.querySelector('input[aria-label="Thought name"]')?.focus()`);
    await client.send("Input.insertText", { text: "Builder alumni bridge" });
    assert.equal(await client.evaluate(`(() => {
      const button = [...document.querySelectorAll('[role="dialog"] button')]
        .find((entry) => /^Place thought$/i.test(entry.textContent || ''));
      button?.click();
      return Boolean(button);
    })()`), true);
    await waitForAtlas(client, projectionExpression(ventureId, `projection.elements.some((entry) => entry.name === 'Builder alumni bridge')`), "keyboard-created concept did not persist");
    await waitForAtlas(client, `(() => {
      const receipt = document.querySelector('.atlas-revision-receipt');
      return /Builder alumni bridge/i.test(receipt?.textContent || '')
        && Boolean([...receipt.querySelectorAll('button')].find((entry) => /^Undo$/i.test((entry.textContent || '').trim())));
    })()`, "keyboard-created concept did not replace the prior receipt with its own forward Undo");
    assert.equal(await clickButton(client, /Undo/i), true);
    try {
      await waitForAtlas(client, projectionExpression(ventureId, `!projection.elements.some((entry) => entry.name === 'Builder alumni bridge') && projection.revision >= ${revisionBeforeCreate + 2}`), "Undo did not create a forward revision that removed the concept");
    } catch (error) {
      const state = await client.evaluate(`Promise.all([
        fetch('/api/ventures/${ventureId}/architecture/projection').then((response) => response.json()),
        Promise.resolve({
          receipt: document.querySelector('.atlas-revision-receipt')?.textContent || null,
          mutationError: document.querySelector('[role="alert"]')?.textContent || null,
          rejections: window.__droverUnhandledRejections || [],
        }),
      ]).then(([{ projection }, ui]) => ({
        revision: projection.revision,
        conceptPresent: projection.elements.some((entry) => entry.name === 'Builder alumni bridge'),
        ...ui,
      }))`);
      throw new Error(`${error.message}: ${JSON.stringify(state)}`);
    }

    // Machinery appears only through explicit inspection.
    await selectAtlasElement(client, /How people may reach value: Project-first graduate entry/i);
    assert.equal(await client.evaluate("Boolean(document.querySelector('[data-atlas-machinery]'))"), false);
    assert.equal(await clickButton(client, /How this runs/i), true);
    await waitForAtlas(client, `Boolean(document.querySelector('[data-atlas-machinery]'))`, "explicit machinery receipt did not open");
    const machinery = await client.evaluate("document.querySelector('[data-atlas-machinery]')?.textContent || ''");
    assert.match(machinery, /Architecture[\s\S]*revision/i);
    assert.match(machinery, /Teammates[\s\S]*Sable[\s\S]*Mara/i);
    assert.match(machinery, /Runtime[\s\S]*work receipt/i);
    assert.match(machinery, /Outward effects wait for your review/i);
    await captureAtlasEvidence(client, "buffalo-machinery-explicit-1920x1080");
    assert.equal(await clickButton(client, /Hide execution details/i), true);

    // Outline parity preserves deterministic keyboard access without replacing the canvas.
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "o", code: "KeyO" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "o", code: "KeyO" });
    await waitForAtlas(client, `Boolean(document.querySelector('#atlas-outline-panel'))`, "O did not open the deterministic outline");
    const outline = await client.evaluate(`Promise.all([
      fetch('/api/ventures/${ventureId}/architecture/projection').then((response) => response.json()),
      Promise.resolve([...document.querySelectorAll('#atlas-outline-panel [role="option"]')].map((entry) => entry.textContent || '')),
    ]).then(([{ projection }, rows]) => ({
      expected: projection.outline.map((entry) => entry.name),
      rows,
      active: document.activeElement?.getAttribute('role'),
      atlasMounted: Boolean(document.querySelector('[data-venture-atlas]')),
    }))`);
    assert.ok(outline.expected.every((name) => outline.rows.some((row) => row.includes(name))), "outline omitted architecture objects");
    assert.equal(outline.active, "option");
    assert.equal(outline.atlasMounted, true, "outline must not route away from the canvas");
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowDown", code: "ArrowDown" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowDown", code: "ArrowDown" });
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter" });
    assert.equal(await client.evaluate("location.pathname"), pathAtOpen);
    assert.equal(await clickButton(client, /Close atlas outline/i), true);

    // Continuous pan/zoom changes presentation only; architecture meaning remains stable.
    const architectureRevisionBeforeCamera = await client.evaluate(`fetch('/api/ventures/${ventureId}/architecture').then((response) => response.json()).then((body) => body.revision)`);
    const cameraBeforePan = await client.evaluate("document.querySelector('.react-flow__viewport')?.style.transform");
    await dragBy(client, ".react-flow__pane", 96, 48);
    await waitForAtlas(client, `document.querySelector('.react-flow__viewport')?.style.transform !== ${JSON.stringify(cameraBeforePan)}`, "canvas did not pan on first drag");
    const cameraAfterPan = await client.evaluate("document.querySelector('.react-flow__viewport')?.style.transform");
    const canvasRect = await client.evaluate(`(() => { const rect = document.querySelector('.atlas-canvas')?.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`);
    await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: canvasRect.x, y: canvasRect.y, deltaX: 0, deltaY: -480 });
    await waitForAtlas(client, `document.querySelector('.react-flow__viewport')?.style.transform !== ${JSON.stringify(cameraAfterPan)}`, "canvas did not zoom continuously");
    assert.equal(await client.evaluate("location.pathname"), pathAtOpen);

    assert.equal(await clickButton(client, /Whole venture/i), true);
    await waitForAtlas(client, `(() => { const rect = document.querySelector('.react-flow__node[data-id="architecture:arch-buffalo-system-proof"]')?.getBoundingClientRect(); return Boolean(rect && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight); })()`, "whole-venture fit did not return the shared system before placement");
    assert.equal(await client.evaluate(`fetch('/api/ventures/${ventureId}/architecture').then((response) => response.json()).then((body) => body.revision)`), architectureRevisionBeforeCamera, "camera movement must not mutate semantic architecture");

    await setAtlasViewport(client, { width: 1280, height: 800, reducedMotion: true });
    await assertAtlasViewport(client, { width: 1280, height: 800, reducedMotion: true });
    await assertReducedMotionSettled(client);
    await captureAtlasEvidence(client, "buffalo-1280x800-reduced-motion");

    // Switching ventures replaces the isolation context but not the interaction model.
    assert.equal(await clickButton(client, /Ventures/i), true);
    await waitForAtlas(client, `/Continue a venture/i.test(document.body.textContent)`, "venture picker did not return");
    assert.equal(await clickButton(client, /DenialShield/i), true);
    await waitForAtlas(client, `/Dental practices prevent avoidable insurance denials/.test(document.body.textContent)`, "DenialShield atlas did not open");
    const portability = await client.evaluate(`Promise.all([
      fetch('/api/ventures/${unrelatedVentureId}/architecture/projection').then((response) => response.json()),
      Promise.resolve(document.body.textContent || ''),
    ]).then(([{ projection }, text]) => ({
      roles: [...new Set(projection.elements.map((entry) => entry.role))].sort(),
      preflightCount: projection.elements.filter((entry) => entry.id === 'arch-denial-system-preflight').length,
      sharedBy: projection.elements.filter((entry) => entry.role === 'motion' && entry.systemIds.includes('arch-denial-system-preflight')).length,
      buffaloLeak: /Builder intake|Project-first graduate entry|Buffalo Projects/.test(text),
      dental: /Claim preflight|Self-serve denial preflight|Consultant-led denial recovery/.test(text),
    }))`);
    assert.deepEqual(portability.roles, ["campaign", "motion", "product-loop", "system"]);
    assert.equal(portability.preflightCount, 1);
    assert.equal(portability.sharedBy, 2);
    assert.equal(portability.buffaloLeak, false);
    assert.equal(portability.dental, true);
    await assertAtlasViewport(client, { width: 1280, height: 800, reducedMotion: true });
    await captureAtlasEvidence(client, "denialshield-1280x800-reduced-motion");

    // A disconnected external source cannot erase the last coherent local atlas.
    await setNetworkOffline(client, true);
    await waitForAtlas(client, `Boolean(document.querySelector('[data-venture-atlas], .venture-atlas'))`, "offline state removed the last coherent atlas");
    assert.equal(await client.evaluate(`Boolean(document.querySelector('[data-venture-atlas], .venture-atlas'))`), true);
    await captureAtlasEvidence(client, "denialshield-offline-last-coherent-atlas");
    await setNetworkOffline(client, false);
    await assertAtlasAccessibility(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
