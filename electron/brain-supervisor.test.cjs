const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const test = require("node:test");
const {
  createBrainSupervisor,
  PROTOCOL,
  PROTOCOL_VERSION,
} = require("./brain-supervisor.cjs");

function protocolMessage(type, fields = {}) {
  return {
    protocol: PROTOCOL,
    version: PROTOCOL_VERSION,
    type,
    ...fields,
  };
}

class FakeBrainChild extends EventEmitter {
  constructor(pid) {
    super();
    this.pid = pid;
    this.connected = true;
    this.killed = false;
    this.sent = [];
    this.stdio = [null, null, null, null, new PassThrough()];
  }

  send(message, callback) {
    if (!this.connected) {
      const error = new Error("IPC channel is closed");
      callback?.(error);
      return false;
    }
    this.sent.push(message);
    this.emit("sent", message);
    callback?.(null);
    return true;
  }

  disconnect() {
    this.connected = false;
  }

  kill() {
    this.killed = true;
    this.connected = false;
    return true;
  }

  becomeReady() {
    this.emit("message", protocolMessage("ready", { pid: this.pid }));
  }

  respond(request, value) {
    this.emit("message", protocolMessage("response", {
      id: request.id,
      ok: true,
      value,
    }));
  }

  fail(request, error) {
    this.emit("message", protocolMessage("response", {
      id: request.id,
      ok: false,
      error: {
        name: error.name || "Error",
        message: error.message,
        ...(error.code ? { code: error.code } : {}),
        ...(error.status ? { status: error.status } : {}),
      },
    }));
  }

  crash(code = 1, signal = null) {
    this.connected = false;
    this.emit("exit", code, signal);
  }
}

function makeHarness(options = {}) {
  const children = [];
  const forkCalls = [];
  const fork = (...args) => {
    forkCalls.push(args);
    const child = new FakeBrainChild(4_000 + children.length);
    children.push(child);
    return child;
  };
  const supervisor = createBrainSupervisor({
    fork,
    childPath: "/test/brain-child.mjs",
    env: { TEST_BRAIN: "1" },
    restart: { minDelayMs: 0, maxDelayMs: 0, maxAttempts: 1 },
    ...options,
  });
  return { children, forkCalls, supervisor };
}

async function until(predicate, message = "condition was not met") {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(message);
}

function requests(child, method) {
  return child.sent.filter((message) => (
    message.protocol === PROTOCOL
    && message.version === PROTOCOL_VERSION
    && message.type === "request"
    && (!method || message.method === method)
  ));
}

test("start waits for the versioned readiness handshake", async () => {
  const { children, forkCalls, supervisor } = makeHarness();
  let settled = false;
  const starting = supervisor.start().then((value) => {
    settled = true;
    return value;
  });

  assert.equal(children.length, 1);
  assert.equal(settled, false, "forking alone is not readiness");
  assert.equal(forkCalls[0][0], "/test/brain-child.mjs");

  children[0].becomeReady();
  const ready = await starting;
  assert.equal(settled, true);
  assert.equal(ready.state, "engine-ready");
  assert.equal(supervisor.readiness().state, "engine-ready");
});

test("concurrent Brain requests correlate responses by id, not arrival order", async () => {
  const { children, supervisor } = makeHarness();
  const starting = supervisor.start();
  children[0].becomeReady();
  await starting;

  const first = supervisor.invokeBrain({ path: "/api/first", method: "GET" });
  const second = supervisor.recoverDesktopWork();
  const invokeRequest = requests(children[0], "invoke")[0];
  const recoverRequest = requests(children[0], "recover")[0];
  assert.ok(invokeRequest?.id);
  assert.ok(recoverRequest?.id);
  assert.notEqual(invokeRequest.id, recoverRequest.id);

  children[0].respond(recoverRequest, { recoveredWorkspaces: ["workspace-2"] });
  children[0].respond(invokeRequest, { status: 200, headers: {}, body: "first" });
  assert.deepEqual(await second, { recoveredWorkspaces: ["workspace-2"] });
  assert.deepEqual(await first, { status: 200, headers: {}, body: "first" });
});

