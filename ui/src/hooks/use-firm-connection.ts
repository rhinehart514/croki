import { useCallback, useEffect, useRef, useState } from "react";
import { getActiveDrives, getConversation, getHealth, getLens, getWorkIndex, type FirmActiveDrive, type WorkIndex } from "@/api";
import type { FirmConversationMessage, FirmLens } from "@/types";
import { setConsequentialWritesAllowed } from "@/lib/freshness";
import { recordUxMetric } from "@/lib/ux-metrics";
import type { RecoveryLayer } from "@/lib/recovery-presentation";
import { useFirmEventStream } from "@/hooks/useFirmEventStream";

export type FirmConnectionPhase = "opening" | "fresh" | "stale" | "offline" | "read-only";

export type FirmConnectionState = {
  phase: FirmConnectionPhase;
  lastUpdatedAt: number | null;
  retryAt: number | null;
  failures: number;
  message: string | null;
  layer?: RecoveryLayer | null;
};

const IDLE_POLL_MS = 1_200;
const MAX_RETRY_MS = 10_000;

function retryDelay(failures: number) {
  return Math.min(IDLE_POLL_MS * (2 ** Math.max(0, failures - 1)), MAX_RETRY_MS);
}

export function useFirmConnection(ventureId: string) {
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
  const refreshRef = useRef<(includeWork?: boolean) => void>(() => undefined);

  const refresh = useCallback(() => refreshRef.current(true), []);
  const { streaming } = useFirmEventStream(ventureId, useCallback(() => {
    // Thread and Work projections have their own ordered payload stream. A durable venture event only
    // refreshes the remaining legacy projections; it must not turn into a WorkIndex read.
    refreshRef.current(false);
  }, []));
  const streamingRef = useRef(streaming);
  useEffect(() => { streamingRef.current = streaming; }, [streaming]);
  // The HTTP reads and the live subscription start independently. An invalidation can land after the
  // first reads were captured but before the stream reports open, so every open/re-open closes that
  // handoff window with one authoritative read. This is intentionally a read, not a stream snapshot:
  // venture routes remain the only source of durable truth.
  useEffect(() => {
    if (streaming) {
      refreshRef.current(!window.droverDesktop?.api?.subscribeWork);
    }
  }, [streaming, ventureId]);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let failures = 0;
    let polling = false;
    let refreshQueued = false;
    let queuedIncludesWork = false;
    let engineNeedsRetry = false;
    const orderedWorkAvailable = Boolean(window.droverDesktop?.api?.subscribeWork);
    setConsequentialWritesAllowed(false);

    const schedule = (delay: number, includeWork = true) => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void poll(includeWork), delay);
    };

    const poll = async (includeWork = true) => {
      if (stopped) return;
      if (polling) {
        // Never drop an invalidation just because the prior authoritative read is still in flight.
        // Coalesce a burst into one follow-up read after that request settles.
        refreshQueued = true;
        queuedIncludesWork ||= includeWork;
        return;
      }
      polling = true;
      try {
        const workIndexRead = includeWork ? getWorkIndex(ventureId) : Promise.resolve(null);
        const [lensResponse, conversationResponse, drivesResponse, workIndexResponse, health] = await Promise.all([
          getLens(ventureId),
          getConversation(ventureId),
          getActiveDrives(ventureId),
          workIndexRead,
          getHealth(),
        ]);
        if (stopped) return;
        failures = 0;
        const now = Date.now();
        setLens(lensResponse.lens);
        setMessages(conversationResponse.messages);
        setActiveDrives(drivesResponse.drives);
        if (workIndexResponse) setWorkIndex(workIndexResponse.workIndex);
        const writable = health.founderAuthority.available;
        setConnection({
          phase: writable ? "fresh" : "read-only",
          lastUpdatedAt: now,
          retryAt: null,
          failures,
          message: writable ? null : "Open Croki through its desktop host to make changes.",
        });
        setConsequentialWritesAllowed(writable);
        schedule(
          streamingRef.current ? 15_000 : IDLE_POLL_MS,
          !streamingRef.current && !orderedWorkAvailable,
        );
      } catch {
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
          message: "The local Work connection did not answer.",
          layer: "transport",
        }));
        schedule(delay);
      } finally {
        polling = false;
        if (refreshQueued && !stopped) {
          refreshQueued = false;
          const includeWork = queuedIncludesWork;
          queuedIncludesWork = false;
          schedule(0, includeWork);
        }
      }
    };

    const retryNow = (includeWork = true) => {
      if (engineNeedsRetry && window.droverDesktop?.engine) {
        engineNeedsRetry = false;
        void window.droverDesktop.engine.retry()
          .catch(() => { engineNeedsRetry = true; })
          .finally(() => schedule(0, true));
        return;
      }
      if (polling) {
        refreshQueued = true;
        queuedIncludesWork ||= includeWork;
      } else schedule(0, includeWork);
    };
    const handleOffline = () => {
      setConsequentialWritesAllowed(false);
      setConnection((current) => ({ ...current, phase: "offline", retryAt: null, layer: "transport" }));
    };
    const handleOnline = () => retryNow();
    refreshRef.current = retryNow;
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    const handleEngineState = (state: DroverEngineState) => {
      engineNeedsRetry = state.phase === "failed";
      if (state.phase === "engine-ready") {
        retryNow(!orderedWorkAvailable);
        return;
      }
      setConsequentialWritesAllowed(false);
      setConnection((current) => ({
        ...current,
        phase: "stale",
        retryAt: null,
        message: state.message ?? (
          state.phase === "engine-starting"
            ? "The work engine is starting. Your last coherent work remains visible."
            : "The work engine is reconnecting. Your last coherent work remains visible."
        ),
        layer: "engine",
      }));
    };
    const stopEngineState = window.droverDesktop?.engine?.onState(handleEngineState);
    void window.droverDesktop?.engine?.status()
      .then(handleEngineState)
      .catch(() => undefined);
    void poll(!orderedWorkAvailable);

    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      stopEngineState?.();
      setConsequentialWritesAllowed(true);
    };
  }, [ventureId]);

  return { lens, messages, activeDrives, workIndex, connection, refresh, setLens, setMessages, setWorkIndex };
}
