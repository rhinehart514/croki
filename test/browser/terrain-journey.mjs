#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { launchChrome } from "./lib/cdp.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SAMPLE = path.join(ROOT, "samples/acme-saas");
const FIXTURE_DIR = path.join(ROOT, "brain/test/fixtures/terrain");
const TERRAIN_VIEW = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, "terrain-view.json"), "utf8"));
const READ_CASES = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, "terrain-read-cases.json"), "utf8"));
const THREE_HYPOTHESES = ["valid-derived-opening", "speculative-opening", "tension-with-counterevidence"]
  .flatMap((id) => READ_CASES.cases.find((item) => item.id === id).response.hypotheses);
const CHANGED_READ = READ_CASES.cases.find((item) => item.id === "outcome-changed-read").response;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "compact", width: 1024, height: 768 },
  { name: "narrow", width: 390, height: 844, mobile: true },
];

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function freePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(url, child, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child?.exitCode !== null) throw new Error(`${label} exited before it became ready.`);
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Process is still starting.
    }
    await delay(50);
  }
  throw new Error(`${label} did not become ready at ${url}.`);
}

function scrubbedEnvironment(home, port) {
  const env = { ...process.env, GTM_IDE_HOME: home, GTM_IDE_PERSISTENCE: "json", GTM_IDE_OPERATOR_RUNTIME: "none", GTM_IDE_DISABLE_CLAUDE_CODE: "1", HOST: "127.0.0.1", PORT: String(port) };
  for (const key of ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "OPENAI_API_KEY", "CODEX_API_KEY"]) delete env[key];
  return env;
}

async function bootDrover() {
  const port = await freePort();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "drover-terrain-browser-store-"));
  const child = spawn(process.execPath, ["brain/src/server.mjs"], {
    cwd: ROOT,
    env: scrubbedEnvironment(home, port),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitFor(`${base}/api/health`, child, "Drover");
    const created = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Acme terrain fixture", repoPath: SAMPLE, winEvent: "signup_completed" }),
    });
    if (!created.ok) assert.fail(`sample grounding failed: ${await created.text()}`);
    const body = await created.json();
    return {
      base,
      child,
      home,
      output: () => output,
      projectId: body.activeProjectId,
      async close() {
        child.kill("SIGTERM");
        await Promise.race([once(child, "exit"), delay(2000).then(() => child.kill("SIGKILL"))]);
        fs.rmSync(home, { recursive: true, force: true });
      },
    };
  } catch (error) {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), delay(2000).then(() => child.kill("SIGKILL"))]);
    fs.rmSync(home, { recursive: true, force: true });
    throw error;
  }
}

async function proxyResponse(upstream, request, response) {
  const target = new URL(request.url, upstream);
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const upstreamResponse = await fetch(target, {
    method: request.method,
    headers: request.headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : Buffer.concat(chunks),
    redirect: "manual",
  });
  const headers = Object.fromEntries(upstreamResponse.headers.entries());
  response.writeHead(upstreamResponse.status, headers);
  response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
}

async function bootFixtureProxy(drover, { runtimeConnected = true } = {}) {
  const port = await freePort();
  let terrainReadCount = 0;
  let resultRecorded = false;
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    const send = (status, body) => {
      response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify(body));
    };
    try {
      if (request.method === "GET" && url.pathname === "/api/connection") {
        send(200, runtimeConnected
          ? { connected: true, label: "Fixture runtime", reason: null, selectedRuntime: "fixture", runtimes: [{ id: "fixture", available: true }] }
          : { connected: false, label: null, reason: "No local runtime is connected.", selectedRuntime: null, runtimes: [] });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/operating-view") {
        const actual = await fetch(new URL(request.url, drover.base), { headers: request.headers });
        const actualBody = actual.ok ? await actual.json() : {};
        send(200, { ...actualBody, ...TERRAIN_VIEW, projectId: drover.projectId, product: { ...TERRAIN_VIEW.product, projectRef: { type: "product", id: drover.projectId } } });
        return;
      }
      if (/\/terrain(?:-read|\/read)?(?:\/stream)?$/.test(url.pathname) && request.method === "POST") {
        terrainReadCount += 1;
        const count = Math.min(terrainReadCount, THREE_HYPOTHESES.length);
        send(200, {
          schemaVersion: 1,
          id: `fixture-read-${terrainReadCount}`,
          projectId: drover.projectId,
          generatedAt: "2026-07-10T12:01:00.000Z",
          inputFingerprint: resultRecorded ? "fixture:sample-acme:joined-outcome-v2" : READ_CASES.inputFingerprint,
          runtime: READ_CASES.runtime,
          hypotheses: resultRecorded ? CHANGED_READ.hypotheses : THREE_HYPOTHESES.slice(0, count),
        });
        return;
      }
      if (/\/terrain\/(?:ask|crew)$/.test(url.pathname) && request.method === "POST") {
        send(200, READ_CASES.disagreement);
        return;
      }
      if (/\/terrain\/fixture-result$/.test(url.pathname) && request.method === "POST") {
        resultRecorded = true;
        send(201, { id: "outcome-brief-zero-conversion", joined: true, kind: "negative", stale: true });
        return;
      }
      await proxyResponse(drover.base, request, response);
    } catch (error) {
      send(502, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    }),
  };
}

