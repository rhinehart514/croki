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
    document.querySelector<HTMLButtonElement>(`.react-flow__node[data-id="${CSS.escape(returnId)}"] .atlas-bet-summary`)?.focus({ preventScroll: true });
  }, [diveId]);
  return { enterDive, returnFromDive };
}
