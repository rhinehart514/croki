#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import { discardCodingWorkspace } from "../../brain/src/firm/code-workspace.mjs";
import { freePort, ROOT, waitForDom } from "./fixtures/browser-harness.mjs";
import { seedNativeCoding } from "./fixtures/native-coding-fixture.mjs";
import { launchDroverElectron } from "./lib/electron-app.mjs";

function clickButton(label) {
  return `(() => {
    const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent.trim() === ${JSON.stringify(label)});
    button?.click(); return Boolean(button && !button.disabled);
  })()`;
}

function listeningTcpPorts(pid) {
  const output = execFileSync("/usr/sbin/lsof", ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN", "-Fn"], { encoding: "utf8" });
  return [...output.matchAll(/:(\d+)$/gm)].map((match) => Number(match[1]));
}

function supervisedBrainPids(parentPid) {
  const output = execFileSync("/bin/ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" });
  return output.split("\n").flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (!match || Number(match[2]) !== parentPid || !match[3].includes("electron/brain-child.mjs")) return [];
    return [Number(match[1])];
  });
}

async function waitForReplacementBrain(parentPid, previousPid) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const replacement = supervisedBrainPids(parentPid).find((pid) => pid !== previousPid);
    if (replacement) return replacement;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Electron did not supervise a replacement Brain process.");
}

