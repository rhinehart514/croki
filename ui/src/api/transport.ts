import { identityHeaders } from "@/lib/identity";
import { requireFreshConnection } from "@/lib/freshness";
type ErrorPayload = { error?: string; code?: string };

export type ApiConnectionObservation = {
  kind: "response" | "network-error";
  path: string;
  method: string;
  observedAt: string;
  ok: boolean;
  status: number | null;
  serverInstance: string | null;
  serverRespondedAt: string | null;
  error: string | null;
};

type ApiConnectionListener = (observation: ApiConnectionObservation) => void;
const connectionListeners = new Set<ApiConnectionListener>();
let nextCommandId = 0;
const ambiguousCommandKeys = new Map<string, string>();
const workProjectionRevisions = new Map<string, number>();

function commandIdempotencyKey() {
  const random = globalThis.crypto?.randomUUID?.();
  return random || `command-${Date.now()}-${++nextCommandId}`;
}

export function noteWorkProjectionRevision(ventureId: string, revision: number) {
  if (!ventureId || !Number.isSafeInteger(revision) || revision < 0) return;
  const current = workProjectionRevisions.get(ventureId) ?? -1;
  if (revision >= current) workProjectionRevisions.set(ventureId, revision);
}

function workCommandHeaders(path: string, method: string, body: BodyInit | null | undefined) {
  if (method.toUpperCase() === "GET") return { headers: {}, fingerprint: null };
  const ventureId = path.match(/^\/api\/ventures\/([^/?]+)/)?.[1];
  const threadId = path.match(/\/threads\/([^/?]+)/)?.[1];
  const runId = path.match(/\/(?:runs|drives)\/([^/?]+)/)?.[1];
  let parsedBody: Record<string, unknown> = {};
  if (typeof body === "string" && body) {
    try {
      const value = JSON.parse(body);
      if (value && typeof value === "object" && !Array.isArray(value)) parsedBody = value;
    } catch {
      // The route remains responsible for rejecting malformed JSON.
    }
  }
  // Product/Canvas and workspace routes may carry their own `baseRevision`/`expectedRevision`.
  // Those are not the ordered Work projection revision and must never be substituted for it.
  const revision = Number.isInteger(parsedBody.expectedProjectionRevision)
    ? parsedBody.expectedProjectionRevision
    : null;
  const decodedVentureId = ventureId ? decodeURIComponent(ventureId) : null;
  const fingerprint = JSON.stringify([method.toUpperCase(), path, typeof body === "string" ? body : ""]);
  const idempotencyKey = ambiguousCommandKeys.get(fingerprint) ?? commandIdempotencyKey();
  ambiguousCommandKeys.set(fingerprint, idempotencyKey);
  return {
    fingerprint,
    headers: {
    "x-drover-idempotency-key": idempotencyKey,
    ...(ventureId ? { "x-drover-venture-id": decodeURIComponent(ventureId) } : {}),
    ...(threadId ? { "x-drover-thread-id": decodeURIComponent(threadId) } : {}),
    ...(runId ? { "x-drover-run-id": decodeURIComponent(runId) } : {}),
    ...(decodedVentureId
      ? {
        "x-drover-expected-projection-revision": String(
          Number.isInteger(revision) ? revision : (workProjectionRevisions.get(decodedVentureId) ?? 0),
        ),
      }
      : {}),
    },
  };
}

export function subscribeApiConnection(listener: ApiConnectionListener) {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

function observeConnection(observation: ApiConnectionObservation) {
  for (const listener of connectionListeners) listener(observation);
}

export class ApiError extends Error {
  readonly status: number | null;
  readonly code: string | null;

  constructor(
    message: string,
    status: number | null,
    code: string | null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export type DroverHealth = {
  ok: boolean;
  instanceId: string;
  startedAt: string;
  now: string;
  founderAuthority: {
    available: boolean;
    transport: "desktop-host";
    header: string;
    replayWindowMs: number;
  };
};

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  let response: Response;
  const command = workCommandHeaders(path, method, init.body);
  try {
    const headers = {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...identityHeaders(),
      ...command.headers,
      ...init.headers,
    } as Record<string, string>;
    if (window.droverDesktop?.api) {
      const result = await window.droverDesktop.api.request({
        path,
        method,
        headers,
        body: typeof init.body === "string" ? init.body : "",
      });
      response = new Response(result.body, { status: result.status, headers: result.headers });
    } else {
      response = await fetch(path, { ...init, headers });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    observeConnection({
      kind: "network-error", path, method, observedAt: new Date().toISOString(), ok: false,
      status: null, serverInstance: null, serverRespondedAt: null, error: message,
    });
    throw new ApiError(message, null, "network_error");
  }
  if (command.fingerprint) ambiguousCommandKeys.delete(command.fingerprint);
  const payload = (await response.json().catch(() => ({}))) as T & ErrorPayload;
  const message = response.ok ? null : (payload.error || `${path} failed (${response.status}).`);
  observeConnection({
    kind: "response", path, method, observedAt: new Date().toISOString(), ok: response.ok,
    status: response.status,
    serverInstance: response.headers.get("x-drover-server-instance"),
    serverRespondedAt: response.headers.get("x-drover-responded-at"),
    error: message,
  });
  if (!response.ok) throw new ApiError(message!, response.status, payload.code ?? null);
  return payload;
}

export const get = <T,>(path: string) => request<T>(path);
export const post = <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
export const put = <T,>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const del = <T,>(path: string) => request<T>(path, { method: "DELETE" });
export const guardedPost = <T,>(path: string, body: unknown) => {
  requireFreshConnection();
  return post<T>(path, body);
};
export const guardedGet = <T,>(path: string) => {
  requireFreshConnection();
  return get<T>(path);
};
export const guardedPut = <T,>(path: string, body: unknown) => {
  requireFreshConnection();
  return put<T>(path, body);
};
export const guardedDelete = <T,>(path: string) => {
  requireFreshConnection();
  return del<T>(path);
};

export const getHealth = () => get<DroverHealth>("/api/health");

export const markFounderPresent = () => post<{ present: boolean }>("/api/presence", {});
export const markFounderAway = () => post<{ present: boolean }>("/api/presence", { away: true });
