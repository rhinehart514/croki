import assert from "node:assert/strict";
import test from "node:test";
import {
  WORK_PROTOCOL_NAME,
  WORK_PROTOCOL_SCHEMA_VERSION,
  createWorkProtocol,
} from "../../src/firm/work-protocol.mjs";

function memoryPersistence() {
  const states = new Map();
  return {
    loadState: (ventureId) => structuredClone(states.get(ventureId) ?? null),
    saveState: (ventureId, state) => states.set(ventureId, structuredClone(state)),
  };
}

function projector(ventureId, scope) {
  return {
    ventureId,
    workIndex: { ventureId, revision: 40, items: [], marker: "coherent-work" },
    timeline: scope.threadId
      ? {
        ventureId,
        revision: 41,
        thread: { threadRef: `thread:${scope.threadId}`, founderIntent: "last coherent Thread" },
        items: [],
      }
      : null,
  };
}

function timeline(ventureId, threadRef, revision, marker) {
  return {
    ventureId,
    revision,
    thread: { threadRef, founderIntent: marker },
    items: [],
    agents: [],
    visuals: [],
  };
}

function workIndex(ventureId, revision, marker) {
  return {
    ventureId,
    revision,
    items: [],
    counts: { total: marker, attention: 0, active: 0, unread: 0, matchCount: 0 },
    legacy: { unindexedRunCount: 0 },
  };
}

function command(overrides = {}) {
  return {
    protocol: WORK_PROTOCOL_NAME,
    schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
    type: "thread.rename",
    idempotencyKey: "rename-once",
    ventureId: "project-a",
    threadId: "one",
    expectedProjectionRevision: 0,
    payload: { name: "One exact outcome" },
    ...overrides,
  };
}

test("durable cursors resume exact contiguous pushes across a server-instance restart", () => {
  const persistence = memoryPersistence();
  const first = createWorkProtocol({
    ...persistence,
    serverInstanceId: "brain-first",
    retentionFrames: 2,
    project: projector,
  });
  first.publish({
    ventureId: "project-a",
    threadId: "one",
    projection: "thread",
    kind: "thread-replaced",
    payload: { revision: 1 },
  });
  first.publish({
    ventureId: "project-a",
    projection: "work",
    kind: "work-replaced",
    payload: { revision: 2 },
  });
  first.publish({
    ventureId: "project-a",
    threadId: "one",
    projection: "thread",
    kind: "thread-replaced",
    payload: { revision: 3 },
  });

  const replacement = createWorkProtocol({
    ...persistence,
    serverInstanceId: "brain-replacement",
    retentionFrames: 2,
    project: projector,
  });
  const resumed = replacement.handshake({
    ventureId: "project-a",
    threadId: "one",
    cursor: 1,
    schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
  });
  assert.equal(resumed.serverInstanceId, "brain-replacement");
  assert.equal(resumed.mode, "resume");
  assert.equal(resumed.cursor, 3);
  assert.deepEqual(resumed.frames.map((frame) => frame.sequence), [2, 3]);
  assert.deepEqual(resumed.frames.map((frame) => frame.projectionRevision), [2, 3]);

  const outsideRetention = replacement.handshake({
    ventureId: "project-a",
    threadId: "one",
    cursor: 0,
    schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
  });
  assert.equal(outsideRetention.mode, "snapshot");
  assert.equal(outsideRetention.cursor, 3);
  assert.equal(outsideRetention.snapshot.ventureId, "project-a");
  assert.equal(outsideRetention.snapshot.cursor, 3);
  assert.equal(outsideRetention.snapshot.workRevision, 3);
  assert.equal(outsideRetention.snapshot.threadRevision, 3);
  assert.equal(outsideRetention.snapshot.work.marker, "coherent-work");
  assert.equal(outsideRetention.snapshot.thread.thread.founderIntent, "last coherent Thread");
});

