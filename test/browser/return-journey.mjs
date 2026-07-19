#!/usr/bin/env node

// On return from an overnight run, held work / market truth / continued work / needs-you are coherent on
// the default workbench; a joined market return opens as selected work and traces to its canonical direction;
// reviewing another decision gate returns cleanly to whole-venture Home; a whole-venture draft survives
// selected work going offline and reconnecting; offline holds composer dispatch and wall decisions. Ported
// from the retired `.firm-app-return` briefing panel onto the founder-truth surfaces the workbench renders:
// VentureHome's direction sections (attention and market truth), a selected bet's `.now-gate` reassurance
// sentence (the modern "held safely" — see DecisionGate.tsx), and the offline pattern canvas-journey.mjs proves.

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

async function openReturnedDirection(client) {
  const opened = await client.evaluate(`(() => {
    const row = [...document.querySelectorAll('.vh-row')]
      .find((entry) => /Find the narrowest product truth worth testing overnight/i.test(entry.textContent || ''));
    row?.click();
    return Boolean(row);
  })()`);
  assert.equal(opened, true, "the returned direction was not available on Venture Home");
  await waitForDom(
    client,
    `!!document.querySelector('[data-testid="venture-workbench"] [data-testid="stage-workspace"]') && !document.querySelector('.venture-maps')`,
    "the returned direction did not open as real work",
  );
}

async function pressEscape(client) {
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
}

