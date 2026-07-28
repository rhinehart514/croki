import { motion } from "motion/react";
import type { ThreadTimeline, VisualReference, WorkIndex } from "@/api";
import { panelMotion } from "@/lib/motion";
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
  onArtifactFocus?: (focus: ArtifactSectionFocus | null) => void;
  onClose: () => void;
  onOpenThread: (threadRef: string) => void;
  onChanged: () => void;
}) {
  return (
    <motion.aside
      className="visual-stage"
      aria-label={`${visual.title} visual workspace`}
      {...panelMotion}
    >
      <VisualStageHeader visual={visual} onClose={onClose} />
      <div className="visual-stage-body">{renderVisualStage({ visual, timeline, workIndex, directions, lens, readOnlyReason, artifactFocus, onArtifactFocus, onOpenThread, onChanged })}</div>
    </motion.aside>
  );
}