test("a persisted idempotency receipt runs one command at most once across Brain replacement", async () => {
  const persistence = memoryPersistence();
  const first = createWorkProtocol({
    ...persistence,
    serverInstanceId: "brain-first",
    project: projector,
  });
  let executions = 0;
  const original = await first.acceptCommand(command(), async () => {
    executions += 1;
    return { renamed: true, execution: executions };
  });
  assert.deepEqual(original, { renamed: true, execution: 1 });

  const replacement = createWorkProtocol({
    ...persistence,
    serverInstanceId: "brain-replacement",
    project: projector,
  });
  const replay = await replacement.acceptCommand(command(), async () => {
    executions += 1;
    return { renamed: true, execution: executions };
  });
  assert.deepEqual(replay, original);
  assert.equal(executions, 1);

  await assert.rejects(
    replacement.acceptCommand(command({ payload: { name: "Different command" } }), async () => null),
    (error) => error.code === "work_idempotency_conflict" && error.status === 409,
  );
  assert.equal(executions, 1);
});

test("a stale expected projection revision refuses before the command handler can mutate", async () => {
  const persistence = memoryPersistence();
  const protocol = createWorkProtocol({
    ...persistence,
    serverInstanceId: "brain-one",
    project: projector,
  });
  protocol.publish({
    ventureId: "project-a",
    projection: "work",
    kind: "work-replaced",
    payload: { revision: 1 },
  });

  let executed = false;
  await assert.rejects(
    protocol.acceptCommand(command({ expectedProjectionRevision: 0 }), async () => {
      executed = true;
    }),
    (error) => (
      error.code === "work_projection_stale"
      && error.expectedProjectionRevision === 0
      && error.currentProjectionRevision === 1
    ),
  );
  assert.equal(executed, false);
});

test("subscriptions are venture-scoped and open with one handshake before ordered pushes", () => {
  const persistence = memoryPersistence();
  const protocol = createWorkProtocol({
    ...persistence,
    serverInstanceId: "brain-one",
    project: projector,
  });
  const received = [];
  const stop = protocol.subscribe({
    ventureId: "project-a",
    threadId: "one",
    cursor: 0,
    schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
  }, (frame) => received.push(frame));

  protocol.publish({
    ventureId: "project-b",
    projection: "work",
    kind: "work-replaced",
    payload: { marker: "must not cross-paint" },
  });
  protocol.publish({
    ventureId: "project-a",
    threadId: "one",
    projection: "thread",
    kind: "thread-replaced",
    payload: { marker: "project-a" },
  });
  stop();

  assert.deepEqual(received.map((frame) => frame.frame), ["handshake", "push"]);
  assert.equal(received[0].ventureId, "project-a");
  assert.equal(received[1].ventureId, "project-a");
  assert.equal(received[1].sequence, 1);
});

test("a coherent Thread plus Work replacement is one durable bundle sequence", () => {
  const persistence = memoryPersistence();
  const protocol = createWorkProtocol({
    ...persistence,
    serverInstanceId: "brain-one",
    project: projector,
  });
  const frame = protocol.publish({
    ventureId: "project-a",
    threadId: "one",
    projection: "bundle",
    kind: "timeline-changed",
    payload: {
      workIndex: workIndex("project-a", 1, 1),
      timeline: timeline("project-a", "thread:one", 1, "atomic current"),
    },
  });

  assert.equal(frame.sequence, 1);
  assert.equal(frame.projectionRevision, 1);
  assert.equal(frame.projection, "bundle");
  const replay = protocol.handshake({
    ventureId: "project-a",
    threadId: "one",
    cursor: 0,
    schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
  });
  assert.equal(replay.mode, "resume");
  assert.deepEqual(replay.frames.map((candidate) => candidate.sequence), [1]);
  assert.equal(replay.frames[0].payload.workIndex.revision, 1);
  assert.equal(replay.frames[0].payload.timeline.revision, 1);
});