test("overnight return: held work, attributable proof, and offline recovery remain coherent on the workbench", async () => {
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
    // item count. The overnight fixture's 3 waiting wall items sit on 3 bets in one fork family, so the
    // workbench's whole-venture Home folds them into ONE direction. The wall API truth above proves there
    // are genuinely 3 undecided items; this proves the founder-facing return picture.
    await waitForDom(client, `!!document.querySelector('.vh[aria-label]')`, "whole-venture Home never appeared");
    const attention = await client.evaluate(`(() => {
      const section = [...document.querySelectorAll('.vh-section')]
        .find((entry) => /needs you/i.test(entry.querySelector('.vh-section-head')?.textContent || ''));
      return {
        summary: document.querySelector('.vh-summary')?.textContent.trim() || '',
        count: Number(section?.querySelector('.vh-section-count')?.textContent.trim()),
        rows: section?.querySelectorAll('.vh-row[data-state="needs-you"]').length ?? 0,
      };
    })()`);
    assert.match(attention.summary, /1 decision needs you/i, "whole-venture Home did not summarize the waiting direction");
    assert.equal(attention.count, 1, "needs-you section did not match the fixture's single fork-family direction");
    assert.equal(attention.rows, 1, "needs-you section did not render its waiting direction");

    // MARKET TRUTH — whole-venture Home carries "The market answered" and its returned direction.
    const market = await client.evaluate(`(() => {
      const section = [...document.querySelectorAll('.vh-section')]
        .find((entry) => /market answered/i.test(entry.querySelector('.vh-section-head')?.textContent || ''));
      return {
        label: section?.querySelector('.vh-section-head')?.textContent.trim() || '',
        rows: section?.querySelectorAll('.vh-row[data-state="from-market"]').length ?? 0,
      };
    })()`);
    assert.match(market.label, /market answered/i, `no "The market answered" workbench section: ${JSON.stringify(market)}`);
    assert.ok(market.rows >= 1, "whole-venture Home did not render the joined overnight return");

    // JOINED MARKET RETURN — descending into the bet that owns the joined outcome renders .now-returned
    // with the outcome body and the honest attribution line. That bet ALSO has a waiting release item, so
    // the default body is the decision gate (consequence); switch the contextual View to "Direction" to
    // reach the returned-reality block the same descended stage exposes.
    await openReturnedDirection(client);
    await waitForDom(
      client,
      `!!document.querySelector('[data-testid="venture-workbench"] [data-testid="stage-workspace"]') && !document.querySelector('.venture-maps')`,
      "the returned direction did not open selected work",
    );
    // The overnight fixture's bets are one fork family (all forkedFrom overnight-bet-evidence), so
    // buildDirections folds them into the ONE direction spined off the founder's opening message — not the
    // sub-bet's own intent sentence.
    const workTitle = await client.evaluate(`document.querySelector('.work-narrative-head h2')?.textContent.trim() || ''`);
    assert.match(workTitle, /Find the narrowest product truth worth testing overnight/i, "descending into the joined-return bet did not target its canonical direction");

    const switchedToDirection = await client.evaluate(`(() => {
      const tab = [...document.querySelectorAll('.work-material-tab')].find((entry) => entry.textContent.trim() === 'Result');
      if (!tab) return false;
      tab.click();
      return true;
    })()`);
    assert.equal(switchedToDirection, true, "the Result tab was not offered alongside the decision gate");
    await waitForDom(client, `!!document.querySelector('.now-returned')`, "the Direction view did not surface the returned market reply");
    const returnedText = await client.evaluate(`document.querySelector('.now-returned')?.textContent || ''`);
    assert.match(returnedText, /This is timely/i, "the joined return's body did not render");
    assert.match(returnedText, /captured provider identity|causality is not claimed/i, "the joined return omitted its honest attribution line");

    // HELD REASSURANCE — the modern equivalent of "held safely": a bet's decision gate states the outward-
    // act invariant. Switch back to the consequence (default) view to read it.
    const switchedBack = await client.evaluate(`(() => {
      const tab = [...document.querySelectorAll('.work-material-tab')].find((entry) => entry.textContent.trim() === 'Decision');
      tab?.click();
      return Boolean(tab);
    })()`);
    assert.equal(switchedBack, true);
    await waitForDom(client, `!!document.querySelector('.now-gate')`, "the consequence gate did not return");
    const gateReassurance = await client.evaluate(`document.querySelector('.now-gate-note')?.textContent || ''`);
    assert.match(
      gateReassurance,
      /This is the only outward act\. Nothing leaves until you release it, and Drover remembers what you allow\./i,
      "the decision gate did not carry the held-safely reassurance",
    );

    // RETURN — a bet-level selected-work surface has no overlay rung. One Escape clears the selection and
    // returns to unselected whole-venture Home with the whole-venture composer.
    await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    await pressEscape(client);
    await waitForDom(
      client,
      `!!document.querySelector('.vh[aria-label]') && !document.querySelector('[data-testid="stage-workspace"]') && !document.querySelector('.venture-workspace-dock .now-composer-scope') && document.querySelector('.venture-workspace-dock .now-composer textarea')?.getAttribute('placeholder') === 'Direct the venture'`,
      "one Escape did not return selected work to unselected whole-venture Home",
    );

    // OFFLINE RECOVERY — create a whole-venture draft at Home, reopen the returned direction, then lose
    // connectivity with selected work and its decision gate still open.
    const recoveryDraft = "Keep this correction with the evidence while the connection recovers.";
    await client.evaluate(`document.querySelector('.venture-workspace-dock .now-composer textarea')?.focus()`);
    await client.send("Input.insertText", { text: recoveryDraft });

    await openReturnedDirection(client);
    await waitForDom(
      client,
      `!!document.querySelector('[data-testid="venture-workbench"] .now-gate') && !document.querySelector('.venture-maps')`,
      "the returned direction did not reopen its selected-work gate before going offline",
    );

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
        workbench: Boolean(document.querySelector('[data-testid="venture-workbench"]')),
        selectedWork: Boolean(document.querySelector('[data-testid="stage-workspace"]')),
        gate: Boolean(document.querySelector('[data-testid="stage-workspace"] .now-gate')),
        mapAbsent: !document.querySelector('.venture-workspace .venture-canvas-flow'),
        scopedDraft: document.querySelector('.venture-workspace-dock .now-composer textarea')?.value,
        wholeVentureDraft: JSON.parse(sessionStorage.getItem('drover:composer-drafts:v1') || '{}')[${JSON.stringify(`${ventureId}:venture`)}] || '',
        composerDisabled: document.querySelector('.venture-workspace-dock .now-composer textarea')?.disabled === true,
      };
    })()`);
    assert.ok(offlineState.held, "freshness chip did not state consequential changes are held");
    assert.ok(offlineState.retry, "offline freshness chip offered no Retry");
    assert.equal(offlineState.workbench, true, "the workbench disappeared while offline");
    assert.equal(offlineState.selectedWork, true, "selected work closed while offline");
    assert.equal(offlineState.gate, true, "the selected decision gate closed while offline");
    assert.equal(offlineState.mapAbsent, true, "the map remounted behind selected work while offline");
    assert.equal(offlineState.scopedDraft, recoveryDraft, "the venture draft was lost when returned work opened");
    assert.equal(offlineState.wholeVentureDraft, recoveryDraft, "the whole-venture draft was lost going offline");
    assert.equal(offlineState.composerDisabled, true, "composer stayed writable while offline");

    // The gate mirrors the workspace freshness boundary: its controls are visibly held while stale, and the
    // request layer remains the final fail-closed authority. Prove both the disabled control and zero wall
    // traffic so the UI cannot imply authority the host will reject.
    let decideRequestsWhileOffline = 0;
    await client.send("Network.enable");
    client.on("Network.requestWillBeSent", ({ request }) => {
      if (request.method === "POST" && /\/wall\/.+\/decide$/.test(request.url)) decideRequestsWhileOffline += 1;
    });
    const offlineDecision = await client.evaluate(`(() => {
      const button = document.querySelector('.now-gate-btn[data-intent="reject"]');
      button?.click();
      return { present: Boolean(button), disabled: button?.disabled === true };
    })()`);
    assert.equal(offlineDecision.present, true, "the offline decision gate had no reject action to hold");
    assert.equal(offlineDecision.disabled, true, "the offline decision gate still appeared actionable");
    await client.evaluate(`new Promise((resolve) => setTimeout(resolve, 300))`);
    assert.equal(decideRequestsWhileOffline, 0, "a decision reached the wall endpoint while offline");
    await captureEvidence(client, "overnight-offline-last-coherent");

    await setNetworkOffline(client, false);
    await client.evaluate(`[...document.querySelectorAll('.firm-freshness button')].find((entry) => /retry/i.test(entry.textContent || ''))?.click()`);
    await waitForDom(client, `!/Offline|Reconnecting/i.test(document.querySelector('.venture-workspace-freshness .firm-freshness')?.textContent || '')`, "the workspace did not recover after connectivity returned");
    const recovered = await client.evaluate(`(() => ({
      workbench: Boolean(document.querySelector('[data-testid="venture-workbench"]')),
      selectedWork: Boolean(document.querySelector('[data-testid="stage-workspace"]')),
      gate: Boolean(document.querySelector('[data-testid="stage-workspace"] .now-gate')),
      mapAbsent: !document.querySelector('.venture-workspace .venture-canvas-flow'),
      scopedDraft: document.querySelector('.venture-workspace-dock .now-composer textarea')?.value,
      wholeVentureDraft: JSON.parse(sessionStorage.getItem('drover:composer-drafts:v1') || '{}')[${JSON.stringify(`${ventureId}:venture`)}] || '',
      decisionEnabled: document.querySelector('.now-gate-btn[data-intent="reject"]')?.disabled === false,
      staleGateMessage: /Offline|Reconnecting/i.test(document.querySelector('.now-gate')?.textContent || ''),
    }))()`);
    assert.equal(recovered.workbench, true, "the workbench did not survive reconnect");
    assert.equal(recovered.selectedWork, true, "reconnect cleared the selected work");
    assert.equal(recovered.gate, true, "reconnect closed the selected decision gate");
    assert.equal(recovered.mapAbsent, true, "reconnect remounted the map behind selected work");
    assert.equal(recovered.scopedDraft, recoveryDraft, "reconnect lost the draft while returned work stayed open");
    assert.equal(recovered.wholeVentureDraft, recoveryDraft, "the whole-venture draft did not survive reconnect");
    assert.equal(recovered.decisionEnabled, true, "reconnect left the founder decision disabled");
    assert.equal(recovered.staleGateMessage, false, "reconnect left stale offline copy inside the decision gate");

    await client.evaluate(`[
      ...document.querySelectorAll('.venture-workspace button')
    ].find((button) => button.textContent?.trim() === 'Whole venture')?.click()`);
    await waitForDom(client, `!!document.querySelector('.vh[aria-label]')`, "whole-venture Home did not reopen after reconnect");
    const restoredDraft = await client.evaluate(`document.querySelector('.venture-workspace-dock .now-composer textarea')?.value || ''`);
    assert.equal(restoredDraft, recoveryDraft, "the scope-safe whole-venture draft was not restored when its scope reopened");
    await captureEvidence(client, "overnight-recovered-in-place");

    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
