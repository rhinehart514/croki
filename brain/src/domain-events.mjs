import crypto from "node:crypto";
import { persistence } from "./persistence.mjs";
import { now, safeId } from "./store-fs.mjs";

const SCHEMA_VERSION = 1;
const COLLECTION = "domain-events";

function emptyStore(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, events: [] };
}

export function loadDomainEventStore(projectId = "default", options = {}) {
  const stored = persistence(options).get(COLLECTION, safeId(projectId));
  if (!stored) return emptyStore(projectId);
  return {
    ...emptyStore(projectId),
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    events: Array.isArray(stored?.events) ? stored.events : [],
  };
}

export function saveDomainEventStore(store, options = {}) {
  const durable = {
    ...store,
    schemaVersion: SCHEMA_VERSION,
    events: Array.isArray(store.events) ? store.events : [],
  };
  persistence(options).set(COLLECTION, safeId(durable.projectId), durable);
  return durable;
}

export function appendDomainEvent(projectId = "default", event = {}, options = {}) {
  if (!event.type) throw new Error("Domain event type is required.");
  const store = loadDomainEventStore(projectId, options);
  const createdAt = now();
  const durableEvent = {
    id: event.id || `event-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    projectId,
    type: event.type,
    aggregateType: event.aggregateType ?? null,
    aggregateId: event.aggregateId ?? null,
    commandId: event.commandId ?? options.commandId ?? null,
    createdAt,
    data: event.data ?? {},
  };
  // The event log is the authoritative, complete history — current state is a projection of it
  // (see program-projection.mjs). It must not be truncated, or a rebuild would lose the early
  // creates and drift from the stored snapshot. Compaction, if ever needed, is a deliberate
  // snapshot-and-prune operation, never a silent tail cap.
  saveDomainEventStore({ ...store, events: [...store.events, durableEvent] }, options);
  return durableEvent;
}

export function listDomainEvents(projectId = "default", options = {}) {
  const events = loadDomainEventStore(projectId, options).events;
  if (!options.aggregateId && !options.type) return events;
  return events.filter((event) =>
    (!options.aggregateId || event.aggregateId === options.aggregateId)
    && (!options.type || event.type === options.type)
  );
}
