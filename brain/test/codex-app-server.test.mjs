import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";

import {
  buildCodexAppServerArgs,
  createCodexAppServerClient,
  decodeCodexAppServerNotification,
  runCodexAppServerTurn,
} from "../src/runtimes/codex.mjs";

function fakeAppServer(onRequest = () => {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.sent = [];
  child.stdin = {
    write(line) {
      const message = JSON.parse(line);
      child.sent.push(message);
      onRequest(message, child);
      return true;
    },
  };
  child.respond = (id, result) => child.stdout.write(`${JSON.stringify({ id, result })}\n`);
  child.reject = (id, error) => child.stdout.write(`${JSON.stringify({ id, error })}\n`);
  child.notify = (method, params) => child.stdout.write(`${JSON.stringify({ method, params })}\n`);
  child.kill = () => {
    queueMicrotask(() => child.emit("close", 0));
    return true;
  };
  return child;
}

describe("Codex app-server protocol", () => {
  it("keeps the current native-coding sandbox and loopback MCP posture", () => {
    const args = buildCodexAppServerArgs({
      nativeCoding: true,
      mcpUrl: "http://127.0.0.1:43123/mcp/opaque",
    });
    assert.deepEqual(args.slice(0, 3), ["app-server", "--listen", "stdio://"]);
    assert.ok(args.includes('approval_policy="never"'));
    assert.ok(args.includes("sandbox_workspace_write.network_access=true"));
    assert.ok(args.includes('features.network_proxy.domains={ "localhost" = "allow", "127.0.0.1" = "allow" }'));
    assert.ok(args.includes('mcp_servers.drover.url="http://127.0.0.1:43123/mcp/opaque"'));
    assert.ok(!args.includes("danger-full-access"));
  });

  it("normalizes collaboration facts without exposing child prompts or messages", () => {
    const [event] = decodeCodexAppServerNotification({
      method: "item/completed",
      params: {
        threadId: "root-thread",
        item: {
          type: "collabAgentToolCall",
          id: "collab-1",
          tool: "spawnAgent",
          status: "completed",
          senderThreadId: "root-thread",
          receiverThreadIds: ["child-a"],
          prompt: "secret internal delegation prompt",
          model: "gpt-5.6-sol",
          reasoningEffort: "high",
          agentsStates: {
            "child-a": { status: "running", message: "secret child response" },
          },
        },
      },
    });
    assert.deepEqual(event, {
      type: "nested-work",
      provider: "codex",
      id: "collab-1",
      parentId: "root-thread",
      action: "spawn",
      status: "completed",
      children: [{ id: "child-a", status: "running" }],
      model: "gpt-5.6-sol",
      effort: "high",
    });
    assert.doesNotMatch(JSON.stringify(event), /secret|prompt|response/);
  });

  it("performs the required handshake and refuses unknown server authority by default", async () => {
    const child = fakeAppServer((message, server) => {
      if (message.method === "initialize") server.respond(message.id, { userAgent: "codex-test" });
      if (message.method === "thread/read") server.respond(message.id, { thread: { id: "thread-1" } });
    });
    const client = createCodexAppServerClient({
      binary: process.execPath,
      cwd: process.cwd(),
      spawnProcess: () => child,
    });
    const initialized = await client.initialize();
    assert.equal(initialized.userAgent, "codex-test");
    assert.deepEqual(child.sent.slice(0, 2).map((message) => message.method), ["initialize", "initialized"]);
    assert.equal((await client.request("thread/read", { threadId: "thread-1" })).thread.id, "thread-1");

    child.stdout.write(`${JSON.stringify({ id: 88, method: "item/commandExecution/requestApproval", params: {} })}\n`);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(child.sent.at(-1), {
      id: 88,
      error: {
        code: -32601,
        message: "Croki does not authorize server request: item/commandExecution/requestApproval",
      },
    });
    client.close();
  });

  it("runs a resumable interactive turn and surfaces native nested work and controls", async () => {
    let emittedTurn = false;
    const child = fakeAppServer((message, server) => {
      if (message.method === "initialize") server.respond(message.id, { userAgent: "codex-test" });
      if (message.method === "thread/resume") {
        server.respond(message.id, { thread: { id: "root-thread", parentThreadId: null } });
      }
      if (message.method === "turn/start") {
        server.respond(message.id, { turn: { id: "turn-1", status: "inProgress", items: [] } });
        if (!emittedTurn) {
          emittedTurn = true;
          setImmediate(() => {
            server.notify("thread/started", {
              thread: {
                id: "child-a",
                parentThreadId: "root-thread",
                status: { type: "active", activeFlags: [] },
                agentNickname: "Verifier",
              },
            });
            server.notify("item/started", {
              threadId: "root-thread",
              turnId: "turn-1",
              startedAtMs: 100,
              item: {
                type: "collabAgentToolCall",
                id: "collab-1",
                tool: "spawnAgent",
                status: "inProgress",
                senderThreadId: "root-thread",
                receiverThreadIds: ["child-a"],
                prompt: "hidden",
                model: "gpt-5.6-sol",
                reasoningEffort: "high",
                agentsStates: { "child-a": { status: "running", message: null } },
              },
            });
            server.notify("item/agentMessage/delta", {
              threadId: "root-thread", turnId: "turn-1", itemId: "message-1", delta: "Checked ",
            });
            server.notify("item/agentMessage/delta", {
              threadId: "root-thread", turnId: "turn-1", itemId: "message-1", delta: "all routes.",
            });
            server.notify("item/completed", {
              threadId: "root-thread",
              turnId: "turn-1",
              completedAtMs: 200,
              item: { type: "agentMessage", id: "message-1", text: "Checked all routes." },
            });
            server.notify("thread/tokenUsage/updated", {
              threadId: "root-thread",
              turnId: "turn-1",
              tokenUsage: {
                last: {
                  totalTokens: 18,
                  inputTokens: 12,
                  cachedInputTokens: 4,
                  cacheWriteInputTokens: 0,
                  outputTokens: 6,
                  reasoningOutputTokens: 2,
                },
              },
            });
            server.notify("turn/completed", {
              threadId: "root-thread",
              turn: { id: "turn-1", status: "completed", error: null, items: [] },
            });
          });
        }
      }
      if (message.method === "turn/steer") server.respond(message.id, { turnId: "turn-1" });
    });
    const deltas = [];
    const nested = [];
    const usage = [];
    const controls = [];
    const sessions = [];
    const tasks = [];
    const result = await runCodexAppServerTurn({
      prompt: "Audit every route",
      cwd: process.cwd(),
      model: "gpt-5.6-sol",
      effort: "high",
      resumeId: "root-thread",
      nativeCoding: true,
      env: { GTM_IDE_CODEX_PATH: process.execPath },
      spawnProcess: () => child,
      onTextDelta: (delta) => deltas.push(delta),
      onNestedWork: (event) => nested.push(event),
      onUsage: (measured) => usage.push(measured),
      onNestedTask: (event) => tasks.push(event),
      onRuntimeSession: (id) => sessions.push(id),
      onControl: (control) => {
        controls.push(control);
        void control.steer("Also check the recovery route.");
      },
    });

    assert.equal(result.error, null);
    assert.equal(result.threadId, "root-thread");
    assert.equal(result.turnId, "turn-1");
    assert.equal(result.text, "Checked all routes.");
    assert.equal(deltas.join(""), "Checked all routes.");
    assert.deepEqual(sessions, ["root-thread"]);
    assert.equal(typeof controls[0].steer, "function");
    assert.equal(typeof controls[0].interrupt, "function");
    assert.equal(controls.at(-1), null, "the settled provider turn unregisters its live controls");
    assert.equal(controls[0].steer("too late"), false);
    assert.ok(child.sent.some((message) => message.method === "turn/steer"));
    assert.deepEqual(usage, [{
      inputTokens: 12,
      outputTokens: 6,
      cacheReadInputTokens: 4,
      cacheCreationInputTokens: 0,
    }]);
    assert.deepEqual(nested.map(({ action, status }) => ({ action, status })), [
      { action: "agent", status: "running" },
      { action: "spawn", status: "running" },
    ]);
    assert.deepEqual(tasks.map(({ kind, taskId, status, activeCount }) => ({ kind, taskId, status, activeCount })), [
      { kind: "started", taskId: "child-a", status: "running", activeCount: 1 },
      { kind: "progress", taskId: "child-a", status: "running", activeCount: 1 },
      { kind: "settled", taskId: "child-a", status: "stopped", activeCount: 0 },
    ], "a root turn never settles while leaving a child falsely live in Croki");
    assert.doesNotMatch(JSON.stringify(nested), /hidden/);
  });

  it("uses app-server's native output schema without streaming serialization into the Thread", async () => {
    const child = fakeAppServer((message, server) => {
      if (message.method === "initialize") server.respond(message.id, { userAgent: "codex-test" });
      if (message.method === "thread/start") server.respond(message.id, { thread: { id: "canvas-thread" } });
      if (message.method === "turn/start") {
        server.respond(message.id, { turn: { id: "canvas-turn", status: "inProgress", items: [] } });
        setImmediate(() => {
          const progress = "I mapped the current repository surface.";
          const text = '{"summary":"Mapped the flow","nodes":[]}';
          server.notify("item/completed", {
            threadId: "canvas-thread",
            turnId: "canvas-turn",
            completedAtMs: 150,
            item: { type: "agentMessage", id: "canvas-progress", text: progress },
          });
          server.notify("item/agentMessage/delta", {
            threadId: "canvas-thread", turnId: "canvas-turn", itemId: "canvas-message", delta: text,
          });
          server.notify("item/completed", {
            threadId: "canvas-thread",
            turnId: "canvas-turn",
            completedAtMs: 200,
            item: { type: "agentMessage", id: "canvas-message", text },
          });
          server.notify("turn/completed", {
            threadId: "canvas-thread",
            turn: {
              id: "canvas-turn",
              status: "completed",
              error: null,
              items: [
                { type: "agentMessage", id: "canvas-progress", text: progress },
                { type: "agentMessage", id: "canvas-message", text },
              ],
            },
          });
        });
      }
    });
    const deltas = [];
    const result = await runCodexAppServerTurn({
      prompt: "Project the selected branch",
      cwd: process.cwd(),
      outputSchema: {
        type: "object",
        required: ["summary", "nodes"],
        properties: { summary: { type: "string" }, nodes: { type: "array" } },
      },
      env: { GTM_IDE_CODEX_PATH: process.execPath },
      spawnProcess: () => child,
      onTextDelta: (delta) => deltas.push(delta),
    });

    assert.equal(result.error, null);
    assert.deepEqual(result.structuredOutput, { summary: "Mapped the flow", nodes: [] });
    assert.deepEqual(deltas, []);
    assert.match(result.text, /I mapped the current repository surface/);
    const threadStart = child.sent.find((message) => message.method === "thread/start");
    assert.equal(threadStart.params.serviceName, "croki");
    const turnStart = child.sent.find((message) => message.method === "turn/start");
    assert.equal(turnStart.params.outputSchema.type, "object");
  });

  it("interrupts the exact active root turn and unregisters the handle", async () => {
    const child = fakeAppServer((message, server) => {
      if (message.method === "initialize") server.respond(message.id, { userAgent: "codex-test" });
      if (message.method === "thread/start") server.respond(message.id, { thread: { id: "root-thread" } });
      if (message.method === "turn/start") {
        server.respond(message.id, { turn: { id: "turn-stop", status: "inProgress", items: [] } });
      }
      if (message.method === "turn/interrupt") {
        server.respond(message.id, {});
        setImmediate(() => server.notify("turn/completed", {
          threadId: "root-thread",
          turn: { id: "turn-stop", status: "interrupted", error: null, items: [] },
        }));
      }
    });
    const handles = [];
    const result = await runCodexAppServerTurn({
      prompt: "Begin the audit",
      cwd: process.cwd(),
      env: { GTM_IDE_CODEX_PATH: process.execPath },
      spawnProcess: () => child,
      onControl: (handle) => {
        handles.push(handle);
        if (handle) void handle.interrupt();
      },
    });

    assert.equal(result.error, "cancelled");
    assert.deepEqual(child.sent.find((message) => message.method === "turn/interrupt")?.params, {
      threadId: "root-thread",
      turnId: "turn-stop",
    });
    assert.equal(handles.at(-1), null);
  });
});