test("venture and drive subscriptions deliver only their own events and unsubscribe exactly once", async () => {
  const { children, supervisor } = makeHarness();
  const starting = supervisor.start();
  children[0].becomeReady();
  await starting;

  const ventureEvents = [];
  const driveEvents = [];
  const stopVenture = supervisor.subscribeToVenture("venture-a", (event) => ventureEvents.push(event));
  const stopDrive = supervisor.subscribeToDriveStream("venture-a", "drive-1", (event) => driveEvents.push(event));
  const ventureRequest = requests(children[0], "subscribe-venture")[0];
  const driveRequest = requests(children[0], "subscribe-drive")[0];
  assert.equal(ventureRequest.input.ventureId, "venture-a");
  assert.deepEqual(driveRequest.input, {
    subscriptionId: driveRequest.input.subscriptionId,
    ventureId: "venture-a",
    driveId: "drive-1",
  });
  assert.notEqual(ventureRequest.input.subscriptionId, driveRequest.input.subscriptionId);

  children[0].emit("message", protocolMessage("event", {
    subscriptionId: ventureRequest.input.subscriptionId,
    event: { kind: "firm-event", revision: 7 },
  }));
  children[0].emit("message", protocolMessage("event", {
    subscriptionId: driveRequest.input.subscriptionId,
    event: { frame: "delta", delta: { text: "hello" } },
  }));
  assert.deepEqual(ventureEvents, [{ kind: "firm-event", revision: 7 }]);
  assert.deepEqual(driveEvents, [{ frame: "delta", delta: { text: "hello" } }]);

  stopVenture();
  stopVenture();
  stopDrive();
  stopDrive();
  const unsubscribeRequests = requests(children[0], "unsubscribe");
  assert.deepEqual(
    unsubscribeRequests.map((request) => request.input.subscriptionId).sort(),
    [ventureRequest.input.subscriptionId, driveRequest.input.subscriptionId].sort(),
    "each id is unsubscribed once even if its disposer is repeated",
  );

  children[0].emit("message", protocolMessage("event", {
    subscriptionId: ventureRequest.input.subscriptionId,
    event: { kind: "late" },
  }));
  assert.equal(ventureEvents.length, 1, "events after unsubscribe are discarded");
});

test("a crash rejects in-flight work, restarts once, and replays live subscriptions with stable ids", async () => {
  const { children, supervisor } = makeHarness();
  const starting = supervisor.start();
  children[0].becomeReady();
  await starting;

  const delivered = [];
  supervisor.subscribeToVenture("venture-a", (event) => delivered.push(event));
  supervisor.subscribeToDriveStream("venture-a", "drive-1", (event) => delivered.push(event));
  const originalVentureRequest = requests(children[0], "subscribe-venture")[0];
  const originalDriveRequest = requests(children[0], "subscribe-drive")[0];
  const inFlight = supervisor.invokeBrain({ path: "/api/blocked", method: "POST", body: "{}" });
  assert.equal(requests(children[0], "invoke").length, 1);

  children[0].crash(86);
  await assert.rejects(inFlight, /Brain|engine|exited|crash/i);

  const replacement = await until(() => children[1], "supervisor did not perform its one restart");
  assert.equal(supervisor.readiness().state, "engine-starting");
  replacement.becomeReady();
  await until(
    () => requests(replacement, "subscribe-venture").length === 1
      && requests(replacement, "subscribe-drive").length === 1,
    "live subscriptions were not replayed",
  );

  const replayedVenture = requests(replacement, "subscribe-venture")[0];
  const replayedDrive = requests(replacement, "subscribe-drive")[0];
  assert.equal(replayedVenture.input.subscriptionId, originalVentureRequest.input.subscriptionId);
  assert.equal(replayedDrive.input.subscriptionId, originalDriveRequest.input.subscriptionId);
  assert.equal(replayedVenture.input.ventureId, "venture-a");
  assert.equal(replayedDrive.input.driveId, "drive-1");

  replacement.emit("message", protocolMessage("event", {
    subscriptionId: replayedVenture.input.subscriptionId,
    event: { kind: "after-restart" },
  }));
  assert.deepEqual(delivered, [{ kind: "after-restart" }]);
});

test("Work replay advances its stable subscription cursor before an engine restart", async () => {
  const { children, supervisor } = makeHarness();
  const starting = supervisor.start();
  children[0].becomeReady();
  await starting;

  const delivered = [];
  supervisor.subscribeToWork(
    { ventureId: "venture-a", cursor: 11, schemaVersion: 1 },
    (event) => delivered.push(event),
  );
  const original = requests(children[0], "subscribe-work")[0];
  assert.equal(original.input.cursor, 11);
  children[0].emit("message", protocolMessage("event", {
    subscriptionId: original.input.subscriptionId,
    event: {
      frame: "push",
      schemaVersion: 1,
      ventureId: "venture-a",
      sequence: 12,
      projection: "work",
      projectionRevision: 7,
      payload: { revision: 7 },
    },
  }));
  assert.equal(delivered.length, 1);

  children[0].crash(86);
  const replacement = await until(() => children[1]);
  replacement.becomeReady();
  const replayed = await until(() => requests(replacement, "subscribe-work")[0]);
  assert.equal(replayed.input.subscriptionId, original.input.subscriptionId);
  assert.equal(replayed.input.cursor, 12);
});

