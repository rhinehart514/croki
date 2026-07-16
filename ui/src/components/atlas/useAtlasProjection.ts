import { useCallback, useEffect, useRef, useState } from "react";
import { getArchitectureProjection } from "@/api";
import type { FirmArchitectureProjection } from "@/types";

const POLL_MS = 1_500;

export function useAtlasProjection(ventureId: string) {
  const [projection, setProjection] = useState<FirmArchitectureProjection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef<() => void>(() => undefined);
  const reload = useCallback(() => requestRef.current(), []);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let polling = false;
    const schedule = () => { timer = window.setTimeout(poll, POLL_MS); };
    const poll = async () => {
      if (stopped || polling) return;
      polling = true;
      try {
        const response = await getArchitectureProjection(ventureId);
        if (stopped) return;
        setProjection(response.projection);
        setError(null);
        setLoading(false);
      } catch (cause) {
        if (stopped) return;
        setError(cause instanceof Error ? cause.message : "The venture architecture could not be opened.");
        setLoading(false);
      } finally {
        polling = false;
        if (!stopped) schedule();
      }
    };
    requestRef.current = () => {
      if (timer !== null) window.clearTimeout(timer);
      void poll();
    };
    void poll();
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [ventureId]);

  return { projection, error, loading, reload };
}
