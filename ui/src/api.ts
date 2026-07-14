import type { FirmLens, FirmPlacement } from "@/types";
import { identityHeaders } from "@/lib/identity";

type ErrorPayload = { error?: string };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...identityHeaders(),
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & ErrorPayload;
  if (!response.ok) throw new Error(payload.error || `${path} failed (${response.status}).`);
  return payload;
}

const get = <T,>(path: string) => request<T>(path);
const post = <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
const put = <T,>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) });

export const getFounderSession = () => get<{ authenticated: boolean }>("/api/founder-session");
export const unlockFounderSession = (code: string) => post<{ authenticated: true }>("/api/founder-session", { code });
export const markFounderPresent = () => post<{ present: boolean }>("/api/presence", {});
export const markFounderAway = () => post<{ present: boolean }>("/api/presence", { away: true });

export type FirmVenture = {
  id: string;
  name: string;
  repository: string;
  createdAt: string;
  updatedAt: string;
};

export const listVentures = () => get<{ ventures: FirmVenture[] }>("/api/ventures");
export const createVenture = (name: string, repository: string) =>
  post<{ venture: FirmVenture }>("/api/ventures", { name, repository });

export type FirmHeatSettings = { heat: "off" | "steady" | "full"; dailySpendUsd: number };
export const getHeatSettings = (ventureId: string) =>
  get<FirmHeatSettings>(`/api/ventures/${encodeURIComponent(ventureId)}/heat`);
export const setHeatSettings = (ventureId: string, settings: FirmHeatSettings) =>
  post<FirmHeatSettings>(`/api/ventures/${encodeURIComponent(ventureId)}/heat`, settings);

export const getLens = (ventureId: string) =>
  get<{ lens: FirmLens }>(`/api/ventures/${encodeURIComponent(ventureId)}/lens`);

export const putPlacement = (
  ventureId: string,
  body: { positions: Record<string, { x: number; y: number }>; expectedRevision: number },
) => put<{ placement: FirmPlacement }>(`/api/ventures/${encodeURIComponent(ventureId)}/placement`, body);

export type WallPurpose = "release" | "answer" | "review-outcome" | "end-bet";
export type WallDecision = "release" | "reject" | "authorize-deploy" | "answer" | "dismiss" | "acknowledge" | "kill" | "keep";

export type WallQueueItemView = {
  id: string;
  ventureId: string;
  betId: string | null;
  purpose: WallPurpose;
  blocksBet: boolean;
  effect: Record<string, unknown>;
  parkedAt: string;
  decision: string | null;
  deployAuthorizedAt?: string | null;
};

export const getWallQueue = (ventureId: string) =>
  get<{ queue: WallQueueItemView[] }>(`/api/ventures/${encodeURIComponent(ventureId)}/wall`);

export const decideWallItem = (
  ventureId: string,
  itemId: string,
  body: { decision: WallDecision; note?: string | null },
) => post<{ receipt: Record<string, unknown> }>(
  `/api/ventures/${encodeURIComponent(ventureId)}/wall/${encodeURIComponent(itemId)}/decide`,
  body,
);

export const driveTeammate = (
  ventureId: string,
  body: { teammateRef: string; goal: string; betId?: string | null; model?: string | null },
) => post<{ outcome: Record<string, unknown>; work: Record<string, unknown> }>(
  `/api/ventures/${encodeURIComponent(ventureId)}/drive`,
  body,
);
