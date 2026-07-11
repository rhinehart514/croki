import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";

import {
  buildFeatureRequest,
  createBuilderPathPolicy,
  resolveProductChangeRuntime,
} from "../src/feature-builder.mjs";
import { listFrictionQueue } from "../src/friction.mjs";
import { buildCodexProductChangeArgs, runCodexProductChange } from "../src/runtimes/codex.mjs";
import { claudeCodeRuntime } from "../src/runtimes/claude-code.mjs";
import { createMicroproductProducer } from "../src/microproduct-composer.mjs";

function fakeGit() {
  const calls = [];
  const git = (args, cwd) => {
    calls.push({ args, cwd });
    if (args[0] === "rev-parse") return "base-sha";
    if (args[0] === "rev-list") return "0";
    if (args[0] === "status") return " M src/change.ts";
    return "";
  };
  git.calls = calls;
  return git;
}

function runtime(id, capture) {
  return {
    id,
    label: id,
    drive() {},
    async runProductChange(request) {
      capture.push(request);
      return { text: `${id} staged the change`, error: null };
    },
  };
}

test("Claude and Codex satisfy the same isolated product-change contract and durable receipt", async () => {
  for (const id of ["claude-code", "codex"]) {
    const queueDir = fs.mkdtempSync(path.join(os.tmpdir(), `product-change-${id}-`));
    const capture = [];
    const git = fakeGit();
    const result = await buildFeatureRequest(
      { report: "Add a scoped product capability", projectId: "product-a" },
      {
        repoRoot: "/products/a",
        queueDir,
        git,
        runtime: runtime(id, capture),
        now: "2026-07-11T15:00:00Z",
        gitSha: "host-sha",
      },
    );

    assert.equal(result.status, "ready-for-review");
    assert.equal(result.provider, id);
    assert.equal(capture.length, 1);
    assert.equal(capture[0].cwd, result.worktree);
    assert.deepEqual(capture[0].allowedTools, ["Read", "Glob", "Grep", "Edit", "Write"]);
    assert.equal(typeof capture[0].canUseTool, "function");
    const receipt = listFrictionQueue({ queueDir }).reports[0];
    assert.equal(receipt.provider, id);
    assert.equal(receipt.projectId, "product-a");
    assert.equal(receipt.baseCommit, "base-sha");
    assert.equal(receipt.workspace, result.worktree);
    assert.equal(receipt.commits, 0);
    assert.ok(!git.calls.some(({ args }) => ["add", "commit", "push", "merge"].includes(args[0])));
  }
});

test("the Claude file-tool policy confines reads and writes to one worktree, including through symlinks", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "builder-policy-"));
  const worktree = path.join(parent, "worktree");
  const outside = path.join(parent, "outside");
  fs.mkdirSync(path.join(worktree, "src"), { recursive: true });
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(worktree, "escape"));
  const policy = createBuilderPathPolicy(worktree);

  assert.equal((await policy("Write", { file_path: "src/ok.ts" })).behavior, "allow");
  assert.equal((await policy("Read", { file_path: path.join(worktree, "src", "ok.ts") })).behavior, "allow");
  assert.equal((await policy("Write", { file_path: "../outside/pwned" })).behavior, "deny");
  assert.equal((await policy("Read", { file_path: path.join(outside, "secret") })).behavior, "deny");
  assert.equal((await policy("Write", { file_path: "escape/pwned" })).behavior, "deny");
  assert.equal((await policy("Glob", { pattern: "escape/**/*" })).behavior, "deny");
  assert.equal((await policy("Edit", { file_path: ".git" })).behavior, "deny");
  assert.equal((await policy("Bash", { command: "git commit" })).behavior, "deny");
  assert.equal((await policy("Glob", { pattern: "../**/*" })).behavior, "deny");
  assert.equal((await policy("Glob", { pattern: "src/**/*.ts" })).updatedInput.path, fs.realpathSync(worktree));
});

test("Codex product changes structurally disable shell, apps, network tools, approvals, and inherited config", () => {
  const args = buildCodexProductChangeArgs({ prompt: "make the scoped edit", model: "gpt-test" });
  const joined = args.join(" ");
  assert.match(joined, /workspace-write/);
  assert.match(joined, /features\.shell_tool=false/);
  assert.match(joined, /features\.unified_exec=false/);
  assert.match(joined, /features\.apps=false/);
  assert.match(joined, /features\.hooks=false/);
  assert.match(joined, /features\.computer_use=false/);
  assert.match(joined, /features\.browser_use=false/);
  assert.match(joined, /features\.network_proxy\.enabled=false/);
  assert.match(joined, /approval_policy="never"/);
  assert.ok(args.includes("--ignore-user-config"));
  assert.ok(args.includes("--ignore-rules"));
  assert.ok(args.includes("--strict-config"));
  assert.ok(args.includes("--ephemeral"));
  assert.doesNotMatch(joined, /dangerously-bypass|add-dir|mcp_servers/);
});