test("Work replay cursor advances only through contiguous pushes, never past a dropped frame", async () => {
  const { children, supervisor } = makeHarness();
  const starting = supervisor.start();
  children[0].becomeReady();
  await starting;

  const delivered = [];
  supervisor.subscribeToWork(
    { ventureId: "venture-a", cursor: 11, schemaVersion: 1 },
    (event) => delivered.push(event),
  );
  const subscription = requests(children[0], "subscribe-work")[0];

  children[0].emit("message", protocolMessage("event", {
    subscriptionId: subscription.input.subscriptionId,
    event: {
      frame: "push",
      schemaVersion: 1,
      ventureId: "venture-a",
      sequence: 13,
      projection: "work",
      projectionRevision: 8,
      payload: { revision: 8 },
    },
  }));
  assert.equal(delivered.length, 1, "the UI may buffer a reordered push");
  assert.equal(
    subscription.input.cursor,
    11,
    "a delivered-but-not-contiguous push is not yet a safe reconnect cursor",
  );

  children[0].emit("message", protocolMessage("event", {
    subscriptionId: subscription.input.subscriptionId,
    event: {
      frame: "push",
      schemaVersion: 1,
      ventureId: "venture-a",
      sequence: 12,
      projection: "thread",
      projectionRevision: 7,
      payload: { revision: 7 },
    },
  }));
  assert.equal(subscription.input.cursor, 13, "closing the gap advances through the buffered push");

  children[0].crash(86);
  const replacement = await until(() => children[1]);
  replacement.becomeReady();
  const replayed = await until(() => requests(replacement, "subscribe-work")[0]);
  assert.equal(replayed.input.cursor, 13);
});

test("a Work snapshot fallback replaces the reconnect cursor", async () => {
  const { children, supervisor } = makeHarness();
  const starting = supervisor.start();
  children[0].becomeReady();
  await starting;

  supervisor.subscribeToWork(
    { ventureId: "venture-a", cursor: 3, schemaVersion: 1 },
    () => {},
  );
  const subscription = requests(children[0], "subscribe-work")[0];
  children[0].emit("message", protocolMessage("event", {
    subscriptionId: subscription.input.subscriptionId,
    event: {
      frame: "handshake",
      schemaVersion: 1,
      minSchemaVersion: 1,
      serverInstanceId: "replacement",
      ventureId: "venture-a",
      cursor: 40,
      projectionRevision: 40,
      mode: "snapshot",
      snapshot: { ventureId: "venture-a", cursor: 40, thread: null, work: null },
    },
  }));
  assert.equal(subscription.input.cursor, 40);

  children[0].crash(86);
  const replacement = await until(() => children[1]);
  replacement.becomeReady();
  const replayed = await until(() => requests(replacement, "subscribe-work")[0]);
  assert.equal(replayed.input.cursor, 40);
});

test("clean shutdown drains the child and never supervises it back to life", async () => {
  const { children, supervisor } = makeHarness();
  const starting = supervisor.start();
  children[0].becomeReady();
  await starting;

  const shuttingDown = supervisor.shutdownDesktopWork();
  const shutdownRequest = requests(children[0], "shutdown")[0];
  assert.ok(shutdownRequest, "the Brain receives its graceful desktop shutdown request");
  children[0].respond(shutdownRequest, { abortedDrives: 2 });
  assert.deepEqual(await shuttingDown, { abortedDrives: 2 });

  children[0].crash(0);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(children.length, 1, "an expected shutdown never triggers a restart");
});

test("the real child boots the desktop runtime and answers without binding a web port", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "croki-supervised-brain-"));
  const supervisor = createBrainSupervisor({
    env: {
      GTM_IDE_HOME: home,
      GTM_IDE_PERSISTENCE: "json",
      GTM_IDE_FOUNDER_CAPABILITY: "",
      DROVER_DEV_FOUNDER: "1",
    },
    hostCall(method) {
      throw Object.assign(new Error(`Unexpected native host call: ${method}`), {
        code: "UNEXPECTED_HOST_CALL",
      });
    },
    restart: { minDelayMs: 10, maxDelayMs: 10, maxAttempts: 1 },
  });
  t.after(async () => {
    await supervisor.shutdownDesktopWork().catch(() => undefined);
    fs.rmSync(home, { recursive: true, force: true });
  });

  const ready = await supervisor.start();
  assert.equal(ready.state, "engine-ready");
  assert.notEqual(ready.pid, process.pid);
  const response = await supervisor.invokeBrain({
    path: "/api/health",
    method: "GET",
    headers: {},
    body: "",
  });
  assert.equal(response.status, 200);
  const health = JSON.parse(response.body);
  assert.equal(health.ok, true);
  assert.equal(health.founderAuthority.available, true);

  const createdResponse = await supervisor.invokeBrain({
    path: "/api/ventures",
    method: "POST",
    headers: {},
    body: JSON.stringify({ name: "IPC Work protocol", repository: process.cwd() }),
  });
  assert.equal(createdResponse.status, 200);
  const venture = JSON.parse(createdResponse.body).venture;
  const frames = [];
  const opening = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("the real child did not send a Work handshake")),
      2_000,
    );
    const stopWork = supervisor.subscribeToWork({
      ventureId: venture.id,
      cursor: null,
      schemaVersion: 1,
    }, (frame) => {
      frames.push(frame);
      if (frames.length === 1) {
        clearTimeout(timeout);
        resolve(frame);
      }
    });
    t.after(stopWork);
  });
  assert.equal(opening.frame, "handshake");
  assert.equal(opening.ventureId, venture.id);
  assert.equal(opening.mode, "snapshot");
  assert.equal(opening.snapshot.ventureId, venture.id);
  assert.equal(opening.snapshot.cursor, opening.cursor);
  assert.equal(opening.snapshot.work.ventureId, venture.id);
  assert.ok(Array.isArray(opening.snapshot.work.items));
});
