// work-protocol.mjs — the ordered, venture-scoped transport contract for Work.
//
// This module deliberately knows nothing about Product/Canvas truth. Its projector is injected, and
// the desktop adapter projects only WorkIndex plus an optional Thread timeline. The protocol owns the
// transport facts that must survive a Brain restart: cursor sequence, projection revision, bounded
// replay frames, and idempotency receipts.

import crypto from "node:crypto";

export const WORK_PROTOCOL_NAME = "croki-work";
export const WORK_PROTOCOL_SCHEMA_VERSION = 1;
export const WORK_PROTOCOL_MIN_SCHEMA_VERSION = 1;

const DEFAULT_RETAINED_FRAMES = 128;
const DEFAULT_RETAINED_BYTES = 2_000_000;
const DEFAULT_COMMAND_RECEIPTS = 256;

function protocolError(message, code, status = 400, detail = {}) {
  return Object.assign(new Error(message), { code, status, ...detail });
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeState(value) {
  return {
    revision: Number.isInteger(value?.revision) && value.revision >= 0 ? value.revision : 0,
    sequence: Number.isInteger(value?.sequence) && value.sequence >= 0 ? value.sequence : 0,
    projectionRevision: Number.isInteger(value?.projectionRevision) && value.projectionRevision >= 0
      ? value.projectionRevision
      : 0,
    retained: Array.isArray(value?.retained) ? clone(value.retained) : [],
    commands: Array.isArray(value?.commands) ? clone(value.commands) : [],
    updatedAt: text(value?.updatedAt) || null,
  };
}

function scopeFrom(input = {}) {
  const ventureId = text(input.ventureId);
  if (!ventureId) throw protocolError("A Work protocol scope needs a ventureId.", "work_scope_invalid");
  const threadId = text(input.threadId).replace(/^thread:/, "") || null;
  const runId = text(input.runId).replace(/^run:/, "") || null;
  return { ventureId, threadId, runId };
}

function assertSchema(schemaVersion) {
  if (!Number.isInteger(schemaVersion)) {
    throw protocolError("A Work protocol schemaVersion is required.", "work_schema_required");
  }
  if (schemaVersion < WORK_PROTOCOL_MIN_SCHEMA_VERSION || schemaVersion > WORK_PROTOCOL_SCHEMA_VERSION) {
    throw protocolError(
      `Work schema ${schemaVersion} is incompatible with ${WORK_PROTOCOL_MIN_SCHEMA_VERSION}-${WORK_PROTOCOL_SCHEMA_VERSION}.`,
      "work_schema_incompatible",
      409,
      {
        schemaVersion,
        minSchemaVersion: WORK_PROTOCOL_MIN_SCHEMA_VERSION,
        maxSchemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
      },
    );
  }
}

function commandDigest(command) {
  return crypto.createHash("sha256").update(JSON.stringify({
    type: command.type,
    ventureId: command.ventureId,
    threadId: command.threadId,
    runId: command.runId,
    payload: command.payload ?? null,
  })).digest("hex");
}

function retainedBytes(frames) {
  return frames.reduce((total, frame) => total + Buffer.byteLength(JSON.stringify(frame)), 0);
}

function trimRetained(frames, maxFrames, maxBytes) {
  while (frames.length > maxFrames || retainedBytes(frames) > maxBytes) frames.shift();
}

function replayAfter(state, cursor) {
  if (cursor === state.sequence) return [];
  const frames = state.retained.filter((frame) => frame.sequence > cursor);
  if (!frames.length || frames[0].sequence !== cursor + 1 || frames.at(-1).sequence !== state.sequence) return null;
  for (let index = 1; index < frames.length; index += 1) {
    if (frames[index].sequence !== frames[index - 1].sequence + 1) return null;
  }
  return clone(frames);
}

function coherentSnapshot(projected, state, ventureId) {
  const value = projected && typeof projected === "object" ? projected : {};
  return {
    ventureId,
    cursor: state.sequence,
    threadRevision: state.projectionRevision,
    workRevision: state.projectionRevision,
    thread: clone(value.thread ?? value.timeline ?? null),
    work: clone(value.work ?? value.workIndex ?? null),
  };
}

function safeStoredError(error) {
  return {
    name: text(error?.name) || "Error",
    message: text(error?.message ?? error) || "The Work command failed.",
    ...(error?.code != null ? { code: String(error.code) } : {}),
    ...(Number.isInteger(error?.status) ? { status: error.status } : {}),
  };
}

function reviveStoredError(value) {
  return protocolError(
    text(value?.message) || "The Work command failed.",
    text(value?.code) || "work_command_failed",
    Number.isInteger(value?.status) ? value.status : 400,
    { name: text(value?.name) || "Error" },
  );
}

export function createWorkProtocol(options = {}) {
  const serverInstanceId = text(options.serverInstanceId) || crypto.randomUUID();
  const project = typeof options.project === "function"
    ? options.project
    : () => { throw protocolError("No Work projector is configured.", "work_projector_missing", 500); };
  const assertScope = typeof options.assertScope === "function" ? options.assertScope : () => {};
  const loadState = typeof options.loadState === "function" ? options.loadState : () => null;
  const saveState = typeof options.saveState === "function" ? options.saveState : () => {};
  const mutateState = typeof options.mutateState === "function"
    ? options.mutateState
    : (ventureId, mutate) => {
      const state = normalizeState(loadState(ventureId));
      const result = mutate(state);
      state.revision += 1;
      saveState(ventureId, state);
      return result;
    };
  const maxFrames = Number.isInteger(options.retentionFrames) && options.retentionFrames > 0
    ? options.retentionFrames
    : DEFAULT_RETAINED_FRAMES;
  const maxBytes = Number.isInteger(options.retentionBytes) && options.retentionBytes > 0
    ? options.retentionBytes
    : DEFAULT_RETAINED_BYTES;
  const maxCommands = Number.isInteger(options.commandReceipts) && options.commandReceipts > 0
    ? options.commandReceipts
    : DEFAULT_COMMAND_RECEIPTS;
  const listeners = new Map();
  const inflight = new Map();
  let nextListenerId = 0;

  function readState(ventureId) {
    return normalizeState(loadState(ventureId));
  }

  function handshake(input = {}) {
    assertSchema(input.schemaVersion);
    const scope = scopeFrom(input);
    // Scope is proved before retained frames are inspected, so a cursor from another venture can never
    // become an addressing side channel. A replayable cursor avoids rebuilding the projection at all.
    assertScope(scope.ventureId, scope);
    const state = readState(scope.ventureId);
    const requested = input.cursor == null ? null : Number(input.cursor);
    const resume = state.sequence > 0 && Number.isInteger(requested) && requested >= 0 && requested <= state.sequence
      ? replayAfter(state, requested)
      : null;
    const mode = resume == null ? "snapshot" : "resume";
    return {
      frame: "handshake",
      protocol: WORK_PROTOCOL_NAME,
      schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
      minSchemaVersion: WORK_PROTOCOL_MIN_SCHEMA_VERSION,
      serverInstanceId,
      ventureId: scope.ventureId,
      cursor: state.sequence,
      projectionRevision: state.projectionRevision,
      mode,
      ...(mode === "snapshot"
        ? { snapshot: coherentSnapshot(project(scope.ventureId, scope), state, scope.ventureId) }
        : {}),
      frames: mode === "resume" ? resume : [],
    };
  }

  function publish(input = {}) {
    const scope = scopeFrom(input);
    const projection = text(input.projection);
    const kind = text(input.kind);
    if (!["thread", "work", "bundle"].includes(projection) || !kind) {
      throw protocolError("A Work push needs a thread/work/bundle projection and kind.", "work_push_invalid");
    }
    const frame = mutateState(scope.ventureId, (state) => {
      state.sequence += 1;
      state.projectionRevision += 1;
      const next = {
        frame: "push",
        protocol: WORK_PROTOCOL_NAME,
        schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
        serverInstanceId,
        ventureId: scope.ventureId,
        ...(scope.threadId ? { threadId: scope.threadId } : {}),
        ...(scope.runId ? { runId: scope.runId } : {}),
        sequence: state.sequence,
        projection,
        projectionRevision: state.projectionRevision,
        kind,
        payload: clone(input.payload ?? null),
      };
      state.retained.push(next);
      trimRetained(state.retained, maxFrames, maxBytes);
      state.updatedAt = new Date().toISOString();
      return clone(next);
    });
    for (const subscription of listeners.values()) {
      if (subscription.ventureId !== scope.ventureId) continue;
      try { subscription.listener(frame); } catch { /* a broken renderer cannot break accepted Work */ }
    }
    return frame;
  }

  function subscribe(input, listener) {
    if (typeof listener !== "function") throw new TypeError("A Work subscription listener is required.");
    const opening = handshake(input);
    const id = ++nextListenerId;
    listeners.set(id, { ventureId: opening.ventureId, listener });
    const frames = opening.frames;
    const publicOpening = { ...opening };
    delete publicOpening.frames;
    try { listener(publicOpening); } catch { /* keep the stream available for a recovering listener */ }
    for (const frame of frames) {
      try { listener(frame); } catch { /* one bad replay callback does not corrupt the cursor */ }
    }
    return () => listeners.delete(id);
  }

  async function acceptCommand(input = {}, handler) {
    if (typeof handler !== "function") throw new TypeError("A Work command handler is required.");
    if (input.protocol !== WORK_PROTOCOL_NAME) {
      throw protocolError("Unknown Work command protocol.", "work_protocol_invalid");
    }
    assertSchema(input.schemaVersion);
    const scope = scopeFrom(input);
    assertScope(scope.ventureId, scope);
    const type = text(input.type);
    const idempotencyKey = text(input.idempotencyKey);
    if (!type || !idempotencyKey) {
      throw protocolError("A Work command needs type and idempotencyKey.", "work_command_invalid");
    }
    if (!Number.isInteger(input.expectedProjectionRevision) || input.expectedProjectionRevision < 0) {
      throw protocolError("A Work command needs expectedProjectionRevision.", "work_projection_revision_required");
    }
    const command = {
      protocol: WORK_PROTOCOL_NAME,
      schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
      type,
      idempotencyKey,
      ...scope,
      expectedProjectionRevision: input.expectedProjectionRevision,
      payload: clone(input.payload ?? null),
    };
    const digest = commandDigest(command);
    const inflightKey = `${scope.ventureId}\u0000${idempotencyKey}`;
    const active = inflight.get(inflightKey);
    if (active) {
      if (active.digest !== digest) {
        throw protocolError("That idempotency key names a different Work command.", "work_idempotency_conflict", 409);
      }
      return active.promise;
    }

    const run = (async () => {
      const prior = readState(scope.ventureId).commands.find((entry) => entry.idempotencyKey === idempotencyKey);
      if (prior) {
        if (prior.digest !== digest) {
          throw protocolError("That idempotency key names a different Work command.", "work_idempotency_conflict", 409);
        }
        if (prior.status === "completed") return clone(prior.result);
        if (prior.status === "failed") throw reviveStoredError(prior.error);
        throw protocolError("That Work command was accepted but its result is not yet known.", "work_command_in_doubt", 409);
      }
      const before = readState(scope.ventureId);
      if (before.projectionRevision !== command.expectedProjectionRevision) {
        throw protocolError("Work changed since this command was prepared.", "work_projection_stale", 409, {
          expectedProjectionRevision: command.expectedProjectionRevision,
          currentProjectionRevision: before.projectionRevision,
        });
      }
      mutateState(scope.ventureId, (state) => {
        state.commands.push({ idempotencyKey, digest, status: "accepted", command, acceptedAt: new Date().toISOString() });
        state.commands = state.commands.slice(-maxCommands);
      });
      try {
        const result = clone(await handler(command));
        mutateState(scope.ventureId, (state) => {
          const receipt = state.commands.find((entry) => entry.idempotencyKey === idempotencyKey);
          if (receipt) Object.assign(receipt, { status: "completed", result, completedAt: new Date().toISOString() });
        });
        return result;
      } catch (error) {
        const stored = safeStoredError(error);
        mutateState(scope.ventureId, (state) => {
          const receipt = state.commands.find((entry) => entry.idempotencyKey === idempotencyKey);
          if (receipt) Object.assign(receipt, { status: "failed", error: stored, completedAt: new Date().toISOString() });
        });
        throw error;
      }
    })();
    inflight.set(inflightKey, { digest, promise: run });
    try {
      return await run;
    } finally {
      inflight.delete(inflightKey);
    }
  }

  return Object.freeze({
    serverInstanceId,
    handshake,
    publish,
    subscribe,
    acceptCommand,
    currentState: (ventureId) => clone(readState(scopeFrom({ ventureId }).ventureId)),
  });
}
