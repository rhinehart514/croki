import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { ThreadTimeline, VisualReference } from "@/api";

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
      // A hidden workbench has no changes tab yet; the reveal control reopens it, and React flushes
      // that discrete click synchronously, so the tab exists by the next lookup.
      if (!document.getElementById("work-tab-changes")) {
        document.querySelector<HTMLButtonElement>(".work-workbench-reveal")?.click();
      }
      const changesTab = document.getElementById("work-tab-changes") as HTMLButtonElement | null;
      changesTab?.click();
      changesTab?.focus();
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
