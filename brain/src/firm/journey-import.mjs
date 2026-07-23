// Provider-neutral journey files are staged only long enough to derive a founder-reviewed aggregate.
// Raw rows stay in a venture-local 0600 file and never enter conversation or durable observation truth.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { csvParse } from "d3-dsv";

import { storeRoot } from "../persistence.mjs";
import {
  getVentureDoc,
  listVentures,
  listVentureDocs,
  openVenture,
  safeId,
  setVentureDoc,
  venturePersistence,
} from "./venture-store.mjs";
import { getSemanticModel } from "./semantic-model-store.mjs";

export const JOURNEY_IMPORT_LIMIT_BYTES = 12 * 1024 * 1024;
export const JOURNEY_IMPORT_TTL_MS = 24 * 60 * 60 * 1000;

const EXTENSIONS = new Set([".json", ".jsonl", ".csv"]);
const SENSITIVE_FIELD = /(?:^|[_-])(user|session|email|name|ip|phone|address|cookie|device|account|visitor)(?:$|[_-])/i;

function fail(message, code, status = 400, details = {}) {
  throw Object.assign(new Error(message), { code, status, ...details });
}

function stagingRoot(ventureId, options = {}) {
  return path.join(storeRoot(options), "ventures", safeId(ventureId), "journey-imports", "staged");
}

function cleanName(value) {
  return path.basename(String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "")).trim().slice(0, 180);
}

function extensionFor(name, mediaType) {
  const extension = path.extname(name).toLowerCase();
  if (EXTENSIONS.has(extension)) return extension;
  const byType = {
    "application/json": ".json",
    "application/x-ndjson": ".jsonl",
    "application/jsonl": ".jsonl",
    "text/csv": ".csv",
  }[String(mediaType ?? "").split(";")[0].trim().toLowerCase()];
  if (byType) return byType;
  fail("Journey evidence must be a JSON, JSONL, or CSV file.", "journey_import_type_unsupported", 415);
}

function decodeInput(input) {
  if (typeof input?.content === "string") return Buffer.from(input.content, "utf8");
  const encoded = String(input?.data ?? "").replace(/\s/g, "");
  if (encoded.length > Math.ceil(JOURNEY_IMPORT_LIMIT_BYTES / 3) * 4 + 4) {
    fail("Journey evidence must be 12 MiB or smaller.", "journey_import_too_large", 413);
  }
  if (!encoded || encoded.length % 4 !== 0 || !/^[a-z0-9+/]*={0,2}$/i.test(encoded) || /=/.test(encoded.slice(0, -2))) {
    fail("Journey evidence is not valid base64 file data.", "journey_import_data_invalid");
  }
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
    fail("Journey evidence is not valid base64 file data.", "journey_import_data_invalid");
  }
  return buffer;
}

function utf8(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    fail("Journey evidence must be valid UTF-8.", "journey_import_utf8_invalid", 422);
  }
}

function objectRows(value) {
  const rows = Array.isArray(value) ? value
    : Array.isArray(value?.events) ? value.events
      : Array.isArray(value?.transitions) ? value.transitions
        : null;
  if (!rows) fail("JSON journey evidence must be a list, or contain an events or transitions list.", "journey_import_shape_invalid", 422);
  return rows;
}

export function parseJourneyRows(buffer, extension) {
  const text = utf8(buffer);
  let rows;
  try {
    if (extension === ".csv") rows = csvParse(text);
    else if (extension === ".json") rows = objectRows(JSON.parse(text));
    else {
      rows = text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
    }
  } catch (error) {
    if (error?.code?.startsWith("journey_")) throw error;
    fail(`Journey evidence is not valid ${extension.slice(1).toUpperCase()}.`, "journey_import_parse_invalid", 422);
  }
  if (!rows.length) fail("Journey evidence contains no rows.", "journey_import_empty", 422);
  if (rows.some((row) => !row || Array.isArray(row) || typeof row !== "object")) {
    fail("Every journey row must be an object.", "journey_import_row_invalid", 422);
  }
  return rows;
}

export function normalizeJourneyRoute(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let pathname;
  try {
    pathname = new URL(raw, "http://croki.local").pathname;
  } catch {
    return null;
  }
  if (!pathname.startsWith("/")) return null;
  try { pathname = decodeURI(pathname); } catch { /* Keep the encoded path when decoding is unsafe. */ }
  pathname = pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  return pathname;
}

