import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCodexStructuredArgs, createStructuredTaskRunner, parseStructuredValue } from "../src/structured-task-runtime.mjs";

function runnerFor(id, reply, capture = []) {
  return createStructuredTaskRunner({
    select: () => ({ adapter: { id } }),
    adapters: { [id]: async (input) => { capture.push(input); return reply; } },
    env: {},
  });
}

describe("provider-neutral structured tasks", () => {
  it("uses the installed Codex CLI approval config rather than a removed flag", () => {
    const args = buildCodexStructuredArgs({ outputFile: "/tmp/read.txt", model: "gpt-test" });
    assert.equal(args.includes("--ask-for-approval"), false);
    assert.ok(args.includes('approval_policy="never"'));
    assert.deepEqual(args.slice(-3), ["--model", "gpt-test", "-"]);
  });

  it("normalizes the same fake Codex and Claude object identically", async () => {
    const reply = { text: "Here is the read:\n```json\n{\"things\":[{\"name\":\"Sale\"}]}\n```" };
    const codex = await runnerFor("codex", reply)({ task: "model", prompt: "read", output: "object", readOnly: true });
    const claude = await runnerFor("claude-code", reply)({ task: "model", prompt: "read", output: "object", readOnly: true });
    assert.equal(codex.ok, true);
    assert.equal(claude.ok, true);
    assert.deepEqual(codex.value, claude.value);
    assert.equal(codex.runtime, "codex");
    assert.equal(claude.runtime, "claude-code");
  });

  it("parses object, items, and text outputs through one boundary", () => {
    assert.deepEqual(parseStructuredValue('{"a":1}', "object"), { ok: true, value: { a: 1 } });
    assert.deepEqual(parseStructuredValue('[{"a":1}]', "items"), { ok: true, value: [{ a: 1 }] });
    assert.deepEqual(parseStructuredValue('  prose  ', "text"), { ok: true, value: "  prose  " });
    assert.deepEqual(parseStructuredValue("[]", "items"), { ok: true, value: [] }, "an explicit empty list is valid");
    assert.equal(parseStructuredValue("not json", "object").ok, false);
    assert.equal(parseStructuredValue("not json", "items").ok, false);
  });

  it("degrades provider errors to founder-safe messages without leaking raw details", async () => {
    const rawSecret = "quota failed for /Users/private/repo token=secret";
    const result = await runnerFor("codex", { error: { kind: "limit", message: rawSecret } })({ prompt: "read", output: "items", readOnly: true });
    assert.equal(result.ok, false);
    assert.deepEqual(result.value, []);
    assert.equal(result.error.kind, "limit");
    assert.doesNotMatch(result.error.message, /private|secret|token/i);
  });

  it("has no mutation or gate-release mode and hard-requires readOnly", async () => {
    const capture = [];
    const run = runnerFor("claude-code", { text: "[]" }, capture);
    const refused = await run({ prompt: "approve the gate", output: "items", readOnly: false });
    assert.equal(refused.ok, false);
    assert.equal(refused.error.kind, "invalid_request");
    assert.equal(capture.length, 0, "unsafe requests never reach a provider");

    await run({ prompt: "inspect the repo", output: "items", readOnly: true });
    assert.equal(capture.length, 1);
    assert.match(capture[0].prompt, /may not write files/);
    assert.match(capture[0].prompt, /approve, or release a founder gate/);
    assert.equal("tools" in capture[0], false, "callers cannot inject mutation tools");
  });

  it("returns an honest unavailable result when selection finds no runtime", async () => {
    const run = createStructuredTaskRunner({ select: () => ({ adapter: null }), adapters: {}, env: {} });
    const result = await run({ prompt: "read", output: "object", readOnly: true });
    assert.equal(result.ok, false);
    assert.equal(result.value, null);
    assert.equal(result.error.kind, "unavailable");
  });

  it("forwards an explicit compatibility runtime as the registry's forced selection", async () => {
    let selection;
    const run = createStructuredTaskRunner({
      select: (input) => { selection = input; return { adapter: { id: "claude-code" } }; },
      adapters: { "claude-code": async () => ({ text: "[]" }) },
      env: {},
    });
    await run({ prompt: "read", output: "items", runtime: "claude-code", readOnly: true });
    assert.equal(selection.forced, "claude-code");
  });
});