test("the existing runtime selector rejects adapters without the safe product-change capability", () => {
  assert.throws(
    () => resolveProductChangeRuntime({ runtime: { id: "read-only", label: "Read only", drive() {} } }),
    /cannot create isolated product changes/,
  );
});

test("provider selection is case-insensitive and rejects an explicit provider/model mismatch", () => {
  const injected = runtime("codex", []);
  assert.equal(resolveProductChangeRuntime({ provider: " CODEX ", runtime: injected }), injected);
  assert.throws(
    () => resolveProductChangeRuntime({ provider: "codex", model: "claude-opus-4-8", runtime: injected }),
    /belongs to the claude-code runtime, not codex/,
  );
});

test("Claude product changes honor the advertised API-key fallback but keep OAuth subscription-first", async () => {
  const seen = [];
  const runQuery = async (request) => { seen.push(request); return { text: "done", error: null }; };
  await claudeCodeRuntime.runProductChange({ prompt: "x", cwd: "/repo", env: { ANTHROPIC_API_KEY: "key" }, authProbe: () => false, runQuery });
  await claudeCodeRuntime.runProductChange({ prompt: "x", cwd: "/repo", env: { CLAUDE_CODE_OAUTH_TOKEN: "oauth", ANTHROPIC_API_KEY: "key" }, authProbe: () => false, runQuery });
  assert.equal(seen[0].allowApiKey, true);
  assert.equal(seen[0].env.ANTHROPIC_API_KEY, "key");
  assert.equal(seen[1].allowApiKey, false);
});

function fakeCodexChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr.setEncoding = () => {};
  child.kill = (signal) => { child.kills.push(signal); return true; };
  child.kills = [];
  return child;
}

test("Codex timeout does not release the worktree until the writer has actually closed", async () => {
  const child = fakeCodexChild();
  const pending = runCodexProductChange({
    prompt: "x",
    cwd: "/repo",
    env: { GTM_IDE_CODEX_PATH: process.execPath },
    timeoutMs: 5,
    spawnProcess: () => child,
  });
  let settled = false;
  pending.then(() => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(settled, false);
  assert.deepEqual(child.kills, ["SIGTERM"]);
  child.emit("close", null);
  const result = await pending;
  assert.equal(result.error.kind, "budget");
});

test("a Codex terminal error remains a failure even when the process exits zero", async () => {
  const child = fakeCodexChild();
  const pending = runCodexProductChange({
    prompt: "x",
    cwd: "/repo",
    env: { GTM_IDE_CODEX_PATH: process.execPath },
    spawnProcess: () => child,
  });
  child.stdout.emit("data", `${JSON.stringify({ type: "turn.failed", error: { message: "provider failed" } })}\n`);
  child.emit("close", 0);
  const result = await pending;
  assert.equal(result.error.message, "provider failed");
});

test("operator product-change generation threads either selected provider through the shared structured runtime", async () => {
  for (const runtime of ["claude-code", "codex"]) {
    let request;
    const produce = createMicroproductProducer({
      cwd: "/products/a",
      runtime,
      model: runtime === "codex" ? "gpt-test" : "claude-test",
      runTask: async (value) => {
        request = value;
        return {
          ok: true,
          runtime,
          model: value.model,
          value: {
            artifactSpec: { kind: "product-change", inRepo: true, entry: "src/change.ts" },
            artifactFiles: [{ path: "src/change.ts", contents: "export const changed = true;\n" }],
          },
        };
      },
    });
    const result = await produce({ goal: "Add the scoped behavior", grounding: { citations: ["src/a.ts:1"] }, taste: { learned: ["Prefer terse copy"] } });
    assert.equal(request.runtime, runtime);
    assert.equal(request.readOnly, true);
    assert.equal(request.output, "object");
    assert.equal(request.cwd, "/products/a");
    assert.match(request.prompt, /Prefer terse copy/);
    assert.equal(result.runtime, runtime);
    assert.equal(result.artifactFiles[0].path, "src/change.ts");
  }
});
