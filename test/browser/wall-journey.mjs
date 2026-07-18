#!/usr/bin/env node

// Founder authority, in context: every wall purpose (release/answer/review-outcome/end-bet) can be
// resolved once through its workbench-native decision gate, leaves a durable receipt, and cannot double-
// fire on repeated activation. The "Needs you" signal counts down as each distinct direction settles, the
// workbench returns Home between decisions, and the clear/safe state survives a full reload. The fixture
// ties each purpose to a different direction, selected by its unique founder-facing intent rather than an
// implementation id.

import assert from "node:assert/strict";
import { test } from "node:test";

import { getVentureDoc } from "../../brain/src/firm/venture-store.mjs";
import { createWallVentureFixture } from "../fixtures/firm-fixtures.mjs";
import {
  assertBasicAccessibility,
  assertNoUnhandledRejections,
  assertPerformanceBudgets,
  bootFixture,
  captureEvidence,
  openFixtureVenture,
  waitForDom,
} from "./fixtures/browser-harness.mjs";

// Select the exact founder-facing direction from workbench Home, falling back to the persistent rail if
// Home is not rendering direction rows. The intent must identify exactly one row on the chosen surface.
async function selectDirectionGate(client, intent) {
  const selected = await client.evaluate(`(() => {
    const intent = ${JSON.stringify(intent)};
    const homeRows = [...document.querySelectorAll('.vh-row')];
    const rows = homeRows.length ? homeRows : [...document.querySelectorAll('.now-rail-dir')];
    const matches = rows.filter((entry) => entry.textContent.includes(intent));
    if (matches.length !== 1) return { matches: matches.length };
    matches[0].click();
    return { matches: 1, clicked: true };
  })()`);
  assert.equal(selected.matches, 1, `direction intent was not unique: ${intent} (${JSON.stringify(selected)})`);
  assert.equal(selected.clicked, true, `direction intent was not selectable: ${intent}`);
  await waitForDom(
    client,
    `!!document.querySelector('[data-testid="venture-workbench"] [data-testid="stage-workspace"]') && !!document.querySelector('[data-testid="venture-workbench"] .now-gate') && !document.querySelector('.venture-workspace .venture-canvas-flow')`,
    `selecting ${intent} did not open its workbench decision gate`,
  );
}

async function returnToWorkbenchHome(client, settledIntent) {
  await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await waitForDom(
    client,
    `!!document.querySelector('[data-testid="venture-workbench"] .vh[aria-label]') && !document.querySelector('[data-testid="venture-workbench"] [data-testid="stage-workspace"]') && !document.querySelector('.venture-workspace .venture-canvas-flow') && !document.querySelector('.venture-workspace-dock .now-composer-scope') && document.querySelector('.venture-workspace-dock .now-composer textarea')?.getAttribute('placeholder') === 'Direct the venture'`,
    `one Escape did not return ${settledIntent} to unselected workbench Home`,
  );
}

const intents = {
  release: "Hold the exact private preview until the founder reviews it",
  answer: "Ask for the one constraint the repository cannot answer",
  reviewOutcome: "Learn from the attributable buyer reply",
  endBet: "End a disproven line only through the founder",
};

async function needsYouCount(client) {
  return client.evaluate(`(() => {
    const count = document.querySelector('.now-rail-needs-count');
    return count ? Number(count.textContent.trim()) : 0;
  })()`);
}

