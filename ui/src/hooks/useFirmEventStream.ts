import { useEffect, useRef, useState } from "react";
import { subscribeVentureEvents, type FirmStreamEvent } from "@/api";

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
  const [streaming, setStreaming] = useState(false);
  // Keep the latest callback without resubscribing on every render — written in an effect (never during
  // render) so the subscription always calls the current handler without tearing down on each rerender.
  const handlerRef = useRef(onEvent);
  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!ventureId) return undefined;
    // `streaming` flips only from the subscription's async open/close callbacks (external-system
    // updates), never synchronously in the effect body — the reset on teardown is a callback too, so a
    // stale "streaming" is never shown for a torn-down subscription.
    const unsubscribe = subscribeVentureEvents(
      ventureId,
      (event) => handlerRef.current(event),
      (state) => setStreaming(state === "open"),
    );
    return () => {
      unsubscribe();
      setStreaming(false);
    };
  }, [ventureId]);

  return { streaming };
}
