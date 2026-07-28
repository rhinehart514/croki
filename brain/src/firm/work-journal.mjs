// Durable append-only Work continuity journal. The canonical Product/Canvas store remains separate
// and authoritative. This journal records only exact Project/Thread/Run/Review continuity and keeps
// large artifacts in their existing addressable stores.

import crypto from "node:crypto";
import path from "node:path";

import { PersistenceConflictError, storeRoot } from "../persistence.mjs";
import { openVenture, safeId, venturePersistence } from "./venture-store.mjs";
import {
  projectWorkJournal,
  WORK_JOURNAL_EVENT_KINDS,
  WORK_JOURNAL_PROJECTION_SCHEMA_VERSION,
} from "./work-journal-projection.mjs";

export const WORK_JOURNAL_SCHEMA_VERSION = 1;
export const WORK_JOURNAL_MIN_SCHEMA_VERSION = 1;
export { WORK_JOURNAL_EVENT_KINDS, WORK_JOURNAL_PROJECTION_SCHEMA_VERSION };

const JOURNAL_COLLECTION = "workJournal";
const JOURNAL_KEY = "events";
const PROJECTION_COLLECTION = "workJournalProjections";
const PROJECTION_KEY = "current";
const MAX_EVENT_BYTES = 64 * 1024;
const MAX_FORMING_REPLY_BYTES = 16 * 1024;
const EMPTY_HASH = "0".repeat(64);
const KINDS = new Set(WORK_JOURNAL_EVENT_KINDS);
const FORBIDDEN_ACTIVITY_KEYS = new Set([
  "chainOfThought",
  "chain_of_thought",
  "hiddenReasoning",
  "hidden_reasoning",
  "rawModelOutput",
  "rawProviderPayload",
  "reasoning",
]);
const FACTUAL_ACTIVITY_KEYS = new Set([
  "activityId",
  "label",
  "tone",
  "durationMs",
  "sourceRefs",
  "usage",
]);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function text(value) {
  return String(value ?? "").trim() || null;
}

function fail(message, code = "work_journal_invalid", status = 400, detail = {}) {
  throw Object.assign(new Error(message), { code, status, ...detail });
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function withoutHash(event) {
  const copy = { ...event };
  delete copy.hash;
  return copy;
}

function eventHash(event) {
  return digest(withoutHash(event));
}

function recovery(code, ventureId, options, detail = {}) {
  return {
    code,
    message: detail.message,
    journalPath: path.join(storeRoot(options), "ventures", safeId(ventureId), JOURNAL_COLLECTION, `${JOURNAL_KEY}.json`),
    steps: [
      "Copy the journal file before changing it.",
      "Export diagnostics and preserve the last known-good journal head.",
      code === "work_journal_schema_incompatible"
        ? "Open this venture with a Croki version that supports the recorded schema, then export it."
        : "Restore the journal from a known-good copy or use the rebuild tool after repairing the final invalid record.",
    ],
    ...detail,
  };
}

function assertVenture(ventureId, options) {
  const id = text(ventureId);
  if (!id || safeId(id) === "default" || !openVenture(id, options)) {
    fail(`No such venture: ${id ?? "(missing)"}`, "venture_not_found", 404);
  }
  return id;
}

function assertScope(ventureId, input) {
  if (input.ventureId != null && text(input.ventureId) !== ventureId) {
    fail("A Work journal event cannot cross ventures.", "work_journal_scope_mismatch", 403, {
      expectedVentureId: ventureId,
      receivedVentureId: text(input.ventureId),
    });
  }
}

function forbiddenKey(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_ACTIVITY_KEYS.has(key)) return key;
    const found = forbiddenKey(nested, seen);
    if (found) return found;
  }
  return null;
}

