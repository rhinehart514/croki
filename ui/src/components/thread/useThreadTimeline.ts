import { useCallback, useEffect, useRef, useState } from "react";
import { getThreadTimeline, type ThreadTimeline } from "@/api";
import { useFirmEventStream } from "@/hooks/useFirmEventStream";
import { useWorkProtocol } from "@/hooks/useWorkProtocol";

// Durable changes only. A `drive` ping fires as often as tokens arrive; refetching the whole timeline
// on each one cost a full round trip per token and replaced the transcript object every time. The
// forming reply now arrives as payload on the drive's own stream (useDriveStream), so this hook
// re-reads only when something durable actually changed in the record.
const DURABLE_KINDS = new Set(["conversation", "timeline", "wall", "outcome", "lens", "release"]);

export function useThreadTimeline(ventureId: string, threadRef: string | null, revision: number | null) {
  const [direct, setDirect] = useState<{
    value: ThreadTimeline;
    observedProjectionRevision: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const scope = `${ventureId}\u0000${threadRef ?? ""}`;
  const orderedWork = useWorkProtocol(ventureId, threadRef);
  const orderedRevision = useRef(orderedWork.projectionRevision);
  useEffect(() => {
    orderedRevision.current = orderedWork.projectionRevision;
  }, [orderedWork.projectionRevision]);
  const { seedThread } = orderedWork;
  const orderedPrimary = Boolean(window.droverDesktop?.api?.subscribeWork);
  const orderedStreaming = orderedPrimary
    && ["connecting", "live"].includes(orderedWork.transportSync);
  const refreshRevision = orderedPrimary ? null : revision;
  useEffect(() => () => {
    // Invalidate every read owned by the prior Project/Thread before its delayed response can settle.
    request.current += 1;
  }, [scope]);

  const refresh = useCallback(async () => {
    if (!threadRef) return;
    const id = ++request.current;
    setLoading(true);
    try {
      const response = await getThreadTimeline(ventureId, threadRef);
      if (id !== request.current) return;
      if (response.timeline.ventureId !== ventureId || response.timeline.thread.threadRef !== threadRef) {
        setError("Thread sync could not verify this destination.");
        return;
      }
      setDirect({
        value: response.timeline,
        observedProjectionRevision: orderedRevision.current,
      });
      seedThread(response.timeline);
      setError(null);
    } catch (cause) {
      if (id !== request.current) return;
      setError(cause instanceof Error ? cause.message : "This thread could not be refreshed.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [seedThread, threadRef, ventureId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh, refreshRevision]);
  const { streaming } = useFirmEventStream(ventureId, useCallback((event) => {
    if (!threadRef) return;
    if (orderedStreaming) return;
    if (!DURABLE_KINDS.has(event.kind)) return;
    if (event.kind === "timeline" && event.threadRef && event.threadRef !== threadRef) return;
    void refresh();
  }, [orderedStreaming, refresh, threadRef]));

  // Close the initial snapshot/live handoff window and repeat the same repair after reconnect. The
  // request-id guard above makes an overlapping older response harmless: only the read started after
  // the stream opened can win.
  useEffect(() => {
    if (!streaming || !threadRef || orderedStreaming) return undefined;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [orderedStreaming, refresh, streaming, threadRef]);

  // The degraded path, unchanged: with no venture stream at all the thread still refreshes, slowly and
  // honestly. It is no longer how streaming works — the drive's own stream carries the forming reply —
  // and it stays only so a dropped connection does not leave the transcript frozen for good.
  useEffect(() => {
    const current = orderedPrimary ? orderedStreaming : streaming;
    if (current || !threadRef) return undefined;
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [orderedPrimary, orderedStreaming, refresh, streaming, threadRef]);

  const pushed = threadRef ? orderedWork.threads[threadRef] : null;
  // A direct refresh can carry workspace review state without advancing the ordered Thread revision.
  // Its semantic-model revision and the Work protocol's projection revision are different clocks, so
  // comparing them makes an older push look newer after several unrelated Work frames. Remember the
  // ordered revision observed when the read completed: only a later push may supersede that exact read.
  const latest = pushed && pushed.revision > (direct?.observedProjectionRevision ?? -1)
    ? pushed.value
    : direct?.value ?? null;
  const coherent = latest?.ventureId === ventureId && latest.thread?.threadRef === threadRef ? latest : null;
  return {
    timeline: coherent,
    loading,
    error,
    streaming,
    refresh,
    sync: {
      transport: orderedWork.transportSync,
      thread: orderedWork.threadSync,
      work: orderedWork.workSync,
      canvas: orderedWork.canvasSync,
    },
  };
}