test("native coding: the real Electron host restores work and holds founder authority", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "drover-native-electron-"));
  const previousPersistence = process.env.GTM_IDE_PERSISTENCE;
  process.env.GTM_IDE_PERSISTENCE = "json";
  let fixture;
  let app = null;
  try {
    fixture = await seedNativeCoding({ root: home });
    const firstDebugPort = await freePort();
    app = await launchDroverElectron({ root: ROOT, home, port: firstDebugPort });
    assert.equal(fs.existsSync(path.join(home, ".runtime", "brain.json")), false, "Electron published a web-server runtime record");
    assert.equal(await app.client.evaluate(`location.protocol`), "file:", "Electron did not load the renderer as a local application asset");
    assert.equal(await app.client.evaluate(`document.visibilityState`), "visible", "Electron loaded the renderer without making its BrowserWindow visible");
    await waitForDom(app.client, `!!document.querySelector('.workspace-shell')`, "the visible Electron window did not render its workspace");
    assert.equal(await app.client.evaluate(`document.querySelector('.workspace-shell')?.dataset.desktopPlatform`), "darwin", "the renderer did not receive the native window platform");
    assert.equal(await app.client.evaluate(`(() => { const rect = document.querySelector('.thread-venture-switcher')?.getBoundingClientRect(); return Boolean(rect && (rect.top >= 42 || rect.left >= 78)); })()`), true, "the venture switcher still collided with the macOS traffic lights");
    assert.deepEqual([...new Set(listeningTcpPorts(app.child.pid))], [firstDebugPort], "Electron opened a TCP listener beyond the test-only DevTools port");
    const firstHealth = await app.client.evaluate(`window.droverDesktop.api.request({ path: "/api/health", method: "GET", headers: {}, body: "" }).then((response) => JSON.parse(response.body))`);
    assert.equal(firstHealth.ok, true, "the supervised desktop Brain did not answer through IPC");
    await waitForDom(app.client, `typeof window.droverDesktop?.selectRepository === 'function'`, "the actual Electron preload did not mount");
    await waitForDom(app.client, `document.querySelectorAll('.thread-material[data-kind="native-code"]').length === 2`, "Electron did not restore both coding attempts");
    assert.equal(await app.client.evaluate(`/Provider turn interrupted/.test(document.body.textContent) && /isolated workspace were retained/.test(document.body.textContent)`), true, "provider recovery did not name its layer and retained state");

    await waitForDom(app.client, `!!document.querySelector('.work-workbench .code-workspace')`, "Electron did not mount exact code beside conversation");
    const initialBrainPid = supervisedBrainPids(app.child.pid)[0];
    assert.ok(initialBrainPid, "Electron did not launch a supervised Brain child");
    const draft = "Keep this exact correction draft through engine recovery.";
    assert.equal(await app.client.evaluate(`(() => {
      const input = document.querySelector('.thread-composer textarea');
      if (!input) return false;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(draft)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return input.value === ${JSON.stringify(draft)};
    })()`), true, "the recovery receipt could not stage a founder draft");

    // A synchronously blocked engine cannot freeze or blank the BrowserWindow: stop only the
    // supervised child, then inspect the already-painted Thread, Review, and draft through CDP.
    process.kill(initialBrainPid, "SIGSTOP");
    try {
      assert.equal(await app.client.evaluate(`JSON.stringify({
        visible: document.visibilityState === 'visible',
        review: Boolean(document.querySelector('.work-workbench .code-workspace')),
        draft: document.querySelector('.thread-composer textarea')?.value,
      })`), JSON.stringify({ visible: true, review: true, draft }));
    } finally {
      process.kill(initialBrainPid, "SIGCONT");
    }

    // An unexpected engine exit rejects its in-flight generation, reaps its provider process group,
    // and reconnects without changing the visible Thread/Review or clearing the founder's draft.
    await app.client.evaluate(`(() => {
      window.__droverRecoveryNotices = [];
      const capture = () => {
        const text = document.querySelector('.firm-freshness')?.textContent?.replace(/\\s+/g, ' ').trim();
        if (text) window.__droverRecoveryNotices.push(text);
      };
      capture();
      window.__droverRecoveryObserver = new MutationObserver(capture);
      window.__droverRecoveryObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    })()`);
    process.kill(initialBrainPid, "SIGKILL");
    const replacementBrainPid = await waitForReplacementBrain(app.child.pid, initialBrainPid);
    assert.notEqual(replacementBrainPid, initialBrainPid);
    await waitForDom(
      app.client,
      `window.droverDesktop.api.request({ path: "/api/health", method: "GET", headers: {}, body: "" }).then((response) => JSON.parse(response.body).instanceId !== ${JSON.stringify(firstHealth.instanceId)}).catch(() => false)`,
      "the visible Electron window did not reconnect to its supervised Brain",
      20_000,
    );
    assert.equal(await app.client.evaluate(`JSON.stringify({
      visible: document.visibilityState === 'visible',
      review: Boolean(document.querySelector('.work-workbench .code-workspace')),
      draft: document.querySelector('.thread-composer textarea')?.value,
    })`), JSON.stringify({ visible: true, review: true, draft }));
    assert.equal(await app.client.evaluate(`window.__droverRecoveryNotices.some((entry) => /Work engine reconnecting/.test(entry) && /transcript, draft, and last Review remain visible/.test(entry))`), true, "engine recovery did not name its layer and retained state");
    await app.client.evaluate(`window.__droverRecoveryObserver?.disconnect()`);

    await waitForDom(app.client, `!!document.querySelector('button[aria-label="Rename thread"]')`, "the native thread title never became editable");
    assert.equal(await app.client.evaluate(`(() => { const button = document.querySelector('button[aria-label="Rename thread"]'); button?.click(); return Boolean(button); })()`), true, "the native thread title did not enter its rename state");
    await waitForDom(app.client, `!!document.querySelector('input[aria-label="Thread name"]')`, "the native thread name editor did not render");
    const renamed = await app.client.evaluate(`(() => {
      const input = document.querySelector('input[aria-label="Thread name"]');
      if (!input) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Native coding review');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.form?.requestSubmit();
      return true;
    })()`);
    assert.equal(renamed, true, "the native thread title editor could not submit");
    await waitForDom(app.client, `document.querySelector('.thread-header h1')?.textContent === 'Native coding review'`, "the renamed thread title did not persist through the desktop host");
    const terminalWorkspaceId = await app.client.evaluate(`(() => { const select = document.querySelector('.work-workbench-tools select'); const option = [...(select?.options || [])].find((entry) => entry.textContent.includes('reviewable')); if (!select || !option) return null; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, option.value); select.dispatchEvent(new Event('change', { bubbles: true })); return option.value; })()`);
    assert.ok(terminalWorkspaceId);
    await waitForDom(app.client, `/native-coding-browser-proof.txt/.test(document.querySelector('.work-workbench')?.textContent || '')`, "Electron did not select the reviewable attempt");

    // Terminal stays a contextual drawer, but its native PTYs are independently named and bound to
    // this exact attempt. Hiding the drawer unmounts xterm presentation without terminating either PTY.
    assert.equal(await app.client.evaluate(clickButton("Terminal")), true, "the contextual terminal drawer did not open");
    await waitForDom(app.client, `!!document.querySelector('.work-terminal-manager')`, "the native terminal manager did not mount");
    assert.equal(await app.client.evaluate(`(() => { const button = document.querySelector('button[aria-label="New terminal"]'); button?.click(); return Boolean(button); })()`), true, "a second named terminal could not be created");
    assert.equal(await app.client.evaluate(`(() => { const button = document.querySelector('button[aria-label="Split terminal"]'); button?.click(); return Boolean(button); })()`), true, "the two terminals could not split");
    await waitForDom(app.client, `document.querySelectorAll('.work-terminal-pane').length === 2`, "two independent terminal panes did not mount");
    await waitForDom(app.client, `window.droverDesktop.terminal.inspect(${JSON.stringify(fixture.venture.id)}, ${JSON.stringify(terminalWorkspaceId)}).then((items) => items.length === 2)`, "the two named PTYs did not start");
    const terminalProof = await app.client.evaluate(`(async () => {
      const bridge = window.droverDesktop.terminal;
      const sessions = await bridge.inspect(${JSON.stringify(fixture.venture.id)}, ${JSON.stringify(terminalWorkspaceId)});
      if (sessions.length !== 2) return { sessions: sessions.length };
      await bridge.write(sessions[0].sessionId, "printf 'TERMINAL_ONE_PROOF\\\\n'\\n");
      await bridge.write(sessions[1].sessionId, "printf 'TERMINAL_TWO_PROOF\\\\n'\\n");
      await new Promise((resolve) => setTimeout(resolve, 120));
      const snapshots = await Promise.all(sessions.map((entry) => bridge.open({
        ventureId: ${JSON.stringify(fixture.venture.id)}, workspaceId: ${JSON.stringify(terminalWorkspaceId)},
        terminalId: entry.terminalId, name: entry.name, cols: 90, rows: 24,
      })));
      return {
        sessions: sessions.length,
        firstId: sessions[0].terminalId,
        firstSessionId: sessions[0].sessionId,
        one: snapshots[0].snapshot,
        two: snapshots[1].snapshot,
      };
    })()`);
    assert.equal(terminalProof.sessions, 2);
    assert.match(terminalProof.one, /TERMINAL_ONE_PROOF/);
    assert.doesNotMatch(terminalProof.one, /TERMINAL_TWO_PROOF/);
    assert.match(terminalProof.two, /TERMINAL_TWO_PROOF/);
    assert.doesNotMatch(terminalProof.two, /TERMINAL_ONE_PROOF/);
    await app.client.evaluate(`window.droverDesktop.terminal.write(${JSON.stringify(terminalProof.firstSessionId)}, "printf 'TERMINAL_RELAUNCH_EXIT\\\\n'; exit 7\\n")`);
    await waitForDom(
      app.client,
      `window.droverDesktop.terminal.inspect(${JSON.stringify(fixture.venture.id)}, ${JSON.stringify(terminalWorkspaceId)}).then((items) => items.some((item) => item.terminalId === ${JSON.stringify(terminalProof.firstId)} && item.exit?.exitCode === 7))`,
      "the terminal did not persist its exact failing exit before app relaunch",
    );
    assert.equal(await app.client.evaluate(clickButton("Terminal")), true, "the terminal drawer did not hide");
    assert.equal(await app.client.evaluate(`window.droverDesktop.terminal.inspect(${JSON.stringify(fixture.venture.id)}, ${JSON.stringify(terminalWorkspaceId)}).then((items) => items.length === 2 && items.some((item) => item.running) && items.some((item) => item.exit?.exitCode === 7))`), true, "hiding the terminal drawer changed native PTY state");

    assert.equal(await app.client.evaluate(clickButton("Approve checkpoint")), true, "the trusted Electron host could not exercise founder review authority");
    await waitForDom(app.client, `/Checkpoint approved/.test(document.querySelector('.work-workbench')?.textContent || '')`, "Electron did not persist founder review");
    await waitForDom(
      app.client,
      `(() => { const facts = document.querySelector('.ship-review-facts'); const text = facts?.textContent || ''; return Boolean(facts && /Base/.test(text) && /Current/.test(text) && /Working tree/.test(text) && /Verification/.test(text) && /What confirmation will change/.test(text)); })()`,
      "the exact source-control review facts did not appear inside Review",
    );
    assert.equal(await app.client.evaluate(clickButton("Preview without shipping")), true, "the founder could not dry-run the exact source-control plan");
    await waitForDom(app.client, `/This was a preview\\. Nothing left your machine\\./.test(document.querySelector('.work-workbench')?.textContent || '')`, "the native dry-run receipt did not prove that nothing left the machine");

    await app.close();
    assert.equal(fs.existsSync(path.join(home, ".runtime", "brain.json")), false, "Electron wrote a Brain web-server location");
    const terminalStateDirectory = path.join(home, ".runtime", "terminal-state");
    const terminalStateFiles = fs.existsSync(terminalStateDirectory)
      ? fs.readdirSync(terminalStateDirectory).filter((entry) => entry.endsWith(".json"))
      : [];
    assert.equal(terminalStateFiles.length, 2, "Electron did not flush both terminal states before quitting");
    assert.ok(terminalStateFiles.every((entry) => (fs.statSync(path.join(terminalStateDirectory, entry)).mode & 0o777) === 0o600), "terminal state was not founder-private on disk");
    const exitedState = terminalStateFiles
      .map((entry) => JSON.parse(fs.readFileSync(path.join(terminalStateDirectory, entry), "utf8")))
      .find((record) => record.identity?.terminalId === terminalProof.firstId);
    assert.equal(exitedState?.identity?.workspaceId, terminalWorkspaceId);
    assert.match(exitedState?.state?.transcript ?? "", /TERMINAL_RELAUNCH_EXIT/);
    assert.equal(exitedState?.state?.exit?.exitCode, 7);
    app = await launchDroverElectron({ root: ROOT, home, port: await freePort() });
    const secondHealth = await app.client.evaluate(`window.droverDesktop.api.request({ path: "/api/health", method: "GET", headers: {}, body: "" }).then((response) => JSON.parse(response.body))`);
    assert.notEqual(secondHealth.instanceId, firstHealth.instanceId, "a relaunch reused the stopped Brain identity");
    await waitForDom(app.client, `document.querySelectorAll('.thread-material[data-kind="native-code"]').length === 2`, "a full Electron relaunch lost coding state", 30_000);
    assert.equal(await app.client.evaluate(`/native coding browser proof/i.test(document.body.textContent)`), true, "the durable implementation did not return after Electron relaunch");
    const returnedTerminalWorkspaceId = await app.client.evaluate(`(() => { const select = document.querySelector('.work-workbench-tools select'); const option = [...(select?.options || [])].find((entry) => entry.textContent.includes('reviewable')); if (!select || !option) return null; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, option.value); select.dispatchEvent(new Event('change', { bubbles: true })); return option.value; })()`);
    assert.equal(returnedTerminalWorkspaceId, terminalWorkspaceId);
    await waitForDom(app.client, `/native-coding-browser-proof.txt/.test(document.querySelector('.work-workbench')?.textContent || '')`, "Electron did not return to the terminal's exact attempt");
    const directRelaunch = await app.client.evaluate(`window.droverDesktop.terminal.open({
      ventureId: ${JSON.stringify(fixture.venture.id)}, workspaceId: ${JSON.stringify(terminalWorkspaceId)},
      terminalId: ${JSON.stringify(terminalProof.firstId)}, name: "Tests", cols: 90, rows: 24,
    })`);
    assert.match(directRelaunch?.snapshot ?? "", /TERMINAL_RELAUNCH_EXIT/);
    assert.equal(directRelaunch?.exit?.exitCode, 7, "full Electron relaunch lost the terminal exit status");
    if (!await app.client.evaluate(`Boolean(document.querySelector('.work-terminal-manager'))`)) {
      assert.equal(await app.client.evaluate(clickButton("Terminal")), true, "the terminal drawer did not reopen after app relaunch");
    }
    await waitForDom(app.client, `!!document.querySelector('.work-terminal-manager')`, "the terminal layout did not remount after app relaunch");
    let relaunchedTerminal;
    try {
      relaunchedTerminal = await app.client.evaluate(`(async () => {
        const bridge = window.droverDesktop.terminal;
        const sessions = await bridge.inspect(${JSON.stringify(fixture.venture.id)}, ${JSON.stringify(terminalWorkspaceId)});
        const entry = sessions.find((item) => item.terminalId === ${JSON.stringify(terminalProof.firstId)});
        if (!entry) return null;
        return bridge.open({
          ventureId: ${JSON.stringify(fixture.venture.id)}, workspaceId: ${JSON.stringify(terminalWorkspaceId)},
          terminalId: entry.terminalId, name: entry.name, cols: 90, rows: 24,
        });
      })()`);
    } catch (error) {
      throw new Error(`${error?.message ?? error}\n\nElectron output:\n${app.output()}`);
    }
    assert.match(relaunchedTerminal?.snapshot ?? "", /TERMINAL_RELAUNCH_EXIT/);
    assert.equal(relaunchedTerminal?.exit?.exitCode, 7);
  } finally {
    await app?.close().catch(() => {});
    if (fixture) {
      for (const id of [fixture.interrupted.id, fixture.completed.id]) {
        try { discardCodingWorkspace(fixture.venture.id, id, { root: home }); } catch { /* preserve the primary receipt failure */ }
      }
    }
    if (previousPersistence === undefined) delete process.env.GTM_IDE_PERSISTENCE;
    else process.env.GTM_IDE_PERSISTENCE = previousPersistence;
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 });
  }
});
