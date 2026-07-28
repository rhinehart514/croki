#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import {
  CODE_WORKSPACE_COLLECTION,
  discardCodingWorkspace,
} from "../../brain/src/firm/code-workspace.mjs";
import { listVentureDocs } from "../../brain/src/firm/venture-store.mjs";
import { freePort, ROOT, waitForDom } from "./fixtures/browser-harness.mjs";
import { seedNativeCoding } from "./fixtures/native-coding-fixture.mjs";
import { launchDroverElectron } from "./lib/electron-app.mjs";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function buttonWithText(text) {
  return `(() => {
    const button = [...document.querySelectorAll("button")].find((entry) => entry.textContent.trim().includes(${JSON.stringify(text)}));
    button?.click();
    return Boolean(button && !button.disabled);
  })()`;
}

function selectReviewableAttempt() {
  return `(() => {
    const select = document.querySelector(".work-workbench-tools select");
    const option = [...(select?.options || [])].find((entry) => entry.textContent.includes("reviewable"));
    if (!select || !option) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, option.value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`;
}

test("native repository Review: unchanged source grounding and exact return survive scale and restart", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "drover-repository-review-electron-"));
  const previousPersistence = process.env.GTM_IDE_PERSISTENCE;
  process.env.GTM_IDE_PERSISTENCE = "json";
  let fixture;
  let app = null;
  try {
    fixture = await seedNativeCoding({ root: home });
    const worktree = fixture.completed.worktree;
    const source = path.join(worktree, "src", "unchanged-long.ts");
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(
      source,
      Array.from({ length: 320 }, (_, index) => `export const unchangedLine${index + 1} = ${index + 1};`).join("\n"),
    );
    const many = path.join(worktree, "many");
    fs.mkdirSync(many);
    for (let index = 0; index < 5_000; index += 1) {
      fs.writeFileSync(path.join(many, `path-${String(index).padStart(5, "0")}.txt`), `${index}\n`);
    }
    git(worktree, ["config", "user.email", "acceptance@example.com"]);
    git(worktree, ["config", "user.name", "Acceptance"]);
    git(worktree, ["add", "src/unchanged-long.ts", "many"]);
    git(worktree, ["commit", "-qm", "add unchanged repository review fixture"]);
    assert.equal(git(worktree, ["status", "--porcelain", "--", "src/unchanged-long.ts"]), "", "the L200 fixture must be unchanged source");

    app = await launchDroverElectron({ root: ROOT, home, port: await freePort() });
    await waitForDom(app.client, `!!document.querySelector(".work-workbench .code-workspace")`, "the exact Review did not mount");
    assert.equal(await app.client.evaluate(selectReviewableAttempt()), true);
    await waitForDom(app.client, `/native-coding-browser-proof.txt/.test(document.querySelector(".work-workbench")?.textContent || "")`, "the reviewable attempt was not selected");

    assert.equal(await app.client.evaluate(buttonWithText("Browse repository")), true);
    await waitForDom(app.client, `!!document.querySelector('.repository-browser aside[aria-label="Repository tree"]')`, "the contextual repository Review did not open");
    await waitForDom(app.client, `/many/.test(document.querySelector('.repository-browser aside')?.textContent || "")`, "the repository root did not finish loading");

    const pageStarted = Date.now();
    assert.equal(await app.client.evaluate(buttonWithText("many")), true, "the 5,000-path directory was not actionable");
    await waitForDom(app.client, `/Load more.*100 of 5000/.test(document.querySelector(".repository-browser aside")?.textContent || "")`, "the first bounded path page did not settle");
    assert.ok(Date.now() - pageStarted < 3_000, `the first 5,000-path page took ${Date.now() - pageStarted}ms`);
    assert.equal(await app.client.evaluate(`document.querySelectorAll(".repository-browser aside li").length`), 100);
    assert.equal(await app.client.evaluate(buttonWithText("Load more")), true);
    await waitForDom(app.client, `document.querySelectorAll(".repository-browser aside li").length === 200`, "repository pagination did not append one bounded page");

    const traversal = await app.client.evaluate(`window.droverDesktop.api.request({
      path: ${JSON.stringify(`/api/ventures/${encodeURIComponent(fixture.venture.id)}/coding-workspaces/${encodeURIComponent(fixture.completed.id)}/repository/file?path=..%2Foutside.txt`)},
      method: "GET", headers: {}, body: "",
    }).then((response) => ({ status: response.status, body: JSON.parse(response.body) }))`);
    assert.equal(traversal.status, 400);
    assert.equal(traversal.body.code, "repository_path_invalid");

    assert.equal(await app.client.evaluate(`(() => {
      const input = document.querySelector('input[aria-label="Search repository paths"]');
      if (!input) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "unchanged-long");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`), true);
    await waitForDom(app.client, `/unchanged-long.ts/.test(document.querySelector('.repository-browser aside[aria-label="Repository search results"]')?.textContent || "")`, "unchanged source did not appear in path search");
    assert.equal(await app.client.evaluate(buttonWithText("unchanged-long.ts")), true);
    await waitForDom(app.client, `!!document.querySelector('[aria-label="Line 1"]')`, "the unchanged file did not open");
    assert.equal(await app.client.evaluate(`(() => {
      const input = document.querySelector('input[aria-label="Go to line"]');
      if (!input) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "200");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.form?.requestSubmit();
      return true;
    })()`), true);
    await waitForDom(app.client, `!!document.querySelector('[aria-label="Line 200"]')`, "exact line 200 did not open");
    assert.equal(await app.client.evaluate(`(() => {
      const first = document.querySelector('[aria-label="Line 200"]');
      const last = document.querySelector('[aria-label="Line 205"]');
      first?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      last?.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
      return Boolean(first && last);
    })()`), true);
    assert.equal(await app.client.evaluate(buttonWithText("Add L200–L205 to direction")), true);
    await waitForDom(app.client, `/@unchanged-long.ts:L200–205/.test(document.querySelector(".thread-composer textarea")?.value || "")`, "the exact range did not reach the anchored composer");
    await waitForDom(app.client, `(() => {
      const drafts = JSON.parse(localStorage.getItem("drover:composer-drafts:v2") || "{}");
      return Object.values(drafts).some((entry) => entry.files?.some((file) => file.path === "src/unchanged-long.ts" && /^repository:/.test(file.sourceRef || "")));
    })()`, "the source-bearing composer reference did not persist");

    const sourceRef = await app.client.evaluate(`(() => {
      const drafts = JSON.parse(localStorage.getItem("drover:composer-drafts:v2") || "{}");
      for (const entry of Object.values(drafts)) {
        const file = entry.files?.find((candidate) => candidate.path === "src/unchanged-long.ts");
        if (file) return file.sourceRef;
      }
      return null;
    })()`);
    assert.match(sourceRef, /^repository:src\/unchanged-long\.ts#L200-L205:[0-9a-f]{12}$/);

    assert.equal(await app.client.evaluate(`(() => {
      const input = document.querySelector(".thread-composer textarea");
      if (!input) return false;
      const value = input.value + " Make this unchanged contract naming clearer.";
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`), true);
    await waitForDom(app.client, `/Make this unchanged contract naming clearer/.test(document.querySelector(".thread-composer textarea")?.value || "")`, "the exact correction did not settle in the composer");
    assert.equal(await app.client.evaluate(`(() => {
      const send = document.querySelector('button[aria-label="Send to this thread"]');
      send?.click();
      return Boolean(send && !send.disabled);
    })()`), true, "the grounded correction could not be sent from the same Thread");
    await waitForDom(app.client, `/runtime is disabled/.test(document.querySelector('[role="alert"]')?.textContent || "")`, "the deterministic desktop runtime did not refuse external provider execution honestly");
    assert.match(
      await app.client.evaluate(`document.querySelector(".thread-composer textarea")?.value`),
      /@unchanged-long\.ts:L200–205.*Make this unchanged contract naming clearer/,
      "a refused runtime must restore the exact grounded correction without losing its source reference",
    );

    assert.equal(await app.client.evaluate(buttonWithText("New thread")), true);
    await waitForDom(app.client, `/What do you want to build/.test(document.body.textContent)`, "the local draft Thread did not open");
    assert.equal(await app.client.evaluate(`(() => {
      const row = [...document.querySelectorAll(".thread-rail-row")].find((entry) => entry.textContent.includes("Implement the native coding browser proof"));
      row?.click(); return Boolean(row);
    })()`), true);
    await waitForDom(app.client, `!!document.querySelector('[aria-label="Line 200"][data-selected="true"]')`, "Thread return lost the same file and line");

    await app.close();
    app = await launchDroverElectron({ root: ROOT, home, port: await freePort() });
    await waitForDom(app.client, `!!document.querySelector(".work-workbench")`, "app restart did not restore the Work Thread", 30_000);
    if (!await app.client.evaluate(`!!document.querySelector('[aria-label="Line 200"][data-selected="true"]')`)) {
      await app.client.evaluate(selectReviewableAttempt());
    }
    await waitForDom(app.client, `!!document.querySelector('[aria-label="Line 200"][data-selected="true"]')`, "app restart lost the exact repository file and line", 30_000);
    assert.equal(await app.client.evaluate(`document.querySelector(".repository-file-head strong")?.textContent`), "src/unchanged-long.ts");
  } finally {
    await app?.close().catch(() => {});
    if (fixture) {
      for (const workspace of listVentureDocs(fixture.venture.id, CODE_WORKSPACE_COLLECTION, { root: home })) {
        try { discardCodingWorkspace(fixture.venture.id, workspace.id, { root: home }); } catch { /* preserve the primary receipt */ }
      }
    }
    if (previousPersistence === undefined) delete process.env.GTM_IDE_PERSISTENCE;
    else process.env.GTM_IDE_PERSISTENCE = previousPersistence;
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 });
  }
});