export function journeyRouteToken(route) {
  return `route-${crypto.createHash("sha256").update(String(route)).digest("hex").slice(0, 16)}`;
}

function routeShape(route) {
  if (route === "/") return "/";
  return `/${route.split("/").filter(Boolean).map(() => ":value").join("/")}`;
}

function pageRouteIndex(ventureId, options) {
  const model = getSemanticModel(ventureId, options);
  const pages = model.objects.filter((object) => object.type === "page" && object.properties?.page?.route)
    .map((object) => ({
      pageRef: `object:${object.id}`,
      name: object.name,
      route: normalizeJourneyRoute(object.properties.page.route),
    }));
  return {
    revision: model.revision,
    pages,
    exact: new Map(pages.map((page) => [page.route, page])),
  };
}

function inferField(columns, candidates) {
  const lowered = new Map(columns.map((column) => [column.toLowerCase().replace(/[^a-z0-9]/g, ""), column]));
  for (const candidate of candidates) {
    const found = lowered.get(candidate.replace(/[^a-z0-9]/g, ""));
    if (found) return found;
  }
  return null;
}

function inferredMapping(columns) {
  const event = {
    sequenceKey: inferField(columns, ["session_id", "session", "user_id", "visitor_id", "sequence"]),
    timestamp: inferField(columns, ["timestamp", "time", "occurred_at", "created_at"]),
    route: inferField(columns, ["route", "path", "pathname", "page", "url"]),
    eventName: inferField(columns, ["event", "event_name", "name", "type"]),
  };
  const aggregate = {
    from: inferField(columns, ["from", "from_route", "source", "source_route"]),
    to: inferField(columns, ["to", "to_route", "destination", "destination_route"]),
    count: inferField(columns, ["count", "total", "volume"]),
  };
  const inputKind = aggregate.from && aggregate.to && aggregate.count ? "aggregate-transitions"
    : event.sequenceKey && event.timestamp && event.route ? "event-rows" : null;
  return { inputKind, fields: inputKind === "aggregate-transitions" ? aggregate : event };
}

function routeProfile(rows, inferred, pageIndex) {
  const fieldNames = inferred.inputKind === "aggregate-transitions"
    ? [inferred.fields.from, inferred.fields.to]
    : [inferred.fields.route];
  const counts = new Map();
  for (const row of rows) {
    for (const field of fieldNames.filter(Boolean)) {
      const route = normalizeJourneyRoute(row[field]);
      if (route) counts.set(route, (counts.get(route) ?? 0) + 1);
    }
  }
  return [...counts].map(([route, count]) => {
    const exact = pageIndex.exact.get(route);
    return {
      token: journeyRouteToken(route),
      count,
      ...(exact
        ? { match: { pageRef: exact.pageRef, pageName: exact.name, basis: "exact-route" } }
        : { shape: routeShape(route), match: null }),
    };
  }).sort((left, right) => right.count - left.count || left.token.localeCompare(right.token));
}

function sanitizedProfile(ventureId, importRef, rows, extension, options) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
  const inferred = inferredMapping(columns);
  const pages = pageRouteIndex(ventureId, options);
  return {
    importRef,
    valid: true,
    format: extension.slice(1),
    rowCount: rows.length,
    columns: columns.map((name) => ({ name, sensitive: SENSITIVE_FIELD.test(name) })),
    inferredMapping: inferred,
    routes: routeProfile(rows, inferred, pages),
    pageModelRevision: pages.revision,
    pageCandidates: pages.pages.map(({ pageRef, name, route }) => ({ pageRef, name, route })),
    issues: [],
  };
}

