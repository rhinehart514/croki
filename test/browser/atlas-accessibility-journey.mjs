#!/usr/bin/env node

import assert from "node:assert/strict";
import { test } from "node:test";

import { recordWorkingTheory } from "../../brain/src/firm/architecture-proposals.mjs";
import { createAtlasPortfolioFixture } from "../fixtures/atlas-fixtures.mjs";
import {
  assertAxeNoCritical,
  bootFixture,
  waitForDom,
} from "./fixtures/browser-harness.mjs";
import {
  assertReducedMotionSettled,
  assertVisibleKeyboardFocus,
  captureAtlasEvidence,
  collectKeyboardTabOrder,
  focusKeyboardTarget,
  focusedKeyboardTarget,
  openAtlasFixture,
  pressKeyboardKey,
} from "./fixtures/atlas-browser-harness.mjs";

const VENTURE_ID = "fixture-buffalo-projects";
const BET_SCENE_ID = "bet:buffalo-bet-project-first";
const WORK_SCENE_ID = "work:buffalo-work-project-drop-v1";

function createAccessibilityFixture(options = {}) {
  const fixture = createAtlasPortfolioFixture(options);
  const conversationRef = `conversation:${VENTURE_ID}-conversation-001`;
  const { theory } = recordWorkingTheory({
    ventureId: VENTURE_ID,
    baseRevision: 7,
    intent: "Builders may reach credible opportunity faster by beginning with useful work.",
    operations: [
      { op: "upsert-subject", id: "direction", value: { name: "Useful work first", statement: "The venture should begin with useful work instead of profile setup." } },
      { op: "upsert-subject", id: "buyer", value: { name: "Builders with live projects", statement: "Builders with work already in motion may be the first people helped." } },
      { op: "upsert-subject", id: "first-value", value: { name: "A credible project invitation", statement: "A concrete invitation may create the first useful exchange." } },
      { op: "upsert-relationship", id: "direction-reaches-buyer", value: { fromRef: "theory:direction", toRef: "theory:buyer", label: "may help" } },
      { op: "upsert-relationship", id: "buyer-reaches-value", value: { fromRef: "theory:buyer", toRef: "theory:first-value", label: "may reach value through" } },
    ],
    anchors: [
      { subjectRef: "theory:direction", sourceRefs: [conversationRef] },
      { subjectRef: "theory:buyer", sourceRefs: [conversationRef] },
      { subjectRef: "theory:first-value", sourceRefs: [`work:${WORK_SCENE_ID.slice("work:".length)}`] },
    ],
    conversationRefs: [conversationRef],
    proposedBy: { authority: "agent", id: "accessibility-fixture" },
  }, { root: options.root });
  return { ...fixture, theory };
}

async function resetKeyboardOrigin(client) {
  await client.evaluate(`(() => {
    document.activeElement?.blur?.();
    document.body.focus({ preventScroll: true });
  })()`);
}

async function waitForWorkingTheory(client) {
  await waitForDom(
    client,
    `Boolean(document.querySelector('[data-working-theory="true"] .react-flow__node[data-id="theory:buyer"]')) || document.getElementById('root')?.childElementCount === 0`,
    "the seeded working theory did not settle on the Atlas",
  );
  assert.equal(
    await client.evaluate(`Boolean(document.querySelector('[data-working-theory="true"] .react-flow__node[data-id="theory:buyer"]'))`),
    true,
    "the seeded working theory crashed before its current-read nodes rendered",
  );
}

