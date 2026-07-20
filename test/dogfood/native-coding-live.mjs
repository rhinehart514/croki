#!/usr/bin/env node

// Manual dogfood receipt: direct the installed Codex runtime through the real Electron product,
// inspect the returned repository proof in the same thread, and exercise founder-held apply. This is
// intentionally excluded from CI because it uses the founder's live provider session.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createVenture, listVentures, listVentureDocs } from "../../brain/src/firm/venture-store.mjs";
import { discardCodingWorkspace } from "../../brain/src/firm/code-workspace.mjs";
import { freePort, ROOT, waitForDom } from "../browser/fixtures/browser-harness.mjs";
import { launchDroverElectron } from "../browser/lib/electron-app.mjs";

const DIRECTION = "Implement only the continuous-integration acceptance wiring. Limit the implementation to package.json and .github/workflows/ci.yml: add a macOS GitHub Actions job that installs dependencies and runs the complete acceptance gate; include the native-coding browser journey in firm acceptance, include the real Electron receipt in test:electron, and include test:electron in test:acceptance. Do not edit documentation or native coding implementation. Run syntax checks and npm test; leave browser and Electron host receipts to Drover's host verification. Do not commit, push, deploy, or open a pull request.";

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitFor(client, expression, message, timeoutMs = 15 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression).catch(() => false)) return;
    await delay(250);
  }
  throw new Error(message);
}

