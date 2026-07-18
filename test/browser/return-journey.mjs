#!/usr/bin/env node

// On return from an overnight run, held work / market truth / continued work / needs-you are all coherent
// and correctly counted on the default canvas shell; a joined market return can be opened and traces to
// its canonical bet's direction; reviewing a decision gate elsewhere doesn't disturb the camera or target
// state; a draft survives going offline and reconnecting; offline holds composer dispatch and wall
// decisions. Ported from the retired `.firm-app-return` briefing panel (single global group headings) onto
// the distributed founder-truth surfaces the canvas shell actually renders: NowRail's "Needs you" count/
// filter (attention), directions with `data-state="from-market"` (market truth), a descended bet's
// `.now-gate` reassurance sentence (the modern "held safely" — see DecisionGate.tsx), and the offline
// pattern canvas-journey.mjs already proves.

import assert from "node:assert/strict";
import { test } from "node:test";

import { createOvernightVentureFixture } from "../fixtures/firm-fixtures.mjs";
import {
  assertNoUnhandledRejections,
  assertPerformanceBudgets,
  bootFixture,
  captureEvidence,
  openFixtureVenture,
  setNetworkOffline,
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

async function pressEscape(client) {
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
}

test("overnight return: held work, attributable proof, and offline recovery remain coherent on the canvas shell", async () => {
  const drover = await bootFixture(createOvernightVentureFixture);
  const chrome = await openFixtureVenture(drover);
  try {
    const { client } = chrome;
    const ventureId = drover.fixture.venture.id;
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await waitForDom(client, `!!document.querySelector('.venture-workspace .vw-index')`, "workspace index did not mount");
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
        staged: lens.bets.reduce((total, bet) => total + bet.stagedCount, 0),
        wall: wall.queue.map((item) => ({ purpose: item.purpose, decision: item.decision })),
        joined: projection.joins.outcomes.map((item) => ({ id: item.id, workRef: item.workRef, level: item.join.level, causal: item.join.causal })).sort((left, right) => left.id.localeCompare(right.id)),
      };
    })`);
    assert.deepEqual({ crew: durableState.crew, bets: durableState.bets, outcomes: durableState.outcomes, staged: durableState.staged }, { crew: 4, bets: 4, outcomes: 1, staged: 4 });
    assert.equal(durableState.wall.length, 3);
    assert.equal(durableState.wall.filter((item) => item.purpose === "release").length, 2);
    assert.ok(durableState.wall.every((item) => item.decision === null), "fixture must not release outward work");
    assert.deepEqual(durableState.joined, [
      { id: "overnight-outcome-joined", workRef: null, level: "unattributed", causal: false },
      { id: "overnight-outcome-unattributed", workRef: null, level: "unattributed", causal: false },
    ]);

    // ATTENTION — needsYou is a per-DIRECTION count (buildDirections in directionModel.ts), not a raw wall-
    // item count. The overnight fixture's 3 waiting wall items sit on 3 bets that are all fork-family
    // members of the same root (overnight-bet-evidence → message/counterexample/partial all forkedFrom
    // it), so buildDirections folds them into ONE direction: needsYou reads 1, not 3. The wall API truth
    // above already proved there are genuinely 3 undecided items; this proves the founder-facing rollup.
    await waitForDom(client, `!!document.querySelector('.now-rail-needs-count')`, "needs-you count never appeared");
    const needsYou = await client.evaluate(`Number(document.querySelector('.now-rail-needs-count')?.textContent.trim())`);
    assert.equal(needsYou, 1, "needs-you count did not match the overnight fixture's single fork-family direction");

    // MARKET TRUTH — the direction section for "The market answered" exists; a direction reads from-market.
    const marketSectionLabel = await client.evaluate(`[...document.querySelectorAll('.now-rail-group-label')].map((entry) => entry.textContent.trim())`);
    assert.ok(marketSectionLabel.some((label) => /market answered/i.test(label)), `no "The market answered" rail section: ${JSON.stringify(marketSectionLabel)}`);
    const fromMarketStates = await client.evaluate(`[...document.querySelectorAll('.now-rail-dir[data-state="from-market"]')].length`);
    assert.ok(fromMarketStates >= 1, "no rail direction read as from-market for the joined overnight return");

    // JOINED MARKET RETURN — descending into the bet that owns the joined outcome renders .now-returned
    // with the outcome body and the honest attribution line. That bet ALSO has a waiting release item, so
    // the default body is the decision gate (consequence); switch the contextual View to "Direction" to
    // reach the returned-reality block the same descended stage exposes.
    await fireNode(client, "bet:overnight-bet-message", "dblclick");
    await waitForDom(client, `!!document.querySelector('[data-testid="stage-workspace"]')`, "descending into the joined-return bet did not open the stage workspace");
    // The overnight fixture's bets are one fork family (all forkedFrom overnight-bet-evidence), so
    // buildDirections folds them into the ONE direction spined off the founder's opening message — not the
    // sub-bet's own intent sentence.
    const crumbTarget = await client.evaluate(`(() => {
      const crumbs = [...document.querySelectorAll('.stage-workspace-crumb')].map((entry) => entry.textContent.trim());
      return crumbs.join(' | ');
    })()`);
    assert.match(crumbTarget, /Find the narrowest product truth worth testing overnight/i, "descending into the joined-return bet did not target its canonical direction");

    const switchedToDirection = await client.evaluate(`(() => {
      const toggle = document.querySelector('.now-view-toggle');
      if (!toggle) return false;
      toggle.click();
      return true;
    })()`);
    assert.equal(switchedToDirection, true, "no View control to switch bodies (expected consequence + direction both available)");
    await waitForDom(client, `!!document.querySelector('.now-view-menu')`, "the View menu did not open");
    const pickedDirection = await client.evaluate(`(() => {
      const option = [...document.querySelectorAll('.now-view-option')].find((entry) => entry.textContent.trim() === 'Direction');
      option?.click();
      return Boolean(option);
    })()`);
    assert.equal(pickedDirection, true, "the Direction view was not offered alongside the consequence gate");
    await waitForDom(client, `!!document.querySelector('.now-returned')`, "the Direction view did not surface the returned market reply");
    const returnedText = await client.evaluate(`document.querySelector('.now-returned')?.textContent || ''`);
    assert.match(returnedText, /This is timely/i, "the joined return's body did not render");
    assert.match(returnedText, /captured provider identity|causality is not claimed/i, "the joined return omitted its honest attribution line");

    // HELD REASSURANCE — the modern equivalent of "held safely": a bet's decision gate states the outward-
    // act invariant. Switch back to the consequence (default) view to read it.
    const switchedBack = await client.evaluate(`(() => {
      const toggle = document.querySelector('.now-view-toggle');
      toggle?.click();
      return Boolean(toggle);
    })()`);
    assert.equal(switchedBack, true);
    await waitForDom(client, `!!document.querySelector('.now-view-menu')`, "the View menu did not reopen");
    await client.evaluate(`(() => {
      const option = [...document.querySelectorAll('.now-view-option')].find((entry) => entry.textContent.trim() === 'The exact effect');
      option?.click();
    })()`);
    await waitForDom(client, `!!document.querySelector('.now-gate')`, "the consequence gate did not return");
    const gateReassurance = await client.evaluate(`document.querySelector('.now-gate-note')?.textContent || ''`);
    assert.match(
      gateReassurance,
      /This is the only outward act\. Nothing leaves until you release it, and Drover remembers what you allow\./i,
      "the decision gate did not carry the held-safely reassurance",
    );

    // CAMERA / TARGET STABILITY — capture viewport transform + stage title, return via one Escape (scope
    // survives), re-descend into a DIFFERENT bet's decision gate, act on nothing (just view), Escape back;
    // the original bet's camera/target framing must be reproducible (the canvas frame owns no separate
    // "wall panel" that could disturb it — proving that instead: viewing another bet's gate and returning
    // leaves the canvas viewport transform unchanged).
    const transformBefore = await client.evaluate(`document.querySelector('.react-flow__viewport')?.style.transform`);
    await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    await pressEscape(client); // first Escape: return from descent, scope survives
    await waitForDom(client, `!document.querySelector('[data-testid="stage-workspace"]')`, "first Escape did not return from the joined-return descent");
    await fireNode(client, "bet:overnight-bet-counterexample", "dblclick");
    await waitForDom(client, `!!document.querySelector('.now-gate')`, "descending into a different bet's decision did not open its gate");
    await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    await pressEscape(client);
    await waitForDom(client, `!document.querySelector('[data-testid="stage-workspace"]')`, "Escape did not return from the second descent");
    const transformAfter = await client.evaluate(`document.querySelector('.react-flow__viewport')?.style.transform`);
    assert.equal(transformAfter, transformBefore, "viewing another bet's decision gate disturbed the founder's camera");

    // OFFLINE RECOVERY — a composer draft survives going offline and reconnecting; the freshness chip is
    // honest; decision gate buttons disable while offline. This mirrors canvas-journey.mjs's proven pattern.
    await pressEscape(client); // second Escape: broaden back to whole venture
    await waitForDom(client, `document.querySelector('.venture-workspace-dock .now-composer textarea')?.getAttribute('placeholder') === 'Direct the venture'`, "second Escape did not broaden back to the whole venture");
    const recoveryDraft = "Keep this correction with the evidence while the connection recovers.";
    await client.evaluate(`document.querySelector('.venture-workspace-dock .now-composer textarea')?.focus()`);
    await client.send("Input.insertText", { text: recoveryDraft });

    await fireNode(client, "bet:overnight-bet-partial", "dblclick");
    await waitForDom(client, `!!document.querySelector('.now-gate')`, "descending into the answer bet did not open its gate before going offline");

    await setNetworkOffline(client, true);
    await client.evaluate(`window.dispatchEvent(new Event('offline'))`);
    await waitForDom(
      client,
      `/Offline|Reconnecting/i.test(document.querySelector('.venture-workspace-freshness .firm-freshness')?.textContent || '')`,
      "offline/stale freshness chip never appeared",
    );
    const offlineState = await client.evaluate(`(() => {
      const chip = document.querySelector('.venture-workspace-freshness .firm-freshness');
      return {
        held: /consequential changes are held/i.test(chip?.textContent || ''),
        retry: Boolean([...(chip?.querySelectorAll('button') || [])].find((b) => /retry/i.test(b.textContent || ''))),
        canvasMounted: Boolean(document.querySelector('.venture-workspace .venture-canvas-flow.atlas-canvas')),
        draft: document.querySelector('.venture-workspace-dock .now-composer textarea')?.value,
        composerDisabled: document.querySelector('.venture-workspace-dock .now-composer textarea')?.disabled === true,
      };
    })()`);
    assert.ok(offlineState.held, "freshness chip did not state consequential changes are held");
    assert.ok(offlineState.retry, "offline freshness chip offered no Retry");
    assert.ok(offlineState.canvasMounted, "canvas unmounted while offline");
    assert.equal(offlineState.draft, recoveryDraft, "the composer draft was lost going offline");
    assert.equal(offlineState.composerDisabled, true, "composer stayed writable while offline");

    // The decision gate is not itself visually disabled while offline (only the composer carries that
    // affordance today), but founder authority is still enforced at the request layer: guardedPost calls
    // requireFreshConnection() before any fetch, so an attempted decision while offline never reaches the
    // wall decide endpoint. Prove the REAL boundary — no network request fires — rather than a DOM
    // `disabled` attribute the shipped gate does not set.
    let decideRequestsWhileOffline = 0;
    await client.send("Network.enable");
    client.on("Network.requestWillBeSent", ({ request }) => {
      if (request.method === "POST" && /\/wall\/.+\/decide$/.test(request.url)) decideRequestsWhileOffline += 1;
    });
    await client.evaluate(`document.querySelector('.now-gate-btn[data-intent="reject"]')?.click()`);
    await client.evaluate(`new Promise((resolve) => setTimeout(resolve, 300))`);
    assert.equal(decideRequestsWhileOffline, 0, "a decision reached the wall endpoint while offline");
    await captureEvidence(client, "overnight-offline-last-coherent");

    await setNetworkOffline(client, false);
    await client.evaluate(`[...document.querySelectorAll('.firm-freshness button')].find((entry) => /retry/i.test(entry.textContent || ''))?.click()`);
    await waitForDom(client, `!/Offline|Reconnecting/i.test(document.querySelector('.venture-workspace-freshness .firm-freshness')?.textContent || '')`, "the workspace did not recover after connectivity returned");
    const recovered = await client.evaluate(`(() => ({
      draft: document.querySelector('.venture-workspace-dock .now-composer textarea')?.value,
    }))()`);
    assert.equal(recovered.draft, recoveryDraft, "the composer draft did not survive reconnect");
    await captureEvidence(client, "overnight-recovered-in-place");

    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