test("the wall: every purpose settles once in-context, leaves a receipt, and the needs-you signal clears and recovers", async () => {
  const drover = await bootFixture(createWallVentureFixture);
  const chrome = await openFixtureVenture(drover);
  try {
    const { client } = chrome;
    const ventureId = drover.fixture.venture.id;
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await waitForDom(
      client,
      `fetch('/api/ventures/${ventureId}/wall').then((response) => response.json()).then((wall) => wall.queue.length === 4)`,
      "four-purpose wall fixture did not seed four durable decisions",
    );
    await assertPerformanceBudgets(client);

    // The fixture's 4 wall items are tied to 4 DISTINCT bets, so needsYou (a per-direction count) reads 4.
    await waitForDom(client, `!!document.querySelector('.now-rail-needs-count')`, "needs-you count never appeared");
    assert.equal(await needsYouCount(client), 4, "initial needs-you count did not match the four-bet wall fixture");

    // Toggle "Needs you" — the rail filters to only needs-you directions.
    await client.evaluate(`document.querySelector('.now-rail-needs')?.click()`);
    await waitForDom(client, `document.querySelector('.now-rail-needs')?.getAttribute('aria-pressed') === 'true'`, "Needs you toggle did not press");
    const filteredStates = await client.evaluate(`[...document.querySelectorAll('.now-rail-dir')].map((entry) => entry.getAttribute('data-state'))`);
    assert.ok(filteredStates.length > 0, "Needs you filter left no directions visible");
    assert.ok(filteredStates.every((state) => state === "needs-you"), `Needs you filter leaked a non-needs-you direction: ${JSON.stringify(filteredStates)}`);

    // RELEASE — double-activation guard: click Reject twice rapidly and confirm exactly ONE POST to the
    // decide endpoint fires.
    await selectDirectionGate(client, intents.release);
    let releaseDecideRequests = 0;
    await client.send("Network.enable");
    client.on("Network.requestWillBeSent", ({ request }) => {
      if (request.method === "POST" && /\/wall\/wall-purpose-release\/decide$/.test(request.url)) releaseDecideRequests += 1;
    });
    const activatedTwice = await client.evaluate(`(() => {
      const button = document.querySelector('.now-gate-btn[data-intent="reject"]');
      if (!button) return false;
      button.click();
      button.click();
      return true;
    })()`);
    assert.equal(activatedTwice, true, "the release gate's Reject action was not available");
    await waitForDom(client, `(() => { const c = document.querySelector('.now-rail-needs-count'); return (c ? Number(c.textContent.trim()) : 0) === 3; })()`, "rejecting the release item did not settle the needs-you count to 3");
    assert.equal(releaseDecideRequests, 1, `double activation emitted ${releaseDecideRequests} wall decision requests instead of one`);

    await returnToWorkbenchHome(client, intents.release);

    // ANSWER — free-text input + Send answer.
    await selectDirectionGate(client, intents.answer);
    const answerSet = await client.evaluate(`(() => {
      const field = document.querySelector('input[aria-label="Your answer"]');
      if (!field) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify("Use the weekly handoff constraint; do not name a customer.")});
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    assert.equal(answerSet, true, "the answer gate's free-text input was not available");
    const sentAnswer = await client.evaluate(`(() => {
      const button = [...document.querySelectorAll('.now-gate-btn')].find((entry) => entry.textContent.trim() === 'Send answer');
      button?.click();
      return Boolean(button);
    })()`);
    assert.equal(sentAnswer, true, "Send answer was not available");
    await waitForDom(client, `(() => { const c = document.querySelector('.now-rail-needs-count'); return (c ? Number(c.textContent.trim()) : 0) === 2; })()`, "answering did not settle the needs-you count to 2");

    await returnToWorkbenchHome(client, intents.answer);

    // REVIEW-OUTCOME — acknowledge the attributable reply.
    await selectDirectionGate(client, intents.reviewOutcome);
    const acknowledged = await client.evaluate(`(() => {
      const button = [...document.querySelectorAll('.now-gate-btn')].find((entry) => entry.textContent.trim() === 'Acknowledge');
      button?.click();
      return Boolean(button);
    })()`);
    assert.equal(acknowledged, true, "Acknowledge was not available for the review-outcome gate");
    await waitForDom(client, `(() => { const c = document.querySelector('.now-rail-needs-count'); return (c ? Number(c.textContent.trim()) : 0) === 1; })()`, "acknowledging did not settle the needs-you count to 1");

    await returnToWorkbenchHome(client, intents.reviewOutcome);

    // END-BET — keep it going (not killed, preserving all four directions).
    await selectDirectionGate(client, intents.endBet);
    const keptGoing = await client.evaluate(`(() => {
      const button = [...document.querySelectorAll('.now-gate-btn')].find((entry) => entry.textContent.trim() === 'Keep it going');
      button?.click();
      return Boolean(button);
    })()`);
    assert.equal(keptGoing, true, "Keep it going was not available for the end-bet gate");

    await waitForDom(client, `!document.querySelector('.now-rail-needs-count')`, "needs-you count did not clear after all four decisions");
    await returnToWorkbenchHome(client, intents.endBet);

    // AFTER ALL FOUR — workbench Home is unselected, the map is absent, and the safe operating surface is
    // intact without an attention marker or exposed execution machinery.
    const clearState = await client.evaluate(`(() => ({
      workbenchVisible: Boolean(document.querySelector('[data-testid="venture-workbench"][data-mode="work"]')),
      homeVisible: Boolean(document.querySelector('[data-testid="venture-workbench"] .vh[aria-label]')),
      stageVisible: Boolean(document.querySelector('[data-testid="venture-workbench"] [data-testid="stage-workspace"]')),
      attention: document.querySelector('.now-rail-needs')?.getAttribute('data-attention'),
      composerVisible: document.querySelector('.venture-workspace-dock .now-composer textarea')?.getAttribute('placeholder') === 'Direct the venture',
      mapVisible: Boolean(document.querySelector('.venture-workspace .venture-canvas-flow')),
      machineryVisible: Boolean(document.querySelector('[data-atlas-machinery]')),
    }))()`);
    assert.equal(clearState.workbenchVisible, true, "workbench disappeared after settling the wall");
    assert.equal(clearState.homeVisible, true, "workbench Home did not return after settling the wall");
    assert.equal(clearState.stageVisible, false, "selected work remained open after settling the wall");
    assert.equal(clearState.attention, null, "Needs you retained an attention marker after clearing");
    assert.equal(clearState.composerVisible, true, "whole-venture composer disappeared after settling the wall");
    assert.equal(clearState.mapVisible, false, "the map mounted at rest after settling the wall");
    assert.equal(clearState.machineryVisible, false, "settling the wall must not expose execution machinery by default");

    // DURABLE RECEIPTS — brain-side truth, unaffected by the shell change.
    const receipts = Object.fromEntries(drover.fixture.wall.map((item) => [
      item.id,
      getVentureDoc(ventureId, "decisions", item.id, { root: drover.home }),
    ]));
    assert.equal(receipts["wall-purpose-release"].decision, "reject");
    assert.equal(receipts["wall-purpose-answer"].decision, "answer");
    assert.equal(receipts["wall-purpose-answer"].note, "Use the weekly handoff constraint; do not name a customer.");
    assert.equal(receipts["wall-purpose-review-outcome"].decision, "acknowledge");
    assert.equal(receipts["wall-purpose-end-bet"].decision, "keep");
    assert.ok(Object.values(receipts).every((receipt) => receipt.decidedAt && receipt.decidedBy), "every wall decision needs a durable receipt");

    // RELOAD RECOVERY — the clear/safe state survives a full reload; the wall API queue length is 0.
    await client.send("Page.reload", { ignoreCache: true });
    await waitForDom(client, `/Continue a venture/i.test(document.body.textContent)`, "venture picker did not return after receipt reload");
    assert.equal(await client.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((entry) => /Wall venture/.test(entry.textContent));
      button?.click();
      return Boolean(button);
    })()`), true);
    await waitForDom(client, `!!document.querySelector('.venture-workspace[data-mode="work"] [data-testid="venture-workbench"][data-mode="work"]')`, "wall venture did not reopen in workbench work mode");
    await waitForDom(client, `!!document.querySelector('[data-testid="venture-workbench"] .vh[aria-label]') && !document.querySelector('[data-testid="venture-workbench"] [data-testid="stage-workspace"]')`, "wall venture did not reopen at unselected workbench Home");
    await waitForDom(client, `!document.querySelector('.venture-workspace .venture-canvas-flow')`, "the map mounted at rest after receipt reload");
    await waitForDom(client, `!document.querySelector('.now-rail-needs-count') && document.querySelector('.now-rail-needs')?.getAttribute('data-attention') == null`, "needs-you attention did not stay clear after a full reload");
    await waitForDom(client, `fetch('/api/ventures/${ventureId}/wall').then((response) => response.json()).then((body) => body.queue.length === 0)`, "wall API queue did not stay empty after a full reload");

    await assertBasicAccessibility(client);
    await captureEvidence(client, "wall-clear-after-four-receipts");
    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
