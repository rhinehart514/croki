#!/usr/bin/env node

// Cutover smoke journey: opening a venture from the picker lands the workbench-first venture workspace,
// not the retired triptych or an always-mounted node map. The workspace's full behaviour — workbench,
// summoned map, scope/descend, lens reversibility, offline honesty, dense collapse, drag-connect + undo —
// is proven end-to-end in canvas-journey.mjs against the same no-flag default surface. The legacy
// triptych journey and its `?shell=legacy` hatch are retired with the flag.

import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { launchChrome } from "./lib/cdp.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PRODUCT_REPOSITORY = path.join(ROOT, "samples/acme-saas");

function signFounderRequest(secret, method, rawUrl) {
  const url = new URL(rawUrl);
  const requestPath = `${url.pathname}${url.search}`;
  const issuedAt = Date.now();
  const nonce = crypto.randomBytes(18).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${method.toUpperCase()}\n${requestPath}\n${issuedAt}\n${nonce}`)
    .digest("base64url");
  return `v1.${issuedAt}.${nonce}.${signature}`;
}

async function installFounderHost(client, base, secret) {
  client.on("Fetch.requestPaused", ({ requestId, request }) => {
    const requestHeaders = Object.entries({
      ...request.headers,
      "x-drover-founder-capability": signFounderRequest(secret, request.method, request.url),
    }).map(([name, value]) => ({ name, value: String(value) }));
    void client.send("Fetch.continueRequest", { requestId, headers: requestHeaders }).catch(() => {});
  });
  await client.send("Fetch.enable", {
    patterns: [{ urlPattern: `${base}/api/*`, requestStage: "Request" }],
  });
}

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
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression).catch(() => false)) return;
    await delay(50);
  }
  throw new Error(message);
}

async function bootDrover() {
  const port = await freePort();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "drover-firm-browser-store-"));
  const founderCapability = crypto.randomBytes(32).toString("base64url");
  const env = {
    ...process.env,
    GTM_IDE_HOME: home,
    GTM_IDE_PERSISTENCE: "json",
    GTM_IDE_DISABLE_CLAUDE_CODE: "1",
    GTM_IDE_FOUNDER_CAPABILITY: founderCapability,
    HOST: "127.0.0.1",
    PORT: String(port),
  };
  const child = spawn(process.execPath, [path.join(ROOT, "brain/src/server.mjs")], {
    cwd: PRODUCT_REPOSITORY,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(`${base}/api/health`, child);
    return {
      base, home, child, founderCapability,
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

test("cutover: opening a venture lands the venture workspace, not the retired triptych", async () => {
  const drover = await bootDrover();
  const chrome = await launchChrome({
    port: await freePort(),
    url: drover.base, // no ?shell param → the sole default shell, VentureWorkspace
    beforeNavigate: (client) => installFounderHost(client, drover.base, drover.founderCapability),
  });
  try {
    const { client } = chrome;
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await waitForDom(client, `/Start your first venture/i.test(document.body.textContent)`, "venture picker did not render");
    assert.equal(await client.evaluate(setControl('[aria-label="New venture name"]', "Workspace firm")), true);
    await waitForDom(
      client,
      `(() => { const button = [...document.querySelectorAll('button')].find((entry) => /start venture/i.test(entry.textContent)); return Boolean(button && !button.disabled); })()`,
      "the new-venture form did not become ready to submit",
    );
    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((entry) => /start venture/i.test(entry.textContent)); button?.click(); return Boolean(button && !button.disabled); })()`), true);

    // The venture opens at WORK: the adaptive workbench says where things stand and the unscoped dock can
    // direct the whole venture. The graph is not mounted at rest; Map remains one action away.
    await waitForDom(client, `!!document.querySelector('.venture-workspace[data-mode="work"]')`, "the venture workspace did not open in work mode");
    await waitForDom(client, `!!document.querySelector('.venture-workspace [data-testid="venture-workbench"][data-mode="work"]')`, "the venture workbench did not mount by default");
    await waitForDom(client, `(() => {
      const home = document.querySelector('[data-testid="venture-workbench"] [role="region"][aria-label*="where things stand"]');
      return Boolean(home && /Where things stand/i.test(home.textContent));
    })()`, "the venture home did not show where things stand");
    await waitForDom(client, `document.querySelector('.venture-workspace-dock .now-composer textarea')?.placeholder === 'Direct the venture'`, "the docked composer did not direct the whole venture");
    assert.equal(await client.evaluate(`!document.querySelector('.venture-workspace .venture-canvas-flow')`), true, "the venture graph mounted at rest instead of waiting for Map");
    assert.equal(await client.evaluate(`!!document.querySelector('.venture-workspace .workbench-map')`), true, "Map was not one action away from the workbench");

    // No legacy triptych presentation ships in the default DOM.
    assert.equal(await client.evaluate(`!document.querySelector('.firm-app-rail')`), true, "a retired conversation rail leaked into the default DOM");
    assert.equal(await client.evaluate(`!document.querySelector('.firm-app-inspector')`), true, "a retired inspector cell leaked into the default DOM");
    assert.equal(await client.evaluate(`!document.querySelector('.firm-app-body')`), true, "the retired triptych grid leaked into the default DOM");
  } finally {
    await chrome.close();
    await drover.close();
  }
});