function assertInput(input) {
  const kind = text(input.kind);
  const eventId = text(input.eventId);
  if (!eventId || !kind || !KINDS.has(kind)) {
    fail("A Work journal event needs a stable eventId and supported kind.");
  }
  if (!text(input.threadId) || !text(input.runId)) {
    fail(`${kind} needs exact threadId and runId scope.`);
  }
  if (kind === "founder-turn-accepted" && !text(input.payload?.messageId)) {
    fail("A founder turn needs payload.messageId.");
  }
  const hidden = forbiddenKey(input.payload);
  if (hidden) fail(`Work continuity cannot persist hidden model material (${hidden}).`, "work_journal_hidden_reasoning");
  if (kind === "factual-activity-recorded") {
    const unknown = Object.keys(input.payload ?? {}).find((key) => !FACTUAL_ACTIVITY_KEYS.has(key));
    if (unknown) {
      fail(`Factual activity has an unshaped field (${unknown}).`, "work_journal_activity_unshaped");
    }
    if (!text(input.payload?.label)) fail("Factual activity needs a readable label.");
  }
  const serialized = Buffer.byteLength(JSON.stringify(input.payload ?? null));
  if (kind === "forming-reply-checkpointed" && serialized > MAX_FORMING_REPLY_BYTES) {
    fail("A forming reply checkpoint exceeds its bounded recovery allowance; store it by reference.", "work_journal_blob_too_large", 413);
  }
  if (serialized > MAX_EVENT_BYTES) {
    fail("A Work journal event is too large; store the artifact outside the hot journal and record its reference.", "work_journal_blob_too_large", 413);
  }
}

function validateCurrent(document, ventureId) {
  if (!document || typeof document !== "object" || !Array.isArray(document.events)) {
    fail("The Work journal container is malformed.", "work_journal_corrupt", 409);
  }
  if (document.schemaVersion !== WORK_JOURNAL_SCHEMA_VERSION) {
    fail(
      `Work journal schema ${document.schemaVersion} is incompatible with ${WORK_JOURNAL_MIN_SCHEMA_VERSION}-${WORK_JOURNAL_SCHEMA_VERSION}.`,
      "work_journal_schema_incompatible",
      409,
      { schemaVersion: document.schemaVersion },
    );
  }
  if (document.ventureId !== ventureId) fail("The Work journal belongs to another venture.", "work_journal_scope_mismatch", 403);
  if (!Number.isInteger(document.revision) || document.revision < 0) fail("The Work journal revision is invalid.", "work_journal_corrupt", 409);
  let previousHash = EMPTY_HASH;
  const ids = new Set();
  for (let index = 0; index < document.events.length; index += 1) {
    const event = document.events[index];
    if (
      event?.schemaVersion !== WORK_JOURNAL_SCHEMA_VERSION
      || event.ventureId !== ventureId
      || event.sequence !== index + 1
      || !text(event.eventId)
      || !text(event.occurredAt)
      || !KINDS.has(event.kind)
      || event.previousHash !== previousHash
      || event.hash !== eventHash(event)
      || ids.has(event.eventId)
    ) {
      fail(`The Work journal hash chain is invalid at sequence ${index + 1}.`, "work_journal_corrupt", 409, {
        sequence: index + 1,
      });
    }
    assertInput(event);
    ids.add(event.eventId);
    previousHash = event.hash;
  }
  if (document.lastSequence !== document.events.length || document.headHash !== previousHash) {
    fail("The Work journal head does not match its event chain.", "work_journal_corrupt", 409);
  }
  try {
    projectWorkJournal(document.events, { ventureId, journalHeadHash: document.headHash });
  } catch (error) {
    fail(`The Work journal cannot rebuild its projections: ${error.message}`, "work_journal_corrupt", 409, {
      eventId: error.eventId ?? null,
    });
  }
  return document;
}

function blank(ventureId) {
  return {
    schemaVersion: WORK_JOURNAL_SCHEMA_VERSION,
    revision: 0,
    ventureId,
    lastSequence: 0,
    headHash: EMPTY_HASH,
    events: [],
  };
}

function journalState(ventureId, options) {
  const provider = venturePersistence(options, ventureId);
  let document;
  try {
    document = provider.get(JOURNAL_COLLECTION, JOURNAL_KEY);
  } catch (error) {
    return {
      mode: "read-only",
      diagnostic: recovery("work_journal_corrupt", ventureId, options, {
        message: `The Work journal cannot be parsed: ${error.message}`,
      }),
    };
  }
  if (!document) return { mode: "writable", document: blank(ventureId) };
  if (document.schemaVersion === 0) return {
    mode: "migration-required",
    document,
    diagnostic: recovery("work_journal_migration_required", ventureId, options, {
      message: "This Work journal needs the supported schema-0 to schema-1 migration.",
    }),
  };
  if (document.schemaVersion !== WORK_JOURNAL_SCHEMA_VERSION) {
    return {
      mode: "read-only",
      diagnostic: recovery("work_journal_schema_incompatible", ventureId, options, {
        message: `Journal schema ${document.schemaVersion} is not supported by this Croki build.`,
        schemaVersion: document.schemaVersion,
        supported: [WORK_JOURNAL_MIN_SCHEMA_VERSION, WORK_JOURNAL_SCHEMA_VERSION],
      }),
    };
  }
  try {
    return { mode: "writable", document: validateCurrent(document, ventureId) };
  } catch (error) {
    return {
      mode: "read-only",
      diagnostic: recovery(error.code ?? "work_journal_corrupt", ventureId, options, {
        message: error.message,
        sequence: error.sequence ?? null,
      }),
    };
  }
}