function browserHelpers() {
  return `
    (() => {
      const visible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const byTestId = (id) => document.querySelector('[data-testid="' + id + '"]');
      const byText = (text) => [...document.querySelectorAll('button,[role="button"],a,h1,h2,h3,[role="heading"]')]
        .find((element) => visible(element) && (element.textContent || "").trim().toLowerCase().includes(text.toLowerCase()));
      window.__terrainEval = { visible, byTestId, byText };
      return true;
    })()
  `;
}

async function waitForDom(client, expression, reason, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await client.evaluate(expression).catch(() => false)) return;
    await delay(100);
  }
  throw new Error(reason);
}

async function activate(client, testId, text, reason, keyboardOnly) {
  const focusedOrClicked = await client.evaluate(`(() => {
    const element = window.__terrainEval.byTestId(${JSON.stringify(testId)}) || window.__terrainEval.byText(${JSON.stringify(text)});
    if (!window.__terrainEval.visible(element)) return false;
    if (${keyboardOnly ? "true" : "false"}) element.focus();
    else element.click();
    return true;
  })()`);
  assert.equal(focusedOrClicked, true, reason);
  if (keyboardOnly) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter" });
  }
}

async function assertAccessibility(client, viewport) {
  const failures = await client.evaluate(`(() => {
    const interactive = [...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"]')]
      .filter(window.__terrainEval.visible);
    const name = (element) => element.getAttribute('aria-label') || element.getAttribute('title') ||
      (element.getAttribute('aria-labelledby') ? document.getElementById(element.getAttribute('aria-labelledby'))?.textContent : '') ||
      element.textContent || element.getAttribute('placeholder') || element.getAttribute('name') || '';
    return interactive.filter((element) => !name(element).trim()).map((element) => element.outerHTML.slice(0, 180));
  })()`);
  assert.deepEqual(failures, [], `${viewport.name}: visible controls without accessible labels: ${failures.join(" | ")}`);

  const clipped = await client.evaluate(`(() => [...document.querySelectorAll('[data-terrain-primary="true"],[data-testid="terrain-primary-action"],[data-testid="founder-gate-approve"]')]
    .filter(window.__terrainEval.visible)
    .filter((element) => { const r = element.getBoundingClientRect(); return r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight; })
    .map((element) => element.getAttribute('data-testid') || element.textContent?.trim() || element.tagName))()`);
  assert.deepEqual(clipped, [], `${viewport.name}: clipped primary controls: ${clipped.join(", ")}`);
}

