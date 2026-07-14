#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { launchChrome } from "./lib/cdp.mjs";
import { createBet } from "../../brain/src/firm/bet.mjs";
import { summon } from "../../brain/src/firm/crew.mjs";
import { recordOutcome } from "../../brain/src/firm/market.mjs";
import { setVentureDoc } from "../../brain/src/firm/venture-store.mjs";
import { park } from "../../brain/src/firm/wall.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PRODUCT_REPOSITORY = path.join(ROOT, "samples/acme-saas");

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function freePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error("Drover exited before becoming ready.");
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Still starting.
    }
    await delay(50);
  }
  throw new Error(`Drover did not become ready at ${url}.`);
}

async function waitForDom(client, expression, message) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (await client.evaluate(expression).catch(() => false)) return;
    await delay(50);
  }
  throw new Error(message);
}

async function bootDrover() {
  const port = await freePort();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "drover-firm-browser-store-"));
  const env = {
    ...process.env,
    GTM_IDE_HOME: home,
    GTM_IDE_PERSISTENCE: "json",
    GTM_IDE_FOUNDER_CODE: "firm-fixture-founder",
    GTM_IDE_DISABLE_CLAUDE_CODE: "1",
    HOST: "127.0.0.1",
    PORT: String(port),
  };
  const child = spawn(process.execPath, ["brain/src/server.mjs"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(`${base}/api/health`, child);
    return {
      base, home, child,
      async close() {
        child.kill("SIGTERM");
        await Promise.race([once(child, "exit"), delay(2000).then(() => child.kill("SIGKILL"))]);
        fs.rmSync(home, { recursive: true, force: true });
      },
    };
  } catch (error) {
    child.kill("SIGTERM");
    fs.rmSync(home, { recursive: true, force: true });
    throw new Error(`${error.message}\n${output}`);
  }
}

function setControl(selector, value) {
  return `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`;
}

test("desktop firm journey: bind product, set heat, and render purpose-correct wall decisions", async () => {
  const drover = await bootDrover();
  const chrome = await launchChrome({ port: await freePort(), url: drover.base });
  try {
    const { client } = chrome;
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await waitForDom(client, `/No ventures yet/i.test(document.body.textContent)`, "venture picker did not render");
    assert.equal(await client.evaluate(setControl('[aria-label="New venture name"]', "Acme firm")), true);
    assert.equal(await client.evaluate(setControl('[aria-label="Product repository path"]', PRODUCT_REPOSITORY)), true);
    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((entry) => /start venture/i.test(entry.textContent)); button?.click(); return !!button; })()`), true);
    await waitForDom(client, `/Unlock founder actions/i.test(document.body.textContent)`, "founder unlock did not open");
    assert.equal(await client.evaluate(setControl('input[placeholder="Founder action code"]', "firm-fixture-founder")), true);
    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((entry) => /^unlock$/i.test(entry.textContent.trim())); button?.click(); return !!button; })()`), true);
    await waitForDom(client, `!!document.querySelector('[aria-label="The firm: crew, their bets, and the wall."]')`, "firm lens did not open");

    const [venture] = await client.evaluate(`fetch('/api/ventures').then((response) => response.json()).then((body) => body.ventures)`);
    assert.equal(venture.repository, fs.realpathSync(PRODUCT_REPOSITORY));

    const options = { root: drover.home };
    summon(venture.id, "outreach-writer", {}, options);
    const bet = createBet({ ventureId: venture.id, intent: "invite operations leads", teammateRef: "outreach-writer" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);
    park({ ventureId: venture.id, betId: bet.id, purpose: "release", effect: { kind: "message", to: "lead@example.com", body: "A precise invitation" } }, options);
    park({ ventureId: venture.id, betId: bet.id, purpose: "answer", effect: { question: "Which segment deserves the first pass?" } }, options);
    park({ ventureId: venture.id, betId: bet.id, purpose: "end-bet", effect: { kind: "kill-proposal", reason: "The angle may be exhausted" } }, options);
    recordOutcome({ ventureId: venture.id, joinKey: bet.joinKey, outcomeKind: "reply", body: "Tell me more", providerEventId: "browser-fixture-reply" }, options);

    await waitForDom(client, `/4 waiting at the wall/i.test(document.body.textContent)`, "the four founder-attention items did not reach the lens");
    await client.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((entry) => /waiting at the wall/i.test(entry.textContent)); button?.click(); return !!button; })()`);
    await waitForDom(client, `/Acknowledge/.test(document.body.textContent)`, "wall review did not open");
    const actions = await client.evaluate(`[...document.querySelectorAll('.firm-wall-review-actions button')].map((button) => button.textContent.trim())`);
    for (const expected of ["Release", "Reject", "Answer", "Dismiss", "Acknowledge", "Kill bet", "Keep bet"]) {
      assert.ok(actions.includes(expected), `missing ${expected} action`);
    }

    assert.equal(await client.evaluate(setControl('.firm-heat-control select', "steady")), true);
    assert.equal(await client.evaluate(setControl('.firm-heat-control input', "4")), true);
    await client.evaluate(`(() => { const button = [...document.querySelectorAll('.firm-heat-control button')].find((entry) => /save/i.test(entry.textContent)); button?.click(); return !!button; })()`);
    await waitForDom(client, `fetch('/api/ventures/${venture.id}/heat').then((response) => response.json()).then((heat) => heat.heat === 'steady' && heat.dailySpendUsd === 4)`, "heat setting did not persist");

    const unhandled = await client.evaluate("window.__droverUnhandledRejections || []");
    assert.deepEqual(unhandled, []);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
