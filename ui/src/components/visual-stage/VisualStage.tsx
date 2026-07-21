import { motion, useReducedMotion } from "motion/react";
import type { ThreadTimeline, VisualReference, WorkIndex } from "@/api";
import type { Direction } from "@/components/now/directionModel";
import type { FirmLens } from "@/types";
import { VisualStageHeader } from "./VisualStageHeader";
import { renderVisualStage } from "./visualStageRegistry";
import type { ArtifactSectionFocus } from "@/components/review/artifactSectionFocus";

export function VisualStage({ visual, timeline, workIndex, directions, lens, readOnlyReason, artifactFocus, onArtifactFocus, onClose, onOpenThread, onChanged }: {
  visual: VisualReference;
  timeline: ThreadTimeline | null;
  workIndex: WorkIndex | null;
  directions: Direction[];
  lens: FirmLens | null;
  readOnlyReason: string | null;
  artifactFocus?: ArtifactSectionFocus | null;
  onArtifactFocus?: (focus: ArtifactSectionFocus) => void;
  onClose: () => void;
  onOpenThread: (threadRef: string) => void;
  onChanged: () => void;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.aside
      className="visual-stage"
      aria-label={`${visual.title} visual workspace`}
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, x: 18, filter: "blur(2px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 8, filter: "blur(1px)" }}
      transition={{ duration: reducedMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <VisualStageHeader visual={visual} onClose={onClose} />
      <div className="visual-stage-body">{renderVisualStage({ visual, timeline, workIndex, directions, lens, readOnlyReason, artifactFocus, onArtifactFocus, onOpenThread, onChanged })}</div>
    </motion.aside>
  );
}
