import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { claudeCodeRuntime } from "../src/runtimes/claude-code.mjs";
import {
  createNestedTaskDispatch,
  sdkUserMessage,
  shapeNestedTaskEvent,
} from "../src/runtimes/claude-stream.mjs";

function context(overrides = {}) {
  return {
    goal: "Audit every route",
    model: "claude-test",
    system: "Stay inside the founder wall.",
    tools: [],
    stepCount: 0,
    maxSteps: 4,
    currentStatus: () => "running",
    isCancelled: () => false,
    onTurn() {},
    onText() {},
    onToolStart() {},
    onToolError() {},
    persistMessages() {},
    async runTool() { return { result: { ok: true }, pause: false }; },
    env: { CLAUDE_CODE_OAUTH_TOKEN: "test-token" },
    ...overrides,
  };
}

describe("Claude nested work", () => {
  it("shapes every SDK task message without leaking Claude wire names", () => {
    assert.deepEqual(shapeNestedTaskEvent({
      type: "system",
      subtype: "task_started",
      task_id: "task-1",
      tool_use_id: "tool-1",
      description: "Inspecting route handlers",
      subagent_type: "Explore",
      task_type: "local_workflow",
      workflow_name: "route-audit",
    }), {
      kind: "started",
      taskId: "task-1",
      status: "running",
      description: "Inspecting route handlers",
      taskKind: "workflow",
      parentToolUseId: "tool-1",
      workerType: "Explore",
      workflowName: "route-audit",
    });

    assert.deepEqual(shapeNestedTaskEvent({
      type: "system",
      subtype: "task_progress",
      task_id: "task-1",
      description: "Reading auth routes",
      summary: "Checking authority guards",
      last_tool_name: "Grep",
      usage: { total_tokens: 1_200, tool_uses: 4, duration_ms: 8_500 },
    }), {
      kind: "progress",
      taskId: "task-1",
      status: "running",
      description: "Reading auth routes",
      summary: "Checking authority guards",
      lastToolName: "Grep",
      usage: { totalTokens: 1_200, toolUses: 4, durationMs: 8_500 },
    });

    assert.deepEqual(shapeNestedTaskEvent({
      type: "system",
      subtype: "task_updated",
      task_id: "task-1",
      patch: {
        status: "paused",
        description: "Waiting",
        total_paused_ms: 600,
        is_backgrounded: true,
      },
    }), {
      kind: "updated",
      taskId: "task-1",
      status: "paused",
      description: "Waiting",
      pausedMs: 600,
      backgrounded: true,
    });

    assert.deepEqual(shapeNestedTaskEvent({
      type: "system",
      subtype: "task_notification",
      task_id: "task-1",
      status: "completed",
      output_file: "/tmp/task-1.output",
      summary: "Checked six routes",
      usage: { total_tokens: 1_800, tool_uses: 7, duration_ms: 12_000 },
    }), {
      kind: "settled",
      taskId: "task-1",
      status: "completed",
      summary: "Checked six routes",
      outputRef: "/tmp/task-1.output",
      usage: { totalTokens: 1_800, toolUses: 7, durationMs: 12_000 },
    });
  });

  it("stamps only founder-authored SDK messages as human", async () => {
    assert.deepEqual(sdkUserMessage("Founder direction", [], { human: true }).origin, { kind: "human" });
    assert.equal(Object.hasOwn(sdkUserMessage("Continue from where you left off."), "origin"), false);

    const fresh = [];
    await claudeCodeRuntime.drive(context({
      query: ({ prompt }) => (async function* freshQuery() {
        const turns = prompt[Symbol.asyncIterator]();
        fresh.push((await turns.next()).value);
        yield { type: "result", subtype: "success", is_error: false, result: "Done." };
      })(),
    }));
    assert.deepEqual(fresh[0].origin, { kind: "human" });

    const recovery = [];
    await claudeCodeRuntime.drive(context({
      runtimeSessionId: "existing-session",
      resumePrompt: "Continue the interrupted run.",
      exactResumeOnly: true,
      query: ({ prompt }) => (async function* recoveryQuery() {
        const turns = prompt[Symbol.asyncIterator]();
        recovery.push((await turns.next()).value);
        yield { type: "result", subtype: "success", is_error: false, result: "Recovered." };
      })(),
    }));
    assert.equal(Object.hasOwn(recovery[0], "origin"), false);
  });

  it("stamps a live founder steer as human", async () => {
    const handles = [];
    let acceptSteer;
    const steerReady = new Promise((resolve) => { acceptSteer = resolve; });
    let continueStream;
    const continued = new Promise((resolve) => { continueStream = resolve; });
    let steeredMessage;
    const drive = claudeCodeRuntime.drive(context({
      onRunHandle: (handle) => handles.push(handle),
      query: ({ prompt }) => ({
        [Symbol.asyncIterator]: async function* steeredQuery() {
          const turns = prompt[Symbol.asyncIterator]();
          await turns.next();
          acceptSteer();
          await continued;
          steeredMessage = (await turns.next()).value;
          yield { type: "result", subtype: "success", is_error: false, result: "Steered." };
        },
      }),
    }));

    await steerReady;
    assert.equal(handles[0].steer("Inspect every route."), true);
    continueStream();
    await drive;
    assert.deepEqual(steeredMessage.origin, { kind: "human" });
  });

  it("tracks resumed tasks from progress and removes only terminal task states", () => {
    const events = [];
    const tracker = createNestedTaskDispatch({ onNestedTask: (event) => events.push(event) });
    tracker.dispatch({
      type: "system",
      subtype: "task_progress",
      task_id: "resumed-task",
      description: "Still checking",
      usage: { total_tokens: 10, tool_uses: 1, duration_ms: 20 },
    });
    tracker.dispatch({
      type: "system",
      subtype: "task_updated",
      task_id: "resumed-task",
      patch: { status: "killed" },
    });
    tracker.dispatch({
      type: "system",
      subtype: "task_updated",
      task_id: "resumed-task",
      patch: { is_backgrounded: false },
    });

    assert.deepEqual([...tracker.activeTaskIds], []);
    assert.deepEqual(events.map(({ kind, status, activeCount }) => ({ kind, status, activeCount })), [
      { kind: "progress", status: "running", activeCount: 1 },
      { kind: "updated", status: "stopped", activeCount: 0 },
      { kind: "updated", status: undefined, activeCount: 0 },
    ]);
  });

  it("keeps the prompt open after the main result until all nested tasks settle", async () => {
    const taskEvents = [];
    let promptOpenAfterResult;
    let promptClosedAfterTask;
    const result = await claudeCodeRuntime.drive(context({
      onNestedTask: (event) => taskEvents.push(event),
      query: ({ prompt }) => ({
        [Symbol.asyncIterator]: async function* nestedQuery() {
          const turns = prompt[Symbol.asyncIterator]();
          await turns.next();
          yield {
            type: "system",
            subtype: "task_started",
            task_id: "task-1",
            description: "Inspecting route handlers",
            task_type: "local_workflow",
            workflow_name: "route-audit",
          };
          yield { type: "result", subtype: "success", is_error: false, result: "Main turn done." };
          promptOpenAfterResult = !prompt.closed;
          yield {
            type: "system",
            subtype: "task_notification",
            task_id: "task-1",
            status: "completed",
            output_file: "/tmp/task-1.output",
            summary: "Checked six routes",
          };
          promptClosedAfterTask = prompt.closed;
        },
      }),
    }));

    assert.equal(result.kind, "completed");
    assert.equal(promptOpenAfterResult, true);
    assert.equal(promptClosedAfterTask, true);
    assert.deepEqual(taskEvents.map(({ kind, status, activeCount }) => ({ kind, status, activeCount })), [
      { kind: "started", status: "running", activeCount: 1 },
      { kind: "settled", status: "completed", activeCount: 0 },
    ]);
  });

  it("exposes exact and all-task stops on the live Run handle", async () => {
    const stopped = [];
    const handles = [];
    let markReady;
    const ready = new Promise((resolve) => { markReady = resolve; });
    let release;
    const released = new Promise((resolve) => { release = resolve; });

    const drive = claudeCodeRuntime.drive(context({
      onRunHandle: (handle) => handles.push(handle),
      query: () => ({
        async stopTask(taskId) { stopped.push(taskId); },
        [Symbol.asyncIterator]: async function* controllableTasks() {
          yield { type: "system", subtype: "task_started", task_id: "task-1", description: "First" };
          yield { type: "system", subtype: "task_started", task_id: "task-2", description: "Second" };
          markReady();
          await released;
          yield { type: "system", subtype: "task_notification", task_id: "task-1", status: "stopped", output_file: "", summary: "Stopped" };
          yield { type: "system", subtype: "task_notification", task_id: "task-2", status: "completed", output_file: "", summary: "Done" };
          yield { type: "result", subtype: "success", is_error: false, result: "Done." };
        },
      }),
    }));

    await ready;
    assert.equal(await handles[0].stopTask("task-1"), true);
    assert.equal(await handles[0].stopTask("unknown"), false);
    assert.deepEqual(await handles[0].stopAllNested(), ["task-1", "task-2"]);
    assert.deepEqual(stopped, ["task-1", "task-1", "task-2"]);
    release();

    assert.equal((await drive).kind, "completed");
    assert.equal(handles.at(-1), null);
    assert.equal(await handles[0].stopTask("task-1"), false);
  });
});
