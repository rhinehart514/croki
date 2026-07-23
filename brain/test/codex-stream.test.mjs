import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { parseCodexEvent, runCodexDriveTurn, runCodexProductChange } from "../src/runtimes/codex.mjs";
import { createCodexTextStream, createCodexThinkingSpans } from "../src/runtimes/codex-events.mjs";

// Every fixture below is a real `codex exec --json` line shape observed from codex-cli 0.145.0, so a
// client change that breaks these breaks against the protocol Croki actually reads.
function fakeCodexChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = { end() {} };
  child.kill = () => {};
  child.emitEvent = (event) => child.stdout.write(`${JSON.stringify(event)}\n`);
  child.finish = (code = 0) => child.emit("close", code);
  return child;
}

function driveTurn(child, overrides = {}) {
  return runCodexDriveTurn({
    prompt: "Do the work",
    cwd: process.cwd(),
    env: { GTM_IDE_CODEX_PATH: process.execPath },
    spawnProcess: () => child,
    ...overrides,
  });
}

const agentMessage = (id, text) => ({ type: "item.completed", item: { id, type: "agent_message", text } });

describe("Codex live stream", () => {
  it("keeps every agent message in a turn instead of only the last one", async () => {
    const child = fakeCodexChild();
    const turn = driveTurn(child);
    child.emitEvent({ type: "thread.started", thread_id: "019f8fe0-410a-7813-af3f-87247c79319e" });
    child.emitEvent({ type: "turn.started" });
    child.emitEvent(agentMessage("item_0", "I will read the failing test first."));
    child.emitEvent(agentMessage("item_1", "The assertion compares stale state."));
    child.emitEvent(agentMessage("item_2", "Fixed and re-ran the suite."));
    child.emitEvent({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 2 } });
    child.finish(0);

    const result = await turn;
    assert.equal(result.error, null);
    assert.equal(result.threadId, "019f8fe0-410a-7813-af3f-87247c79319e");
    assert.match(result.text, /read the failing test first/);
    assert.match(result.text, /assertion compares stale state/);
    assert.match(result.text, /Fixed and re-ran the suite/);
  });

  it("streams each message into the delta channel as it arrives, not at turn end", async () => {
    const child = fakeCodexChild();
    const deltas = [];
    const turn = driveTurn(child, { onTextDelta: (delta) => deltas.push(delta) });
    child.emitEvent(agentMessage("item_0", "Working on it."));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(deltas, ["Working on it."], "the first message reached the founder before the turn ended");

    child.emitEvent(agentMessage("item_1", "Done."));
    child.finish(0);
    const result = await turn;
    assert.equal(deltas.join(""), result.text, "the streamed text reproduces the turn's text exactly once");
  });

  it("reports a settled patch with the file Codex actually changed", async () => {
    const child = fakeCodexChild();
    const results = [];
    const turn = driveTurn(child, { onToolResult: (result) => results.push(result) });
    const changes = [
      { path: "/tmp/work/hello.txt", kind: "add" },
      { path: "/tmp/work/notes.md", kind: "update" },
    ];
    child.emitEvent({ type: "item.started", item: { id: "item_1", type: "file_change", changes, status: "in_progress" } });
    assert.deepEqual(results, [], "an in-flight patch is not a settled edit");
    child.emitEvent({ type: "item.completed", item: { id: "item_1", type: "file_change", changes, status: "completed" } });
    child.finish(0);
    await turn;

    assert.deepEqual(results, [
      { name: "apply_patch", target: "/tmp/work/hello.txt", status: "passed", detail: "Added" },
      { name: "apply_patch", target: "/tmp/work/notes.md", status: "passed", detail: "Updated" },
    ]);
  });

  it("reports the turn's measured tokens and invents nothing when the client omits usage", async () => {
    const child = fakeCodexChild();
    const usage = [];
    const turn = driveTurn(child, { onUsage: (measured) => usage.push(measured) });
    child.emitEvent({
      type: "turn.completed",
      usage: { input_tokens: 42741, cached_input_tokens: 13056, cache_write_input_tokens: 0, output_tokens: 209, reasoning_output_tokens: 52 },
    });
    child.emitEvent({ type: "turn.completed" });
    child.emitEvent({ type: "turn.completed", usage: { input_tokens: 0, output_tokens: 0 } });
    child.finish(0);
    await turn;

    assert.deepEqual(usage, [{
      inputTokens: 42741,
      outputTokens: 209,
      cacheReadInputTokens: 13056,
      cacheCreationInputTokens: 0,
    }], "an unmeasured turn reports no usage at all");
  });

  it("surfaces reasoning as a measured span and never its content", async () => {
    const child = fakeCodexChild();
    const spans = [];
    const turn = driveTurn(child, { onThinking: (span) => spans.push(span) });
    child.emitEvent({ type: "item.started", item: { id: "item_0", type: "reasoning", text: "secret plan" } });
    child.emitEvent({ type: "item.completed", item: { id: "item_0", type: "reasoning", text: "secret plan" } });
    child.finish(0);
    await turn;

    assert.equal(spans.length, 2);
    assert.equal(spans[0].state, "start");
    assert.equal(spans[1].state, "stop");
    assert.ok(Number.isFinite(spans[1].durationMs), "a completed span carries its measured duration");
    assert.ok(!JSON.stringify(spans).includes("secret plan"), "reasoning content never leaves the adapter");
  });

  it("balances a reasoning span the client only reported as completed, without inventing a duration", () => {
    const spans = createCodexThinkingSpans({ now: () => 0 });
    assert.deepEqual(spans.stop("item_0"), [{ state: "start" }, { state: "stop" }]);
  });

  it("keeps the turn alive when a host live callback throws", async () => {
    const child = fakeCodexChild();
    const turn = driveTurn(child, {
      onTextDelta: () => { throw new Error("host blew up"); },
      onUsage: () => { throw new Error("host blew up"); },
    });
    child.emitEvent(agentMessage("item_0", "Still fine."));
    child.emitEvent({ type: "turn.completed", usage: { input_tokens: 5, output_tokens: 1 } });
    child.finish(0);

    const result = await turn;
    assert.equal(result.error, null);
    assert.equal(result.text, "Still fine.");
  });

  it("keeps every product-change message in the change note", async () => {
    const child = fakeCodexChild();
    const run = runCodexProductChange({
      prompt: "Change one file",
      cwd: process.cwd(),
      env: { GTM_IDE_CODEX_PATH: process.execPath },
      spawnProcess: () => child,
    });
    child.emitEvent(agentMessage("item_0", "I will add the missing guard."));
    child.emitEvent(agentMessage("item_1", "Added the guard to the loader."));
    child.finish(0);

    const result = await run;
    assert.equal(result.error, null);
    assert.match(result.text, /missing guard/);
    assert.match(result.text, /Added the guard to the loader/);
  });
});

