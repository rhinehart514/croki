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
