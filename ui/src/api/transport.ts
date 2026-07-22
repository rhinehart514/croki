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
  try {
    const headers = {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...identityHeaders(),
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
