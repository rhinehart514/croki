// useCanvasLens — bundles the operating-lens wiring for the stage (spec §2/§3): the lens state home, the
// captured ReactFlow instance, the FLIP that plays a lens / restores instantly, and the active-lens gate
// the stage's poll-reconcile reads. Keeping this together lets VentureCanvasStage stay a thin composition:
// it renders the plane, mounts the control/answer, and reads `lensActiveRef` to stand its reconcile down.
//
// The FLIP writes positions ONLY through setNodes (Law 6): it never calls putPlacement and never feeds
// lens positions into foldPlacement's stored arg. restore() re-reads foldPlacement (founder positions).

import { useEffect, useRef, useState } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import type { FirmArchitectureProjection, FirmLens } from "@/types";
import { useOperatingLens } from "./useOperatingLens";
import { useLensFlip } from "./useLensFlip";
import type { LensId } from "./lensArrangement";

export function useCanvasLens({
  sceneNodes,
  placementPositions,
  lens,
  projection,
  setNodes,
  isAnswerOpen,
  dismissAnswer,
}: {
  sceneNodes: AtlasNode[];
  placementPositions: Record<string, { x: number; y: number }>;
  lens: FirmLens | null;
  projection: FirmArchitectureProjection | null;
  setNodes: (updater: (nodes: AtlasNode[]) => AtlasNode[]) => void;
  // The lens/answer mutual-exclusion preempt (both drive the ONE node array; coexisting corrupts the
  // restore frame). Forwarded straight to useOperatingLens.
  isAnswerOpen?: () => boolean;
  dismissAnswer?: () => void;
}) {
  const { lensId, setLens } = useOperatingLens({ isAnswerOpen, dismissAnswer });
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);

  const { enter, restore } = useLensFlip({
    instance: flowInstance,
    sceneNodes,
    placementPositions,
    lens,
    projection,
    setNodes,
  });

  // Active-lens gate: the stage's poll-reconcile reads this ref to stand down while a lens is active (so a
  // lens node is never snapped back to free mid-lens). Synced in an effect (never mutated during render).
  const lensActiveRef = useRef<LensId | null>(null);
  useEffect(() => { lensActiveRef.current = lensId; }, [lensId]);

  // Drive the flip from the lens id: a lens plays arrangeLens; null restores the founder's own layout.
  useEffect(() => {
    if (lensId) enter(lensId);
    else restore();
    // enter/restore are refs-backed stable callbacks; re-run only when the lens id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lensId]);

  return { lensId, setLens, flowInstance, setFlowInstance, lensActiveRef };
}
