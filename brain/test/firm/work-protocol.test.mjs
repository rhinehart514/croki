import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "croki-work-protocol-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const {
  createWorkProtocol,
  WORK_PROTOCOL_NAME,
  WORK_PROTOCOL_SCHEMA_VERSION,
} = await import("../../src/firm/work-protocol.mjs");
const { createVenture } = await import("../../src/firm/venture-store.mjs");
const {
  beginActiveDrive,
  noteDriveText,
  __resetActiveDrives,
} = await import("../../src/firm/active-drives.mjs");
const {
  subscribeToWork,
  workHandshake,
  __resetDesktopWorkProtocolSubscriptions,
} = await import("../../src/firm/work-protocol-desktop.mjs");
const {
  classifyDesktopWorkCommand,
  executeDesktopWorkRequest,
} = await import("../../src/firm/work-command-routes.mjs");

test.afterEach(() => {
  __resetActiveDrives();
  __resetDesktopWorkProtocolSubscriptions();
});

test.after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function memoryHarness({ retentionFrames = 128, retentionBytes = 2_000_000 } = {}) {
  const states = new Map();
  const projections = new Map([
    ["venture-a", { ventureId: "venture-a", workIndex: { items: [{ threadRef: "thread:a" }] }, timeline: null }],
    ["venture-b", { ventureId: "venture-b", workIndex: { items: [{ threadRef: "thread:b" }] }, timeline: null }],
  ]);
  let projectCalls = 0;
  const options = {
    retentionFrames,
    retentionBytes,
    loadState: (ventureId) => structuredClone(states.get(ventureId) ?? null),
    saveState: (ventureId, state) => states.set(ventureId, structuredClone(state)),
    assertScope: (ventureId) => {
      if (!projections.has(ventureId)) throw Object.assign(new Error("No such venture."), { status: 404 });
    },
    project: (ventureId) => {
      projectCalls += 1;
      return structuredClone(projections.get(ventureId));
    },
  };
  return {
    states,
    projections,
    options,
    protocol: createWorkProtocol({ ...options, serverInstanceId: "brain-one" }),
    projectCalls: () => projectCalls,
  };
}

function push(protocol, ventureId, value, scope = {}) {
  return protocol.publish({
    ventureId,
    ...scope,
    projection: "work",
    kind: "projection-replaced",
    payload: { value },
  });
}

test("pushes carry durable monotonic sequence, projection revision, schema, and exact scope", () => {
  const harness = memoryHarness();
  const first = push(harness.protocol, "venture-a", "one", { threadId: "thread:a", runId: "run:1" });
  const second = push(harness.protocol, "venture-a", "two");
  const other = push(harness.protocol, "venture-b", "elsewhere");

  assert.deepEqual(
    [first.sequence, second.sequence, other.sequence],
    [1, 2, 1],
    "each venture owns an independent monotonic cursor",
  );
  assert.deepEqual([first.projectionRevision, second.projectionRevision, other.projectionRevision], [1, 2, 1]);
  assert.equal(first.protocol, WORK_PROTOCOL_NAME);
  assert.equal(first.schemaVersion, WORK_PROTOCOL_SCHEMA_VERSION);
  assert.equal(first.serverInstanceId, "brain-one");
  assert.equal(first.threadId, "a");
  assert.equal(first.runId, "1");
  assert.equal(harness.states.get("venture-a").sequence, 2, "the current cursor is durable state");
});

