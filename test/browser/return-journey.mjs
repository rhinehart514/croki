#!/usr/bin/env node

import assert from "node:assert/strict";
import { test } from "node:test";

import { createOvernightVentureFixture } from "../fixtures/firm-fixtures.mjs";
import {
  assertDesktopViewports,
  assertNoUnhandledRejections,
  assertPerformanceBudgets,
  bootFixture,
  captureEvidence,
  openFixtureVenture,
  setNetworkOffline,
  waitForDom,
} from "./fixtures/browser-harness.mjs";

test("overnight return: held work, attributable proof, and offline recovery remain coherent in Atlas", async () => {
  const drover = await bootFixture(createOvernightVentureFixture);
  const chrome = await openFixtureVenture(drover);
  try {
    const { client } = chrome;
    const ventureId = drover.fixture.venture.id;
    await waitForDom(client, `Boolean(document.querySelector('[data-venture-atlas]'))`, "overnight fixture did not settle into the Atlas");
    await waitForDom(client, `['Needs you', 'The market spoke', 'Kept moving', 'Held safely'].every((label) => document.querySelector('.firm-app-return')?.textContent.includes(label))`, "overnight return briefing did not account for attention, market truth, safe holds, and continued work");
    await assertPerformanceBudgets(client);

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

    await assertDesktopViewports(client, async (scenario) => {
      const state = await client.evaluate(`(() => ({
        atlas: Boolean(document.querySelector('[data-venture-atlas]')),
        returnedReality: document.querySelectorAll('.atlas-element[data-kind="outcome"]').length,
        returnedRealityVisible: (() => {
          const canvas = document.querySelector('.atlas-canvas')?.getBoundingClientRect();
          if (!canvas) return 0;
          return [...document.querySelectorAll('.atlas-element[data-kind="outcome"]')].filter((element) => {
            const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
            return Number(style.opacity) > 0 && style.visibility !== 'hidden' && rect.right > canvas.left && rect.left < canvas.right && rect.bottom > canvas.top && rect.top < canvas.bottom;
          }).length;
        })(),
        outcomeRects: [...document.querySelectorAll('.atlas-element[data-kind="outcome"]')].map((element) => {
          const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, opacity: style.opacity, visibility: style.visibility, inline: element.getAttribute('style'), focus: element.getAttribute('data-focus-role') };
        }),
        canvasRect: (() => { const rect = document.querySelector('.atlas-canvas')?.getBoundingClientRect(); return rect && { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; })(),
        viewport: document.querySelector('.react-flow__viewport')?.style.transform,
        wallText: document.querySelector('[data-atlas-wall]')?.textContent,
        composerVisible: Boolean(document.querySelector('.firm-app-composer textarea')),
        returnGroups: [...document.querySelectorAll('.firm-app-return-group h3')].map((heading) => heading.textContent.trim()),
        heldSafety: (document.querySelector('.firm-app-return')?.textContent || '').includes('Held safely. Nothing leaves until you release this exact act.'),
        returnText: document.querySelector('.firm-app-return')?.textContent || '',
        primaryAgents: document.querySelectorAll('.firm-lens-crew-node, .firm-lens-participant-card').length,
      }))()`);
      assert.equal(state.atlas, true);
      assert.equal(state.returnedReality, 2);
      assert.ok(state.returnedRealityVisible > 0, `a venture with returns but no named architecture opened to blank terrain: ${JSON.stringify({ outcomes: state.outcomeRects, canvas: state.canvasRect, viewport: state.viewport })}`);
      assert.match(state.wallText ?? "", /3 decisions need you/i);
      assert.equal(state.composerVisible, true);
      assert.deepEqual(state.returnGroups, ["Needs you", "The market spoke", "Kept moving"]);
      assert.equal(state.heldSafety, true, `held outward work was not explained inside the decision group at ${scenario.width}x${scenario.height} ${scenario.motion}: ${state.returnText}`);
      assert.equal(state.primaryAgents, 0);
    }, { evidencePrefix: "overnight-atlas-return" });

    const returnTruth = await client.evaluate(`([...document.querySelectorAll('.firm-app-return-record')].find((entry) => /This is timely/.test(entry.textContent || ''))?.textContent || '')`);
    assert.match(returnTruth, /captured provider identity/i);
    assert.match(returnTruth, /causality is not claimed/i);
    const openedProof = await client.evaluate(`(() => {
      const record = [...document.querySelectorAll('.firm-app-return-record')].find((entry) => /This is timely/.test(entry.textContent || ''));
      const button = record?.querySelector('button'); button?.click(); return Boolean(button);
    })()`);
    assert.equal(openedProof, true, "joined market return did not offer a proof-open action");
    await waitForDom(client, `/Test the repository-backed promise/.test(document.querySelector('.firm-app-direction-target')?.textContent || '')`, "joined return did not target its canonical bet context");
    await waitForDom(client, `(() => {
      const selected = document.querySelector('.atlas-bet-node[data-expanded="true"], .atlas-element[data-selected="true"]');
      const target = selected?.closest('.react-flow__node');
      const canvas = document.querySelector('.atlas-canvas');
      const targetRect = target?.getBoundingClientRect(); const canvasRect = canvas?.getBoundingClientRect();
      if (!targetRect || !canvasRect || !target) return false;
      const style = getComputedStyle(target);
      return /bet:overnight-bet-message|outcome:overnight-outcome-joined/.test(target.dataset.id || '') && style.opacity !== '0' && style.visibility !== 'hidden' && targetRect.right > canvasRect.left && targetRect.left < canvasRect.right && targetRect.bottom > canvasRect.top && targetRect.top < canvasRect.bottom;
    })()`, "opening return proof did not frame its canonical bet on the Atlas");
    const proof = await client.evaluate(`(() => ({
      outcomeText: document.querySelector('.atlas-element[data-atlas-id="outcome:overnight-outcome-joined"]')?.textContent,
      stagedWorkInProjection: document.body.textContent.includes('Outbound note'),
      target: document.querySelector('.firm-app-direction-target')?.textContent,
    }))()`);
    assert.match(proof.outcomeText ?? "", /This is timely/i);
    assert.match(proof.outcomeText ?? "", /not causality/i);
    assert.match(proof.target ?? "", /Test the repository-backed promise/i);

    await client.evaluate("new Promise((resolve) => setTimeout(resolve, 450))");
    const transformBeforeWall = await client.evaluate("document.querySelector('.react-flow__viewport')?.style.transform");
    const targetBeforeWall = await client.evaluate("document.querySelector('.firm-app-direction-target')?.textContent || ''");

    await client.evaluate(`document.querySelector('[data-atlas-wall] .firm-lens-wall-band')?.click()`);
    await waitForDom(client, `Boolean(document.querySelector('[aria-label="Founder decisions"]'))`, "founder decision workbench did not open");
    const wallReview = await client.evaluate(`(() => ({
      items: document.querySelectorAll('[aria-label="Items waiting for your decision"] > li').length,
      release: [...document.querySelectorAll('.firm-wall-review-actions button')].some((button) => /^release$/i.test((button.textContent || '').trim())),
      reject: [...document.querySelectorAll('.firm-wall-review-actions button')].some((button) => /^reject$/i.test((button.textContent || '').trim())),
      composer: Boolean(document.querySelector('.firm-app-composer')),
      atlas: Boolean(document.querySelector('[data-venture-atlas]')),
    }))()`);
    assert.deepEqual(wallReview, { items: 3, release: true, reject: true, composer: true, atlas: true });
    await client.evaluate(`document.querySelector('[data-atlas-wall] .firm-lens-wall-band')?.click()`);
    await waitForDom(client, `!document.querySelector('.firm-lens-wall-panel')`, "wall did not close back to its boundary");
    assert.equal(await client.evaluate("document.querySelector('.react-flow__viewport')?.style.transform"), transformBeforeWall, "wall review changed the founder's Atlas neighborhood");
    assert.equal(await client.evaluate("document.querySelector('.firm-app-direction-target')?.textContent || ''"), targetBeforeWall, "wall review lost the returned outcome's canonical bet target");

    const recoveryDraft = "Keep this correction with the evidence while the connection recovers.";
    await client.evaluate(`document.querySelector('.firm-app-composer textarea')?.focus()`);
    await client.send("Input.insertText", { text: recoveryDraft });
    await client.evaluate(`document.querySelector('[data-atlas-wall] .firm-lens-wall-band')?.click()`);
    await waitForDom(client, `Boolean(document.querySelector('.firm-lens-wall-panel'))`, "wall did not reopen before the offline check");
    await setNetworkOffline(client, true);
    await waitForDom(client, `/Offline/i.test(document.querySelector('.firm-freshness')?.textContent || '')`, "offline state did not become explicit");
    await waitForDom(client, `/Showing the last coherent view/i.test(document.querySelector('[data-venture-atlas]')?.textContent || '')`, "offline state did not identify the last coherent venture view");
    await waitForDom(client, `document.querySelector('.firm-app-composer button[type="submit"]')?.disabled === true`, "offline state did not hold composer dispatch");
    const offline = await client.evaluate(`(() => ({
      atlas: Boolean(document.querySelector('[data-venture-atlas]')),
      target: document.querySelector('.firm-app-direction-target')?.textContent || '',
      draft: document.querySelector('.firm-app-composer textarea')?.value,
      composerEditable: document.querySelector('.firm-app-composer textarea')?.disabled === false,
      sendDisabled: document.querySelector('.firm-app-composer button[type="submit"]')?.disabled,
      decisionsDisabled: [...document.querySelectorAll('.firm-wall-review-actions button')].every((button) => button.disabled),
    }))()`);
    assert.equal(offline.atlas, true);
    assert.equal(offline.target, targetBeforeWall);
    assert.equal(offline.draft, recoveryDraft);
    assert.equal(offline.composerEditable, true);
    assert.equal(offline.sendDisabled, true);
    assert.equal(offline.decisionsDisabled, true);
    await captureEvidence(client, "overnight-atlas-offline-last-coherent");

    await setNetworkOffline(client, false);
    await client.evaluate(`[...document.querySelectorAll('.firm-freshness button')].find((entry) => /retry now/i.test(entry.textContent || ''))?.click()`);
    await waitForDom(client, `/Current/i.test(document.querySelector('.firm-freshness')?.textContent || '')`, "the Atlas did not recover after connectivity returned");
    await waitForDom(client, `[...document.querySelectorAll('.firm-wall-review-actions button')].some((button) => !button.disabled)`, "founder decisions did not recover after reconnect");
    const recovered = await client.evaluate(`(() => ({ target: document.querySelector('.firm-app-direction-target')?.textContent || '', draft: document.querySelector('.firm-app-composer textarea')?.value }))()`);
    assert.deepEqual(recovered, { target: targetBeforeWall, draft: recoveryDraft });
    await captureEvidence(client, "overnight-atlas-recovered-in-place");
    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