function readOnlyError(state) {
  return fail(
    `${state.diagnostic.message} The journal is open read-only.`,
    state.diagnostic.code,
    409,
    { diagnostic: clone(state.diagnostic) },
  );
}

function migrateV0(ventureId, options) {
  const provider = venturePersistence(options, ventureId);
  const state = journalState(ventureId, options);
  if (state.mode === "writable") return clone(state.document);
  if (state.mode !== "migration-required") return readOnlyError(state);
  const source = state.document;
  if (!Number.isInteger(source.revision) || source.revision < 0 || !Array.isArray(source.events)) {
    fail("The legacy Work journal cannot be migrated safely.", "work_journal_corrupt", 409);
  }
  let previousHash = EMPTY_HASH;
  const events = source.events.map((legacy, index) => {
    const input = {
      eventId: legacy.eventId,
      ventureId,
      threadId: legacy.threadId,
      runId: legacy.runId,
      reviewId: legacy.reviewId,
      kind: legacy.kind,
      occurredAt: legacy.occurredAt,
      payload: clone(legacy.payload ?? null),
    };
    assertInput(input);
    const event = {
      schemaVersion: WORK_JOURNAL_SCHEMA_VERSION,
      eventId: input.eventId,
      ventureId,
      sequence: index + 1,
      kind: input.kind,
      occurredAt: text(input.occurredAt),
      threadId: text(input.threadId),
      runId: text(input.runId),
      ...(text(input.reviewId) ? { reviewId: text(input.reviewId) } : {}),
      payload: input.payload,
      previousHash,
    };
    event.hash = eventHash(event);
    previousHash = event.hash;
    return event;
  });
  const migrated = {
    schemaVersion: WORK_JOURNAL_SCHEMA_VERSION,
    revision: source.revision + 1,
    ventureId,
    lastSequence: events.length,
    headHash: previousHash,
    events,
  };
  projectWorkJournal(migrated.events, { ventureId, journalHeadHash: migrated.headHash });
  provider.compareAndSet(JOURNAL_COLLECTION, JOURNAL_KEY, source.revision, migrated);
  return clone(migrated);
}

function buildEnvelope(ventureId, document, input, occurredAt) {
  input = input ?? {};
  assertScope(ventureId, input);
  assertInput(input);
  const event = {
    schemaVersion: WORK_JOURNAL_SCHEMA_VERSION,
    eventId: text(input.eventId),
    ventureId,
    sequence: document.lastSequence + 1,
    kind: text(input.kind),
    occurredAt,
    threadId: text(input.threadId),
    runId: text(input.runId),
    ...(text(input.reviewId) ? { reviewId: text(input.reviewId) } : {}),
    payload: clone(input.payload ?? null),
    previousHash: document.headHash,
  };
  event.hash = eventHash(event);
  return event;
}

