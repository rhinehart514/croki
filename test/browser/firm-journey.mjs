#!/usr/bin/env node

// Cutover smoke journey: opening a venture lands the thread rail + permanent conversation, with no
// workbench, ontology browser, or always-mounted visual. Rich material and the venture map are summoned
// beside this conversation; deeper seeded journeys cover canonical work and the founder boundary.

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
    if (child.exitCode !== null) throw new Error("Croki exited before becoming ready.");
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Still starting.
    }
    await delay(50);
  }
  throw new Error(`Croki did not become ready at ${url}.`);
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

test("cutover: opening a venture lands the one-shell founder workspace", async () => {
  const drover = await bootDrover();
  const chrome = await launchChrome({
    port: await freePort(),
    url: drover.base, // no ?shell param → the sole default shell, VentureWorkspace
    beforeNavigate: (client) => installFounderHost(client, drover.base, drover.founderCapability),
  });
  try {
    const { client } = chrome;
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await waitForDom(client, `/Open a codebase/i.test(document.body.textContent)`, "direct codebase-first path did not render");
    await waitForDom(
      client,
      `(() => { const button = [...document.querySelectorAll('button')].find((entry) => entry.getAttribute('aria-label') === 'Add acme-saas codebase'); return Boolean(button && !button.disabled); })()`,
      "the current repository did not become available to connect",
    );
    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((entry) => entry.getAttribute('aria-label') === 'Add acme-saas codebase'); button?.click(); return Boolean(button && !button.disabled); })()`), true);

    await waitForDom(client, `!!document.querySelector('.workspace-shell .thread-rail')`, "the workspace rail did not mount");
    await waitForDom(client, `!!document.querySelector('.workspace-shell .thread-conversation [role="log"]')`, "the mounted conversation did not render");
    await waitForDom(client, `document.querySelector('.thread-composer textarea')?.placeholder === 'Describe what you want to build…'`, "the connected codebase did not open the direct Work composer");
    assert.equal(await client.evaluate(`document.querySelector('.thread-rail')?.getBoundingClientRect().width`), 272, "the default thread rail is not 272px");
    assert.equal(await client.evaluate(`document.querySelector('.work-surface')?.getBoundingClientRect().width`), 1648, "the Work ADE does not own the remaining desktop width");
    assert.equal(await client.evaluate(`document.querySelector('.thread-conversation')?.getBoundingClientRect().width > 1500 && !document.querySelector('.work-workbench')`), true, "a fresh venture did not give conversation the available Work surface until repository work exists");
    assert.equal(await client.evaluate(`!document.querySelector('.visual-stage')`), true, "a visual mounted before the founder opened one");
    assert.equal(await client.evaluate(`!document.querySelector('[data-testid="venture-workbench"]')`), true, "the retired workbench leaked into the default shell");
    assert.equal(await client.evaluate(`(() => { const toggle = [...document.querySelectorAll('button')].find((entry) => entry.getAttribute('aria-label') === 'Canvas'); return Boolean(toggle) && toggle.getAttribute('aria-pressed') === 'false' && ![...document.querySelectorAll('button')].some((entry) => /Releases/.test(entry.textContent)); })()`), true, "the one shell did not mount a single closed Canvas toggle without a Releases destination");
    assert.equal(await client.evaluate(`!document.querySelector('.workspace-shell[data-canvas-open]')`), true, "the Canvas opened before the founder asked for it");
    assert.equal(await client.evaluate(`(() => { const bar = document.querySelector('.work-composer-bar'); const canvas = bar?.querySelector('button[aria-label="Canvas"]'); const model = bar?.querySelector('[aria-label="SDK model"]'); return Boolean(canvas && model) && canvas.getAttribute('aria-pressed') === 'false' && ![...bar.querySelectorAll('button')].some((entry) => entry.textContent.trim() === 'Code'); })()`), true, "the composer did not keep the selected SDK beside a presentation-only Canvas toggle");
    assert.equal(await client.evaluate(`(() => { const bar = document.querySelector('.work-composer-bar'); const model = bar?.querySelector('[aria-label="SDK model"]'); const text = bar?.textContent || ''; return Boolean(model && text.includes('acme-saas') && text.includes('Isolated worktree') && text.includes('Guarded')); })()`), true, "Work did not expose repository, worktree, founder guard, and model context");
    assert.equal(await client.evaluate(`(() => {
      const bar = document.querySelector('.work-composer-bar');
      if (!bar) return false;
      const boundary = bar.getBoundingClientRect();
      return [...bar.children].every((child) => {
        const rect = child.getBoundingClientRect();
        return rect.left >= boundary.left - 1 && rect.right <= boundary.right + 1;
      });
    })()`), true, "Thread controls escaped the composer width");

    // A fresh thread stays local until the founder sends its first direction.
    const durableThreadsBeforeDraft = await client.evaluate(`document.querySelectorAll('.thread-rail-row').length`);
    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('.thread-rail button')].find((entry) => /new thread/i.test(entry.textContent)); button?.click(); return Boolean(button); })()`), true);
    await waitForDom(client, `document.querySelector('.thread-composer textarea')?.placeholder === 'Describe what you want to build…'`, "the local draft did not use the coding composer");
    assert.equal(await client.evaluate(`document.querySelectorAll('.thread-log .thread-message').length`), 0, "the previous Thread leaked into the new local draft");
    assert.equal(await client.evaluate(`document.querySelectorAll('.thread-rail-row').length`), durableThreadsBeforeDraft, "an empty durable thread was created before first send");

    // No legacy triptych presentation ships in the default DOM.
    assert.equal(await client.evaluate(`!document.querySelector('.firm-app-rail')`), true, "a retired conversation rail leaked into the default DOM");
    assert.equal(await client.evaluate(`!document.querySelector('.firm-app-inspector')`), true, "a retired inspector cell leaked into the default DOM");
    assert.equal(await client.evaluate(`!document.querySelector('.firm-app-body')`), true, "the retired triptych grid leaked into the default DOM");
  } finally {
    await chrome.close();
    await drover.close();
  }
});
