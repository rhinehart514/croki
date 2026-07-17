#!/usr/bin/env node
// Visual capture harness for the Now workspace. Drives the running dev server (default :4317) with the
// existing CDP Chrome launcher, opens a venture, and screenshots the founder surfaces at each supported
// desktop width plus a focused direction workspace. Console errors and unhandled rejections are reported
// so a render defect or a runtime error is caught, not inferred.
//
//   node test/browser/capture-now.mjs [--url http://127.0.0.1:4317] [--out <dir>] [--venture "Buffalo Projects"]
import fs from "node:fs";
import path from "node:path";
import { launchChrome } from "./lib/cdp.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []));
const URL = args.url ?? "http://127.0.0.1:4317";
const OUT = args.out ?? path.join(process.env.SCRATCH ?? "/tmp", "now-shots");
const VENTURE = args.venture ?? "Buffalo Projects";
const WIDTHS = [1440, 1100, 1000, 960];
const PORT = 9223;

fs.mkdirSync(OUT, { recursive: true });
const errors = [];

async function poll(client, expr, { tries = 120, gap = 100 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    if (await client.evaluate(expr).catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, gap));
  }
  return false;
}

async function width(client, w) {
  await client.send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
  await new Promise((r) => setTimeout(r, 350));
}

async function shot(client, name) {
  const { data } = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const file = path.join(OUT, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  console.log("shot", file);
}

async function collectConsole(client) {
  client.on("Log.entryAdded", ({ entry }) => { if (entry.level === "error") errors.push(`[console] ${entry.text}`); });
  client.on("Runtime.consoleAPICalled", ({ type, args }) => {
    if (type === "error") errors.push(`[console.error] ${args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
  });
  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    errors.push(`[exception] ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
  });
}

const clickByText = (sel, text) => `(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(n => n.textContent.includes(${JSON.stringify(text)})); if (el) { el.click(); return true; } return false; })()`;

const { client, close } = await launchChrome({ port: PORT, url: URL, beforeNavigate: collectConsole });
try {
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // Venture entry.
  const picked = await poll(client, `!!document.querySelector('.firm-app')`);
  if (!picked) throw new Error("venture picker never rendered");
  await shot(client, "01-venture-picker");
  const opened = await client.evaluate(clickByText("button", VENTURE));
  if (!opened) throw new Error(`venture "${VENTURE}" not found in picker`);

  // Now shell — home (no direction selected): centred composer + recent list, rail is the index.
  const shell = await poll(client, `!!document.querySelector('.now')`);
  if (!shell) throw new Error("Now shell never rendered after opening venture");
  await poll(client, `!!document.querySelector('.now-rail-dir, .now-empty')`);

  for (const w of WIDTHS) { await width(client, w); await shot(client, `02-now-${w}`); }

  // A direction workspace (a specific one when --open text is given, else the first rail direction).
  await width(client, 1440);
  const openExpr = args.open
    ? `(() => { const r = [...document.querySelectorAll('.now-rail-dir')].find(n => n.textContent.includes(${JSON.stringify(args.open)})); if (r) { r.click(); return true; } return false; })()`
    : `(() => { const r = document.querySelector('.now-rail-dir'); if (r) { r.click(); return true; } return false; })()`;
  const row = await client.evaluate(openExpr);
  if (row) {
    const detail = await poll(client, `!!document.querySelector('.now-doc')`);
    if (detail) {
      for (const w of [1440, 1100, 1000, 960]) { await width(client, w); await shot(client, `03-direction-${w}`); }
      // Scroll to the decision so the attached founder-held act is captured, not just the artifact.
      await width(client, 1440);
      await client.evaluate(`(() => { const g = document.querySelector('.now-gate'); if (g) g.scrollIntoView({ block: 'center' }); return true; })()`);
      await new Promise((r) => setTimeout(r, 300));
      await shot(client, "03-direction-decision");
      // The persistent composer docked at the bottom of the active workspace.
      await client.evaluate(`(() => { const d = document.querySelector('.now-dock'); if (d) d.scrollIntoView({ block: 'end' }); return true; })()`);
      await new Promise((r) => setTimeout(r, 200));
      await shot(client, "03-direction-dock");
    }
  } else {
    console.log("no direction rows to open (venture may be empty)");
  }

  // Needs-you filter on the rail.
  await width(client, 1440);
  await client.evaluate(clickByText(".now-rail-needs", "Needs you"));
  await new Promise((r) => setTimeout(r, 300));
  await shot(client, "04-needs-you");

  // Stale/offline: fail every /api request in THIS headless browser only (the server keeps running),
  // so the poll goes stale and the honest stale treatment can be captured.
  if (args.stale) {
    await width(client, 1440);
    await client.evaluate(clickByText(".now-nav-item", "Now"));
    await new Promise((r) => setTimeout(r, 300));
    await client.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/*", requestStage: "Request" }] });
    client.on("Fetch.requestPaused", ({ requestId }) => { void client.send("Fetch.failRequest", { requestId, errorReason: "Failed" }).catch(() => {}); });
    const banner = await poll(client, `!!document.querySelector('.now-stale')`, { tries: 80, gap: 200 });
    console.log("stale banner:", banner ? "shown" : "MISSING");
    await shot(client, "05-stale-now");
    await client.evaluate(`(() => { const r = document.querySelector('.now-row'); if (r) r.click(); return true; })()`);
    await new Promise((r) => setTimeout(r, 400));
    await shot(client, "05-stale-direction");
  }

  const rejections = await client.evaluate(`JSON.stringify(window.__droverUnhandledRejections || [])`);
  const parsed = JSON.parse(rejections || "[]");
  for (const r of parsed) errors.push(`[rejection] ${r}`);

  console.log("\n=== CONSOLE / RUNTIME ===");
  console.log(errors.length ? errors.join("\n") : "clean — no console errors or rejections");
} finally {
  await close();
}
