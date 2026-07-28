// Bounded adapter from shipped desktop HTTP-shaped requests into ordered Work commands. It names only
// founder-facing Work mutations; Product/Canvas routes intentionally remain on their own authority and
// revision contracts.

import crypto from "node:crypto";

import {
  WORK_PROTOCOL_NAME,
  WORK_PROTOCOL_SCHEMA_VERSION,
} from "./work-protocol.mjs";

const WORK_MUTATIONS = [
  /^\/api\/ventures\/[^/]+\/conversation\/reply$/,
  /^\/api\/ventures\/[^/]+\/drive$/,
  /^\/api\/ventures\/[^/]+\/drives\/[^/]+\/abort$/,
  /^\/api\/ventures\/[^/]+\/threads\/[^/]+(?:\/(?:pin|name))?$/,
  /^\/api\/ventures\/[^/]+\/work-index\/[^/]+\/reviewed-through$/,
  /^\/api\/ventures\/[^/]+\/coding-workspaces\/[^/]+\/(?:review-comment|review|product-consequence|apply|revert|commit|prepare-pull-request|prepare-ship|ship|restore|discard)$/,
];

function header(headers, name) {
  const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return String(found?.[1] ?? "").trim();
}

function fail(message, code) {
  throw Object.assign(new Error(message), { code, status: 400 });
}

function bodyScope(body) {
  if (!body) return {};
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return {
      threadId: String(parsed.threadRef ?? "").replace(/^thread:/, "") || null,
      runId: String(parsed.runRef ?? "").replace(/^run:/, "") || null,
    };
  } catch {
    return {};
  }
}

export function classifyDesktopWorkCommand(input = {}) {
  const method = String(input.method ?? "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return null;
  if (header(input.headers, "x-gtm-actor").toLowerCase() === "agent") return null;
  const url = new URL(String(input.path ?? "/"), "http://drover.local");
  if (!WORK_MUTATIONS.some((pattern) => pattern.test(url.pathname))) return null;

  const pathVentureId = decodeURIComponent(url.pathname.match(/^\/api\/ventures\/([^/]+)/)?.[1] ?? "");
  const ventureId = header(input.headers, "x-drover-venture-id");
  if (!ventureId || ventureId !== pathVentureId) {
    fail("A desktop Work command needs its exact venture scope.", "work_command_venture_required");
  }
  const idempotencyKey = header(input.headers, "x-drover-idempotency-key");
  if (!idempotencyKey) fail("A desktop Work command needs an idempotency key.", "work_command_idempotency_required");
  const expectedText = header(input.headers, "x-drover-expected-projection-revision");
  const expectedProjectionRevision = Number(expectedText);
  if (!expectedText || !Number.isSafeInteger(expectedProjectionRevision) || expectedProjectionRevision < 0) {
    fail("A desktop Work command needs its expected projection revision.", "work_projection_revision_required");
  }

  const pathThreadId = decodeURIComponent(
    url.pathname.match(/\/threads\/([^/]+)/)?.[1]
      ?? url.pathname.match(/\/work-index\/([^/]+)\/reviewed-through$/)?.[1]
      ?? "",
  ) || null;
  const pathRunId = decodeURIComponent(url.pathname.match(/\/drives\/([^/]+)\//)?.[1] ?? "") || null;
  const fromBody = bodyScope(String(input.body ?? ""));
  const threadId = header(input.headers, "x-drover-thread-id") || pathThreadId || fromBody.threadId || null;
  const runId = header(input.headers, "x-drover-run-id") || pathRunId || fromBody.runId || null;
  if (pathThreadId && threadId !== pathThreadId) fail("The Work command Thread scope does not match its route.", "work_command_thread_mismatch");
  if (pathRunId && runId !== pathRunId) fail("The Work command Run scope does not match its route.", "work_command_run_mismatch");

  const bodyDigest = crypto.createHash("sha256").update(String(input.body ?? "")).digest("hex");
  return {
    protocol: WORK_PROTOCOL_NAME,
    schemaVersion: WORK_PROTOCOL_SCHEMA_VERSION,
    type: `${method} ${url.pathname}`,
    idempotencyKey,
    ventureId,
    ...(threadId ? { threadId } : {}),
    ...(runId ? { runId } : {}),
    expectedProjectionRevision,
    payload: { method, path: `${url.pathname}${url.search}`, bodyDigest },
  };
}

export async function executeDesktopWorkRequest(input, { acceptCommand, dispatch }) {
  const command = classifyDesktopWorkCommand(input);
  if (!command) return dispatch(input);
  return acceptCommand(command, () => dispatch(input));
}
