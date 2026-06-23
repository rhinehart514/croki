import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCHEMA_VERSION = 1;

function now() {
  return new Date().toISOString();
}

function root(options = {}) {
  return options.root || process.env.GTM_IDE_HOME || path.join(os.homedir(), ".gtm-ide");
}

function safeId(value) {
  return String(value || "default").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "default";
}

function fileFor(projectId, options = {}) {
  return path.join(root(options), "domain-events", `${safeId(projectId)}.json`);
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function emptyStore(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, events: [] };
}

export function loadDomainEventStore(projectId = "default", options = {}) {
  const file = fileFor(projectId, options);
  if (!fs.existsSync(file)) return emptyStore(projectId);
  const stored = JSON.parse(fs.readFileSync(file, "utf8"));
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
  write(fileFor(durable.projectId, options), durable);
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