test("handshake resumes an exact cursor across a server instance and snapshots outside retention", () => {
  const harness = memoryHarness({ retentionFrames: 2 });
  push(harness.protocol, "venture-a", "one");
  push(harness.protocol, "venture-a", "two");

  const replacement = createWorkProtocol({
    ...harness.options,
    serverInstanceId: "brain-two",
  });
  const resumed = replacement.handshake({
    ventureId: "venture-a",
    cursor: 1,
    schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
  });
  assert.equal(resumed.serverInstanceId, "brain-two");
  assert.equal(resumed.mode, "resume");
  assert.equal(resumed.snapshot, undefined);
  assert.deepEqual(resumed.frames.map((frame) => frame.sequence), [2]);
  assert.equal(harness.projectCalls(), 0, "an exact cursor resume does not rebuild WorkIndex");

  push(replacement, "venture-a", "three");
  const stale = replacement.handshake({
    ventureId: "venture-a",
    cursor: 0,
    schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
  });
  assert.equal(stale.mode, "snapshot");
  assert.equal(stale.cursor, 3);
  assert.equal(stale.projectionRevision, 3);
  assert.equal(stale.snapshot.work.items[0].threadRef, "thread:a");
  assert.equal(stale.snapshot.cursor, 3);
  assert.equal(stale.snapshot.workRevision, 3);
  assert.equal(harness.projectCalls(), 1);

  const delayedAhead = replacement.handshake({
    ventureId: "venture-a",
    cursor: 99,
    schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
  });
  assert.equal(delayedAhead.mode, "snapshot", "an impossible future cursor cannot replace coherent content");
});

test("subscription replays dropped frames in order and never crosses ventures", () => {
  const harness = memoryHarness();
  for (const value of ["one", "two", "three"]) push(harness.protocol, "venture-a", value);
  push(harness.protocol, "venture-b", "private");
  const heard = [];
  const stop = harness.protocol.subscribe({
    ventureId: "venture-a",
    cursor: 1,
    schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
  }, (frame) => heard.push(frame));

  assert.equal(heard[0].frame, "handshake");
  assert.equal(heard[0].mode, "resume");
  assert.deepEqual(heard.slice(1).map((frame) => frame.sequence), [2, 3]);
  assert.ok(heard.every((frame) => frame.ventureId === "venture-a"));

  push(harness.protocol, "venture-b", "still private");
  push(harness.protocol, "venture-a", "four");
  assert.deepEqual(heard.filter((frame) => frame.frame === "push").map((frame) => frame.sequence), [2, 3, 4]);
  stop();
  push(harness.protocol, "venture-a", "after close");
  assert.equal(heard.at(-1).sequence, 4);

  assert.throws(
    () => harness.protocol.handshake({ ventureId: "missing", cursor: 0, schemaVersion: 1 }),
    (error) => error.status === 404,
    "venture isolation fails before a cursor or frame is disclosed",
  );
});

test("commands require full transport metadata, deduplicate retries, and reject stale/reused keys", async () => {
  const harness = memoryHarness();
  let executions = 0;
  const command = {
    protocol: WORK_PROTOCOL_NAME,
    schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
    type: "thread.rename",
    idempotencyKey: "rename-a-once",
    ventureId: "venture-a",
    threadId: "a",
    runId: "1",
    expectedProjectionRevision: 0,
    payload: { name: "Exact return" },
  };
  const handler = async (accepted) => {
    executions += 1;
    assert.equal(accepted.ventureId, "venture-a");
    assert.equal(accepted.threadId, "a");
    assert.equal(accepted.runId, "1");
    return { renamed: true };
  };

  assert.deepEqual(await harness.protocol.acceptCommand(command, handler), { renamed: true });
  assert.deepEqual(await harness.protocol.acceptCommand(command, handler), { renamed: true });
  assert.equal(executions, 1, "the durable idempotency receipt answers the duplicate");

  await assert.rejects(
    harness.protocol.acceptCommand({ ...command, payload: { name: "Different" } }, handler),
    (error) => error.code === "work_idempotency_conflict" && error.status === 409,
  );

  push(harness.protocol, "venture-a", "newer");
  await assert.rejects(
    harness.protocol.acceptCommand({
      ...command,
      idempotencyKey: "stale-command",
      expectedProjectionRevision: 0,
    }, handler),
    (error) => error.code === "work_projection_stale"
      && error.currentProjectionRevision === 1
      && error.status === 409,
  );
  assert.equal(executions, 1);

  await assert.rejects(
    harness.protocol.acceptCommand({
      ...command,
      idempotencyKey: "",
      expectedProjectionRevision: undefined,
    }, handler),
    (error) => error.code === "work_command_invalid",
  );
});

