// Deterministic journey aggregation. This module keeps sequence identifiers in memory only and writes
// bounded aggregate observations plus their adoption receipt; it never promotes them into model v3.

import crypto from "node:crypto";

import {
  currentJourneyPages,
  deleteJourneyImport,
  journeyRouteToken,
  normalizeJourneyRoute,
  openJourneyImport,
} from "./journey-import.mjs";
import { listVentureDocs, setVentureDoc } from "./venture-store.mjs";

function fail(message, code, status = 400, details = {}) {
  throw Object.assign(new Error(message), { code, status, ...details });
}

function text(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function mappingInput(body) {
  return body?.mapping && typeof body.mapping === "object" ? body.mapping : body;
}

function canonicalKind(value) {
  if (["event-rows", "events"].includes(value)) return "event-rows";
  if (["aggregate-transitions", "transitions"].includes(value)) return "aggregate-transitions";
  fail("Choose event-rows or aggregate-transitions for this journey import.", "journey_mapping_kind_invalid");
}

function requireField(rows, field, label) {
  const name = text(field);
  if (!name) fail(`Journey mapping needs a ${label} field.`, "journey_mapping_field_required");
  if (!rows.some((row) => Object.hasOwn(row, name))) {
    fail(`Journey mapping field "${name}" does not exist in this file.`, "journey_mapping_field_missing");
  }
  return name;
}

function normalizePageRef(value) {
  const ref = text(value);
  if (!ref) return null;
  return ref.startsWith("object:") ? ref : `object:${ref}`;
}

function validateMapping(rows, body, pages) {
  const input = mappingInput(body);
  const inputKind = canonicalKind(input?.inputKind);
  const fields = input?.fields ?? {};
  const normalizedFields = inputKind === "event-rows" ? {
    sequenceKey: requireField(rows, fields.sequenceKey, "sequence key"),
    timestamp: requireField(rows, fields.timestamp, "timestamp"),
    route: requireField(rows, fields.route, "route"),
    ...(text(fields.eventName) ? { eventName: requireField(rows, fields.eventName, "event name") } : {}),
  } : {
    from: requireField(rows, fields.from, "from route"),
    to: requireField(rows, fields.to, "to route"),
    count: requireField(rows, fields.count, "count"),
  };
  const validPageRefs = new Set(pages.pages.map((page) => page.pageRef));
  const routeMappings = {};
  for (const [token, requestedRef] of Object.entries(input?.routeMappings ?? {})) {
    if (!/^route-[a-f0-9]{16}$/.test(token)) fail(`Invalid journey route token: ${token}`, "journey_mapping_route_token_invalid");
    const pageRef = normalizePageRef(requestedRef);
    if (!validPageRefs.has(pageRef)) {
      fail(`Journey mapping points to a page that is not in the current Product map: ${pageRef}`, "journey_mapping_page_missing", 409);
    }
    routeMappings[token] = pageRef;
  }
  return {
    inputKind,
    fields: normalizedFields,
    routeMappings,
    timezone: text(input?.timezone) ?? "UTC",
    sourceRef: text(input?.sourceRef) ?? null,
    window: input?.window ?? null,
  };
}

function routeResolver(pages, mapping) {
  const pageByRef = new Map(pages.pages.map((page) => [page.pageRef, page]));
  return (value) => {
    const route = normalizeJourneyRoute(value);
    if (!route) return { route: null, token: null, pageRef: null };
    const token = journeyRouteToken(route);
    const exact = pages.exact.get(route)?.pageRef ?? null;
    const mapped = exact ?? mapping.routeMappings[token] ?? null;
    return { route, token, pageRef: mapped && pageByRef.has(mapped) ? mapped : null };
  };
}

function increment(map, key, count = 1) {
  map.set(key, (map.get(key) ?? 0) + count);
}

function rejectionCollector() {
  const reasons = new Map();
  return {
    reject(reason) { increment(reasons, reason); },
    result() {
      return {
        count: [...reasons.values()].reduce((sum, count) => sum + count, 0),
        reasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => a.reason.localeCompare(b.reason)),
      };
    },
  };
}

function timestamp(value) {
  const raw = text(value);
  if (!raw) return null;
  const hasZone = /(?:z|[+-]\d\d(?::?\d\d)?)$/i.test(raw);
  const time = Date.parse(hasZone ? raw : `${raw}Z`);
  return Number.isFinite(time) ? time : null;
}

function isDropOff(value) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return !normalized || ["dropoff", "exit", "end", "null", "none"].includes(normalized);
}

