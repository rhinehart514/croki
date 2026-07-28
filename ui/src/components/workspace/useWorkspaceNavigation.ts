import { useCallback, useEffect } from "react";
import {
  markWorkIndexReviewed,
  type SystemIndexObject,
  type WorkIndex,
  type WorkIndexItem,
} from "@/api";
import { latestLinkedThread } from "./useWorkspaceConversation";

export function useWorkspaceNavigation({
  ventureId, workIndex, selectedObject, readOnly, openerRef, stage,
  openThread, beginScopedThread, newThread, refresh, setWorkIndex,
  setSystemSelection, setCanvasOpen, setSelectedAgentRef, setStage,
}: {
  ventureId: string;
  workIndex: WorkIndex | null;
  selectedObject: SystemIndexObject | null;
  readOnly: boolean;
  openerRef: React.MutableRefObject<HTMLElement | null>;
  stage: import("@/api").VisualReference | null;
  openThread: (ref: string) => void;
  beginScopedThread: (ref: string, related?: string[]) => void;
  newThread: () => void;
  refresh: () => void;
  setWorkIndex: (index: WorkIndex) => void;
  setSystemSelection: (ref: string | null) => void;
  setCanvasOpen: (open: boolean) => void;
  setSelectedAgentRef: (ref: string | null) => void;
  setStage: (visual: import("@/api").VisualReference | null) => void;
}) {
  const selectThread = useCallback((item: WorkIndexItem) => {
    openThread(item.threadRef);
    if (!item.unread || readOnly || item.threadRef.startsWith("thread:legacy-")) return;
    void markWorkIndexReviewed(ventureId, item)
      .then((response) => setWorkIndex(response.workIndex)).catch(refresh);
  }, [openThread, readOnly, refresh, setWorkIndex, ventureId]);

  // Selecting a canvas object focuses it, opens the Canvas so its live detail is in view, and follows any
  // exact linked Thread into the always-present conversation spine.
  const selectObject = useCallback((object: SystemIndexObject | null, directThreadRef: string | null = null) => {
    if (!object) {
      setSystemSelection(null);
      return;
    }
    if (directThreadRef) {
      openThread(directThreadRef);
    } else {
      const linkedRefs = [...new Set([
        ...object.threadRefs,
        ...(workIndex?.items ?? []).filter((item) => item.subjectRefs.includes(object.objectRef)).map((item) => item.threadRef),
      ])];
      const linked = latestLinkedThread(linkedRefs, workIndex);
      if (linked) openThread(linked.threadRef);
      else beginScopedThread(object.objectRef);
    }
    // Opening a linked Thread restores its remembered presentation. Apply the founder's direct Canvas
    // selection afterward so that older Thread memory cannot erase the object they just chose.
    setSystemSelection(object.objectRef);
    setCanvasOpen(true);
  }, [beginScopedThread, openThread, setCanvasOpen, setSystemSelection, workIndex]);

  const assignAgentInSystem = useCallback((ref: string, subjectRef?: string) => {
    const subject = subjectRef ?? selectedObject?.objectRef;
    setSelectedAgentRef(ref);
    setCanvasOpen(true);
    if (subject) { setSystemSelection(subject); beginScopedThread(subject); }
    else newThread();
  }, [beginScopedThread, newThread, selectedObject, setCanvasOpen,
    setSelectedAgentRef, setSystemSelection]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !stage) return;
      event.preventDefault();
      setStage(null);
      openerRef.current?.focus();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [openerRef, setStage, stage]);

  return { selectThread, selectObject, assignAgentInSystem };
}
