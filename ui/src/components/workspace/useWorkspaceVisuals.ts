import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { ThreadTimeline, VisualReference } from "@/api";
import { requestWorkReview } from "@/components/work-mode/previewPresentation";

export function useWorkspaceVisuals({
  timeline, openerRef, setCanvasOpen, setStage, setArtifactFocus,
}: {
  timeline: ThreadTimeline | null;
  openerRef: MutableRefObject<HTMLElement | null>;
  setCanvasOpen: (open: boolean) => void;
  setStage: (visual: VisualReference | null) => void;
  setArtifactFocus: (focus: null) => void;
}) {
  return useCallback((visual: VisualReference, source: HTMLElement) => {
    const timelineItem = timeline?.items.find(
      (candidate) => candidate.ref === visual.ref || candidate.visual?.ref === visual.ref,
    );
    const artifact = timelineItem?.artifact as { kind?: string } | undefined;
    if (artifact?.kind === "native-code") {
      setCanvasOpen(false);
      setStage(null);
      requestWorkReview({
        threadRef: visual.threadRef,
        workspaceId: typeof (timelineItem?.artifact as { id?: unknown } | undefined)?.id === "string"
          ? (timelineItem!.artifact as { id: string }).id
          : visual.ref.startsWith("work:") ? visual.ref.slice(5) : undefined,
        target: "changes",
        source,
      });
      return;
    }
    if (timelineItem?.kind === "comparison" && visual.kind === "comparison") {
      setCanvasOpen(false);
      setStage(null);
      requestWorkReview({ threadRef: visual.threadRef, target: "comparison", source });
      return;
    }
    if (visual.kind === "map") {
      setCanvasOpen(true);
      setStage(null);
      return;
    }
    openerRef.current = source;
    setArtifactFocus(null);
    // Exact material takes the pane beside the spine, so the Canvas yields it rather than the two
    // splitting the body into a sliver each. Reopening the Canvas returns the Product / GTM register.
    setCanvasOpen(false);
    setStage(visual);
  }, [openerRef, setArtifactFocus, setCanvasOpen, setStage, timeline?.items]);
}
