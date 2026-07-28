const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadBridge() {
  const listeners = new Map();
  const invocations = [];
  let bridge = null;
  const ipcRenderer = {
    invoke: async (channel, ...args) => {
      invocations.push([channel, ...args]);
      return { subscribed: channel === "drover:events-subscribe" };
    },
    on: (channel, handler) => {
      const handlers = listeners.get(channel) ?? new Set();
      handlers.add(handler);
      listeners.set(channel, handlers);
    },
    removeListener: (channel, handler) => {
      listeners.get(channel)?.delete(handler);
    },
  };
  const source = fs.readFileSync(path.join(__dirname, "preload.cjs"), "utf8");
  vm.runInNewContext(source, {
    require: (specifier) => {
      assert.equal(specifier, "electron");
      return {
        contextBridge: {
          exposeInMainWorld: (_name, value) => { bridge = value; },
        },
        ipcRenderer,
      };
    },
    process: { platform: "darwin" },
  });
  return {
    bridge: () => bridge,
    invocations,
    emit: (channel, payload) => {
      for (const handler of listeners.get(channel) ?? []) handler({}, payload);
    },
  };
}

test("venture event subscriptions route and clean up by independent ids", async () => {
  const harness = loadBridge();
  const firstEvents = [];
  const secondEvents = [];
  const firstStop = await harness.bridge().api.subscribe("venture-a", (event) => firstEvents.push(event));
  const secondStop = await harness.bridge().api.subscribe("venture-a", (event) => secondEvents.push(event));

  const subscriptions = harness.invocations.filter(([channel]) => channel === "drover:events-subscribe");
  assert.equal(subscriptions.length, 2);
  const firstId = subscriptions[0][1].subscriptionId;
  const secondId = subscriptions[1][1].subscriptionId;
  assert.notEqual(firstId, secondId);

  harness.emit("drover:venture-event", { subscriptionId: firstId, event: { kind: "timeline" } });
  harness.emit("drover:venture-event", { subscriptionId: secondId, event: { kind: "drive" } });
  assert.deepEqual(firstEvents, [{ kind: "timeline" }]);
  assert.deepEqual(secondEvents, [{ kind: "drive" }]);

  firstStop();
  harness.emit("drover:venture-event", { subscriptionId: secondId, event: { kind: "conversation" } });
  assert.deepEqual(firstEvents, [{ kind: "timeline" }]);
  assert.deepEqual(secondEvents, [{ kind: "drive" }, { kind: "conversation" }]);

  const unsubscriptions = harness.invocations.filter(([channel]) => channel === "drover:events-unsubscribe");
  assert.deepEqual(unsubscriptions, [["drover:events-unsubscribe", firstId]]);

  secondStop();
  assert.deepEqual(
    harness.invocations.filter(([channel]) => channel === "drover:events-unsubscribe"),
    [
      ["drover:events-unsubscribe", firstId],
      ["drover:events-unsubscribe", secondId],
    ],
  );
});

test("engine lifecycle stays a data-only desktop subscription", async () => {
  const harness = loadBridge();
  const states = [];
  const stop = harness.bridge().engine.onState((state) => states.push(state));

  harness.emit("drover:engine-state", {
    phase: "degraded",
    at: "2026-07-25T12:00:00.000Z",
    attempt: 2,
    message: "The work engine is reconnecting.",
  });
  assert.deepEqual(states, [{
    phase: "degraded",
    at: "2026-07-25T12:00:00.000Z",
    attempt: 2,
    message: "The work engine is reconnecting.",
  }]);

  await harness.bridge().engine.status();
  assert.deepEqual(
    harness.invocations.filter(([channel]) => channel === "drover:engine-status"),
    [["drover:engine-status"]],
  );

  stop();
  harness.emit("drover:engine-state", { phase: "engine-ready" });
  assert.equal(states.length, 1);
});

