#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { claudeCodeRuntime } from "../brain/src/runtimes/claude-code.mjs";
import { codexRuntime } from "../brain/src/runtimes/codex.mjs";

const STEPS = ["start", "stream", "question", "tool", "stop", "resume", "checkpoint", "verify", "settle"];

function context(overrides = {}) {
  return {
    goal: "Inspect the fixture, make one local correction, and verify it.",
    model: null,
    system: "Keep outward authority with the founder.",
    tools: [{ name: "ask_founder", description: "Ask exactly one question.", input_schema: { type: "object", properties: { question: { type: "string" } } } }],
    stepCount: 0,
    maxSteps: 8,
    currentStatus: () => "running",
    isCancelled: () => false,
    onTurn: () => 1,
    onText() {},
    onTextDelta() {},
    onToolStart() {},
    onToolError() {},
    onToolResult() {},
    onRuntimeSession() {},
    persistMessages() {},
    async runTool() { return { result: { ok: true }, pause: false }; },
    ...overrides,
  };
}

function workspaceReceipt(provider) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `croki-parity-${provider}-`));
  const run = (args) => spawnSync("git", args, { cwd: directory, encoding: "utf8" });
  try {
    assert.equal(run(["init", "-q"]).status, 0);
    assert.equal(run(["config", "user.email", "parity@croki.local"]).status, 0);
    assert.equal(run(["config", "user.name", "Croki parity"]).status, 0);
    const target = path.join(directory, "parity.txt");
    fs.writeFileSync(target, "before\n", "utf8");
    assert.equal(run(["add", "parity.txt"]).status, 0);
    assert.equal(run(["commit", "-qm", "fixture"]).status, 0);
    fs.writeFileSync(target, "before\nafter\n", "utf8");
    const patch = run(["diff", "--binary", "--", "parity.txt"]);
    assert.equal(patch.status, 0);
    const checkpoint = crypto.createHash("sha256").update(patch.stdout).digest("hex");
    const verification = run(["diff", "--check"]);
    return {
      checkpoint,
      verification: {
        command: "git diff --check",
        status: verification.status === 0 ? "passed" : "failed",
        output: `${verification.stdout}${verification.stderr}`.trim(),
      },
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function claudeContract() {
  const passed = new Set();
  const sessions = [];
  const deltas = [];
  const questions = [];
  const tools = [];
  let status = "running";
  let resumeInvocation = null;

  const paused = await claudeCodeRuntime.drive(context({
    nativeCoding: true,
    env: { CLAUDE_CODE_OAUTH_TOKEN: "parity-token" },
    currentStatus: () => status,
    onRuntimeSession: (id) => { sessions.push(id); passed.add("start"); },
    onTextDelta: (text) => { deltas.push(text); passed.add("stream"); },
    onToolResult: (receipt) => { tools.push(receipt); passed.add("tool"); },
    onProviderIntervention: async (request) => {
      questions.push(request);
      status = "paused";
      passed.add("question");
      return { behavior: "deny", message: "Waiting for the founder." };
    },
    query: ({ options }) => (async function* fixtureQuery() {
      yield { type: "stream_event", session_id: "claude-parity-session", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Inspecting." } } };
      yield { type: "assistant", session_id: "claude-parity-session", message: { content: [{ type: "tool_use", id: "bash-1", name: "Bash", input: { command: "git diff --check" } }] } };
      yield { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "bash-1", content: "clean" }] } };
      const decision = await options.canUseTool("AskUserQuestion", { questions: [{ question: "Keep the narrow correction?" }] }, { toolUseID: "question-1" });
      assert.equal(decision.behavior, "deny");
      yield { type: "stream_event", event: { type: "content_block_stop", index: 0 } };
    })(),
  }));
  assert.equal(paused.kind, "paused");
  assert.deepEqual(sessions, ["claude-parity-session"]);
  assert.deepEqual(deltas, ["Inspecting."]);
  assert.equal(questions.length, 1);
  assert.equal(tools[0].status, "passed");

  status = "running";
  const resumed = await claudeCodeRuntime.drive(context({
    runtimeSessionId: sessions[0],
    resumeSessionAt: "assistant-before-pause",
    resumePrompt: "Founder answer: keep the narrow correction.",
    env: { CLAUDE_CODE_OAUTH_TOKEN: "parity-token" },
    currentStatus: () => status,
    query: (input) => {
      resumeInvocation = input;
      return (async function* fixtureResume() {
        yield { type: "stream_event", session_id: "claude-parity-session", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Resuming." } } };
        yield { type: "result", session_id: "claude-parity-session", subtype: "success", is_error: false, result: "Verified and settled." };
      })();
    },
  }));
  assert.equal(resumed.kind, "completed");
  assert.equal(resumeInvocation.options.resume, sessions[0]);
  assert.equal(resumeInvocation.options.resumeSessionAt, "assistant-before-pause");
  passed.add("resume");
  passed.add("settle");

  const controller = new AbortController();
  let started;
  const didStart = new Promise((resolve) => { started = resolve; });
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const stopped = claudeCodeRuntime.drive(context({
    signal: controller.signal,
    isCancelled: () => controller.signal.aborted,
    currentStatus: () => "running",
    env: { CLAUDE_CODE_OAUTH_TOKEN: "parity-token" },
    query: () => ({
      async interrupt() { release(); },
      async *[Symbol.asyncIterator]() {
        started();
        await blocked;
      },
    }),
  }));
  await didStart;
  controller.abort();
  assert.equal((await stopped).kind, "cancelled");
  passed.add("stop");

  const receipt = workspaceReceipt("claude");
  assert.equal(receipt.checkpoint.length, 64);
  assert.equal(receipt.verification.status, "passed");
  passed.add("checkpoint");
  passed.add("verify");
  return { id: claudeCodeRuntime.id, passed, receipt, nativeFeatures: claudeCodeRuntime.nativeFeatures };
}

async function codexContract() {
  const passed = new Set();
  const sessions = [];
  const deltas = [];
  const questions = [];
  const tools = [];

  const paused = await codexRuntime.drive(context({
    onRuntimeSession: (id) => { sessions.push(id); passed.add("start"); },
    onTextDelta: (text) => { deltas.push(text); passed.add("stream"); },
    onToolResult: (receipt) => { tools.push(receipt); passed.add("tool"); },
    async runTool(call) {
      questions.push(call);
      passed.add("question");
      return { result: { parked: true }, pause: true };
    },
    runCodexTurn: async (input) => {
      input.onTextDelta("Inspecting.");
      input.onToolStart("shell", { summary: "Running git diff --check" });
      input.onToolResult({ name: "shell", target: "git diff --check", status: "passed", detail: "clean" });
      await input.runTool({ name: "ask_founder", input: { question: "Keep the narrow correction?" } });
      return { threadId: "codex-parity-session", text: "", error: null, terminal: "paused" };
    },
  }));
  assert.equal(paused.kind, "paused");
  assert.deepEqual(sessions, ["codex-parity-session"]);
  assert.deepEqual(deltas, ["Inspecting."]);
  assert.equal(questions.length, 1);
  assert.equal(tools[0].status, "passed");

  let resumeInvocation = null;
  const resumed = await codexRuntime.drive(context({
    runtimeSessionId: sessions[0],
    resumePrompt: "Founder answer: keep the narrow correction.",
    runCodexTurn: async (input) => {
      resumeInvocation = input;
      return { threadId: "codex-parity-session", text: "Verified and settled.", error: null, terminal: null };
    },
  }));
  assert.equal(resumed.kind, "completed");
  assert.equal(resumeInvocation.resumeId, sessions[0]);
  passed.add("resume");
  passed.add("settle");

  const controller = new AbortController();
  let started;
  const didStart = new Promise((resolve) => { started = resolve; });
  const stopped = codexRuntime.drive(context({
    signal: controller.signal,
    isCancelled: () => controller.signal.aborted,
    runCodexTurn: ({ signal }) => new Promise((resolve) => {
      started();
      signal.addEventListener("abort", () => resolve({ threadId: null, text: "", error: "cancelled", terminal: null }), { once: true });
    }),
  }));
  await didStart;
  controller.abort();
  assert.equal((await stopped).kind, "cancelled");
  passed.add("stop");

  const receipt = workspaceReceipt("codex");
  assert.equal(receipt.checkpoint.length, 64);
  assert.equal(receipt.verification.status, "passed");
  passed.add("checkpoint");
  passed.add("verify");
  return { id: codexRuntime.id, passed, receipt, nativeFeatures: codexRuntime.nativeFeatures };
}

function table(results) {
  const header = ["Provider", ...STEPS];
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...results.map((result) => `| ${[result.id, ...STEPS.map((step) => result.passed.has(step) ? "PASS" : "FAIL")].join(" | ")} |`),
  ].join("\n");
}

const results = await Promise.all([claudeContract(), codexContract()]);
process.stdout.write(`${table(results)}\n\n`);
for (const result of results) {
  const unsupported = Object.entries(result.nativeFeatures).filter(([, supported]) => !supported).map(([feature]) => feature);
  process.stdout.write(`${result.id}: unsupported native controls: ${unsupported.join(", ") || "none"}\n`);
}
const failed = results.some((result) => STEPS.some((step) => !result.passed.has(step)));
process.exitCode = failed ? 1 : 0;
