#!/usr/bin/env node

import assert from "node:assert/strict";
import { test } from "node:test";
import { createAtlasPortfolioFixture } from "../fixtures/atlas-fixtures.mjs";
import { createModelBranch, proposeModelChange } from "../../brain/src/firm/model-branches.mjs";
import { getVentureDoc, setVentureDoc } from "../../brain/src/firm/venture-store.mjs";
import { assertNoUnhandledRejections, bootFixture, openFixtureVenture, waitForDom } from "./fixtures/browser-harness.mjs";

function createLocalModelViewFixture(options = {}) {
  const fixture = createAtlasPortfolioFixture(options);
  const sourceRef = "object:arch-buffalo-motion-graduate";
  const branch = createModelBranch({
    ventureId: fixture.venture.id,
    name: "Ecosystem distribution after proof",
    question: "When should ecosystem distribution begin?",
    sourceRefs: [sourceRef],
    createdBy: { authority: "agent", id: "strategist" },
  }, { root: options.root });
  proposeModelChange({
    ventureId: fixture.venture.id, branchId: branch.id, targetFamily: "objects", operation: "create",
    proposedRecord: { id: "ecosystem-motion", type: "motion", name: "Ecosystem distribution", statement: "Begin ecosystem distribution only after external proof exists.", properties: { territory: "gtm" } },
    rationale: "The motion should compound proof rather than substitute for it.", sourceRefs: [sourceRef], proposedBy: { authority: "agent", id: "strategist" },
  }, { root: options.root });
  const bet = getVentureDoc(fixture.venture.id, "bets", fixture.reality.bet.id, { root: options.root });
  const stagedAt = "2026-07-21T14:00:00.000Z";
  const view = {
    id: "ecosystem-local-view", title: "Ecosystem distribution after proof", ownerRefs: ["maker"], contributorRefs: [], stagedAt,
    content: {
      kind: "model-view", purpose: "product-gtm-local-model", question: "When should ecosystem distribution begin?", branchRef: `model-branch:${branch.id}`,
      nodes: [
        { id: "truth", label: "Dogfood receipt", detail: "Current proof from real use.", kind: "truth", state: "current" },
        { id: "question", label: "When should distribution begin?", kind: "question", state: "provisional" },
        { id: "proposal", label: "Wait for external proof", detail: "Do not let attention substitute for evidence.", kind: "proposal", state: "provisional" },
        { id: "unknown", label: "One external story", kind: "unknown", state: "unresolved" },
        { id: "action", label: "MCP registry listing", kind: "action", state: "provisional" },
        { id: "outcome", label: "Distribution compounds proof", kind: "outcome", state: "provisional" },
      ],
      edges: [
        { from: "truth", to: "question", label: "informs" },
        { from: "question", to: "proposal", label: "current answer" },
        { from: "unknown", to: "proposal", label: "must resolve", kind: "dependency" },
        { from: "proposal", to: "action", label: "then" },
        { from: "action", to: "outcome", label: "returns" },
      ],
    },
  };
  setVentureDoc(fixture.venture.id, "bets", bet.id, { ...bet, staged: [...(bet.staged ?? []), view], updatedAt: stagedAt }, { root: options.root });
  return fixture;
}

test("Product / GTM conversation keeps a flexible local model view above the composer", async () => {
  const drover = await bootFixture(createLocalModelViewFixture);
  const chrome = await openFixtureVenture(drover, { viewport: { width: 1440, height: 900 } });
  try {
    const { client } = chrome;
    await waitForDom(client, `!!document.querySelector('.work-graph-sketch[data-kind="model-view"]')`, "the provisional local model view did not appear above the composer");
    await waitForDom(client, `document.querySelectorAll('.work-graph-sketch[data-kind="model-view"] .react-flow__node').length === 6`, "the local model view did not render its supported material");
    const state = await client.evaluate(`(() => {
      const shell = document.querySelector('.work-graph-sketch[data-kind="model-view"]');
      const composer = document.querySelector('.thread-composer');
      const rect = shell?.getBoundingClientRect();
      return {
        title: shell?.querySelector('header strong')?.textContent,
        label: shell?.querySelector('header span')?.textContent,
        proposed: shell?.querySelectorAll('.react-flow__node.is-provisional').length,
        unresolved: shell?.querySelectorAll('.react-flow__node.is-unresolved').length,
        sequentialLanguage: /steps|workflow/i.test(shell?.querySelector('header small')?.textContent || ''),
        contained: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= composer.getBoundingClientRect().top),
      };
    })()`);
    assert.deepEqual(state, { title: "Ecosystem distribution after proof", label: "Provisional Product / GTM view", proposed: 4, unresolved: 1, sequentialLanguage: false, contained: true });

    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('.work-graph-sketch[data-kind="model-view"] button')].find((entry) => /Review changes/.test(entry.textContent)); button?.click(); return Boolean(button); })()`), true);
    await waitForDom(client, `document.querySelector('.workspace-shell')?.getAttribute('data-canvas-open') === 'true' && !!document.querySelector('.workspace-canvas .product-gtm-review[data-inline="true"]')`, "review did not open the exact provisional branch on the Canvas");
    await waitForDom(client, `/When should ecosystem distribution begin/.test(document.querySelector('.product-gtm-review')?.textContent || '')`, "the exact provisional branch did not finish loading");
    assert.match(await client.evaluate(`document.querySelector('.product-gtm-review')?.textContent || ''`), /When should ecosystem distribution begin/);
    // The founder register keeps one exact change at a time (per-object Keep, no checkbox merge control).
    assert.equal(await client.evaluate(`document.querySelectorAll('.product-gtm-review input[type="checkbox"]').length`), 0, "the branch review still exposed the retired multi-select merge control");
    assert.ok(await client.evaluate(`document.querySelectorAll('.product-gtm-review .product-gtm-delta').length >= 1`), "the provisional branch did not offer a keepable change");
    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