async function send(client, text) {
  const entered = await client.evaluate(`(() => {
    const input = document.querySelector('.thread-composer textarea');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  assert.equal(entered, true, "the Electron composer was unavailable");
  await waitFor(client, `(() => { const button = document.querySelector('[aria-label="Send to this thread"]'); return Boolean(button && !button.disabled); })()`, "the direction did not become sendable", 10_000);
  const sent = await client.evaluate(`(() => { const button = document.querySelector('[aria-label="Send to this thread"]'); button?.click(); return Boolean(button && !button.disabled); })()`);
  assert.equal(sent, true, "the direction was not submitted");
}

const resumeArgument = process.argv.indexOf("--home");
const resumedHome = resumeArgument >= 0 ? process.argv[resumeArgument + 1] : null;
const home = resumedHome ? path.resolve(resumedHome) : fs.mkdtempSync(path.join(os.tmpdir(), "drover-live-dogfood-"));
const previousPersistence = process.env.GTM_IDE_PERSISTENCE;
process.env.GTM_IDE_PERSISTENCE = "json";
const options = { root: home, seedFoundingCrew: false };
let fixture = null;
let app = null;
let success = false;
try {
  fixture = resumedHome
    ? { venture: listVentures(options)[0], workspace: null }
    : { venture: createVenture({ name: "Drover dogfood", repository: ROOT }, options), workspace: null };
  if (!fixture.venture) throw new Error(`No retained dogfood venture exists at ${home}`);
  fixture.workspace = listVentureDocs(fixture.venture.id, "codeWorkspaces", options).find((entry) => entry.goal.includes("continuous integration")) ?? null;
  app = await launchDroverElectron({ root: ROOT, home, port: await freePort() });
  await waitForDom(app.client, `!!document.querySelector('.thread-composer textarea')`, "Drover did not open its conversation");
  const directedAt = Date.now();
  if (fixture.workspace) {
    await waitFor(app.client, `fetch('/api/ventures/${fixture.venture.id}/coding-workspaces').then((response) => response.json()).then((body) => body.workspaces.some((entry) => entry.id === '${fixture.workspace.id}' && entry.status === 'interrupted'))`, "Drover did not recover the interrupted live workspace", 30_000);
    await send(app.client, "Resume the retained implementation after the interruption. Implement the requested CI and acceptance wiring, resolve every verification failure, rerun the exact failed checks, and return only when the repository state and proof are reviewable. Do not commit or push.");
  } else {
    await send(app.client, DIRECTION);
  }
  await waitFor(app.client, `!!document.querySelector('.thread-agent-update[data-state="working"], .thread-agent-update[data-state="queued"]')`, "Codex never became visible in the thread", 30_000);
  await waitFor(app.client, `document.querySelector('.thread-composer textarea')?.disabled === false`, "the founder did not regain the composer", 10_000);
  const controlReturnedMs = Date.now() - directedAt;

  await waitFor(app.client, `fetch('/api/ventures/${fixture.venture.id}/coding-workspaces').then((response) => response.json()).then((body) => body.workspaces.some((entry) => entry.goal.includes('continuous integration') && !['running', 'preparing'].includes(entry.status)))`, "Codex did not return a durable coding attempt");
  let record = await app.client.evaluate(`fetch('/api/ventures/${fixture.venture.id}/coding-workspaces').then((response) => response.json()).then((body) => body.workspaces.find((entry) => entry.goal.includes('continuous integration')))`);
  let status = record?.status ?? null;
  if (status !== "reviewable") {
    await send(app.client, "Continue this same implementation. Resolve every recorded verification failure, rerun the exact failed checks, and return only when the repository state and proof are reviewable. Do not commit or push.");
    await waitFor(app.client, `fetch('/api/ventures/${fixture.venture.id}/coding-workspaces').then((response) => response.json()).then((body) => body.workspaces.some((entry) => entry.goal.includes('continuous integration') && entry.status === 'running'))`, "the correction did not resume the retained workspace", 30_000);
    await waitFor(app.client, `fetch('/api/ventures/${fixture.venture.id}/coding-workspaces').then((response) => response.json()).then((body) => body.workspaces.some((entry) => entry.goal.includes('continuous integration') && !['running', 'preparing'].includes(entry.status)))`, "the corrected attempt did not settle");
    record = await app.client.evaluate(`fetch('/api/ventures/${fixture.venture.id}/coding-workspaces').then((response) => response.json()).then((body) => body.workspaces.find((entry) => entry.goal.includes('continuous integration')))`);
    status = record?.status ?? null;
  }
  assert.equal(status, "reviewable", `live Codex returned ${status}`);

  await waitForDom(app.client, `!!document.querySelector('.work-workbench .code-workspace')`, "the live implementation did not return in the Work ADE");
  assert.equal(await app.client.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent.trim() === 'Approve checkpoint'); button?.click(); return Boolean(button && !button.disabled); })()`), true);
  await waitFor(app.client, `/Exact checkpoint approved/.test(document.querySelector('.work-workbench')?.textContent || '')`, "founder review did not persist", 20_000);
  assert.equal(await app.client.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent.trim() === 'Apply to source workspace'); button?.click(); return Boolean(button && !button.disabled); })()`), true);
  assert.equal(await app.client.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent.trim() === 'Confirm apply to source workspace'); button?.click(); return Boolean(button && !button.disabled); })()`), true);
  await waitFor(app.client, `(document.querySelector('.code-workspace-summary [data-status]')?.textContent || '').trim() === 'applied'`, "the founder-held apply did not complete", 30_000);

  record = await app.client.evaluate(`fetch('/api/ventures/${fixture.venture.id}/coding-workspaces').then((response) => response.json()).then((body) => body.workspaces.find((entry) => entry.goal.includes('continuous integration')))`);
  fixture.workspace = record;
  process.stdout.write(`${JSON.stringify({
    outcome: "applied",
    provider: record.providerSessions.at(-1)?.provider,
    threadRef: record.threadRef,
    runRefs: record.runRefs,
    workspace: record.worktree,
    branch: record.branch,
    checkpoints: record.checkpoints.map((entry) => entry.id),
    changedFiles: record.changedFiles,
    verification: record.verification.map((entry) => ({ command: entry.command, status: entry.status, exitCode: entry.exitCode })),
    controlReturnedMs,
    productConsequence: record.productConsequence,
  }, null, 2)}\n`);
  success = true;
} finally {
  await app?.close().catch(() => {});
  if (fixture?.workspace) {
    try { discardCodingWorkspace(fixture.venture.id, fixture.workspace.id, options); } catch { /* retain evidence on an incomplete cleanup */ }
  }
  if (previousPersistence === undefined) delete process.env.GTM_IDE_PERSISTENCE;
  else process.env.GTM_IDE_PERSISTENCE = previousPersistence;
  if (success) fs.rmSync(home, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 });
  else process.stderr.write(`Live dogfood state retained at ${home}\n`);
}
