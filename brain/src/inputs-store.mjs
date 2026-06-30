import crypto from "node:crypto";
import { persistence } from "./persistence.mjs";
import { safeId } from "./store-fs.mjs";

// The INPUTS layer — a durable, project-scoped, append-only log of live world signals entering the
// product from the outside: a commit, a signup, a reply, a star, a demo visit, a CSV row. This is the
// raw inbox of "something happened out there," captured before anyone decides what it means. It is NOT
// domain-events.mjs (that is the Product mode's interpretive event-sourcing log, projected into the
// ProductModel) — these two never cross. An Input is world truth waiting to be ROUTED into a run, a
// person, an experiment, or ignored; the routing decision is recorded on the record, never inferred.
//
// Append-only: a record is written once and only its routing status is ever mutated (markRouted). The
// log is never truncated, so the full history of what entered the product stays auditable.

const SCHEMA_VERSION = 1;
const COLLECTION = "inputs";

// The lifecycle of a captured signal. It lands 'unrouted' (nobody has decided what to do with it yet),
// then either 'routed' (folded into a run / person / experiment, with routedTo naming the target) or
// 'ignored' (deliberately set aside). Only these three are legal.
const INPUT_STATUSES = new Set(["unrouted", "routed", "ignored"]);

function now() {
  return new Date().toISOString();
}

function emptyStore(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, inputs: [] };
}

export function loadInputStore(projectId = "default", options = {}) {
  const stored = persistence(options).get(COLLECTION, safeId(projectId));
  if (!stored) return emptyStore(projectId);
  return {
    ...emptyStore(projectId),
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    inputs: Array.isArray(stored?.inputs) ? stored.inputs : [],
  };
}

export function saveInputStore(store, options = {}) {
  const durable = {
    ...store,
    schemaVersion: SCHEMA_VERSION,
    inputs: Array.isArray(store.inputs) ? store.inputs : [],
  };
  persistence(options).set(COLLECTION, safeId(durable.projectId), durable);
  return durable;
}

// Capture one world signal. kind (commit/signup/reply/star/demo-visit/csv-row/…) and source (where it
// came from) are required — an Input with no kind or no source is not a signal, it is noise. payload is
// the raw event body, provenance is how we know it (the connector, webhook, file, or import that
// carried it). The record lands 'unrouted'; routedTo stays null until a routing decision is made.
export function appendInput(projectId = "default", input = {}, options = {}) {
  const kind = String(input.kind || "").trim();
  if (!kind) throw new Error("An input kind is required.");
  const source = String(input.source || "").trim();
  if (!source) throw new Error("An input source is required.");
  const store = loadInputStore(projectId, options);
  const receivedAt = input.receivedAt || now();
  const durableInput = {
    id: input.id || `input-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    projectId,
    kind,
    source,
    payload: input.payload ?? {},
    provenance: input.provenance ?? null,
    receivedAt,
    status: "unrouted",
    routedTo: null,
  };
  // Append-only: the inbox of world signals is never truncated, so the full record of what entered the
  // product stays auditable. Compaction, if ever needed, is a deliberate prune, never a silent tail cap.
  saveInputStore({ ...store, inputs: [...store.inputs, durableInput] }, options);
  return durableInput;
}

// Every captured input for a project, optionally narrowed by kind, source, or status for the caller.
export function listInputs(projectId = "default", options = {}) {
  const inputs = loadInputStore(projectId, options).inputs;
  if (!options.kind && !options.source && !options.status) return inputs;
  return inputs.filter((entry) =>
    (!options.kind || entry.kind === options.kind)
    && (!options.source || entry.source === options.source)
    && (!options.status || entry.status === options.status)
  );
}

// The work queue: every signal still waiting for a routing decision. This is what a router reads to
// decide what each new world signal should feed.
export function listUnroutedInputs(projectId = "default", options = {}) {
  return listInputs(projectId, { ...options, status: "unrouted" });
}

// Record a routing decision on one captured input — the only mutation an Input ever takes. Routing it
// to a concrete target (a run, a person, an experiment) sets status 'routed' and stores routedTo;
// passing { ignored: true } (or status 'ignored') sets it aside with no target. The record is rewritten
// in place in the append-only log; its identity and capture facts never change.
export function markRouted(projectId = "default", inputId, routedTo = null, options = {}) {
  const store = loadInputStore(projectId, options);
  const index = store.inputs.findIndex((entry) => entry.id === inputId);
  if (index === -1) throw new Error(`Input not found: ${inputId}`);
  const ignored = options.ignored === true || routedTo === "ignored" || routedTo === false;
  const status = ignored ? "ignored" : "routed";
  if (!ignored && (routedTo == null || String(routedTo).trim() === "")) {
    throw new Error("Routing an input requires a routedTo target (or mark it ignored).");
  }
  if (!INPUT_STATUSES.has(status)) throw new Error(`Invalid input status: ${status}`);
  const updated = {
    ...store.inputs[index],
    status,
    routedTo: ignored ? null : routedTo,
  };
  const inputs = [...store.inputs];
  inputs[index] = updated;
  saveInputStore({ ...store, inputs }, options);
  return updated;
}