async function openFixtureWithKeyboard(drover, { reducedMotion = false } = {}) {
  const chrome = await openAtlasFixture(drover, { openVenture: false, width: 1920, height: 1080, reducedMotion });
  const { client } = chrome;
  assert.deepEqual(await client.evaluate(`({ width: innerWidth, height: innerHeight })`), { width: 1920, height: 1080 });
  await assertAxeNoCritical(client, { context: "document.querySelector('.firm-app-picker')", label: "venture picker opening" });
  await pressKeyboardKey(client, "Tab");
  const pickerTarget = await focusedKeyboardTarget(client);
  assert.match(pickerTarget.name, /Buffalo Projects/i, `the first picker focus target must open the first venture: ${JSON.stringify(pickerTarget)}`);
  await assertVisibleKeyboardFocus(client, "venture picker");
  const runtimeExceptions = [];
  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    runtimeExceptions.push(exceptionDetails?.exception?.description || exceptionDetails?.text || "unknown browser exception");
  });
  await pressKeyboardKey(client, "Enter");
  await waitForDom(
    client,
    `Boolean(document.querySelector('[data-venture-atlas], .venture-atlas')) || document.getElementById('root')?.childElementCount === 0`,
    "keyboard Enter did not open the venture atlas",
  );
  assert.equal(
    await client.evaluate(`Boolean(document.querySelector('[data-venture-atlas], .venture-atlas'))`),
    true,
    `opening the seeded working theory crashed before Atlas rendered: ${runtimeExceptions.join(" | ")}`,
  );
  await waitForWorkingTheory(client);
  return chrome;
}

function assertSceneReadingOrder(tabOrder) {
  const edgeStops = tabOrder.filter((entry) => entry.edgeId).map((entry) => entry.edgeId);
  assert.deepEqual(edgeStops, [], `canvas edges must not become keyboard stops: ${JSON.stringify(edgeStops)}`);
  const sceneStops = tabOrder.filter((entry) => entry.sceneId).map((entry) => entry.sceneId);
  assert.deepEqual(sceneStops, [...new Set(sceneStops)], `each canvas object needs one focus owner: ${JSON.stringify(sceneStops)}`);
  const directionIndex = tabOrder.findIndex((entry) => entry.id === "firm-direction-composer");
  const firstSceneIndex = tabOrder.findIndex((entry) => entry.sceneId);
  assert.ok(directionIndex >= 0 && directionIndex < firstSceneIndex, `chrome direction control must precede canvas traversal: ${JSON.stringify(tabOrder)}`);
  const landmarks = ["theory:direction", "theory:buyer", "theory:first-value", WORK_SCENE_ID];
  const indexes = landmarks.map((id) => sceneStops.indexOf(id));
  assert.ok(indexes.every((index) => index >= 0), `keyboard order omitted direction, current read, or exact work: ${JSON.stringify({ landmarks, sceneStops })}`);
  assert.deepEqual(indexes, [...indexes].sort((left, right) => left - right), `canvas reading order must be direction → theory → exact work: ${JSON.stringify({ landmarks, sceneStops })}`);
}