export function createWorkJournal(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();

  function inspect(ventureId) {
    const exact = assertVenture(ventureId, options);
    const state = journalState(exact, options);
    return state.mode === "writable"
      ? {
        mode: state.mode,
        schemaVersion: state.document.schemaVersion,
        revision: state.document.revision,
        lastSequence: state.document.lastSequence,
        headHash: state.document.headHash,
      }
      : { mode: state.mode, diagnostic: clone(state.diagnostic) };
  }

  function events(ventureId, { afterSequence = 0 } = {}) {
    const exact = assertVenture(ventureId, options);
    const state = journalState(exact, options);
    if (state.mode !== "writable") return readOnlyError(state);
    if (!Number.isInteger(afterSequence) || afterSequence < 0) fail("afterSequence must be a non-negative integer.");
    return clone(state.document.events.filter((event) => event.sequence > afterSequence));
  }

  function append(ventureId, input, { expectedRevision = null } = {}) {
    const exact = assertVenture(ventureId, options);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      let state = journalState(exact, options);
      if (state.mode === "migration-required") {
        migrateV0(exact, options);
        state = journalState(exact, options);
      }
      if (state.mode !== "writable") return readOnlyError(state);
      const current = state.document;
      const duplicate = current.events.find((event) => event.eventId === text(input.eventId));
      if (duplicate) {
        const candidate = buildEnvelope(exact, {
          ...current,
          lastSequence: duplicate.sequence - 1,
          headHash: duplicate.previousHash,
        }, input, duplicate.occurredAt);
        if (candidate.hash !== duplicate.hash) {
          fail("That eventId names different Work journal content.", "work_journal_event_conflict", 409);
        }
        return { event: clone(duplicate), revision: current.revision, duplicate: true };
      }
      if (expectedRevision != null && expectedRevision !== current.revision) {
        fail("The Work journal changed before this append.", "work_journal_revision_conflict", 409, {
          expectedRevision,
          actualRevision: current.revision,
        });
      }
      const event = buildEnvelope(exact, current, input, text(input.occurredAt) ?? now());
      const next = {
        ...current,
        revision: current.revision + 1,
        lastSequence: event.sequence,
        headHash: event.hash,
        events: [...current.events, event],
      };
      // The event becomes durable only if the exact journal can rebuild. This prevents a hash-valid
      // but semantically incomplete event from poisoning every later projection.
      projectWorkJournal(next.events, { ventureId: exact, journalHeadHash: next.headHash });
      try {
        venturePersistence(options, exact).compareAndSet(
          JOURNAL_COLLECTION,
          JOURNAL_KEY,
          current.revision,
          next,
        );
        return { event: clone(event), revision: next.revision, duplicate: false };
      } catch (error) {
        if (!(error instanceof PersistenceConflictError) || expectedRevision != null) throw error;
      }
    }
    fail("The Work journal remained busy; retry the append.", "work_journal_busy", 409);
  }

  function rebuildProjections(ventureId) {
    const exact = assertVenture(ventureId, options);
    const state = journalState(exact, options);
    if (state.mode !== "writable") return readOnlyError(state);
    const projection = projectWorkJournal(state.document.events, {
      ventureId: exact,
      journalHeadHash: state.document.headHash,
    });
    venturePersistence(options, exact).set(PROJECTION_COLLECTION, PROJECTION_KEY, projection);
    return clone(projection);
  }

  function readProjections(ventureId) {
    const exact = assertVenture(ventureId, options);
    const state = journalState(exact, options);
    if (state.mode !== "writable") return readOnlyError(state);
    const stored = venturePersistence(options, exact).get(PROJECTION_COLLECTION, PROJECTION_KEY);
    if (
      stored?.schemaVersion === WORK_JOURNAL_PROJECTION_SCHEMA_VERSION
      && stored.ventureId === exact
      && stored.throughSequence === state.document.lastSequence
      && stored.journalHeadHash === state.document.headHash
    ) return clone(stored);
    return rebuildProjections(exact);
  }

  function deleteProjections(ventureId) {
    const exact = assertVenture(ventureId, options);
    return venturePersistence(options, exact).delete(PROJECTION_COLLECTION, PROJECTION_KEY);
  }

  function exportDiagnostics(ventureId) {
    const exact = assertVenture(ventureId, options);
    const state = journalState(exact, options);
    const projection = (() => {
      try { return venturePersistence(options, exact).get(PROJECTION_COLLECTION, PROJECTION_KEY); } catch { return null; }
    })();
    return {
      exportedAt: now(),
      ventureId: exact,
      mode: state.mode,
      journal: state.mode === "writable"
        ? {
          schemaVersion: state.document.schemaVersion,
          revision: state.document.revision,
          lastSequence: state.document.lastSequence,
          headHash: state.document.headHash,
        }
        : clone(state.diagnostic),
      projection: projection
        ? {
          schemaVersion: projection.schemaVersion,
          throughSequence: projection.throughSequence,
          journalHeadHash: projection.journalHeadHash,
        }
        : null,
    };
  }

  return Object.freeze({
    inspect,
    events,
    append,
    migrate: (ventureId) => migrateV0(assertVenture(ventureId, options), options),
    rebuildProjections,
    readProjections,
    deleteProjections,
    exportDiagnostics,
  });
}
