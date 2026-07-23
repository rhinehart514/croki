import { useEffect, useRef, useState } from "react";
import { subscribeVentureEvents, type FirmStreamEvent } from "@/api";

type StreamConsumer = {
  onEvent: (event: FirmStreamEvent) => void;
  onStateChange: (state: "open" | "closed") => void;
};

type SharedVentureStream = {
  consumers: Set<StreamConsumer>;
  state: "open" | "closed";
  unsubscribe: () => void;
};

const sharedVentureStreams = new Map<string, SharedVentureStream>();

function subscribeSharedVentureStream(ventureId: string, consumer: StreamConsumer): () => void {
  let stream = sharedVentureStreams.get(ventureId);
  if (!stream) {
    stream = {
      consumers: new Set(),
      state: "closed",
      unsubscribe: () => {},
    };
    sharedVentureStreams.set(ventureId, stream);
    stream.unsubscribe = subscribeVentureEvents(
      ventureId,
      (event) => {
        for (const activeConsumer of stream!.consumers) activeConsumer.onEvent(event);
      },
      (state) => {
        stream!.state = state;
        for (const activeConsumer of stream!.consumers) activeConsumer.onStateChange(state);
      },
    );
  }

  stream.consumers.add(consumer);
  const observedStream = stream;
  queueMicrotask(() => {
    if (observedStream.consumers.has(consumer)) consumer.onStateChange(observedStream.state);
  });

  return () => {
    observedStream.consumers.delete(consumer);
    if (observedStream.consumers.size > 0) return;
    if (sharedVentureStreams.get(ventureId) === observedStream) sharedVentureStreams.delete(ventureId);
    observedStream.unsubscribe();
  };
}

// useFirmEventStream — the live-work push half of the streaming seam (build contract §2.4 / Phase 5).
//
// The brain pushes a small, data-free "something changed in this venture" event over SSE. This hook
// subscribes and calls `onEvent` for each one; a consumer re-reads the relevant surface (lens,
// conversation, wall) through the existing venture-scoped routes. It carries no venture data itself.
//
// HONEST FALLBACK (§2.4): the 900 ms poll is NOT deleted — it is kept as the reconnect fallback. While
// the stream is open, the consumer can slow or pause its poll (this hook reports `streaming`); when the
// stream drops (reconnect gap, no EventSource in the dev/test harness), the consumer keeps polling. This
// hook only owns the subscription + the streaming flag; the consumer owns its own poll cadence, so the
// change is additive and does not rewrite the existing poll hook.
//
// Additive by design: a shell adopts this alongside useFirmLensProjection's poll without editing it —
// the poll stays the source of truth and the correctness floor; the stream is the low-latency
// convenience on top.
export function useFirmEventStream(
  ventureId: string | null,
  onEvent: (event: FirmStreamEvent) => void,
): { streaming: boolean } {
  const [openVentureId, setOpenVentureId] = useState<string | null>(null);
  // Keep the latest callback without resubscribing on every render — written in an effect (never during
  // render) so the subscription always calls the current handler without tearing down on each rerender.
  const handlerRef = useRef(onEvent);
  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!ventureId) return undefined;
    // Open/closed state comes only from the external subscription callback. The returned value is
    // also scoped to this exact venture, so a venture switch cannot briefly inherit the prior
    // venture's open state while the new connection is settling.
    if (typeof subscribeVentureEvents !== "function") return undefined;
    return subscribeSharedVentureStream(ventureId, {
      onEvent: (event) => handlerRef.current(event),
      onStateChange: (state) => setOpenVentureId(state === "open" ? ventureId : null),
    });
  }, [ventureId]);

  return { streaming: Boolean(ventureId && openVentureId === ventureId) };
}
