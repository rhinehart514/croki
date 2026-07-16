import { useCallback, useRef } from "react";
import { trackAtlasArrivals } from "./atlasMotion";
import type { AtlasNode } from "./atlasTypes";

export function useAtlasArrivalTracker(ventureId: string, projectionPresent: boolean) {
  const tracker = useRef<{ ventureId: string; projectionSeen: boolean; known: Set<string> } | null>(null);

  return useCallback((nodes: AtlasNode[]) => {
    const current = tracker.current;
    const sameVenture = current?.ventureId === ventureId;
    const firstProjection = sameVenture && !current.projectionSeen && projectionPresent;
    const next = trackAtlasArrivals(sameVenture && !firstProjection ? current.known : null, nodes);
    tracker.current = {
      ventureId,
      projectionSeen: sameVenture ? current.projectionSeen || projectionPresent : projectionPresent,
      known: next.known,
    };
    return nodes.map((node) => ({
      ...node,
      data: { ...node.data, arrivalReceiptId: next.arrivals.get(node.id) },
    }));
  }, [projectionPresent, ventureId]);
}
