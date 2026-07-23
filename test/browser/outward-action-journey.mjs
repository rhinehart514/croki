#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { prepareOutwardAction, prepareOutwardMaterial } from "../../brain/src/firm/outward-actions.mjs";
import { createGeneratedMapsFixture } from "../fixtures/atlas-fixtures.mjs";
import { assertNoUnhandledRejections, bootFixture, openFixtureVenture, waitForDom } from "./fixtures/browser-harness.mjs";

async function seedOutwardActionFixture({ root }) {
  const repository = path.join(root, "dogfood-product");
  fs.mkdirSync(repository, { recursive: true });
  fs.writeFileSync(path.join(repository, "package.json"), JSON.stringify({ scripts: { deploy: "node deploy.mjs" } }, null, 2));
  fs.writeFileSync(path.join(repository, "deploy.mjs"), "import fs from 'node:fs'; fs.writeFileSync('deployed.json', JSON.stringify({ deployed: true }));\n");
  fs.mkdirSync(path.join(repository, "app"), { recursive: true });
  fs.writeFileSync(path.join(repository, "app/page.tsx"), "export default function Page() { return <main><h1>Dogfood preview</h1></main>; }\n");
  const fixture = createGeneratedMapsFixture({ root, repository });
  const preparedMaterial = prepareOutwardMaterial({ ventureId: fixture.venture.id, kind: "deploy", preparedMaterial: { destination: "Dogfood preview" } }, { root });
  const action = prepareOutwardAction({
    ventureId: fixture.venture.id,
    kind: "deploy",
    subjectRefs: ["object:map-release"],
    workRefs: ["work:buffalo-work-project-drop-v2"],
    decisionRef: "decision:buffalo-bet-project-first-pending-wall",
    preparedMaterial,
    expectedReturn: {
      source: "http",
      target: { url: "https://drover.test/dogfood" },
      purpose: "Confirm the dogfood preview is reachable.",
      windowHours: 24,
      returnConditions: [{ type: "http-status", equals: 200 }],
    },
    actor: { authority: "agent", id: "codex" },
  }, { root });
  return { ...fixture, dogfoodRepository: repository, outwardActionId: action.id };
}

test("Product / GTM executes one exact deploy and grants only its bounded return read", async () => {
  const drover = await bootFixture(seedOutwardActionFixture);
  const chrome = await openFixtureVenture(drover, { viewport: { width: 1440, height: 900 } });
  try {
    const { client } = chrome;
    assert.equal(await client.evaluate(`(() => { const button=[...document.querySelectorAll('.workspace-mode-nav button')].find((entry)=>entry.textContent.includes('Product / GTM')); button?.click(); return Boolean(button); })()`), true);
    await waitForDom(client, `document.querySelector('.product-gtm-surface')?.dataset.projection === 'product-walk'`, "Product / GTM did not open on the Product walk");
    assert.equal(await client.evaluate(`(() => {
      const input = document.querySelector('.workspace-rail input[type="search"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Project-drop invitation v1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`), true, "the Product / GTM rail search was unavailable");
    await waitForDom(client, `[...document.querySelectorAll('.product-rail-body section button strong')].some((entry) => entry.textContent.trim() === 'Project-drop invitation v1')`, "the deploy's Product dependency was not searchable");
    assert.equal(await client.evaluate(`(() => {
      const button = [...document.querySelectorAll('.product-rail-body section button')].find((entry) => entry.querySelector('strong')?.textContent.trim() === 'Project-drop invitation v1');
      button?.click();
      return Boolean(button);
    })()`), true, "the deploy's Product dependency could not be selected");
    await waitForDom(client, `document.querySelector('.product-gtm-surface')?.dataset.projection === 'consequence-trace'`, "the deploy did not open in its Product consequence trace");
    await waitForDom(client, `[...document.querySelectorAll('.product-gtm-node strong')].some((entry) => entry.textContent.includes('Dogfood preview'))`, "the exact dogfood deploy did not reach Product / GTM");
    assert.equal(await client.evaluate(`(() => { const node=[...document.querySelectorAll('.product-gtm-node')].find((entry)=>entry.querySelector('strong')?.textContent.includes('Dogfood preview')); node?.click(); return Boolean(node); })()`), true);
    await waitForDom(client, `/npm run deploy/.test(document.querySelector('.product-gtm-outward-review')?.textContent || '')`, "the exact deploy command did not expand in place");
    assert.match(await client.evaluate(`document.querySelector('.product-gtm-outward-review')?.textContent || ''`), /24 hours, only after you grant it/);
    if (process.env.DROVER_VISUAL_QA_PATH) {
      const screenshot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
      fs.writeFileSync(process.env.DROVER_VISUAL_QA_PATH, Buffer.from(screenshot.data, "base64"));
    }

    assert.equal(await client.evaluate(`(() => { const button=[...document.querySelectorAll('.product-gtm-outward-review button')].find((entry)=>entry.textContent.includes('Deploy now')); button?.click(); return Boolean(button && !button.disabled); })()`), true);
    await waitForDom(client, `/In the world/.test(document.querySelector('.product-gtm-outward-review')?.textContent || '') && [...document.querySelectorAll('.product-gtm-outward-review button')].some((entry)=>entry.textContent.includes('Watch for 24h'))`, "the deploy did not settle into its exact return gate");
    assert.equal(fs.existsSync(path.join(drover.fixture.dogfoodRepository, "deployed.json")), true, "the verified repository deploy command did not run");

    assert.equal(await client.evaluate(`(() => { const button=[...document.querySelectorAll('.product-gtm-outward-review button')].find((entry)=>entry.textContent.includes('Watch for 24h')); button?.click(); return Boolean(button && !button.disabled); })()`), true);
    try {
      await waitForDom(client, `[...document.querySelectorAll('.product-gtm-outward-review button')].some((entry)=>entry.textContent.includes('Check for a return'))`, "the bounded return authority was not granted");
    } catch (error) {
      const state = await client.evaluate(`(async () => { const movement = await fetch('/api/ventures/${drover.fixture.venture.id}/market-movement').then((response) => response.json()); return { action: movement.marketMovement.actions.find((entry) => entry.id === ${JSON.stringify(drover.fixture.outwardActionId)}), review: document.querySelector('.product-gtm-outward-review')?.textContent || '', body: document.body.textContent?.replace(/\\s+/g, ' ').slice(0, 1000) || '', resources: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('outward-actions')).slice(-10).map((entry) => ({ name: entry.name, status: entry.responseStatus })) }; })()`);
      throw new Error(`${error.message}: ${JSON.stringify(state)}`);
    }
    const movement = await drover.founderFetch(`/api/ventures/${drover.fixture.venture.id}/market-movement`).then((response) => response.json());
    const action = movement.marketMovement.actions.find((entry) => entry.id === drover.fixture.outwardActionId);
    assert.equal(action.state, "in-world");
    assert.equal(action.observations.length, 1);
    assert.deepEqual(action.observations[0].authority.denies, ["send", "publish", "deploy", "spend", "canonical-interpretation"]);
    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