async function runJourney(client, viewport, { keyboardOnly = false } = {}) {
  await client.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile === true });
  await client.send("Page.reload", { ignoreCache: true });
  await waitForDom(client, "document.readyState === 'complete' && !!document.querySelector('#root')", `${viewport.name}: Drover did not finish loading`);
  await client.evaluate(browserHelpers());

  await waitForDom(
    client,
    `!!window.__terrainEval.byTestId("terrain-product-landmark")`,
    `${viewport.name}: Gate B step 2 failed — a grounded zero-pipeline product did not render the cited terrain landmark before a goal field. Lane B/C terrain projection and first-screen routing are not merged.`,
  );
  const goalRequired = await client.evaluate(`(() => { const goal = document.querySelector('[data-testid="goal-launcher"], input[required][name*="goal" i], textarea[required][name*="goal" i]'); return window.__terrainEval.visible(goal); })()`);
  assert.equal(goalRequired, false, `${viewport.name}: Gate B step 2 failed — a goal is required before deterministic product truth is useful`);

  await waitForDom(client, `document.querySelectorAll('[data-testid="terrain-hypothesis"]').length === 3`, `${viewport.name}: Gate B step 3 failed — three fixture hypotheses did not arrive progressively`);
  const progressiveCounts = await client.evaluate("window.__droverTerrainCounts || []");
  assert.deepEqual(progressiveCounts.slice(-3), [1, 2, 3], `${viewport.name}: Gate B step 3 rendered a batch reveal instead of progressive terrain (${progressiveCounts.join(", ")})`);
  await activate(client, "terrain-hypothesis", "Make the project brief", `${viewport.name}: Gate B step 4 could not focus a hypothesis`, keyboardOnly);
  await waitForDom(client, `(() => { const panel = window.__terrainEval.byTestId("terrain-hypothesis-detail"); return panel && /evidence/i.test(panel.textContent) && /falsifier|change the read/i.test(panel.textContent); })()`, `${viewport.name}: Gate B step 4 failed — focused terrain did not expose evidence and falsifier`);

  if (keyboardOnly) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    const focused = await client.evaluate(`document.activeElement !== document.body && !!document.activeElement`);
    assert.equal(focused, true, "keyboard-only: Tab did not reach a visible canvas control");
  }
  await activate(client, "terrain-ask-crew", "Ask crew", `${viewport.name}: Gate B step 5 could not ask the crew`, keyboardOnly);
  await waitForDom(client, `document.querySelectorAll('[data-testid="crew-position"]').length === 2`, `${viewport.name}: Gate B step 5 failed — two distinct teammate positions were not preserved`);
  const positions = await client.evaluate(`[...document.querySelectorAll('[data-testid="crew-position"]')].map((element) => element.textContent.trim())`);
  assert.notEqual(positions[0], positions[1], `${viewport.name}: teammate disagreement collapsed into synthetic consensus`);

  await activate(client, "terrain-turn-into-pipeline", "Turn into pipeline", `${viewport.name}: Gate B step 6 could not turn the hypothesis into a pipeline`, keyboardOnly);
  await waitForDom(client, `!!window.__terrainEval.byTestId("engineer-view")`, `${viewport.name}: Gate B step 7 failed — the chosen move did not open in Engineer`);
  await waitForDom(client, `(() => { const view = window.__terrainEval.byTestId("engineer-view"); return /intended effect/i.test(view.textContent) && /gate|approval|wall/i.test(view.textContent); })()`, `${viewport.name}: Gate B step 7 failed — Engineer omitted intended effect or gate consequence`);

  await activate(client, "pipeline-run", "Run", `${viewport.name}: Gate B step 8 could not run the fixture pipeline`, keyboardOnly);
  await waitForDom(client, `!!window.__terrainEval.byTestId("founder-gate")`, `${viewport.name}: Gate B step 8 failed — the run did not stop at the founder wall`);
  assert.equal(await client.evaluate(`!!window.__terrainEval.byTestId("external-release-receipt")`), false, `${viewport.name}: an external release appeared before founder approval`);
  await activate(client, "founder-gate-approve", "Approve", `${viewport.name}: Gate B step 9 requires an explicit browser founder action`, keyboardOnly);
  await waitForDom(client, `!!window.__terrainEval.byTestId("gate-approved-receipt")`, `${viewport.name}: Gate B step 9 did not persist the founder decision receipt`);
  await activate(client, "record-outcome", "Record result", `${viewport.name}: Gate B step 9 could not record a joined result`, keyboardOnly);
  await waitForDom(client, `!!window.__terrainEval.byTestId("joined-outcome")`, `${viewport.name}: the fixture result was not visibly joined`);

  await activate(client, "operator-view-toggle", "Operator", `${viewport.name}: Gate B step 10 could not return to Operator`, keyboardOnly);
  await waitForDom(client, `(() => { const root = document.querySelector('#root'); return /stale|updated|changed/i.test(root.textContent) && !!window.__terrainEval.byTestId("terrain-product-landmark"); })()`, `${viewport.name}: Gate B step 10 failed — the joined result did not return to affected terrain`);
  const beforeRefresh = await client.evaluate(`({ project: window.__terrainEval.byTestId("terrain-product-landmark")?.textContent, focus: window.__terrainEval.byTestId("terrain-focus")?.getAttribute("data-ref"), gate: !!window.__terrainEval.byTestId("gate-approved-receipt"), outcome: !!window.__terrainEval.byTestId("joined-outcome") })`);
  await client.send("Page.reload", { ignoreCache: true });
  await waitForDom(client, "document.readyState === 'complete' && !!document.querySelector('#root')", `${viewport.name}: refresh did not recover the app`);
  await client.evaluate(browserHelpers());
  const afterRefresh = await client.evaluate(`({ project: window.__terrainEval.byTestId("terrain-product-landmark")?.textContent, focus: window.__terrainEval.byTestId("terrain-focus")?.getAttribute("data-ref"), gate: !!window.__terrainEval.byTestId("gate-approved-receipt"), outcome: !!window.__terrainEval.byTestId("joined-outcome") })`);
  assert.deepEqual(afterRefresh, beforeRefresh, `${viewport.name}: Gate B step 11 lost project, focus, gate, or outcome history after refresh`);
  await assertAccessibility(client, viewport);
}

