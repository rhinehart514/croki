#!/usr/bin/env node

// Founder authority, in-context: every wall purpose (release/answer/review-outcome/end-bet) can be
// resolved once through the canvas shell's per-bet decision gate, leaves a durable receipt, a double-
// activation cannot double-fire the same decision, the "Needs you" signal correctly counts down as each
// distinct bet settles, and the clear/safe state survives a full reload. Ported from the retired
// VentureAtlas global wall-panel DOM (`.firm-wall-queue`, `[aria-label="Founder decisions"]`) onto
// NowRail's "Needs you" filter + a descended bet's `.now-gate` blocks (ConsequenceBody/DecisionGate,
// reused verbatim from the Now route). The wall fixture ties each of its 4 purposes to a DIFFERENT bet, so
// "4 wall items" = 4 distinct directions in the rail, each requiring its own descend to act on.

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

async function fireNode(client, id, kind) {
  const fired = await client.evaluate(`(() => {
    const node = document.querySelector('.react-flow__node[data-id=${JSON.stringify(id)}]');
    if (!node) return false;
    const r = node.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    node.dispatchEvent(new MouseEvent(${JSON.stringify(kind)}, opts));
    return true;
  })()`);
  assert.ok(fired, `node ${id} was not on screen to ${kind}`);
}

// Descend into a bet's decision gate via the rail: click the rail direction row (scopes composer), then
// double-click the same bet's canvas node (descends into the stage workspace's consequence body).
async function descendToGate(client, betId) {
  const clickedRailRow = await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('.now-rail-dir')]
      .find((entry) => entry.getAttribute('data-state') === 'needs-you');
    button?.click();
    return Boolean(button);
  })()`);
  assert.ok(clickedRailRow, "no needs-you rail direction to select");
  await fireNode(client, `bet:${betId}`, "dblclick");
  await waitForDom(client, `!!document.querySelector('.now-gate')`, `descending into ${betId} did not raise a decision gate`);
}

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

    // RELEASE — wall-purpose-release / wall-bet-release. Double-activation guard: click Reject twice
    // rapidly and confirm exactly ONE POST to the decide endpoint fires.
    await descendToGate(client, "wall-bet-release");
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

    // ANSWER — wall-purpose-answer / wall-bet-answer. Free-text input + Send answer.
    await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitForDom(client, `!document.querySelector('[data-testid="stage-workspace"]')`, "first Escape did not return from the release descent");
    await descendToGate(client, "wall-bet-answer");
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

    // REVIEW-OUTCOME — wall-purpose-review-outcome / wall-bet-outcome. Acknowledge.
    await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitForDom(client, `!document.querySelector('[data-testid="stage-workspace"]')`, "first Escape did not return from the answer descent");
    await descendToGate(client, "wall-bet-outcome");
    const acknowledged = await client.evaluate(`(() => {
      const button = [...document.querySelectorAll('.now-gate-btn')].find((entry) => entry.textContent.trim() === 'Acknowledge');
      button?.click();
      return Boolean(button);
    })()`);
    assert.equal(acknowledged, true, "Acknowledge was not available for the review-outcome gate");
    await waitForDom(client, `(() => { const c = document.querySelector('.now-rail-needs-count'); return (c ? Number(c.textContent.trim()) : 0) === 1; })()`, "acknowledging did not settle the needs-you count to 1");

    // END-BET — wall-purpose-end-bet / wall-bet-end. Keep it going (not killed — preserves "still 4 bets").
    await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitForDom(client, `!document.querySelector('[data-testid="stage-workspace"]')`, "first Escape did not return from the review-outcome descent");
    await descendToGate(client, "wall-bet-end");
    const keptGoing = await client.evaluate(`(() => {
      const button = [...document.querySelectorAll('.now-gate-btn')].find((entry) => entry.textContent.trim() === 'Keep it going');
      button?.click();
      return Boolean(button);
    })()`);
    assert.equal(keptGoing, true, "Keep it going was not available for the end-bet gate");

    // AFTER ALL FOUR — needs-you count/badge is gone, nothing crashed, composer + canvas still there.
    await waitForDom(client, `!document.querySelector('.now-rail-needs-count')`, "needs-you count did not clear after all four decisions");
    const clearState = await client.evaluate(`(() => ({
      attention: document.querySelector('.now-rail-needs')?.getAttribute('data-attention'),
      composerVisible: Boolean(document.querySelector('.venture-workspace-dock .now-composer textarea')),
      canvasVisible: Boolean(document.querySelector('.venture-workspace .venture-canvas-flow.atlas-canvas')),
      machineryVisible: Boolean(document.querySelector('[data-atlas-machinery]')),
    }))()`);
    assert.equal(clearState.attention, null, "Needs you retained an attention marker after clearing");
    assert.equal(clearState.composerVisible, true, "composer disappeared after settling the wall");
    assert.equal(clearState.canvasVisible, true, "canvas disappeared after settling the wall");
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
    await waitForDom(client, `!!document.querySelector('.venture-workspace .venture-canvas-flow.atlas-canvas')`, "wall venture did not reopen after reload");
    await waitForDom(client, `!document.querySelector('.now-rail-needs-count')`, "needs-you count did not stay clear after a full reload");
    assert.equal(await client.evaluate(`fetch('/api/ventures/${ventureId}/wall').then((response) => response.json()).then((body) => body.queue.length)`), 0);

    await assertBasicAccessibility(client);
    await captureEvidence(client, "wall-clear-after-four-receipts");
    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