test("update posture is read-only and cannot invoke an installer from the renderer", async () => {
  const harness = loadBridge();
  assert.deepEqual(Object.keys(harness.bridge().update), ["status"]);
  await harness.bridge().update.status();
  assert.deepEqual(
    harness.invocations.filter(([channel]) => channel === "drover:update-status"),
    [["drover:update-status"]],
  );
});

test("ordered Work frames route through their own subscription and cleanup id", async () => {
  const harness = loadBridge();
  const frames = [];
  const stop = await harness.bridge().api.subscribeWork(
    { ventureId: "venture-a", cursor: 17, schemaVersion: 1 },
    (frame) => frames.push(frame),
  );
  const invocation = harness.invocations.find(([channel]) => channel === "drover:work-subscribe");
  assert.ok(invocation);
  const subscriptionId = invocation[1].subscriptionId;
  assert.equal(invocation[1].ventureId, "venture-a");
  assert.equal(invocation[1].cursor, 17);

  harness.emit("drover:work-frame", {
    subscriptionId,
    frame: {
      frame: "push",
      schemaVersion: 1,
      ventureId: "venture-a",
      sequence: 18,
      projection: "work",
      projectionRevision: 4,
      payload: { revision: 4 },
    },
  });
  assert.equal(frames.length, 1);
  assert.equal(frames[0].sequence, 18);

  stop();
  assert.deepEqual(
    harness.invocations.filter(([channel]) => channel === "drover:events-unsubscribe").at(-1),
    ["drover:events-unsubscribe", subscriptionId],
  );
});

test("named terminal controls remain data-only IPC scoped by venture, workspace, and session", async () => {
  const harness = loadBridge();
  await harness.bridge().terminal.open({ ventureId: "venture-a", workspaceId: "attempt-a", terminalId: "tests", name: "Tests", cols: 90, rows: 24 });
  await harness.bridge().terminal.inspect("venture-a", "attempt-a");
  await harness.bridge().terminal.resize("session-one", 120, 40);
  await harness.bridge().terminal.restart("session-one");
  await harness.bridge().terminal.close("session-one");
  assert.deepEqual(harness.invocations.slice(-5), [
    ["drover:terminal-open", { ventureId: "venture-a", workspaceId: "attempt-a", terminalId: "tests", name: "Tests", cols: 90, rows: 24 }],
    ["drover:terminal-inspect", "venture-a", "attempt-a"],
    ["drover:terminal-resize", "session-one", 120, 40],
    ["drover:terminal-restart", "session-one"],
    ["drover:terminal-close", "session-one"],
  ]);
});

test("shared preview controls remain data-only IPC scoped by venture and workspace", async () => {
  const harness = loadBridge();
  const states = [];
  const stop = harness.bridge().preview.onState((state) => states.push(state));
  await harness.bridge().preview.attach("venture-a", "attempt-a", 44);
  await harness.bridge().preview.inspect("venture-a", "attempt-a");
  await harness.bridge().preview.control("venture-a", "attempt-a", "navigate", { url: "http://127.0.0.1:4310/" });
  harness.emit("drover:preview-state", {
    workspaceId: "attempt-a",
    url: "http://127.0.0.1:4310/",
    control: { kind: "run", runId: "run-1", at: "2026-07-25T12:00:00.000Z" },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(harness.invocations.slice(-3))), [
    ["drover:preview-attach", { ventureId: "venture-a", workspaceId: "attempt-a", webContentsId: 44 }],
    ["drover:preview-inspect", { ventureId: "venture-a", workspaceId: "attempt-a" }],
    ["drover:preview-control", {
      ventureId: "venture-a",
      workspaceId: "attempt-a",
      operation: "navigate",
      url: "http://127.0.0.1:4310/",
    }],
  ]);
  assert.equal(states[0].control.runId, "run-1");
  stop();
  harness.emit("drover:preview-state", { workspaceId: "attempt-a" });
  assert.equal(states.length, 1);
});