function aggregateEventRows(rows, mapping, pages) {
  const resolve = routeResolver(pages, mapping);
  const rejected = rejectionCollector();
  const sequences = new Map();
  for (const row of rows) {
    const sequence = text(row[mapping.fields.sequenceKey]);
    const at = timestamp(row[mapping.fields.timestamp]);
    const resolved = resolve(row[mapping.fields.route]);
    if (!sequence) { rejected.reject("missing-sequence-key"); continue; }
    if (at == null) { rejected.reject("invalid-timestamp"); continue; }
    if (!resolved.route) { rejected.reject("invalid-route"); continue; }
    const events = sequences.get(sequence) ?? [];
    events.push({ at, ...resolved });
    sequences.set(sequence, events);
  }

  const pageCounts = new Map();
  const transitions = new Map();
  const dropOffs = new Map();
  const unmatchedRoutes = new Map();
  let from = Infinity;
  let to = -Infinity;
  for (const events of sequences.values()) {
    events.sort((left, right) => left.at - right.at || left.token.localeCompare(right.token));
    for (const event of events) {
      from = Math.min(from, event.at);
      to = Math.max(to, event.at);
      if (event.pageRef) increment(pageCounts, event.pageRef);
      else increment(unmatchedRoutes, event.token);
    }
    for (let index = 1; index < events.length; index += 1) {
      const prior = events[index - 1];
      const current = events[index];
      if (prior.pageRef && current.pageRef && prior.pageRef !== current.pageRef) {
        increment(transitions, `${prior.pageRef}\u0000${current.pageRef}`);
      }
    }
    const last = events.at(-1);
    if (last?.pageRef) increment(dropOffs, last.pageRef);
  }
  if (!Number.isFinite(from)) fail("No valid event rows remain after applying this mapping.", "journey_preview_empty", 422);
  return {
    pageCounts, transitions, dropOffs, unmatchedRoutes,
    window: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), timezone: mapping.timezone },
    rejectedRows: rejected.result(),
  };
}

function aggregateTransitionRows(rows, mapping, pages) {
  const resolve = routeResolver(pages, mapping);
  const rejected = rejectionCollector();
  const pageCounts = new Map();
  const transitions = new Map();
  const dropOffs = new Map();
  const unmatchedRoutes = new Map();
  for (const row of rows) {
    const count = Number(row[mapping.fields.count]);
    const from = resolve(row[mapping.fields.from]);
    const drops = isDropOff(row[mapping.fields.to]);
    const to = drops ? null : resolve(row[mapping.fields.to]);
    if (!from.route) { rejected.reject("invalid-from-route"); continue; }
    if (!Number.isSafeInteger(count) || count <= 0) { rejected.reject("invalid-count"); continue; }
    if (!drops && !to?.route) { rejected.reject("invalid-to-route"); continue; }
    if (from.pageRef) increment(pageCounts, from.pageRef, count);
    else increment(unmatchedRoutes, from.token, count);
    if (drops) {
      if (from.pageRef) increment(dropOffs, from.pageRef, count);
      continue;
    }
    if (!to.pageRef) increment(unmatchedRoutes, to.token, count);
    if (from.pageRef && to.pageRef && from.pageRef !== to.pageRef) {
      increment(transitions, `${from.pageRef}\u0000${to.pageRef}`, count);
    }
  }
  const from = timestamp(mapping.window?.from);
  const to = timestamp(mapping.window?.to);
  if (from == null || to == null || from > to) {
    fail("Aggregate transition evidence needs a valid source window with from and to timestamps.", "journey_mapping_window_required");
  }
  if (![...pageCounts.values(), ...unmatchedRoutes.values()].length) {
    fail("No valid transition rows remain after applying this mapping.", "journey_preview_empty", 422);
  }
  return {
    pageCounts, transitions, dropOffs, unmatchedRoutes,
    window: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), timezone: mapping.timezone },
    rejectedRows: rejected.result(),
  };
}

