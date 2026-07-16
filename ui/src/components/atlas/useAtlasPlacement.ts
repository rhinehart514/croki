import { useCallback, useEffect, useRef } from "react";
import { putPlacement } from "@/api";
import type { FirmLens } from "@/types";

type Position = { x: number; y: number };

export function useAtlasPlacement({
  ventureId,
  lens,
  readOnly,
  onLensChange,
  onRefresh,
}: {
  ventureId: string;
  lens: FirmLens;
  readOnly: boolean;
  onLensChange: (lens: FirmLens) => void;
  onRefresh: () => void;
}) {
  const revisionRef = useRef(lens.placement.revision);
  const positionsRef = useRef({ ...lens.placement.positions });
  const lensRef = useRef(lens);
  const pendingRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    lensRef.current = lens;
    if (lens.placement.revision > revisionRef.current) {
      revisionRef.current = lens.placement.revision;
      positionsRef.current = pendingRef.current
        ? { ...lens.placement.positions, ...positionsRef.current }
        : { ...lens.placement.positions };
    } else if (!pendingRef.current && lens.placement.revision === revisionRef.current) {
      positionsRef.current = { ...lens.placement.positions };
    }
  }, [lens]);

  const commitPosition = useCallback((id: string, position: Position) => {
    if (readOnly) return Promise.resolve();
    positionsRef.current = { ...positionsRef.current, [id]: position };
    pendingRef.current += 1;
    const run = async () => {
      try {
        const result = await putPlacement(ventureId, {
          positions: { ...positionsRef.current },
          expectedRevision: revisionRef.current,
        });
        revisionRef.current = result.placement.revision;
        pendingRef.current -= 1;
        if (!pendingRef.current) {
          positionsRef.current = { ...result.placement.positions };
          onLensChange({ ...lensRef.current, placement: result.placement });
        }
      } catch {
        pendingRef.current -= 1;
        onRefresh();
      }
    };
    queueRef.current = queueRef.current.catch(() => undefined).then(run);
    return queueRef.current;
  }, [onLensChange, onRefresh, readOnly, ventureId]);

  return { commitPosition };
}
