import { useCallback, useEffect, useRef, useState } from "react";
import { getThreadTimeline, type ThreadTimeline } from "@/api";
import { useFirmEventStream } from "@/hooks/useFirmEventStream";

export function useThreadTimeline(ventureId: string, threadRef: string | null, revision: number | null) {
  const [timeline, setTimeline] = useState<ThreadTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    if (!threadRef) return;
    const id = ++request.current;
    setLoading(true);
    try {
      const response = await getThreadTimeline(ventureId, threadRef);
      if (id !== request.current) return;
      setTimeline(response.timeline);
      setError(null);
    } catch (cause) {
      if (id !== request.current) return;
      setError(cause instanceof Error ? cause.message : "This thread could not be refreshed.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [threadRef, ventureId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh, revision]);
  const { streaming } = useFirmEventStream(ventureId, useCallback((event) => {
    if (!threadRef) return;
    if (event.kind === "timeline" && event.threadRef && event.threadRef !== threadRef) return;
    void refresh();
  }, [refresh, threadRef]));

  useEffect(() => {
    if (streaming || !threadRef) return undefined;
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh, streaming, threadRef]);

  const coherent = timeline?.thread?.threadRef === threadRef ? timeline : null;
  return { timeline: coherent, loading, error, streaming, refresh };
}