function records(aggregate) {
  return {
    window: aggregate.window,
    pageCounts: [...aggregate.pageCounts].map(([pageRef, count]) => ({ pageRef, count })).sort((a, b) => a.pageRef.localeCompare(b.pageRef)),
    transitions: [...aggregate.transitions].map(([key, count]) => {
      const [fromPageRef, toPageRef] = key.split("\u0000");
      return { fromPageRef, toPageRef, count };
    }).sort((a, b) => `${a.fromPageRef}:${a.toPageRef}`.localeCompare(`${b.fromPageRef}:${b.toPageRef}`)),
    dropOffs: [...aggregate.dropOffs].map(([pageRef, count]) => ({ pageRef, count })).sort((a, b) => a.pageRef.localeCompare(b.pageRef)),
    // Unmatched paths stay opaque even in local durable records. Route tokens can be reviewed and
    // explicitly mapped without persisting a user/session identifier embedded in a URL.
    unmatchedRoutes: [...aggregate.unmatchedRoutes].map(([route, count]) => ({ route, count })).sort((a, b) => a.route.localeCompare(b.route)),
    rejectedRows: aggregate.rejectedRows,
  };
}

export function previewJourneyImport(ventureId, importRef, body, options = {}) {
  const { staged, rows } = openJourneyImport(ventureId, importRef, options);
  const pages = currentJourneyPages(ventureId, options);
  const mapping = validateMapping(rows, body, pages);
  const result = mapping.inputKind === "event-rows"
    ? aggregateEventRows(rows, mapping, pages)
    : aggregateTransitionRows(rows, mapping, pages);
  return {
    importRef,
    inputKind: mapping.inputKind,
    pageModelRevision: pages.revision,
    source: { name: staged.name, mediaType: staged.mediaType, byteSize: staged.byteSize, digest: staged.digest },
    mapping,
    ...records(result),
  };
}

function stableDigest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function adoptJourneyImport(ventureId, importRef, body, options = {}) {
  const expected = body?.expectedPageModelRevision;
  const current = currentJourneyPages(ventureId, options);
  if (!Number.isInteger(expected) || expected !== current.revision) {
    fail(
      `The Product map changed before this journey mapping was adopted (expected ${expected}, current ${current.revision}). Refresh the preview.`,
      "journey_page_model_stale",
      409,
      { expectedPageModelRevision: expected, currentPageModelRevision: current.revision },
    );
  }
  const preview = previewJourneyImport(ventureId, importRef, body, options);
  // Re-check after parsing/aggregation so a concurrent Product-map write cannot be silently adopted.
  const after = currentJourneyPages(ventureId, options);
  if (after.revision !== expected) {
    fail("The Product map changed while this journey mapping was being checked. Refresh the preview.", "journey_page_model_stale", 409);
  }
  const { staged } = openJourneyImport(ventureId, importRef, options);
  const adoptedAt = new Date().toISOString();
  const sourceRef = text(body?.sourceRef) ?? preview.mapping.sourceRef ?? importRef;
  const identity = stableDigest({ ventureId, importRef, mapping: preview.mapping, expected, sourceRef });
  const receiptRef = `journey-receipt-${identity.slice(0, 32)}`;
  const snapshot = {
    id: `journey-observation-${identity.slice(0, 32)}`,
    ventureId,
    receiptRef,
    sourceRef,
    window: preview.window,
    pageCounts: preview.pageCounts,
    transitions: preview.transitions,
    dropOffs: preview.dropOffs,
    unmatchedRoutes: preview.unmatchedRoutes,
    createdAt: adoptedAt,
  };
  const receipt = {
    id: receiptRef,
    ventureId,
    importRef,
    file: { digest: staged.digest, name: staged.name, mediaType: staged.mediaType, byteSize: staged.byteSize },
    inputKind: preview.inputKind,
    rowCount: staged.profile.rowCount,
    rejectedRows: preview.rejectedRows,
    fieldMapping: preview.mapping.fields,
    routeToPageMapping: preview.mapping.routeMappings,
    sourceRef,
    sourceWindow: preview.window,
    threadRef: text(body?.threadRef),
    messageRef: text(body?.messageRef),
    pageModelRevision: expected,
    importedBy: { authority: "founder", id: "founder" },
    adoptedAt,
  };
  setVentureDoc(ventureId, "journeyReceipts", receipt.id, receipt, options);
  setVentureDoc(ventureId, "journeyObservations", snapshot.id, snapshot, options);
  deleteJourneyImport(ventureId, importRef, options);
  return { snapshot: structuredClone(snapshot), receipt: structuredClone(receipt) };
}

export function listJourneyObservations(ventureId, options = {}) {
  const observations = listVentureDocs(ventureId, "journeyObservations", options)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  const receipts = listVentureDocs(ventureId, "journeyReceipts", options)
    .sort((left, right) => String(right.adoptedAt).localeCompare(String(left.adoptedAt)));
  return { observations, receipts };
}
