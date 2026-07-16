import { useCallback, useLayoutEffect, useRef, type Dispatch, type SetStateAction } from "react";

export function useDiveFocus(diveId: string | null, setDiveId: Dispatch<SetStateAction<string | null>>) {
  const returnIdRef = useRef<string | null>(null);
  const restorePendingRef = useRef(false);
  const enterDive = useCallback((id: string) => {
    returnIdRef.current = id;
    restorePendingRef.current = false;
    setDiveId(id.replace(/^bet:/, ""));
  }, [setDiveId]);
  const returnFromDive = useCallback(() => {
    restorePendingRef.current = true;
    setDiveId(null);
  }, [setDiveId]);
  useLayoutEffect(() => {
    if (diveId !== null || !restorePendingRef.current) return;
    restorePendingRef.current = false;
    const returnId = returnIdRef.current;
    if (!returnId) return;
    // The atlas remounts when Dive folds back, so the originating bet's summary button may not be in
    // the DOM on the first tick — React Flow paints its nodes over the next frame(s), and the camera
    // settle re-renders the field once more, which can drop focus back to <body>. So we don't just
    // focus once: we re-assert focus on the bet's summary across a short window (until the button holds
    // focus, or the founder moves focus elsewhere), so keyboard focus reliably returns to the work that
    // was open rather than being blurred by the post-return re-render.
    const selector = `.react-flow__node[data-id="${CSS.escape(returnId)}"] .atlas-bet-summary`;
    let frame = 0;
    let attempts = 0;
    const reassert = () => {
      const button = document.querySelector<HTMLButtonElement>(selector);
      const active = document.activeElement;
      // Stop once the button holds focus, or the founder has moved focus to some other real control.
      const focusSettledElsewhere = active && active !== document.body && !button?.contains(active) && active !== button;
      if (button && document.activeElement !== button && !focusSettledElsewhere) {
        button.focus({ preventScroll: true });
      }
      if (attempts++ < 24 && document.activeElement !== button && !focusSettledElsewhere) {
        frame = window.requestAnimationFrame(reassert);
      }
    };
    frame = window.requestAnimationFrame(reassert);
    return () => window.cancelAnimationFrame(frame);
  }, [diveId]);
  return { enterDive, returnFromDive };
}
