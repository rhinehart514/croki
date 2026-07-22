import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { ThreadTimeline, VisualReference } from "@/api";
import type { WorkspaceMode } from "@/lib/venture-session";

export function useWorkspaceVisuals({
  mode, timeline, openerRef, setMode, setStage, setArtifactFocus,
}: {
  mode: WorkspaceMode;
  timeline: ThreadTimeline | null;
  openerRef: MutableRefObject<HTMLElement | null>;
  setMode: (mode: WorkspaceMode) => void;
  setStage: (visual: VisualReference | null) => void;
  setArtifactFocus: (focus: null) => void;
}) {
  return useCallback((visual: VisualReference, source: HTMLElement) => {
    const timelineItem = timeline?.items.find(
      (candidate) => candidate.ref === visual.ref || candidate.visual?.ref === visual.ref,
    );
    const artifact = timelineItem?.artifact as { kind?: string } | undefined;
    if (artifact?.kind === "native-code" && mode === "work") {
      const changesTab = document.getElementById("work-tab-changes") as HTMLButtonElement | null;
      changesTab?.click();
      changesTab?.focus();
      return;
    }
    if (visual.kind === "map") {
      setMode("product-gtm");
      setStage(null);
      return;
    }
    openerRef.current = source;
    setArtifactFocus(null);
    setStage(visual);
  }, [mode, openerRef, setArtifactFocus, setMode, setStage, timeline?.items]);
}