test("provider text tokens never trigger a Work projection push or WorkIndex rebuild", () => {
  const venture = createVenture({ name: "Token isolation", repository: process.cwd() }, { root });
  const frames = [];
  const stop = subscribeToWork({
    ventureId: venture.id,
    schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
  }, (frame) => frames.push(frame));
  assert.equal(frames[0].frame, "handshake");
  assert.equal(frames[0].mode, "snapshot");

  const drive = beginActiveDrive({
    ventureId: venture.id,
    teammateRef: "claude",
    runtime: "claude-code",
    abortSupported: true,
  });
  const afterStart = frames.length;
  assert.equal(frames.at(-1).kind, "status-changed");
  for (let index = 0; index < 2_000; index += 1) {
    noteDriveText(drive.id, "token", { now: () => 1_000_000 + index });
  }
  assert.equal(frames.length, afterStart, "even fallback drive pings are below the ordered Work projection");

  drive.finish();
  assert.equal(frames.at(-1).kind, "status-changed");
  const rendererCursor = frames.at(-1).sequence;
  stop();

  const unattended = beginActiveDrive({
    ventureId: venture.id,
    teammateRef: "codex",
    runtime: "codex",
    abortSupported: true,
  });
  unattended.finish();
  const cursor = workHandshake({ ventureId: venture.id, schemaVersion: 1, cursor: rendererCursor });
  assert.equal(cursor.mode, "resume");
  assert.deepEqual(
    cursor.frames.map((frame) => frame.sequence),
    [rendererCursor + 1, rendererCursor + 2],
    "the Brain keeps cursor capture alive while the renderer is disconnected",
  );
});

test("the shipped desktop Work route executes an idempotent retry once and rejects missing scope metadata", async () => {
  const harness = memoryHarness();
  let dispatches = 0;
  const input = {
    path: "/api/ventures/venture-a/threads/a/name",
    method: "PUT",
    headers: {
      "x-drover-idempotency-key": "route-rename-once",
      "x-drover-venture-id": "venture-a",
      "x-drover-thread-id": "a",
      "x-drover-expected-projection-revision": "0",
    },
    body: JSON.stringify({ name: "One durable name" }),
  };
  const execute = () => executeDesktopWorkRequest(input, {
    acceptCommand: harness.protocol.acceptCommand,
    dispatch: async () => {
      dispatches += 1;
      return { status: 200, headers: {}, body: JSON.stringify({ renamed: true }) };
    },
  });

  const accepted = classifyDesktopWorkCommand(input);
  assert.equal(accepted.ventureId, "venture-a");
  assert.equal(accepted.threadId, "a");
  assert.equal(accepted.expectedProjectionRevision, 0);
  assert.deepEqual(await execute(), await execute());
  assert.equal(dispatches, 1, "the route handler executes once across a repeated desktop request");

  await assert.rejects(
    executeDesktopWorkRequest({
      ...input,
      headers: { "x-drover-venture-id": "venture-a" },
    }, {
      acceptCommand: harness.protocol.acceptCommand,
      dispatch: async () => ({ status: 200 }),
    }),
    (error) => error.code === "work_command_idempotency_required" && error.status === 400,
  );

  assert.equal(
    classifyDesktopWorkCommand({ path: "/api/ventures/venture-a/system/mutations", method: "POST", headers: {} }),
    null,
    "Product/Canvas mutations retain their existing authority and revision path",
  );
  assert.equal(
    classifyDesktopWorkCommand({
      path: "/api/ventures/venture-a/drive",
      method: "POST",
      headers: { "x-gtm-actor": "agent" },
    }),
    null,
    "the MCP/agent inward-work door is not recast as a desktop client command",
  );

  const ship = classifyDesktopWorkCommand({
    path: "/api/ventures/venture-a/coding-workspaces/code-one/ship",
    method: "POST",
    headers: {
      "x-drover-idempotency-key": "ship-reviewed-plan-once",
      "x-drover-venture-id": "venture-a",
      "x-drover-expected-projection-revision": "8",
    },
    body: JSON.stringify({ confirm: true, planFingerprint: "a".repeat(64) }),
  });
  assert.equal(ship.type, "POST /api/ventures/venture-a/coding-workspaces/code-one/ship");
  assert.equal(ship.ventureId, "venture-a");
  assert.equal(ship.expectedProjectionRevision, 8);
  assert.match(ship.payload.bodyDigest, /^[0-9a-f]{64}$/, "the exact confirmed plan is deduplicated without exposing its body");
});