async function assertNoRuntimeValue(client, proxyBase) {
  await client.send("Page.navigate", { url: proxyBase });
  await waitForDom(client, "document.readyState === 'complete' && !!document.querySelector('#root')", "no-runtime pass did not load");
  await client.evaluate(browserHelpers());
  await waitForDom(client, `!!window.__terrainEval.byTestId("terrain-product-landmark")`, "no-runtime deterministic value failed — the cited terrain disappeared behind a runtime connection wall");
  assert.equal(await client.evaluate(`!!window.__terrainEval.byTestId("runtime-fullscreen-wall")`), false, "no-runtime state replaced deterministic terrain with a connection wall");
}

async function main() {
  let drover;
  let proxy;
  let disconnectedProxy;
  let chrome;
  const errors = [];
  try {
    drover = await bootDrover();
    proxy = await bootFixtureProxy(drover, { runtimeConnected: true });
    const chromePort = await freePort();
    chrome = await launchChrome({ port: chromePort, url: proxy.base });
    chrome.client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => errors.push(exceptionDetails.exception?.description || exceptionDetails.text));
    chrome.client.on("Runtime.consoleAPICalled", ({ type, args }) => {
      if (type === "error") errors.push(`console.error: ${args.map((arg) => arg.value ?? arg.description ?? "").join(" ")}`);
    });
    chrome.client.on("Log.entryAdded", ({ entry }) => { if (entry.level === "error") errors.push(entry.text); });
    for (const viewport of VIEWPORTS) {
      console.log(`Gate B: ${viewport.width}x${viewport.height}`);
      try { await runJourney(chrome.client, viewport); }
      catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    }
    console.log("Gate B: keyboard-only");
    try { await runJourney(chrome.client, VIEWPORTS[0], { keyboardOnly: true }); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }

    disconnectedProxy = await bootFixtureProxy(drover, { runtimeConnected: false });
    console.log("Gate B: no-runtime deterministic value");
    try { await assertNoRuntimeValue(chrome.client, disconnectedProxy.base); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }

    const unhandled = await chrome.client.evaluate("window.__droverUnhandledRejections || []").catch(() => []);
    errors.push(...unhandled.map((message) => `Unhandled rejection: ${message}`));
    assert.deepEqual(errors, [], `Gate B deterministic browser failures:\n- ${errors.join("\n- ")}`);
    console.log("Gate B passed at 1440x900, 1024x768, 390x844, keyboard-only, refresh, and no-runtime modes.");
  } finally {
    await chrome?.close();
    await disconnectedProxy?.close();
    await proxy?.close();
    await drover?.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