describe("Codex event decoding", () => {
  it("never throws on malformed, partial, or unknown JSONL", () => {
    for (const line of ["", "   ", "{", "null", "[]", "not json at all", '{"type":"item.completed"}', '{"type":"future.event","item":{"type":"unknowable"}}']) {
      assert.equal(parseCodexEvent(line), null, `unreadable line survived: ${line}`);
    }
    assert.equal(parseCodexEvent(undefined), null);
    // A non-fatal item-level notice (the skills-budget warning a real client emits) is not a terminal error.
    assert.equal(parseCodexEvent('{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Skill descriptions were shortened."}}'), null);
  });

  it("folds a re-reported message rather than doubling it", () => {
    const stream = createCodexTextStream();
    assert.deepEqual(stream.push({ id: "item_0", text: "Look" }), { text: "Look", delta: "Look" });
    assert.deepEqual(stream.push({ id: "item_0", text: "Looking closer" }), { text: "Looking closer", delta: "ing closer" });
    assert.deepEqual(stream.push({ id: "item_1", text: "Done" }), { text: "Looking closer\n\nDone", delta: "\n\nDone" });
  });

  it("still decodes the terminal families Croki depends on", () => {
    assert.deepEqual(parseCodexEvent('{"type":"thread.started","thread_id":"t-1"}'), { type: "thread", id: "t-1" });
    assert.deepEqual(parseCodexEvent('{"type":"turn.failed","error":{"message":"rate limited"}}'), { type: "error", message: "rate limited" });
    const command = parseCodexEvent('{"type":"item.completed","item":{"id":"item_2","type":"command_execution","command":"npm test","aggregated_output":"ok","exit_code":0,"status":"completed"}}');
    assert.deepEqual(command, { type: "command-complete", id: "item_2", command: "npm test", exitCode: 0, output: "ok" });
  });
});
