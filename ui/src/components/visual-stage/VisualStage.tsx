import type { ThreadTimeline, VisualReference, WorkIndex } from "@/api";
import type { Direction } from "@/components/now/directionModel";
import type { FirmLens } from "@/types";
import { VisualStageHeader } from "./VisualStageHeader";
import { renderVisualStage } from "./visualStageRegistry";

export function VisualStage({ visual, timeline, workIndex, directions, lens, readOnlyReason, onClose, onOpenThread, onChanged }: {
  visual: VisualReference;
  timeline: ThreadTimeline | null;
  workIndex: WorkIndex | null;
  directions: Direction[];
  lens: FirmLens | null;
  readOnlyReason: string | null;
  onClose: () => void;
  onOpenThread: (threadRef: string) => void;
  onChanged: () => void;
}) {
  return <aside className="visual-stage" aria-label={`${visual.title} visual workspace`}><VisualStageHeader visual={visual} onClose={onClose} /><div className="visual-stage-body">{renderVisualStage({ visual, timeline, workIndex, directions, lens, readOnlyReason, onOpenThread, onChanged })}</div></aside>;
}