test("WT6 keyboard journey: picker to exact consequence and one-layer return", async () => {
  const drover = await bootFixture(createAccessibilityFixture);
  const chrome = await openFixtureWithKeyboard(drover);
  try {
    const { client } = chrome;
    await assertAxeNoCritical(client, { context: "document.querySelector('[data-venture-atlas], .venture-atlas')", label: "working theory atlas" });
    await captureAtlasEvidence(client, "working-theory-opening-1920x1080");

    const tabOrder = await collectKeyboardTabOrder(client);
    assertSceneReadingOrder(tabOrder);

    await resetKeyboardOrigin(client);
    const betOwner = await focusKeyboardTarget(
      client,
      (target) => target.sceneId === BET_SCENE_ID,
      "the exact work direction was not reachable from the keyboard order",
    );
    assert.equal(betOwner.edgeId, null);
    await assertVisibleKeyboardFocus(client, "exact work direction");
    await pressKeyboardKey(client, "Enter");
    await client.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    const unfolded = await client.evaluate(`(() => {
      const node = document.querySelector('.react-flow__node[data-id=${JSON.stringify(BET_SCENE_ID)}]');
      return {
        expanded: node?.querySelector('.atlas-bet-node')?.getAttribute('data-expanded'),
        pressed: node?.querySelector('.atlas-bet-summary')?.getAttribute('aria-pressed'),
        activeClass: document.activeElement?.className?.baseVal || document.activeElement?.className || '',
      };
    })()`);
    assert.equal(unfolded.expanded, "true", `Enter on the bet's first focus owner did not unfold exact work: ${JSON.stringify(unfolded)}`);

    await focusKeyboardTarget(client, (target) => /Inspect this work/i.test(target.name), "the unfolded work has no named keyboard Dive action");
    await pressKeyboardKey(client, "Enter");
    await waitForDom(client, `Boolean(document.querySelector('.atlas-dive'))`, "the named nested action did not enter Dive");
    assert.equal(await client.evaluate(`document.querySelector('.atlas-dive')?.contains(document.activeElement) || false`), true, "Dive entry must move focus into Dive");
    await assertAxeNoCritical(client, { context: "document.querySelector('.atlas-dive')", label: "Dive" });
    await captureAtlasEvidence(client, "working-theory-dive-1920x1080");
    assert.equal(await client.evaluate(`Boolean(document.querySelector('.atlas-dive [role="dialog"]'))`), false, "Dive must not open a consequence inspector before its named gate action");

    await focusKeyboardTarget(client, (target) => /Inspect held act/i.test(target.name), "the held consequence has no named keyboard inspector action");
    await pressKeyboardKey(client, "Enter");
    await waitForDom(client, `Boolean(document.querySelector('.atlas-dive [role="dialog"][aria-modal="true"]'))`, "keyboard Enter did not open the exact consequence inspector");
    await assertAxeNoCritical(client, { context: "document.querySelector('.atlas-dive [role=\"dialog\"]')", label: "exact consequence inspector" });
    await captureAtlasEvidence(client, "working-theory-consequence-1920x1080");

    const initialInspectorFocus = await client.evaluate(`(() => {
      const dialog = document.querySelector('.atlas-dive [role="dialog"]');
      const controls = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((entry) => !entry.disabled);
      return { inside: dialog.contains(document.activeElement), activeIndex: controls.indexOf(document.activeElement), count: controls.length };
    })()`);
    assert.ok(initialInspectorFocus.count >= 3, "consequence inspector must expose close, Review, and Hold controls");
    assert.deepEqual({ inside: initialInspectorFocus.inside, activeIndex: initialInspectorFocus.activeIndex }, { inside: true, activeIndex: 0 }, "inspector open must focus its first actionable control");
    await pressKeyboardKey(client, "Tab", { shift: true });
    assert.equal(await client.evaluate(`(() => { const dialog = document.querySelector('.atlas-dive [role="dialog"]'); const controls = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((entry) => !entry.disabled); return controls.indexOf(document.activeElement) === controls.length - 1; })()`), true, "Shift+Tab from the first inspector control must wrap to the last");
    await pressKeyboardKey(client, "Tab");
    assert.equal(await client.evaluate(`(() => { const dialog = document.querySelector('.atlas-dive [role="dialog"]'); const controls = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((entry) => !entry.disabled); return controls.indexOf(document.activeElement) === 0; })()`), true, "Tab from the last inspector control must wrap to the first");

    await pressKeyboardKey(client, "Escape");
    await waitForDom(client, `!document.querySelector('.atlas-dive [role="dialog"]')`, "first Escape did not close the consequence inspector");
    assert.equal(await client.evaluate(`Boolean(document.querySelector('.atlas-dive'))`), true, "first Escape must close only the inspector");
    assert.equal(await client.evaluate(`document.activeElement?.matches('.atlas-dive-gate-action') || false`), true, "closing the inspector must restore its exact gate trigger");

    await pressKeyboardKey(client, "Escape");
    await waitForDom(client, `Boolean(document.querySelector('[data-venture-atlas], .venture-atlas')) && !document.querySelector('.atlas-dive')`, "second Escape did not return one altitude to Orbit");
    await waitForDom(
      client,
      `document.activeElement?.closest?.('[data-scene-id]')?.getAttribute('data-scene-id') === ${JSON.stringify(BET_SCENE_ID)}`,
      "returning from Dive did not restore the originating work focus",
    );
    const returnedFocus = await focusedKeyboardTarget(client);
    assert.equal(returnedFocus.sceneId, BET_SCENE_ID, `returning from Dive must restore the originating work: ${JSON.stringify(returnedFocus)}`);
    await assertAxeNoCritical(client, { context: "document.querySelector('[data-venture-atlas], .venture-atlas')", label: "returned Orbit" });
  } finally {
    await chrome.close();
    await drover.close();
  }
});