export function stageJourneyImport(ventureId, input, options = {}) {
  if (!openVenture(ventureId, options)) fail(`No such venture: ${ventureId}`, "venture_not_found", 404);
  const name = cleanName(input?.name);
  if (!name) fail("Journey evidence needs a file name.", "journey_import_name_required");
  const extension = extensionFor(name, input?.mediaType);
  const buffer = decodeInput(input);
  if (buffer.length > JOURNEY_IMPORT_LIMIT_BYTES) {
    fail("Journey evidence must be 12 MiB or smaller.", "journey_import_too_large", 413);
  }
  const digest = crypto.createHash("sha256").update(buffer).digest("hex");
  const importRef = `journey-import-${digest.slice(0, 32)}`;
  const mediaType = String(input?.mediaType ?? "").trim() || ({ ".json": "application/json", ".jsonl": "application/x-ndjson", ".csv": "text/csv" }[extension]);
  const root = stagingRoot(ventureId, options);
  const file = path.join(root, `${digest}${extension}`);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  fs.chmodSync(root, 0o700);
  try { fs.writeFileSync(file, buffer, { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error?.code !== "EEXIST") throw error; }
  fs.chmodSync(file, 0o600);

  let profile;
  try {
    profile = sanitizedProfile(ventureId, importRef, parseJourneyRows(buffer, extension), extension, options);
  } catch (error) {
    profile = {
      importRef, valid: false, format: extension.slice(1), rowCount: 0, columns: [],
      inferredMapping: { inputKind: null, fields: {} }, routes: [],
      pageModelRevision: getSemanticModel(ventureId, options).revision,
      pageCandidates: [], issues: [{ code: error?.code ?? "journey_import_invalid", message: error instanceof Error ? error.message : String(error) }],
    };
  }
  profile = { ...profile, name, mediaType, byteSize: buffer.length, digest };
  const createdAt = new Date().toISOString();
  setVentureDoc(ventureId, "journeyImports", importRef, {
    id: importRef,
    ventureId,
    digest,
    name,
    mediaType,
    byteSize: buffer.length,
    extension,
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + JOURNEY_IMPORT_TTL_MS).toISOString(),
    profile,
  }, options);
  return structuredClone(profile);
}

// The only dialogue/provider-facing resolver. It returns the already-sanitized aggregate profile and
// portable attachment metadata, never the staged path, file bytes, rows, or route values.
export function journeyImportProfile(ventureId, importRef, options = {}) {
  const staged = getVentureDoc(ventureId, "journeyImports", importRef, options);
  if (!staged) fail(`No such staged journey import: ${importRef}`, "journey_import_not_found", 404);
  return structuredClone(staged.profile);
}

export function publicJourneyImportAttachment(profile) {
  if (!profile?.importRef || !profile?.digest) {
    fail("Journey attachment metadata is incomplete.", "journey_import_attachment_invalid");
  }
  return {
    kind: "journey-import",
    importRef: profile.importRef,
    name: profile.name,
    mediaType: profile.mediaType,
    byteSize: profile.byteSize,
    digest: profile.digest,
  };
}

export function openJourneyImport(ventureId, importRef, options = {}) {
  const staged = getVentureDoc(ventureId, "journeyImports", importRef, options);
  if (!staged) fail(`No such staged journey import: ${importRef}`, "journey_import_not_found", 404);
  const file = path.join(stagingRoot(ventureId, options), `${staged.digest}${staged.extension}`);
  if (!fs.existsSync(file)) fail("The staged journey file is no longer available.", "journey_import_file_missing", 410);
  return { staged, rows: parseJourneyRows(fs.readFileSync(file), staged.extension), file };
}

export function deleteJourneyImport(ventureId, importRef, options = {}) {
  const staged = getVentureDoc(ventureId, "journeyImports", importRef, options);
  if (!staged) fail(`No such staged journey import: ${importRef}`, "journey_import_not_found", 404);
  const file = path.join(stagingRoot(ventureId, options), `${staged.digest}${staged.extension}`);
  try { fs.unlinkSync(file); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  venturePersistence(options, ventureId).delete("journeyImports", safeId(importRef));
  return true;
}

export function cleanupExpiredJourneyImports(options = {}, at = Date.now()) {
  const removed = [];
  for (const venture of listVentures(options)) {
    for (const staged of listVentureDocs(venture.id, "journeyImports", options)) {
      if (Date.parse(staged.expiresAt ?? staged.createdAt) > at) continue;
      try {
        deleteJourneyImport(venture.id, staged.id, options);
        removed.push({ ventureId: venture.id, importRef: staged.id });
      } catch (error) {
        if (error?.code !== "journey_import_not_found") throw error;
      }
    }
  }
  return removed;
}

export function currentJourneyPages(ventureId, options = {}) {
  return pageRouteIndex(ventureId, options);
}
