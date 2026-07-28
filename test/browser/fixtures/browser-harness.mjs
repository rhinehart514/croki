import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";

import { launchChrome } from "../lib/cdp.mjs";

const require = createRequire(import.meta.url);
const AXE_SOURCE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

export const ROOT = path.resolve(import.meta.dirname, "../../..");
export const PRODUCT_REPOSITORY = path.join(ROOT, "samples/acme-saas");
export const EVIDENCE_DIR = path.join(ROOT, "docs/design/evidence/workyard");

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
    const headers = Object.entries({
      ...request.headers,
      "x-drover-founder-capability": signFounderRequest(secret, request.method, request.url),
    }).map(([name, value]) => ({ name, value: String(value) }));
    void client.send("Fetch.continueRequest", { requestId, headers }).catch(() => {});
  });
  await client.send("Fetch.enable", {
    patterns: [{ urlPattern: `${base}/api/*`, requestStage: "Request" }],
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function freePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (child.exitCode !== null) throw new Error("Croki exited before becoming ready.");
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The deterministic local server is still starting.
    }
    await delay(50);
  }
  throw new Error(`Croki did not become ready at ${url}.`);
}

export async function waitForDom(client, expression, message, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const matched = await Promise.race([
      client.evaluate(expression).catch(() => false),
      delay(1_000).then(() => false),
    ]);
    if (matched) return;
    await delay(50);
  }
  throw new Error(message);
}

export async function waitForCanvasViewportStable(client, message = "canvas camera did not settle") {
  const deadline = Date.now() + 12_000;
  let previous = null;
  let stableSamples = 0;
  while (Date.now() < deadline) {
    const current = await client.evaluate("document.querySelector('.react-flow__viewport')?.style.transform || null");
    if (current && current === previous) stableSamples += 1;
    else stableSamples = 0;
    if (stableSamples >= 3) return current;
    previous = current;
    await delay(80);
  }
  throw new Error(message);
}

export async function bootFixture(seedFixture) {
  const port = await freePort();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "drover-acceptance-browser-"));
  const founderCapability = crypto.randomBytes(32).toString("base64url");
  const previousPersistence = process.env.GTM_IDE_PERSISTENCE;
  process.env.GTM_IDE_PERSISTENCE = "json";
  let fixture;
  try {
    fixture = await seedFixture({ root: home, repository: PRODUCT_REPOSITORY });
  } finally {
    if (previousPersistence === undefined) delete process.env.GTM_IDE_PERSISTENCE;
    else process.env.GTM_IDE_PERSISTENCE = previousPersistence;
  }

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
      base,
      child,
      fixture,
      founderCapability,
      home,
      founderFetch(pathname, init = {}) {
        const url = new URL(pathname, base).toString();
        const method = init.method ?? "GET";
        return fetch(url, {
          ...init,
          headers: { ...(init.headers ?? {}), "x-drover-founder-capability": signFounderRequest(founderCapability, method, url) },
        });
      },
      async close() {
        child.kill("SIGTERM");
        await Promise.race([once(child, "exit"), delay(2000).then(() => child.kill("SIGKILL"))]);
        fs.rmSync(home, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 });
      },
    };
  } catch (error) {
    child.kill("SIGTERM");
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 });
    throw new Error(`${error.message}\n${output}`);
  }
}

