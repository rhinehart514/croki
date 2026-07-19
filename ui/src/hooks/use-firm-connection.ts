import { useCallback, useEffect, useRef, useState } from "react";
import { getActiveDrives, getConversation, getHealth, getLens, getWorkIndex, type FirmActiveDrive, type WorkIndex } from "@/api";
import type { FirmConversationMessage, FirmLens } from "@/types";
import { setConsequentialWritesAllowed } from "@/lib/freshness";
import { recordUxMetric, recordUxMetricOnce } from "@/lib/ux-metrics";

export type FirmConnectionPhase = "opening" | "fresh" | "stale" | "offline" | "read-only";

export type FirmConnectionState = {
  phase: FirmConnectionPhase;
  lastUpdatedAt: number | null;
  retryAt: number | null;
  failures: number;
  message: string | null;
};

const IDLE_POLL_MS = 1_200;
const MAX_RETRY_MS = 10_000;
const FILE_LINE_REFERENCE = /(?:^|[\s([`])(?:\.{0,2}\/)?(?:[\w.-]+\/)*[\w.-]+\.[a-z0-9]+:\d+\b/i;

function repositoryEvidence(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const evidence = value as Record<string, unknown>;
  const type = String(evidence.type ?? "").trim().toLowerCase();
  const path = String(evidence.path ?? evidence.file ?? "").trim();
  return type === "repository-citation" && Boolean(path);
}

export function hasGroundedValue(lens: FirmLens, messages: FirmConversationMessage[]) {
  return lens.bets.some((bet) => bet.evidence.some(repositoryEvidence))
    || messages.some((message) => (
      message.role === "teammate"
      && FILE_LINE_REFERENCE.test(String(message.content ?? ""))
    ));
}

function retryDelay(failures: number) {
  return Math.min(IDLE_POLL_MS * (2 ** Math.max(0, failures - 1)), MAX_RETRY_MS);
}

export function useFirmConnection(ventureId: string | null) {
  const [lens, setLens] = useState<FirmLens | null>(null);
  const [messages, setMessages] = useState<FirmConversationMessage[]>([]);
  const [activeDrives, setActiveDrives] = useState<FirmActiveDrive[]>([]);
  const [workIndex, setWorkIndex] = useState<WorkIndex | null>(null);
  const [connection, setConnection] = useState<FirmConnectionState>({
    phase: "opening",
    lastUpdatedAt: null,
    retryAt: null,
    failures: 0,
    message: null,
  });
  const refreshRef = useRef<() => void>(() => undefined);

  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    if (!ventureId) {
      setLens(null);
      setMessages([]);
      setActiveDrives([]);
      setWorkIndex(null);
      setConnection({ phase: "opening", lastUpdatedAt: null, retryAt: null, failures: 0, message: null });
      setConsequentialWritesAllowed(true);
      refreshRef.current = () => undefined;
      return;
    }

    let stopped = false;
    let timer: number | null = null;
    let failures = 0;
    let polling = false;
    const openedAt = performance.now();
    setConsequentialWritesAllowed(false);
    setWorkIndex(null);
    setConnection({ phase: "opening", lastUpdatedAt: null, retryAt: null, failures: 0, message: null });

    const schedule = (delay: number) => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(poll, delay);
    };

    const poll = async () => {
      if (stopped || polling) return;
      polling = true;
      try {
        const [lensResponse, conversationResponse, drivesResponse, workIndexResponse, health] = await Promise.all([
          getLens(ventureId),
          getConversation(ventureId),
          getActiveDrives(ventureId),
          getWorkIndex(ventureId),
          getHealth(),
        ]);
        if (stopped) return;
        failures = 0;
        const now = Date.now();
        setLens(lensResponse.lens);
        setMessages(conversationResponse.messages);
        setActiveDrives(drivesResponse.drives);
        setWorkIndex(workIndexResponse.workIndex);
        if (hasGroundedValue(lensResponse.lens, conversationResponse.messages)) {
          recordUxMetricOnce("first_grounded_value", ventureId, performance.now() - openedAt);
        }
        const writable = health.founderAuthority.available;
        setConnection({
          phase: writable ? "fresh" : "read-only",
          lastUpdatedAt: now,
          retryAt: null,
          failures,
          message: writable ? null : "Open Drover through its desktop host to make changes.",
        });
        setConsequentialWritesAllowed(writable);
        schedule(IDLE_POLL_MS);
      } catch (error) {
        if (stopped) return;
        failures += 1;
        if (failures === 1) recordUxMetric("stale_incident", ventureId);
        const delay = retryDelay(failures);
        setConsequentialWritesAllowed(false);
        setConnection((current) => ({
          ...current,
          phase: typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "stale",
          retryAt: Date.now() + delay,
          failures,
          message: error instanceof Error ? error.message : "The firm could not be refreshed.",
        }));
        schedule(delay);
      } finally {
        polling = false;
      }
    };

    const retryNow = () => schedule(0);
    const handleOffline = () => {
      setConsequentialWritesAllowed(false);
      setConnection((current) => ({ ...current, phase: "offline", retryAt: null }));
    };
    const handleOnline = () => retryNow();
    refreshRef.current = retryNow;
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    void poll();

    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      setConsequentialWritesAllowed(true);
    };
  }, [ventureId]);

  return { lens, messages, activeDrives, workIndex, connection, refresh, setLens, setMessages, setWorkIndex };
}