test("WT6 correction surface is keyboard-reachable and axe-clean", async () => {
  const drover = await bootFixture(createAccessibilityFixture);
  const chrome = await openFixtureWithKeyboard(drover);
  try {
    const { client } = chrome;
    await resetKeyboardOrigin(client);
    await focusKeyboardTarget(client, (target) => target.sceneId === "theory:buyer", "the current read was not keyboard reachable");
    await pressKeyboardKey(client, "Enter");
    await focusKeyboardTarget(client, (target) => /^Correct this$/i.test(target.name), "the selected provisional read has no named keyboard correction action");
    await pressKeyboardKey(client, "Enter");
    await waitForDom(client, `document.activeElement?.id === 'firm-direction-composer'`, "the correction action did not move focus to the correction composer");
    await assertVisibleKeyboardFocus(client, "working theory correction composer");
    await assertAxeNoCritical(client, { context: "document.querySelector('.firm-app-composer')", label: "working theory correction" });
    await captureAtlasEvidence(client, "working-theory-correction-1920x1080");
  } finally {
    await chrome.close();
    await drover.close();
  }
});

test("WT6 reduced motion settles on Orbit, correction, Dive, and consequence surfaces", async () => {
  const drover = await bootFixture(createAccessibilityFixture);
  const chrome = await openAtlasFixture(drover, { width: 1920, height: 1080, reducedMotion: true });
  try {
    const { client } = chrome;
    await waitForWorkingTheory(client);
    await assertReducedMotionSettled(client, { context: "document.querySelector('[data-venture-atlas], .venture-atlas')", label: "Orbit" });

    await client.evaluate(`document.querySelector('.react-flow__node[data-id="theory:buyer"] .atlas-element-main')?.click()`);
    await waitForDom(client, `Boolean([...document.querySelectorAll('button')].find((entry) => /^Correct this$/i.test((entry.textContent || '').trim())))`, "the reduced-motion correction action did not render");
    await client.evaluate(`[...document.querySelectorAll('button')].find((entry) => /^Correct this$/i.test((entry.textContent || '').trim()))?.click()`);
    await assertReducedMotionSettled(client, { context: "document.querySelector('.firm-app-composer')", label: "correction" });
    await assertAxeNoCritical(client, { context: "document.querySelector('.firm-app-composer')", label: "reduced-motion correction" });

    await client.evaluate(`document.querySelector('.react-flow__node[data-id=${JSON.stringify(BET_SCENE_ID)}] .atlas-bet-summary')?.click()`);
    await waitForDom(client, `Boolean([...document.querySelectorAll('button')].find((entry) => /Inspect this work/i.test(entry.textContent || '')))`, "the reduced-motion Dive action did not render");
    await client.evaluate(`[...document.querySelectorAll('button')].find((entry) => /Inspect this work/i.test(entry.textContent || ''))?.click()`);
    await waitForDom(client, `Boolean(document.querySelector('.atlas-dive'))`, "reduced-motion Dive did not render");
    await client.evaluate(`document.querySelector('.atlas-dive [aria-label="Close gate inspector"]')?.click()`);
    await assertReducedMotionSettled(client, { context: "document.querySelector('.atlas-dive')", label: "Dive" });
    await assertAxeNoCritical(client, { context: "document.querySelector('.atlas-dive')", label: "reduced-motion Dive" });

    await client.evaluate(`document.querySelector('.atlas-dive-gate-action')?.click()`);
    await waitForDom(client, `Boolean(document.querySelector('.atlas-dive [role="dialog"]'))`, "reduced-motion consequence inspector did not render");
    await assertReducedMotionSettled(client, { context: "document.querySelector('.atlas-dive [role=\"dialog\"]')", label: "consequence inspector" });
    await assertAxeNoCritical(client, { context: "document.querySelector('.atlas-dive [role=\"dialog\"]')", label: "reduced-motion consequence inspector" });
  } finally {
    await chrome.close();
    await drover.close();
  }
});
