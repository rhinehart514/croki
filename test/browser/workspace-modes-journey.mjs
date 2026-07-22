#!/usr/bin/env node

import assert from "node:assert/strict";
import { test } from "node:test";
import { createGeneratedMapsFixture } from "../fixtures/atlas-fixtures.mjs";
import { assertNoUnhandledRejections, bootFixture, openFixtureVenture, waitForCanvasViewportStable, waitForDom } from "./fixtures/browser-harness.mjs";

async function chooseMode(client, label) {
  const clicked = await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('.workspace-mode-nav button')]
      .find((entry) => entry.textContent.includes(${JSON.stringify(label)}));
    if (!button) return false;
    if (button.getAttribute('aria-current') !== 'page') button.click();
    return true;
  })()`);
  assert.equal(clicked, true, `${label} surface was unavailable`);
  await waitForDom(client, `document.querySelector('.workspace-mode-nav button[aria-current="page"]')?.textContent.includes(${JSON.stringify(label)})`, `${label} did not become current`);
}

test("Product / GTM shows current truth, durable alternatives, exact work, and founder-gated outward action", async () => {
  const drover = await bootFixture(createGeneratedMapsFixture);
  const chrome = await openFixtureVenture(drover, { viewport: { width: 1440, height: 900 } });
  try {
    const { client } = chrome;
    await client.evaluate(`(() => {
      localStorage.setItem(${JSON.stringify(`drover:workspace-session:v12:${drover.fixture.venture.id}`)}, JSON.stringify({
        mode: 'product-gtm', railWidth: 272, contextualChatOpen: false,
        selectedThreadRef: null, selectedObjectRef: null,
        systemCamera: { x: 200, y: 505, zoom: 0.56 }, chatScrollByThread: {},
      }));
      location.reload();
    })()`);
    await waitForDom(client, `Boolean(document.querySelector('.workspace-shell'))`, "the workspace did not restore its stale canvas camera fixture");
    await chooseMode(client, "Product / GTM");
    await waitForDom(client, `document.querySelectorAll('.product-gtm-node[data-kind="truth"]').length >= 6`, "current Product/GTM truth did not materialize");
    await waitForDom(client, `!!document.querySelector('.product-gtm-node[data-kind="branch"]') && !!document.querySelector('.product-gtm-node[data-kind="action"][data-waiting="true"]')`, "the provisional Product alternative and founder-gated action were not visible together");
    await waitForDom(client, `document.querySelectorAll('.product-gtm-edge-path.is-cross-territory').length > 0`, "territory-crossing relationships did not render");
    await waitForCanvasViewportStable(client);

    const composition = await client.evaluate(`(() => ({
      mode: document.querySelector('.workspace-shell')?.dataset.mode,
      truth: document.querySelectorAll('.product-gtm-node[data-kind="truth"]').length,
      branches: document.querySelectorAll('.product-gtm-node[data-kind="branch"]').length,
      work: document.querySelectorAll('.product-gtm-node[data-kind="work"]').length,
      gates: document.querySelectorAll('.product-gtm-node[data-kind="action"][data-waiting="true"]').length,
      oldSystem: Boolean(document.querySelector('.system-workspace')),
      oldRelease: Boolean(document.querySelector('.release-workspace')),
      oldPipeline: Boolean(document.querySelector('.venture-pipeline-lane')),
      codingControls: Boolean(document.querySelector('.workspace-primary .work-composer-bar')),
    }))()`);
    assert.equal(composition.mode, "product-gtm");
    assert.ok(composition.truth >= 6 && composition.branches >= 1 && composition.work >= 1 && composition.gates >= 1, JSON.stringify(composition));
    assert.deepEqual({ oldSystem: composition.oldSystem, oldRelease: composition.oldRelease, oldPipeline: composition.oldPipeline, codingControls: composition.codingControls }, { oldSystem: false, oldRelease: false, oldPipeline: false, codingControls: false });

    const causalStory = await client.evaluate(`(() => {
      const byName = (name) => [...document.querySelectorAll('.product-gtm-node')].find((entry) => entry.querySelector('strong')?.textContent === name);
      const spineNames = ['A project worth advancing', 'Start with the work', 'Project intake', 'Project-drop invitation v1', 'Project-first invitation test', 'Builder started with the project'];
      const spine = spineNames.map((name) => byName(name)?.getBoundingClientRect()).filter(Boolean);
      const flow = document.querySelector('.product-gtm-canvas')?.getBoundingClientRect();
      const attachedWork = byName('Test project-first entry with recent graduates')?.getBoundingClientRect();
      const workSubject = byName('Project-first invitation test')?.getBoundingClientRect();
      const founderGate = byName('founder interview')?.getBoundingClientRect();
      const transform = document.querySelector('.react-flow__viewport')?.style.transform || '';
      const labels = [...document.querySelectorAll('.product-gtm-node small')].map((entry) => entry.textContent);
      return {
        spineCount: spine.length,
        strictlyLeftToRight: spine.every((entry, index) => index === 0 || entry.left > spine[index - 1].left),
        crossesTerritory: document.querySelectorAll('.product-gtm-edge-path.is-cross-territory').length > 0,
        readableOpeningZoom: Number(transform.match(/scale\\(([^)]+)\\)/)?.[1] || 0),
        workAttachedToSubject: Boolean(attachedWork && workSubject && Math.abs(attachedWork.left - workSubject.left) < 24),
        founderGateInOpeningFrame: Boolean(flow && founderGate && founderGate.left >= flow.left && founderGate.right <= flow.right && founderGate.top >= flow.top && founderGate.bottom <= flow.bottom),
        inlineExpansionOnly: !document.querySelector('.product-gtm-inspector'),
        direction: byName('A project worth advancing')?.querySelector('strong')?.textContent,
        context: document.querySelector('.product-gtm-context strong')?.textContent,
        compatibilityLabels: labels.filter((label) => ['Pipeline', 'Campaign', 'Channel', 'Signal', 'Working-Theory'].includes(label)),
        provisionalBranches: document.querySelectorAll('.product-gtm-node[data-kind="branch"][data-provisional="true"]').length,
      };
    })()`);
    assert.deepEqual({ spineCount: causalStory.spineCount, strictlyLeftToRight: causalStory.strictlyLeftToRight, crossesTerritory: causalStory.crossesTerritory, inlineExpansionOnly: causalStory.inlineExpansionOnly }, { spineCount: 6, strictlyLeftToRight: true, crossesTerritory: true, inlineExpansionOnly: true }, JSON.stringify(causalStory));
    assert.ok(causalStory.readableOpeningZoom >= 0.81, `the default frame made the causal chapter too small: ${JSON.stringify(causalStory)}`);
    assert.equal(causalStory.workAttachedToSubject, true, `live work drifted away from its subject: ${JSON.stringify(causalStory)}`);
    assert.equal(causalStory.founderGateInOpeningFrame, true, `the default frame omitted the exact founder decision: ${JSON.stringify(causalStory)}`);
    assert.equal(causalStory.direction, "A project worth advancing");
    assert.equal(causalStory.context, "product release");
    assert.deepEqual(causalStory.compatibilityLabels, []);
    assert.ok(causalStory.provisionalBranches >= 1, "the Product alternative was not visibly provisional");

    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('.product-gtm-context button')].find((entry) => /Whole venture/.test(entry.textContent)); button?.click(); return Boolean(button); })()`), true);
    await waitForDom(client, `!document.querySelector('.product-gtm-context') && !document.querySelector('.product-gtm-surface[data-has-focus="true"]')`, "the founder could not return to the whole venture");

    assert.equal(await client.evaluate(`(() => { const node = [...document.querySelectorAll('.product-gtm-node')].find((entry) => entry.querySelector('strong')?.textContent === 'Start with the work'); node?.click(); return Boolean(node); })()`), true);
    await waitForDom(client, `document.querySelectorAll('.product-gtm-node[data-focus="false"]').length > 0`, "selection did not quiet unrelated Product/GTM material");
    const focusCounts = await client.evaluate(`({ focused: document.querySelectorAll('.product-gtm-node[data-focus="true"]').length, quiet: document.querySelectorAll('.product-gtm-node[data-focus="false"]').length })`);
    assert.ok(focusCounts.focused > 0 && focusCounts.quiet > 0, JSON.stringify(focusCounts));
    assert.match(await client.evaluate(`document.querySelector('.product-gtm-context')?.textContent || ''`), /Start with the work/);

    assert.equal(await client.evaluate(`(() => { const node = document.querySelector('.product-gtm-node[data-kind="branch"]'); node?.click(); return Boolean(node); })()`), true);
    await waitForDom(client, `/Should bespoke onboarding become the Product/.test(document.querySelector('.product-gtm-node[data-expanded="true"] .product-gtm-review[data-inline="true"]')?.textContent || '')`, "the exact Product-model delta did not expand in its owning node");
    assert.match(await client.evaluate(`document.querySelector('.product-gtm-review')?.textContent || ''`), /doing the unscalable work before automating it/i);
    assert.equal(await client.evaluate(`document.querySelectorAll('.product-gtm-review input[type="checkbox"]:checked').length`), 1, "the selective merge did not expose its exact selected change");

    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('.product-gtm-review button')].find((entry) => /Make 1 current/.test(entry.textContent)); button?.click(); return Boolean(button && !button.disabled); })()`), true);
    await waitForDom(client, `!document.querySelector('.product-gtm-review')`, "the founder merge did not settle");
    assert.equal(await client.evaluate(`(() => { const node = [...document.querySelectorAll('.product-gtm-node[data-kind="truth"]')].find((entry) => entry.querySelector('strong')?.textContent === 'Start with the work'); node?.click(); return Boolean(node); })()`), true);
    await waitForDom(client, `/manually shapes the first useful project/.test(document.querySelector('.product-gtm-node[data-expanded="true"]')?.textContent || '')`, "the selectively merged Product change did not become current truth in place");

    const currentIndex = await drover.founderFetch(`/api/ventures/${drover.fixture.venture.id}/system-index?scope=system`).then((response) => response.json());
    const workflowResponse = await drover.founderFetch(`/api/ventures/${drover.fixture.venture.id}/system/mutations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        baseRevision: currentIndex.systemIndex.revision,
        mutations: [{
          op: "create-object",
          id: "proof-referral-loop",
          type: "pipeline",
          territory: "gtm",
          name: "Proof to referral",
          statement: "Turn returned proof into the next qualified builder conversation.",
          properties: { workflowGraph: {
            steps: [
              { id: "proof", label: "Proof returns", detail: "A builder result stays attached to its exact invitation.", type: "trigger" },
              { id: "shape", label: "Shape the proof story", detail: "An agent prepares the claim and preserves its source.", type: "agent-work" },
              { id: "fit", label: "Credible enough to share?", detail: "Weak proof loops back for another observation.", type: "condition" },
              { id: "approve", label: "Approve the exact claim", detail: "The founder sees the destination and exact material.", type: "founder-gate" },
              { id: "send", label: "Send the warm introduction", detail: "One exact message crosses into the world.", type: "external-action" },
              { id: "observe", label: "Observe the reply", detail: "The authorized source returns the reply or silence.", type: "observation" },
              { id: "learn", label: "Update the next invitation", detail: "Returned language changes the Product or GTM claim.", type: "outcome" },
            ],
            edges: [
              { from: "proof", to: "shape" }, { from: "shape", to: "fit" },
              { from: "fit", to: "approve", label: "credible" }, { from: "fit", to: "observe", label: "needs more evidence" },
              { from: "approve", to: "send" }, { from: "send", to: "observe" }, { from: "observe", to: "learn" },
              { from: "learn", to: "shape", label: "evidence sharpens the next pass" },
            ],
          } },
        }],
      }),
    });
    assert.equal(workflowResponse.status, 200, await workflowResponse.text());
    await client.evaluate("location.reload()");
    await waitForDom(client, "Boolean(document.querySelector('.workspace-shell'))", "the workspace did not return after adopting the workflow");
    await chooseMode(client, "Product / GTM");
    await waitForDom(client, `document.querySelector('.product-gtm-workflow-shortcut strong')?.textContent === 'Proof to referral'`, "the adopted GTM workflow did not become the visible canvas shortcut");
    assert.equal(await client.evaluate(`(() => { const button = document.querySelector('.product-gtm-workflow-shortcut'); button?.click(); return Boolean(button); })()`), true);
    await waitForDom(client, `document.querySelectorAll('.product-gtm-node[data-kind="workflow"]').length === 7`, "the GTM path did not unfold its complete workflow");
    const workflow = await client.evaluate(`(() => ({
      steps: document.querySelectorAll('.product-gtm-node[data-kind="workflow"]').length,
      founderGates: document.querySelectorAll('.product-gtm-node[data-workflow-step="founder-gate"]').length,
      outwardActions: document.querySelectorAll('.product-gtm-node[data-workflow-step="external-action"]').length,
      returnEdges: document.querySelectorAll('.product-gtm-edge-path.is-return').length,
      context: document.querySelector('.product-gtm-context')?.textContent || '',
    }))()`);
    assert.deepEqual({ steps: workflow.steps, founderGates: workflow.founderGates, outwardActions: workflow.outwardActions }, { steps: 7, founderGates: 1, outwardActions: 1 }, JSON.stringify(workflow));
    assert.ok(workflow.returnEdges >= 1, `the evidence loop still read as forward progress: ${JSON.stringify(workflow)}`);
    assert.match(workflow.context, /trigger, work, conditions, founder gates, outward action, and return path/i);

    assert.equal(await client.evaluate(`(() => { const node = [...document.querySelectorAll('.product-gtm-node[data-kind="workflow"]')].find((entry) => entry.querySelector('strong')?.textContent === 'Observe the reply'); node?.click(); return Boolean(node); })()`), true);
    await waitForDom(client, `/authorized source returns the reply or silence/i.test(document.querySelector('.product-gtm-node[data-kind="workflow"][data-expanded="true"]')?.textContent || '')`, "the founder could not inspect exact workflow-step material in place");
    assert.match(await client.evaluate(`document.querySelector('.product-gtm-context')?.textContent || ''`), /Observe the reply/);
    assert.match(await client.evaluate(`document.querySelector('.product-gtm-node[data-kind="workflow"][data-expanded="true"]')?.textContent || ''`), /Work on this step/);

    await chooseMode(client, "Work");
    await waitForDom(client, `!!document.querySelector('.work-surface .thread-conversation') && !!document.querySelector('.work-composer-bar [aria-label="SDK model"]')`, "Work did not restore the direct SDK environment");
    assert.equal(await client.evaluate(`!!document.querySelector('.work-surface .thread-conversation') && !!document.querySelector('.work-composer-bar [aria-label="SDK model"]')`), true, "Work did not restore the direct SDK environment");
    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
