#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { once } from "node:events";
import { launchChrome } from "../../../test/browser/lib/cdp.mjs";

const HERE = import.meta.dirname;
const URL = "http://127.0.0.1:4178/docs/design/venture-architecture-adaptation/";
const EVIDENCE = path.join(HERE, "evidence");

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function freePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function waitFor(client, expression, message) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await client.evaluate(expression).catch(() => false)) return;
    await delay(50);
  }
  throw new Error(message);
}
async function click(client, selector) {
  assert.equal(await client.evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node?.click(); return !!node; })()`), true, `missing ${selector}`);
  await client.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
}
async function capture(client, name, { fromSurface = true } = {}) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await client.send("Page.bringToFront");
  await client.evaluate("new Promise((resolve) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 120))");
  await client.send("Page.captureScreenshot", { format: "png", fromSurface, captureBeyondViewport: false });
  await client.evaluate("new Promise((resolve) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 60))");
  const screenshot = await client.send("Page.captureScreenshot", { format: "png", fromSurface, captureBeyondViewport: false });
  assert.ok(screenshot.data.length > 10_000, "prototype screenshot was unexpectedly empty");
  const file = path.join(EVIDENCE, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(screenshot.data, "base64"));
  return file;
}
async function assertVisibleControlsNamed(client) {
  const unnamed = await client.evaluate(`(() => {
    const visible = (node) => { const style=getComputedStyle(node); const rect=node.getBoundingClientRect(); return !node.hidden && style.display!=="none" && style.visibility!=="hidden" && rect.width>0 && rect.height>0; };
    return [...document.querySelectorAll("button,textarea")].filter(visible).filter((node) => !(node.getAttribute("aria-label") || node.textContent.trim() || node.getAttribute("placeholder"))).map((node)=>node.outerHTML.slice(0,120));
  })()`);
  assert.deepEqual(unnamed, []);
}
async function assertViewport(client, width, height, motion) {
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: motion }] });
  await client.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const bounds = await client.evaluate(`(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewport: [innerWidth, innerHeight],
    composer: document.querySelector(".composer").getBoundingClientRect().toJSON(),
    wall: document.querySelector(".wall").getBoundingClientRect().toJSON(),
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
  }))()`);
  assert.deepEqual(bounds.viewport, [width, height]);
  assert.equal(bounds.width, width, "prototype introduced horizontal page overflow");
  assert.equal(bounds.height, height, "prototype introduced vertical page overflow");
  assert.ok(bounds.composer.left >= 0 && bounds.composer.right <= width && bounds.composer.bottom <= height);
  assert.ok(bounds.wall.left >= 0 && bounds.wall.right <= width && bounds.wall.bottom <= height);
  assert.equal(bounds.reduced, motion === "reduce");
}

const chrome = await launchChrome({ port: await freePort(), url: URL });
try {
  const { client } = chrome;
  await waitFor(client, `/Trying to make true/.test(document.body.textContent)`, "prototype did not render");
  await assertViewport(client, 1440, 900, "no-preference");
  await assertVisibleControlsNamed(client);
  const defaultTruth = await client.evaluate(`(() => ({
    intent: document.querySelector("#venture-intent")?.textContent,
    motions: document.querySelectorAll(".motion").length,
    territory: document.querySelector("#territory-heading")?.textContent,
    openConcepts: document.querySelectorAll(".open-concept:not([hidden])").length,
    wall: document.querySelector("#wall-item")?.textContent,
    returned: document.querySelector("#recent-return")?.textContent,
    machineryHidden: document.querySelector("#machinery")?.hidden,
  }))()`);
  assert.match(defaultTruth.intent, /credible work/i);
  assert.equal(defaultTruth.motions, 3);
  assert.match(defaultTruth.territory, /campus distribution door/i);
  assert.equal(defaultTruth.openConcepts, 2);
  assert.match(defaultTruth.wall, /needs you/i);
  assert.match(defaultTruth.returned, /4 of 6/i);
  assert.equal(defaultTruth.machineryHidden, true);
  await capture(client, "buffalo-venture-1440x900");

  await click(client, '[data-entity="concept:referral"]');
  await waitFor(client, `!document.querySelector("#concept-popover").hidden`, "open concept did not reveal contextual meaning");
  assert.match(await client.evaluate(`document.querySelector("#concept-popover").textContent`), /no execution effect/i);
  await capture(client, "buffalo-open-concept-1440x900", { fromSurface: false });
  await click(client, "#use-in-drover");
  assert.match(await client.evaluate(`document.querySelector("#mutation-preview").textContent`), /enter teammate context/i);
  await click(client, "#apply-mutation");
  await waitFor(client, `/Reusable system/.test(document.querySelector('[data-entity="concept:referral"]')?.textContent)`, "concept promotion did not apply");
  assert.match(await client.evaluate(`document.querySelector("#concept-popover").textContent`), /founder-applied role/i);
  await capture(client, "buffalo-operational-promotion-1440x900");
  await click(client, "#concept-close");

  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "n", code: "KeyN" });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "n", code: "KeyN" });
  await waitFor(client, `!document.querySelector("#concept-editor").hidden`, "keyboard concept creation did not open");
  await client.evaluate(`document.querySelector("#concept-input").value = "Builder dinners"`);
  await click(client, "#create-concept");
  assert.match(await client.evaluate(`document.querySelector("#concept-popover").textContent`), /nothing about execution|no execution effect/i);
  assert.equal(await client.evaluate(`document.querySelectorAll(".open-concept:not([hidden])").length`), 3);
  await click(client, "#concept-close");

  await click(client, '[data-go="architecture"]');
  await click(client, '[data-entity="system:work-proof"]');
  await waitFor(client, `!document.querySelector("#focus-scene").hidden`, "shared-system focus did not open");
  assert.match(await client.evaluate(`document.querySelector("#focus-detail").textContent`), /multiple repeatable motions/i);

  await click(client, '[data-go="campaign"]');
  await waitFor(client, `getComputedStyle(document.querySelector(".campaign-zone")).opacity === "1"`, "campaign altitude did not render");
  await capture(client, "buffalo-campaign-trace-1440x900", { fromSurface: false });
  await click(client, ".release-node");
  assert.match(await client.evaluate(`document.querySelector("#focus-detail").textContent`), /Nothing has crossed/i);
  await click(client, '[data-focus="outcome:drop-return"]');
  assert.match(await client.evaluate(`document.querySelector("#focus-detail").textContent`), /does not claim/i);
  await capture(client, "buffalo-outcome-trace-1440x900");

  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "o", code: "KeyO" });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "o", code: "KeyO" });
  await waitFor(client, `!document.querySelector("#outline").hidden`, "keyboard outline did not open");
  assert.equal(await client.evaluate(`document.querySelectorAll("#outline-list button").length >= 12`), true);
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  await waitFor(client, `document.querySelector("#outline").hidden`, "Escape did not close the outline");

  await click(client, "#machinery-button");
  assert.match(await client.evaluate(`document.querySelector("#machinery").textContent`), /worktree\/bet-project-drop/i);
  await capture(client, "buffalo-machinery-revealed-1440x900");
  await click(client, "#machinery-close");
  await click(client, "#wider-button");
  await click(client, '[data-entity="concept:champions"]');
  await capture(client, "buffalo-open-concept-1440x900");
  await click(client, "#concept-close");
  // Re-enter the campaign scene after several settled paints. Headless Chrome can occasionally leave
  // a transient compositor tile unpainted on the first focus capture; the later frame is the artifact.
  await click(client, '[data-go="campaign"]');
  await waitFor(client, `/bounded activation/i.test(document.querySelector("#focus-detail").textContent)`, "campaign focus did not settle for final capture");
  await capture(client, "buffalo-campaign-trace-1440x900");

  await click(client, "#venture-switch");
  await click(client, '[data-venture="denialshield"]');
  await waitFor(client, `/Dental teams prevent claim denials/.test(document.body.textContent)`, "unrelated venture did not render");
  assert.equal(await client.evaluate(`document.querySelectorAll(".motion").length`), 3);
  await assertViewport(client, 1280, 800, "reduce");
  await capture(client, "denialshield-venture-1280x800-reduced-motion");

  const result = {
    fixtures: ["Buffalo Projects", "DenialShield"],
    viewports: ["1440x900", "1280x800"],
    interactions: ["open concept", "operational promotion", "keyboard concept creation", "shared system", "campaign", "bet/release", "outcome", "wall", "machinery", "keyboard outline", "venture switch"],
    reducedMotion: true,
  };
  fs.writeFileSync(path.join(HERE, "evidence.json"), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await chrome.close();
}