export async function openFixtureVenture(drover, { viewport = { width: 1920, height: 1080 } } = {}) {
  const chrome = await launchChrome({
    port: await freePort(),
    url: drover.base,
    beforeNavigate: async (client) => {
      // Establish the supported desktop contract before the first paint so performance metrics do
      // not include Chrome's unsupported 800x600 launch viewport or the later emulation resize.
      await client.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await client.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
      });
      await installFounderHost(client, drover.base, drover.founderCapability);
    },
  });
  const { client } = chrome;
  const ventureName = drover.fixture.venture.name;
  await waitForDom(
    client,
    `!!document.querySelector('.workspace-shell .thread-conversation') || /Resume work/i.test(document.body.textContent)`,
    "fixture venture neither auto-opened nor offered a picker",
  );

  // Returning founders now land directly in their last venture. The picker remains only for first-run or
  // an explicit portfolio return, so acceptance must accept both launch states. A multi-venture fixture can
  // auto-open a different venture; use the real in-workspace switcher to reach the fixture under test.
  const launchState = await client.evaluate(`(() => ({
    workspace: Boolean(document.querySelector('.workspace-shell .thread-conversation')),
    current: document.querySelector('.thread-venture-switcher summary strong')?.textContent?.trim() || null,
  }))()`);
  if (!launchState.workspace) {
    const opened = await client.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')]
        .find((entry) => entry.textContent.includes(${JSON.stringify(ventureName)}));
      button?.click();
      return Boolean(button);
    })()`);
    assert.equal(opened, true, `could not open ${ventureName}`);
  } else if (launchState.current !== ventureName) {
    const openedMenu = await client.evaluate(`(() => {
      const switcher = document.querySelector('.thread-venture-switcher summary');
      switcher?.click();
      return Boolean(switcher);
    })()`);
    assert.equal(openedMenu, true, `could not open the venture switcher from ${launchState.current ?? "the returned venture"}`);
    await waitForDom(
      client,
      `[...document.querySelectorAll('.thread-venture-switcher > div button')].some((entry) => entry.textContent.includes(${JSON.stringify(ventureName)}))`,
      `venture switcher did not offer ${ventureName}`,
    );
    const switched = await client.evaluate(`(() => {
      const option = [...document.querySelectorAll('.thread-venture-switcher > div button')]
        .find((entry) => entry.textContent.includes(${JSON.stringify(ventureName)}));
      option?.click();
      return Boolean(option);
    })()`);
    assert.equal(switched, true, `could not switch from ${launchState.current ?? "the returned venture"} to ${ventureName}`);
  }
  try {
    await waitForDom(
      client,
      `!!document.querySelector('.workspace-shell .thread-conversation') && document.querySelector('.thread-venture-switcher summary strong')?.textContent?.trim() === ${JSON.stringify(ventureName)}`,
      "fixture venture did not open in the conversation shell",
    );
  } catch (error) {
    const state = await client.evaluate(`(() => ({
      title: document.title,
      body: document.body.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 1200) || '',
      html: document.body.innerHTML.slice(0, 1200),
    }))()`);
    await chrome.close();
    await drover.close();
    throw new Error(`${error.message}\nBrowser state: ${JSON.stringify(state)}`);
  }
  return chrome;
}

// One shell: conversation is the permanent spine and the Canvas (the venture graph) is an auxiliary
// workbench panel. Its toggle changes presentation only; the selected SDK and Thread stay intact.
// The graph is a read projection of venture truth: pan/zoom and route focus are presentation, never a
// second source of business truth.
export async function openCanvas(client) {
  const found = await client.evaluate(`(() => { const toggle = document.querySelector('.work-composer-bar button[aria-label="Canvas"]'); if (!toggle) return false; if (toggle.getAttribute('aria-pressed') !== 'true') toggle.click(); return true; })()`);
  assert.equal(found, true, "the Canvas view toggle was unavailable");
  await waitForDom(client, `document.querySelector('button[aria-label="Canvas"]')?.getAttribute('aria-pressed') === 'true' && Boolean(document.querySelector('.workspace-canvas .product-gtm-surface'))`, "the Canvas did not open beside the spine");
}

export async function hideCanvas(client) {
  const found = await client.evaluate(`(() => { const toggle = document.querySelector('.work-composer-bar button[aria-label="Canvas"]'); if (!toggle) return false; if (toggle.getAttribute('aria-pressed') === 'true') toggle.click(); return true; })()`);
  assert.equal(found, true, "the Canvas view toggle was unavailable");
  await waitForDom(client, `document.querySelector('button[aria-label="Canvas"]')?.getAttribute('aria-pressed') === 'false'`, "the Canvas did not hide");
}

// Select a Canvas object by name through the ⌘K search that spans Threads, the Canvas, and actions.
// This replaces the retired product-rail object search; the rail is now Threads-only.
export async function selectCanvasObject(client, name) {
  await client.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`);
  await waitForDom(client, `!!document.querySelector('[role="combobox"][aria-label="Search this project"]')`, "the ⌘K search did not open");
  await client.evaluate(`(() => {
    const input = document.querySelector('[role="combobox"][aria-label="Search this project"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(name)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitForDom(client, `[...document.querySelectorAll('[role="option"] strong')].some((entry) => entry.textContent.trim() === ${JSON.stringify(name)})`, `${name} was not searchable on the Canvas`);
  await client.evaluate(`(() => { const option = [...document.querySelectorAll('[role="option"]')].find((entry) => entry.querySelector('strong')?.textContent.trim() === ${JSON.stringify(name)}); option?.click(); })()`);
}

export async function assertBasicAccessibility(client) {
  const unnamed = await client.evaluate(`(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const name = (element) =>
      element.getAttribute('aria-label')?.trim()
      || element.getAttribute('title')?.trim()
      || element.textContent?.trim()
      || (element.labels ? [...element.labels].map((label) => label.textContent?.trim()).filter(Boolean).join(' ') : '')
      || element.getAttribute('placeholder')?.trim();
    return [...document.querySelectorAll('button, a[href], input, select, textarea')]
      .filter(visible)
      .filter((element) => !name(element))
      .map((element) => element.outerHTML.slice(0, 180));
  })()`);
  assert.deepEqual(unnamed, [], `visible interactive elements need accessible names: ${unnamed.join(" | ")}`);

  const structure = await client.evaluate(`(() => {
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id).filter(Boolean);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const unlabeledImages = [...document.querySelectorAll('img')]
      .filter((image) => !image.hasAttribute('alt') && !image.getAttribute('aria-label'))
      .map((image) => image.outerHTML.slice(0, 180));
    const invalidAriaControls = [...document.querySelectorAll('[aria-controls]')]
      .filter((element) => !document.getElementById(element.getAttribute('aria-controls')))
      .map((element) => element.outerHTML.slice(0, 180));
    return { duplicateIds, unlabeledImages, invalidAriaControls };
  })()`);
  assert.deepEqual(structure.duplicateIds, [], `duplicate DOM ids: ${structure.duplicateIds.join(", ")}`);
  assert.deepEqual(structure.unlabeledImages, [], `images need alt text: ${structure.unlabeledImages.join(" | ")}`);
  assert.deepEqual(structure.invalidAriaControls, [], `aria-controls targets must exist: ${structure.invalidAriaControls.join(" | ")}`);
}

export async function assertAxeNoCritical(client, { context = "document", label = "surface" } = {}) {
  await client.evaluate(`(() => {
    if (window.axe) return true;
    ${AXE_SOURCE}
    return Boolean(window.axe);
  })()`);
  const violations = await client.evaluate(`(async () => {
    const root = ${context};
    if (!root) return [{ id: "missing-context", impact: "critical", description: "Axe context was not found", nodes: [] }];
    const result = await window.axe.run(root, {
      resultTypes: ["violations"],
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    });
    return result.violations
      .filter((violation) => violation.impact === "critical")
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        description: violation.description,
        nodes: violation.nodes.slice(0, 5).map((node) => ({ target: node.target, summary: node.failureSummary })),
      }));
  })()`);
  assert.deepEqual(violations, [], `${label} has critical axe violations: ${JSON.stringify(violations)}`);
}

function safeEvidenceName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function captureEvidence(client, name) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  await client.send("Page.bringToFront");
  await client.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  // The first capture also forces any deferred compositor tiles to paint after viewport or network
  // emulation. Keep the second stable frame as the review artifact.
  await client.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  await client.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const screenshot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  assert.ok(screenshot.data.length > 1_000, "desktop review screenshot was unexpectedly empty");
  const file = path.join(EVIDENCE_DIR, `${safeEvidenceName(name)}.png`);
  fs.writeFileSync(file, Buffer.from(screenshot.data, "base64"));
  return file;
}

export async function assertDesktopViewports(client, assertFixtureState, { evidencePrefix = "firm" } = {}) {
  const scenarios = [
    { width: 1920, height: 1080, motion: "no-preference" },
    { width: 1920, height: 1080, motion: "reduce" },
    { width: 1440, height: 900, motion: "no-preference" },
    { width: 1440, height: 900, motion: "reduce" },
    { width: 1280, height: 800, motion: "no-preference" },
    { width: 1280, height: 800, motion: "reduce" },
  ];

  for (const scenario of scenarios) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: scenario.width,
      height: scenario.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: scenario.motion }],
    });
    await waitForDom(client, `document.querySelector('.venture-canvas-flow.atlas-canvas')?.clientWidth > 0`, "firm layout did not settle");
    await waitForDom(client, `(() => {
      const canvas = document.querySelector('.venture-canvas-flow.atlas-canvas')?.getBoundingClientRect();
      return Boolean(canvas && [...document.querySelectorAll('.react-flow__node')].some((node) => {
        const rect = node.getBoundingClientRect(); const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
          && rect.right > canvas.left && rect.left < canvas.right && rect.bottom > canvas.top && rect.top < canvas.bottom;
      }));
    })()`, "canvas nodes did not render after the desktop viewport settled");
    await client.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    // Headless Chromium can leave its first resized compositor surface partially unpainted even
    // after layout is complete. Reasserting the settled desktop metrics refreshes that surface
    // without changing the scenario, so the evidence is a faithful viewport rather than black tiles.
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: scenario.width,
      height: scenario.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    const layout = await client.evaluate(`(() => {
      const rail = document.querySelector('.venture-workspace .vw-index')?.getBoundingClientRect();
      const canvas = document.querySelector('.venture-canvas-flow.atlas-canvas')?.getBoundingClientRect();
      const visibleCanvasNodes = canvas ? [...document.querySelectorAll('.react-flow__node')].filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0
          && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0
          && rect.right > canvas.left && rect.left < canvas.right
          && rect.bottom > canvas.top && rect.top < canvas.bottom;
      }).length : 0;
      return {
        width: innerWidth,
        height: innerHeight,
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        bodyOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
        rail: rail && { left: rail.left, right: rail.right, width: rail.width, height: rail.height },
        canvas: canvas && { left: canvas.left, right: canvas.right, width: canvas.width, height: canvas.height },
        firstNode: (() => {
          const node = document.querySelector('.react-flow__node');
          const rect = node?.getBoundingClientRect();
          const style = node ? getComputedStyle(node) : null;
          return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, display: style?.display, visibility: style?.visibility, opacity: style?.opacity } : null;
        })(),
        visibleCanvasNodes,
      };
    })()`);
    assert.equal(layout.width, scenario.width);
    assert.equal(layout.height, scenario.height);
    assert.equal(layout.reduced, scenario.motion === "reduce");
    assert.ok(layout.rail && layout.canvas, "desktop conversation and canvas must both remain mounted");
    // The ADE shell docks the conversation rail at the composite's 336px track (stage-maximal by
    // design — the stage holds ~85%). The rail element measures the track minus its border, so the
    // usable-width floor is the composite rail width, not the pre-ADE ≥360 assumption.
    assert.ok(layout.rail.width >= 320, `conversation compressed below a usable desktop width: ${layout.rail.width}`);
    assert.ok(layout.canvas.width > layout.rail.width, `canvas must remain the larger working plane: ${JSON.stringify({ conversation: layout.rail, canvas: layout.canvas })}`);
    assert.ok(layout.visibleCanvasNodes > 0, `canvas topology exists but no node is visible in the working plane: ${JSON.stringify({ canvas: layout.canvas, firstNode: layout.firstNode })}`);
    // In the ADE docked grid the conversation rail is its own cell to the LEFT of the stage — it no
    // longer floats inside the canvas (the pre-ADE flex model). The correct invariant is that the two
    // cells are side by side and never overlap: the rail sits at or before the stage's left edge.
    assert.ok(layout.rail.right <= layout.canvas.left + 1, `conversation rail overlaps the canvas stage cell: ${JSON.stringify({ rail: layout.rail, canvas: layout.canvas })}`);
    assert.ok(layout.canvas.right <= scenario.width + 1, "canvas escapes the desktop viewport");
    assert.ok(layout.bodyOverflow <= 1, `page has ${layout.bodyOverflow}px horizontal overflow`);
    await assertFixtureState(scenario);
    await assertBasicAccessibility(client);
    await captureEvidence(
      client,
      `${evidencePrefix}-${scenario.width}x${scenario.height}-${scenario.motion === "reduce" ? "reduced-motion" : "normal-motion"}`,
    );
  }
}

export async function setNetworkOffline(client, offline) {
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", {
    offline,
    latency: 0,
    downloadThroughput: offline ? 0 : -1,
    uploadThroughput: offline ? 0 : -1,
    connectionType: offline ? "none" : "ethernet",
  });
}

export async function assertNoUnhandledRejections(client) {
  const unhandled = await client.evaluate("window.__droverUnhandledRejections || []");
  assert.deepEqual(unhandled, []);
}

export async function assertPerformanceBudgets(client) {
  // The PerformanceObserver callback can land after the workspace readiness check, especially when the
  // browser journeys run back-to-back. Wait for the measured signal instead of racing it.
  await waitForDom(
    client,
    `(window.__droverPerformance?.lcp ?? 0) > 0`,
    "largest-contentful-paint was not observed",
  );
  const metrics = await client.evaluate("window.__droverPerformance || { cls: 0, inp: 0, lcp: 0 }");
  const layoutShifts = metrics.cls > 0.1
    ? await client.evaluate("window.__droverLayoutShifts || []")
    : [];
  assert.ok(metrics.lcp > 0, "largest-contentful-paint was not observed");
  assert.ok(metrics.lcp <= 2_500, `LCP ${metrics.lcp.toFixed(1)}ms exceeds 2500ms`);
  assert.ok(metrics.cls <= 0.1, `CLS ${metrics.cls.toFixed(3)} exceeds 0.1: ${JSON.stringify(layoutShifts)}`);
  if (metrics.inp > 0) assert.ok(metrics.inp <= 200, `INP ${metrics.inp.toFixed(1)}ms exceeds 200ms`);
  return metrics;
}
